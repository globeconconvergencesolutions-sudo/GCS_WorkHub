'use server'

import { and, desc, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { signOut } from '@/auth'
import {
  canChangeResponsibilityOwner,
  canCreateProjects,
  canEditTaskActor,
  canManageUsers,
  isManagement,
} from '@/lib/auth/permissions'
import { getDb } from '@/lib/db'
import { getCompany, getCurrentUser } from '@/lib/db/queries'
import {
  activityEvents,
  departments,
  deliverables,
  projectMilestones,
  projectMilestoneTasks,
  projectTeams,
  projects,
  taskDependencies,
  taskApprovals,
  responsibilities,
  responsibilityAssignees,
  taskAttachments,
  taskComments,
  tasks,
  users,
  roles,
  userRoles,
  notifications,
  notificationPreferences,
  managementRequests,
} from '@/lib/db/schema'
import type {
  projectStatusEnum,
  responsibilityStatusEnum,
  taskCategoryEnum,
  taskPriorityEnum,
  taskStatusEnum,
  managementRequestPriorityEnum,
  managementRequestStatusEnum,
} from '@/lib/db/schema'
import { statusLabel } from '@/lib/format'

function refreshWorkhub() {
  revalidatePath('/')
  revalidatePath('/tasks')
  revalidatePath('/responsibilities')
  revalidatePath('/departments')
  revalidatePath('/activity')
  revalidatePath('/settings')
}

export async function switchUser(userId: string) {
  return { error: `Switch user is disabled. Sign in with a real account instead of selecting ${userId}.` }
}

export async function logout() {
  await signOut({ redirectTo: '/login' })
}

export async function createTask(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'A task name is required.' }

  const [currentUser, company] = await Promise.all([getCurrentUser(), getCompany()])
  if (!currentUser || !company) return { error: 'Workspace is not ready yet.' }
  if (!isManagement(currentUser) && !canCreateProjects(currentUser)) {
    return { error: 'You are not allowed to create tasks for the workspace.' }
  }

  const assigneeId = String(formData.get('assigneeId') ?? currentUser.id)
  const category = (String(formData.get('category') || 'operational') ||
    'operational') as (typeof taskCategoryEnum.enumValues)[number]
  const priority = (String(formData.get('priority') || 'medium') ||
    'medium') as (typeof taskPriorityEnum.enumValues)[number]
  const startDate = String(formData.get('startDate') ?? '') || null
  const dueDate = String(formData.get('dueDate') ?? '') || null
  const description = String(formData.get('description') ?? '').trim() || null
  const departmentId = String(formData.get('departmentId') ?? currentUser.departmentId ?? '') || null

  const [task] = await getDb()
    .insert(tasks)
    .values({
      companyId: company.id,
      title,
      description,
      assigneeId,
      createdById: currentUser.id,
      departmentId,
      category,
      priority,
      status: 'not_started',
      startDate,
      dueDate,
    })
    .returning()

  await getDb().insert(activityEvents).values({
    companyId: company.id,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: task.id,
    action: 'created',
    summary: `created ${title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function createResponsibility(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'A responsibility name is required.' }

  const [currentUser, company] = await Promise.all([getCurrentUser(), getCompany()])
  if (!currentUser || !company) return { error: 'Workspace is not ready yet.' }
  if (!isManagement(currentUser) && !canCreateProjects(currentUser)) {
    return { error: 'You are not allowed to create responsibilities.' }
  }

  const ownerId = String(formData.get('ownerId') ?? currentUser.id)
  const category = String(formData.get('category') || 'operational')
  const status = (String(formData.get('status') || 'active') ||
    'active') as (typeof responsibilityStatusEnum.enumValues)[number]
  const description = String(formData.get('description') ?? '').trim() || null
  const departmentId = String(formData.get('departmentId') ?? '') || null

  const [resp] = await getDb()
    .insert(responsibilities)
    .values({
      companyId: company.id,
      title,
      description,
      ownerId,
      departmentId,
      category,
      status,
    })
    .returning()

  await getDb().insert(responsibilityAssignees).values({
    responsibilityId: resp.id,
    userId: ownerId,
  })

  await getDb().insert(activityEvents).values({
    companyId: company.id,
    actorId: currentUser.id,
    entityType: 'responsibility',
    entityId: resp.id,
    action: 'created',
    summary: `created responsibility ${title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function updateResponsibilityOwner(responsibilityId: string, ownerId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [responsibility] = await getDb()
    .select()
    .from(responsibilities)
    .where(eq(responsibilities.id, responsibilityId))
    .limit(1)
  if (!responsibility) return { error: 'Responsibility not found.' }
  if (!canChangeResponsibilityOwner(currentUser, responsibility)) {
    return { error: 'You are not allowed to change this responsibility owner.' }
  }

  await getDb()
    .update(responsibilities)
    .set({ ownerId })
    .where(eq(responsibilities.id, responsibilityId))

  await getDb().insert(activityEvents).values({
    companyId: responsibility.companyId,
    actorId: currentUser.id,
    entityType: 'responsibility',
    entityId: responsibilityId,
    action: 'ownership_changed',
    summary: `changed owner for ${responsibility.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function createProject(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'A project name is required.' }

  const [currentUser, company] = await Promise.all([getCurrentUser(), getCompany()])
  if (!currentUser || !company) return { error: 'Workspace is not ready yet.' }
  if (!canCreateProjects(currentUser)) return { error: 'You are not allowed to create projects.' }

  const ownerId = String(formData.get('ownerId') ?? currentUser.id)
  const description = String(formData.get('description') ?? '').trim() || null

  const status = (String(formData.get('status') || 'active') ||
    'active') as (typeof projectStatusEnum.enumValues)[number]

  const departmentId = String(formData.get('departmentId') ?? '') || null
  if (!departmentId) return { error: 'Select a department to scope the project.' }

  const milestoneTitle = String(formData.get('milestoneTitle') ?? '').trim() || 'Delivery'

  const [project] = await getDb()
    .insert(projects)
    .values({
      companyId: company.id,
      ownerId,
      title,
      description,
      status,
      progress: 0,
    })
    .returning()

  const teamUserIds = formData.getAll('teamUserIds').map((v) => String(v)).filter(Boolean)
  const teamSet = new Set<string>([ownerId, ...teamUserIds])

  await getDb().insert(projectTeams).values(
    [...teamSet].map((userId) => ({
      projectId: project.id,
      userId,
    })),
  )

  const milestone = await getDb()
    .insert(projectMilestones)
    .values({
      projectId: project.id,
      title: milestoneTitle,
      status: 'active',
      startDate: String(formData.get('startDate') ?? '') || null,
      dueDate: String(formData.get('dueDate') ?? '') || null,
      progress: 0,
    })
    .returning()

  const milestoneRow = milestone[0]
  if (!milestoneRow) return { error: 'Unable to create project milestone.' }

  const departmentTasks = await getDb().select().from(tasks).where(eq(tasks.departmentId, departmentId))
  const milestoneTasksRows = departmentTasks.map((t) => ({ milestoneId: milestoneRow.id, taskId: t.id }))

  if (milestoneTasksRows.length) {
    await getDb().insert(projectMilestoneTasks).values(milestoneTasksRows)

    const completedCount = departmentTasks.filter((t) => t.status === 'completed').length
    const progress = Math.round((completedCount / departmentTasks.length) * 100)

    await getDb()
      .update(projects)
      .set({ progress })
      .where(eq(projects.id, project.id))
  }

  await getDb().insert(activityEvents).values({
    companyId: company.id,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'created',
    summary: `created project ${title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function addComment(taskId: string, body: string) {
  const trimmed = body.trim()
  if (!trimmed) return { error: 'Comment cannot be empty.' }

  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  await getDb().insert(taskComments).values({
    taskId,
    userId: currentUser.id,
    body: trimmed,
  })

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: taskId,
    action: 'commented',
    summary: `commented on ${task.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function updateTaskDetails(input: {
  taskId: string
  title: string
  description: string
  assigneeId: string
  priority: (typeof taskPriorityEnum.enumValues)[number]
  startDate: string | null
  dueDate: string | null
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  if (!canEditTaskActor(currentUser, task)) {
    return { error: 'You are not allowed to edit this task.' }
  }

  const title = input.title.trim()
  if (!title) return { error: 'Task title is required.' }

  const nextDescription = input.description.trim() || null
  const nextStartDate = input.startDate || null
  const nextDueDate = input.dueDate || null

  const changedAssignment = task.assigneeId !== input.assigneeId
  const changedFields =
    task.title !== title ||
    (task.description ?? null) !== nextDescription ||
    task.priority !== input.priority ||
    (task.startDate ?? null) !== nextStartDate ||
    (task.dueDate ?? null) !== nextDueDate

  await getDb()
    .update(tasks)
    .set({
      title,
      description: nextDescription,
      assigneeId: input.assigneeId,
      priority: input.priority,
      startDate: nextStartDate,
      dueDate: nextDueDate,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, input.taskId))

  if (changedAssignment) {
    await getDb().insert(activityEvents).values({
      companyId: task.companyId,
      actorId: currentUser.id,
      entityType: 'task',
      entityId: input.taskId,
      action: 'assignment_changed',
      summary: `reassigned ${title}`,
    })
  }

  if (changedFields) {
    await getDb().insert(activityEvents).values({
      companyId: task.companyId,
      actorId: currentUser.id,
      entityType: 'task',
      entityId: input.taskId,
      action: 'edited',
      summary: `updated task details for ${title}`,
    })
  }

  refreshWorkhub()
  return { ok: true }
}

export async function addAttachment(taskId: string, label: string, url: string) {
  if (!label.trim() || !url.trim()) return { error: 'Label and URL are required.' }

  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  await getDb().insert(taskAttachments).values({
    taskId,
    userId: currentUser.id,
    label: label.trim(),
    url: url.trim(),
  })

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: taskId,
    action: 'attached',
    summary: `attached ${label.trim()} to ${task.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function updateTaskProgress(taskId: string, progress: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)))
  const currentUser = await getCurrentUser()
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  const updates: Record<string, unknown> = { progress: clamped, updatedAt: new Date() }
  if (clamped === 100 && task.status !== 'completed') updates.status = 'completed'
  if (clamped < 100 && task.status === 'completed') updates.status = 'in_progress'
  const shouldRecalculateUnblocked =
    clamped === 100 && task.status !== 'completed'

  await getDb().update(tasks).set(updates).where(eq(tasks.id, taskId))

  if (currentUser) {
    await getDb().insert(activityEvents).values({
      companyId: task.companyId,
      actorId: currentUser.id,
      entityType: 'task',
      entityId: taskId,
      action: 'progress_updated',
      summary: `updated ${task.title} progress to ${clamped}%`,
    })
  }

  if (shouldRecalculateUnblocked) {
    await recalculateUnblockedTasks(taskId, task.companyId, currentUser?.id ?? null)
  }

  refreshWorkhub()
  return { ok: true }
}

async function recalculateUnblockedTasks(
  completedTaskId: string,
  companyId: string,
  actorId: string | null,
) {
  const dependents = await getDb()
    .select({ blockedTaskId: taskDependencies.blockedTaskId })
    .from(taskDependencies)
    .where(and(eq(taskDependencies.companyId, companyId), eq(taskDependencies.blockingTaskId, completedTaskId)))

  for (const d of dependents) {
    const blockedTaskId = d.blockedTaskId
    const [blockedTask] = await getDb().select().from(tasks).where(eq(tasks.id, blockedTaskId)).limit(1)
    if (!blockedTask) continue
    if (blockedTask.status !== 'blocked') continue

    const remaining = await getDb()
      .select({ blockingTaskId: taskDependencies.blockingTaskId })
      .from(taskDependencies)
      .where(and(eq(taskDependencies.companyId, companyId), eq(taskDependencies.blockedTaskId, blockedTaskId)))

    if (remaining.length === 0) continue

    const blockingIds = remaining.map((r) => r.blockingTaskId)
    const blockingTasks = await getDb().select().from(tasks).where(inArray(tasks.id, blockingIds))
    const allDone = blockingTasks.every((t) => t.status === 'completed')

    if (allDone) {
      const newStatus = blockedTask.progress > 0 ? 'in_progress' : 'not_started'
      await getDb()
        .update(tasks)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(tasks.id, blockedTaskId))

      if (actorId) {
        await getDb().insert(activityEvents).values({
          companyId,
          actorId,
          entityType: 'task',
          entityId: blockedTaskId,
          action: 'dependency_satisfied',
          summary: `unblocked ${blockedTask.title} after dependency completion`,
        })
      }
    }
  }
}

export async function createTaskDependency(blockingTaskId: string, blockedTaskId: string) {
  if (blockingTaskId === blockedTaskId) return { error: 'A task cannot depend on itself.' }

  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [blockingTask] = await getDb().select().from(tasks).where(eq(tasks.id, blockingTaskId)).limit(1)
  const [blockedTask] = await getDb().select().from(tasks).where(eq(tasks.id, blockedTaskId)).limit(1)

  if (!blockingTask || !blockedTask) return { error: 'One or both tasks not found.' }
  if (blockingTask.companyId !== blockedTask.companyId) return { error: 'Tasks must belong to the same workspace.' }

  await getDb().insert(taskDependencies).values({
    companyId: blockingTask.companyId,
    blockingTaskId,
    blockedTaskId,
  })

  // If the blocking task isn't completed, mark the blocked task as blocked for visibility.
  if (blockingTask.status !== 'completed' && blockedTask.status !== 'completed' && blockedTask.status !== 'cancelled') {
    await getDb()
      .update(tasks)
      .set({ status: 'blocked', updatedAt: new Date() })
      .where(eq(tasks.id, blockedTaskId))
  }

  await getDb().insert(activityEvents).values({
    companyId: blockingTask.companyId,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: blockedTaskId,
    action: 'dependency_created',
    summary: `set dependency: ${blockingTask.title} → ${blockedTask.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

async function getTaskApproverForDepartment(departmentId: string | null) {
  if (!departmentId) return null
  const [dept] = await getDb().select().from(departments).where(eq(departments.id, departmentId)).limit(1)
  return dept?.ownerId ?? null
}

async function canDecideApproval(userId: string) {
  const privileged = await getDb()
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId))

  return privileged.some((r) => r.key === 'admin' || r.key === 'managing_director')
}

async function requestTaskApproval(taskId: string, requesterId: string) {
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  const [open] = await getDb()
    .select()
    .from(taskApprovals)
    .where(and(eq(taskApprovals.taskId, taskId), eq(taskApprovals.status, 'requested')))
    .limit(1)
  if (open) return { ok: true }

  const approverId = await getTaskApproverForDepartment(task.departmentId)
  const resolvedApproverId = approverId ?? requesterId

  await getDb().insert(taskApprovals).values({
    companyId: task.companyId,
    taskId,
    requestorId: requesterId,
    approverId: resolvedApproverId,
    status: 'requested',
  })

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: requesterId,
    entityType: 'task',
    entityId: taskId,
    action: 'approval_requested',
    summary: `requested approval for ${task.title}`,
  })

  return { ok: true }
}

export async function approveTask(taskId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [approval] = await getDb()
    .select()
    .from(taskApprovals)
    .where(and(eq(taskApprovals.taskId, taskId), eq(taskApprovals.status, 'requested')))
    .orderBy(desc(taskApprovals.createdAt))
    .limit(1)

  if (!approval) return { error: 'No pending approval found for this task.' }

  const allowed = approval.approverId === currentUser.id || (await canDecideApproval(currentUser.id))
  if (!allowed) return { error: 'You are not allowed to approve this request.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  await getDb()
    .update(taskApprovals)
    .set({ status: 'approved', decidedAt: new Date(), decisionReason: null })
    .where(eq(taskApprovals.id, approval.id))

  const newStatus = task.progress >= 100 ? 'completed' : 'in_progress'
  await getDb().update(tasks).set({ status: newStatus, updatedAt: new Date() }).where(eq(tasks.id, taskId))

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: taskId,
    action: 'approved',
    summary: `approved ${task.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function rejectTask(taskId: string, reason: string) {
  const trimmed = reason.trim()
  if (!trimmed) return { error: 'Rejection reason is required.' }

  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [approval] = await getDb()
    .select()
    .from(taskApprovals)
    .where(and(eq(taskApprovals.taskId, taskId), eq(taskApprovals.status, 'requested')))
    .orderBy(desc(taskApprovals.createdAt))
    .limit(1)

  if (!approval) return { error: 'No pending approval found for this task.' }

  const allowed = approval.approverId === currentUser.id || (await canDecideApproval(currentUser.id))
  if (!allowed) return { error: 'You are not allowed to reject this request.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  await getDb()
    .update(taskApprovals)
    .set({ status: 'rejected', decidedAt: new Date(), decisionReason: trimmed })
    .where(eq(taskApprovals.id, approval.id))

  await getDb()
    .update(tasks)
    .set({ status: 'blocked', updatedAt: new Date() })
    .where(eq(tasks.id, taskId))

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: taskId,
    action: 'rejected',
    summary: `rejected ${task.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function requestTaskRevision(taskId: string, reason: string) {
  const trimmed = reason.trim()
  if (!trimmed) return { error: 'Revision reason is required.' }

  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [approval] = await getDb()
    .select()
    .from(taskApprovals)
    .where(and(eq(taskApprovals.taskId, taskId), eq(taskApprovals.status, 'requested')))
    .orderBy(desc(taskApprovals.createdAt))
    .limit(1)

  if (!approval) return { error: 'No pending approval found for this task.' }

  const allowed = approval.approverId === currentUser.id || (await canDecideApproval(currentUser.id))
  if (!allowed) return { error: 'You are not allowed to request revisions.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  await getDb()
    .update(taskApprovals)
    .set({ status: 'revision_requested', decidedAt: new Date(), decisionReason: trimmed })
    .where(eq(taskApprovals.id, approval.id))

  await getDb()
    .update(tasks)
    .set({ status: 'waiting', updatedAt: new Date() })
    .where(eq(tasks.id, taskId))

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: taskId,
    action: 'revision_requested',
    summary: `requested revision for ${task.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function createDeliverable(taskId: string, title: string, description: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const trimmedTitle = title.trim()
  if (!trimmedTitle) return { error: 'Deliverable title is required.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  const [deliverable] = await getDb().insert(deliverables).values({
    companyId: task.companyId,
    taskId,
    title: trimmedTitle,
    description: description.trim() || null,
    status: 'draft',
  }).returning()

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: currentUser.id,
    entityType: 'deliverable',
    entityId: deliverable.id,
    action: 'created',
    summary: `created deliverable ${trimmedTitle}`,
  })

  refreshWorkhub()
  return { ok: true, deliverable }
}

export async function submitDeliverable(
  deliverableId: string,
  evidenceUrl: string,
  notes: string,
) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const trimmedEvidenceUrl = evidenceUrl.trim()
  if (!trimmedEvidenceUrl) return { error: 'Evidence URL is required.' }

  const [deliverable] = await getDb()
    .select()
    .from(deliverables)
    .where(eq(deliverables.id, deliverableId))
    .limit(1)

  if (!deliverable) return { error: 'Deliverable not found.' }

  const [updated] = await getDb()
    .update(deliverables)
    .set({
      status: 'submitted',
      evidenceUrl: trimmedEvidenceUrl,
      submissionNotes: notes.trim() || null,
      submittedById: currentUser.id,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, deliverableId))

  await getDb().insert(activityEvents).values({
    companyId: deliverable.companyId,
    actorId: currentUser.id,
    entityType: 'deliverable',
    entityId: deliverableId,
    action: 'submitted',
    summary: `submitted deliverable ${deliverable.title}`,
  })

  refreshWorkhub()
  return { ok: true, deliverable: updated }
}

async function getDeliverableTaskAndDepartment(deliverableId: string) {
  return getDb()
    .select({
      deliverable: deliverables,
      task: tasks,
      departmentOwnerId: departments.ownerId,
    })
    .from(deliverables)
    .innerJoin(tasks, eq(tasks.id, deliverables.taskId))
    .leftJoin(departments, eq(departments.id, tasks.departmentId))
    .where(eq(deliverables.id, deliverableId))
    .limit(1)
}

export async function verifyDeliverable(deliverableId: string, reason: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const trimmedReason = reason.trim() || null

  const [row] = await getDeliverableTaskAndDepartment(deliverableId)
  if (!row) return { error: 'Deliverable not found.' }

  const allowed =
    (await canDecideApproval(currentUser.id)) ||
    (row.departmentOwnerId ? row.departmentOwnerId === currentUser.id : false)

  if (!allowed) return { error: 'You are not allowed to verify this deliverable.' }

  const [updated] = await getDb()
    .update(deliverables)
    .set({
      status: 'verified',
      decisionReason: trimmedReason,
      verifiedById: currentUser.id,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, deliverableId))
    .returning()

  await getDb().insert(activityEvents).values({
    companyId: row.deliverable.companyId,
    actorId: currentUser.id,
    entityType: 'deliverable',
    entityId: deliverableId,
    action: 'verified',
    summary: `verified deliverable ${row.deliverable.title}`,
  })

  refreshWorkhub()
  return { ok: true, deliverable: updated }
}

export async function approveDeliverable(deliverableId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  if (!(await canDecideApproval(currentUser.id))) return { error: 'Only management can approve deliverables.' }

  const [row] = await getDb()
    .select({ deliverable: deliverables })
    .from(deliverables)
    .where(eq(deliverables.id, deliverableId))
    .limit(1)

  if (!row) return { error: 'Deliverable not found.' }

  const [updated] = await getDb()
    .update(deliverables)
    .set({
      status: 'approved',
      approvedById: currentUser.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, deliverableId))
    .returning()

  await getDb().insert(activityEvents).values({
    companyId: row.deliverable.companyId,
    actorId: currentUser.id,
    entityType: 'deliverable',
    entityId: deliverableId,
    action: 'approved',
    summary: `approved deliverable ${row.deliverable.title}`,
  })

  refreshWorkhub()
  return { ok: true, deliverable: updated }
}

export async function rejectDeliverable(deliverableId: string, reason: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const trimmedReason = reason.trim()
  if (!trimmedReason) return { error: 'Rejection reason is required.' }

  const [row] = await getDeliverableTaskAndDepartment(deliverableId)
  if (!row) return { error: 'Deliverable not found.' }

  const allowed =
    (await canDecideApproval(currentUser.id)) ||
    (row.departmentOwnerId ? row.departmentOwnerId === currentUser.id : false)

  if (!allowed) return { error: 'You are not allowed to reject this deliverable.' }

  const [updated] = await getDb()
    .update(deliverables)
    .set({
      status: 'rejected',
      decisionReason: trimmedReason,
      rejectedById: currentUser.id,
      rejectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, deliverableId))
    .returning()

  await getDb().insert(activityEvents).values({
    companyId: row.deliverable.companyId,
    actorId: currentUser.id,
    entityType: 'deliverable',
    entityId: deliverableId,
    action: 'rejected',
    summary: `rejected deliverable ${row.deliverable.title}`,
  })

  refreshWorkhub()
  return { ok: true, deliverable: updated }
}

export async function toggleUserStatus(userId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  if (!canManageUsers(currentUser)) return { error: 'You are not allowed to change user status.' }

  const [target] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) return { error: 'User not found.' }

  const newStatus = target.status === 'active' ? 'inactive' : 'active'
  await getDb().update(users).set({ status: newStatus }).where(eq(users.id, userId))

  const company = await getCompany()
  if (company) {
    await getDb().insert(activityEvents).values({
      companyId: company.id,
      actorId: currentUser.id,
      entityType: 'user',
      entityId: userId,
      action: newStatus === 'active' ? 'activated' : 'deactivated',
      summary: `${newStatus === 'active' ? 'activated' : 'deactivated'} ${target.firstName} ${target.lastName}`,
    })
  }

  refreshWorkhub()
  return { ok: true, status: newStatus }
}

export async function completeTask(taskId: string) {
  const currentUser = await getCurrentUser()
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  const shouldRecalculateUnblocked = task.status !== 'completed'

  await getDb()
    .update(tasks)
    .set({ status: 'completed', progress: 100, updatedAt: new Date() })
    .where(eq(tasks.id, taskId))

  if (currentUser) {
    await getDb().insert(activityEvents).values({
      companyId: task.companyId,
      actorId: currentUser.id,
      entityType: 'task',
      entityId: task.id,
      action: 'completed',
      summary: `completed ${task.title}`,
    })
  }

  if (shouldRecalculateUnblocked) {
    await recalculateUnblockedTasks(taskId, task.companyId, currentUser?.id ?? null)
  }

  refreshWorkhub()
  return { ok: true }
}

export async function updateTaskStatus(
  taskId: string,
  status: (typeof taskStatusEnum.enumValues)[number],
) {
  const currentUser = await getCurrentUser()
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  const shouldRecalculateUnblocked = status === 'completed' && task.status !== 'completed'
  const shouldRequestApproval = status === 'pending_approval'

  await getDb()
    .update(tasks)
    .set({
      status,
      progress: status === 'completed' ? 100 : task.progress,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))

  if (currentUser) {
    await getDb().insert(activityEvents).values({
      companyId: task.companyId,
      actorId: currentUser.id,
      entityType: 'task',
      entityId: task.id,
      action: 'status_changed',
      summary: `moved ${task.title} to ${statusLabel(status)}`,
    })
  }

  if (currentUser && shouldRequestApproval) {
    await requestTaskApproval(taskId, currentUser.id)
  }

  if (shouldRecalculateUnblocked) {
    await recalculateUnblockedTasks(taskId, task.companyId, currentUser?.id ?? null)
  }

  refreshWorkhub()
  return { ok: true }
}

export async function markNotificationRead(notificationId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [notification] = await getDb()
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, currentUser.id)))
    .limit(1)

  if (!notification) return { error: 'Notification not found.' }

  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, notificationId))

  refreshWorkhub()
  return { ok: true }
}

export async function markAllNotificationsRead() {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.userId, currentUser.id))

  refreshWorkhub()
  return { ok: true }
}

export async function updateNotificationPreferences(formData: FormData) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const values = {
    deadlineAlerts: formData.get('deadlineAlerts') === 'on' ? 1 : 0,
    escalationAlerts: formData.get('escalationAlerts') === 'on' ? 1 : 0,
    approvalAlerts: formData.get('approvalAlerts') === 'on' ? 1 : 0,
    managementRequestAlerts: formData.get('managementRequestAlerts') === 'on' ? 1 : 0,
    dailySummary: formData.get('dailySummary') === 'on' ? 1 : 0,
    updatedAt: new Date(),
  }

  await getDb()
    .insert(notificationPreferences)
    .values({ userId: currentUser.id, ...values })
    .onConflictDoUpdate({
      target: notificationPreferences.userId,
      set: values,
    })

  refreshWorkhub()
  return { ok: true }
}

