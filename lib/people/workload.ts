import { and, count, eq, ne, notInArray, or } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  departments,
  managementRequests,
  projectTeams,
  projects,
  responsibilities,
  responsibilityAssignees,
  taskApprovals,
  tasks,
  users,
} from '@/lib/db/schema'

const OPEN_TASK = notInArray(tasks.status, ['completed', 'cancelled'])

export type PersonWorkload = {
  openTasks: number
  ownedProjects: number
  ownedResponsibilities: number
  responsibilityMemberships: number
  projectMemberships: number
  directReports: number
  departmentsLed: number
  openManagementRequests: number
  approvalRecords: number
  total: number
  requiresTransfer: boolean
}

export async function getPersonWorkload(userId: string): Promise<PersonWorkload> {
  const db = getDb()
  const [
    [openTasks],
    [ownedProjects],
    [ownedResponsibilities],
    [responsibilityMemberships],
    [projectMemberships],
    [directReports],
    [departmentsLed],
    [openManagementRequests],
    [approvalRecords],
  ] = await Promise.all([
    db.select({ value: count() }).from(tasks).where(and(eq(tasks.assigneeId, userId), OPEN_TASK)),
    // All owned projects (including archived) — owner_id is ON DELETE RESTRICT.
    db.select({ value: count() }).from(projects).where(eq(projects.ownerId, userId)),
    db.select({ value: count() }).from(responsibilities).where(eq(responsibilities.ownerId, userId)),
    db.select({ value: count() }).from(responsibilityAssignees).where(eq(responsibilityAssignees.userId, userId)),
    db.select({ value: count() }).from(projectTeams).where(eq(projectTeams.userId, userId)),
    db.select({ value: count() }).from(users).where(and(eq(users.managerId, userId), ne(users.status, 'inactive'))),
    db.select({ value: count() }).from(departments).where(eq(departments.ownerId, userId)),
    db
      .select({ value: count() })
      .from(managementRequests)
      .where(
        and(
          eq(managementRequests.assigneeId, userId),
          notInArray(managementRequests.status, ['resolved', 'cancelled']),
        ),
      ),
    db
      .select({ value: count() })
      .from(taskApprovals)
      .where(or(eq(taskApprovals.requestorId, userId), eq(taskApprovals.approverId, userId))),
  ])

  const workload: PersonWorkload = {
    openTasks: openTasks?.value ?? 0,
    ownedProjects: ownedProjects?.value ?? 0,
    ownedResponsibilities: ownedResponsibilities?.value ?? 0,
    responsibilityMemberships: responsibilityMemberships?.value ?? 0,
    projectMemberships: projectMemberships?.value ?? 0,
    directReports: directReports?.value ?? 0,
    departmentsLed: departmentsLed?.value ?? 0,
    openManagementRequests: openManagementRequests?.value ?? 0,
    approvalRecords: approvalRecords?.value ?? 0,
    total: 0,
    requiresTransfer: false,
  }
  workload.total =
    workload.openTasks +
    workload.ownedProjects +
    workload.ownedResponsibilities +
    workload.directReports +
    workload.departmentsLed +
    workload.openManagementRequests +
    workload.approvalRecords
  // Projects / responsibilities / approvals use ON DELETE RESTRICT — must hand off before hard delete.
  workload.requiresTransfer = workload.total > 0
  return workload
}

/**
 * Moves ownership and open assignments off `fromUserId` onto `toUserId`, then
 * clears memberships that would otherwise block permanent removal.
 */
export async function reassignPersonWork(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) {
    throw new Error('Choose a different person to receive the work.')
  }
  const db = getDb()
  const [recipient] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, toUserId))
    .limit(1)
  if (!recipient || recipient.status === 'inactive') {
    throw new Error('Work can only be transferred to an active (or invited) person.')
  }

  await db
    .update(tasks)
    .set({ assigneeId: toUserId, updatedAt: new Date() })
    .where(and(eq(tasks.assigneeId, fromUserId), OPEN_TASK))

  // Every owned project/responsibility — RESTRICT blocks hard delete otherwise.
  await db.update(projects).set({ ownerId: toUserId, updatedAt: new Date() }).where(eq(projects.ownerId, fromUserId))
  await db.update(responsibilities).set({ ownerId: toUserId }).where(eq(responsibilities.ownerId, fromUserId))

  await db.update(users).set({ managerId: toUserId }).where(eq(users.managerId, fromUserId))
  await db.update(departments).set({ ownerId: toUserId }).where(eq(departments.ownerId, fromUserId))
  await db
    .update(managementRequests)
    .set({ assigneeId: toUserId, updatedAt: new Date() })
    .where(
      and(
        eq(managementRequests.assigneeId, fromUserId),
        notInArray(managementRequests.status, ['resolved', 'cancelled']),
      ),
    )

  await db
    .update(taskApprovals)
    .set({ requestorId: toUserId })
    .where(eq(taskApprovals.requestorId, fromUserId))
  await db
    .update(taskApprovals)
    .set({ approverId: toUserId })
    .where(eq(taskApprovals.approverId, fromUserId))

  await db.delete(projectTeams).where(eq(projectTeams.userId, fromUserId))
  const owned = await db.select({ id: projects.id }).from(projects).where(eq(projects.ownerId, toUserId))
  for (const project of owned) {
    await db
      .insert(projectTeams)
      .values({ projectId: project.id, userId: toUserId })
      .onConflictDoNothing()
  }

  await db.delete(responsibilityAssignees).where(eq(responsibilityAssignees.userId, fromUserId))
}

export async function clearPersonSideEffects(userId: string) {
  const db = getDb()
  await db.update(tasks).set({ assigneeId: null, updatedAt: new Date() }).where(eq(tasks.assigneeId, userId))
  await db.update(tasks).set({ createdById: null }).where(eq(tasks.createdById, userId))
  await db.update(managementRequests).set({ assigneeId: null }).where(eq(managementRequests.assigneeId, userId))
  await db.update(users).set({ managerId: null }).where(eq(users.managerId, userId))
  await db.update(departments).set({ ownerId: null }).where(eq(departments.ownerId, userId))
  await db.delete(projectTeams).where(eq(projectTeams.userId, userId))
  await db.delete(responsibilityAssignees).where(eq(responsibilityAssignees.userId, userId))
}

/** Final nullify / membership wipe before deleting the users row. */
export async function preparePersonHardDelete(userId: string) {
  await clearPersonSideEffects(userId)
}
