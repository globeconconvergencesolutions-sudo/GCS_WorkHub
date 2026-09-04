import { and, count, eq, ne, notInArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  departments,
  managementRequests,
  projectTeams,
  projects,
  responsibilities,
  responsibilityAssignees,
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
  ] = await Promise.all([
    db.select({ value: count() }).from(tasks).where(and(eq(tasks.assigneeId, userId), OPEN_TASK)),
    db
      .select({ value: count() })
      .from(projects)
      .where(and(eq(projects.ownerId, userId), ne(projects.status, 'archived'))),
    db
      .select({ value: count() })
      .from(responsibilities)
      .where(and(eq(responsibilities.ownerId, userId), ne(responsibilities.status, 'completed'))),
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
    total: 0,
    requiresTransfer: false,
  }
  workload.total =
    workload.openTasks +
    workload.ownedProjects +
    workload.ownedResponsibilities +
    workload.directReports +
    workload.departmentsLed +
    workload.openManagementRequests
  // Projects and responsibilities use ON DELETE RESTRICT — must transfer before remove.
  workload.requiresTransfer =
    workload.ownedProjects > 0 || workload.ownedResponsibilities > 0 || workload.total > 0
  return workload
}

/**
 * Moves ownership and open assignments off `fromUserId` onto `toUserId`, then
 * clears memberships that would otherwise block removal.
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
  if (!recipient || recipient.status !== 'active') {
    throw new Error('Work can only be transferred to an active person.')
  }

  await db
    .update(tasks)
    .set({ assigneeId: toUserId, updatedAt: new Date() })
    .where(and(eq(tasks.assigneeId, fromUserId), OPEN_TASK))

  await db
    .update(projects)
    .set({ ownerId: toUserId, updatedAt: new Date() })
    .where(and(eq(projects.ownerId, fromUserId), ne(projects.status, 'archived')))

  await db
    .update(responsibilities)
    .set({ ownerId: toUserId })
    .where(and(eq(responsibilities.ownerId, fromUserId), ne(responsibilities.status, 'completed')))

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