export async function createManagementRequest(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'A request title is required.' }

  const [currentUser, company] = await Promise.all([getCurrentUser(), getCompany()])
  if (!currentUser || !company) return { error: 'Workspace is not ready yet.' }

  const description = String(formData.get('description') ?? '').trim() || null
  const assigneeId = String(formData.get('assigneeId') ?? '') || null
  const priority = (String(formData.get('priority') || 'medium') ||
    'medium') as (typeof managementRequestPriorityEnum.enumValues)[number]

  const [request] = await getDb()
    .insert(managementRequests)
    .values({
      companyId: company.id,
      requestorId: currentUser.id,
      assigneeId,
      title,
      description,
      priority,
      status: 'open',
    })
    .returning()

  if (assigneeId) {
    await getDb().insert(notifications).values({
      companyId: company.id,
      userId: assigneeId,
      type: 'management_request',
      title: 'New management request',
      body: `${currentUser.firstName} ${currentUser.lastName} submitted "${title}".`,
      entityType: 'management_request',
      entityId: request.id,
    })
  }

  await getDb().insert(activityEvents).values({
    companyId: company.id,
    actorId: currentUser.id,
    entityType: 'management_request',
    entityId: request.id,
    action: 'created',
    summary: `submitted management request ${title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function updateManagementRequestStatus(
  requestId: string,
  status: (typeof managementRequestStatusEnum.enumValues)[number],
  responseNotes?: string,
) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [request] = await getDb()
    .select()
    .from(managementRequests)
    .where(eq(managementRequests.id, requestId))
    .limit(1)

  if (!request) return { error: 'Management request not found.' }

  const canUpdate =
    isManagement(currentUser) ||
    request.assigneeId === currentUser.id ||
    request.requestorId === currentUser.id

  if (!canUpdate) return { error: 'You are not allowed to update this request.' }

  await getDb()
    .update(managementRequests)
    .set({
      status,
      responseNotes: responseNotes?.trim() || request.responseNotes,
      respondedAt: ['resolved', 'cancelled'].includes(status) ? new Date() : request.respondedAt,
      updatedAt: new Date(),
    })
    .where(eq(managementRequests.id, requestId))

  if (request.requestorId !== currentUser.id) {
    await getDb().insert(notifications).values({
      companyId: request.companyId,
      userId: request.requestorId,
      type: 'management_request',
      title: 'Management request updated',
      body: `Your request "${request.title}" is now ${status.replaceAll('_', ' ')}.`,
      entityType: 'management_request',
      entityId: request.id,
    })
  }

  refreshWorkhub()
  return { ok: true }
}

export async function sendWorkspaceReminder(input: { userId: string; message: string; taskId?: string }) {
  const currentUser = await getCurrentUser()
  const company = await getCompany()
  if (!currentUser || !company) return { error: 'Workspace is not ready yet.' }
  if (!isManagement(currentUser) && !canCreateProjects(currentUser)) {
    return { error: 'You are not allowed to send reminders.' }
  }

  const message = input.message.trim()
  if (!message) return { error: 'Reminder message is required.' }

  await getDb().insert(notifications).values({
    companyId: company.id,
    userId: input.userId,
    type: 'reminder',
    title: 'WorkHub reminder',
    body: message,
    entityType: input.taskId ? 'task' : 'user',
    entityId: input.taskId ?? null,
  })

  await getDb().insert(activityEvents).values({
    companyId: company.id,
    actorId: currentUser.id,
    entityType: 'notification',
    entityId: null,
    action: 'reminder_sent',
    summary: `sent a reminder to a team member`,
  })

  refreshWorkhub()
  return { ok: true }
}
