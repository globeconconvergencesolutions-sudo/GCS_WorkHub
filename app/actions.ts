'use server'

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import {
  canChangeResponsibilityOwner,
  canCreateWork,
  canDeactivateUser,
  canEditTask,
  canInvite,
  canManageOrg,
  canManageProject,
  canProgressTask,
  canSeeTask,
  canSubmitLeadershipRequest,
  canSubmitWorkRequest,
  canViewCompanyReports,
  canViewDepartmentReports,
  denied,
  isDepartmentHead,
  isDepartmentLeader,
  isManagement,
} from '@/lib/auth/permissions'
import { getInviteStarterPassword } from '@/lib/env'
import { provisionAuthIdentity, revokeAuthSessions } from '@/lib/auth/provision-user'
import { getDb } from '@/lib/db'
import { getCompany, getCurrentUser, getUserByEmail, getUserById, listTasks } from '@/lib/db/queries'
import { tasksToCsv } from '@/lib/reporting/build-report'
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
  teams,
  managementRequestKindEnum,
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
import { resolveCategoryInput } from '@/lib/category'
import { statusLabel } from '@/lib/format'
import { destroyCloudinaryAsset, isOurCloudinaryUrl } from '@/lib/uploads/cloudinary'

function refreshWorkhub() {
  revalidatePath('/')
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48)
}

async function syncProjectProgress(projectId: string) {
  const row = await getDb().query.projects.findFirst({
    where: eq(projects.id, projectId),
    with: {
      milestones: {
        with: { milestoneTasks: { with: { task: true } } },
      },
    },
  })
  if (!row) return

  for (const milestone of row.milestones) {
    const total = milestone.milestoneTasks.length
    const avg =
      total === 0
        ? 0
        : Math.round(
            milestone.milestoneTasks.reduce((sum, entry) => sum + (entry.task.progress ?? 0), 0) / total,
          )
    await getDb()
      .update(projectMilestones)
      .set({
        progress: avg,
        updatedAt: new Date(),
      })
      .where(eq(projectMilestones.id, milestone.id))
  }

  const all = row.milestones.flatMap((milestone) => milestone.milestoneTasks)
  const total = all.length
  const progress =
    total === 0 ? 0 : Math.round(all.reduce((sum, entry) => sum + (entry.task.progress ?? 0), 0) / total)
  await getDb()
    .update(projects)
    .set({
      progress,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
}

async function syncProjectsForTask(taskId: string) {
  const links = await getDb().query.projectMilestoneTasks.findMany({
    where: eq(projectMilestoneTasks.taskId, taskId),
    with: { milestone: true },
  })
  const projectIds = [...new Set(links.map((link) => link.milestone.projectId))]
  for (const projectId of projectIds) {
    await syncProjectProgress(projectId)
  }
}

async function requireManageableProject(projectId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' as const }
  const project = await getDb().query.projects.findFirst({
    where: eq(projects.id, projectId),
  })
  if (!project) return { error: 'Project not found.' as const }
  if (!canManageProject(currentUser, project)) {
    return { error: 'You are not allowed to change this project.' as const }
  }
  return { currentUser, project }
}

async function placeTaskOnMilestone(taskId: string, milestoneId: string) {
  const milestone = await getDb().query.projectMilestones.findFirst({
    where: eq(projectMilestones.id, milestoneId),
  })
  if (!milestone) return { error: 'Milestone not found.' as const }

  const siblings = await getDb()
    .select({ id: projectMilestones.id })
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, milestone.projectId))
  const siblingIds = siblings.map((row) => row.id)

  if (siblingIds.length > 0) {
    await getDb()
      .delete(projectMilestoneTasks)
      .where(
        and(eq(projectMilestoneTasks.taskId, taskId), inArray(projectMilestoneTasks.milestoneId, siblingIds)),
      )
  }

  await getDb().insert(projectMilestoneTasks).values({ milestoneId, taskId })
  await syncProjectProgress(milestone.projectId)
  return { milestone }
}

export async function switchUser(userId: string) {
  return { error: `Switch user is disabled. Sign in with a real account instead of selecting ${userId}.` }
}

export async function logout() {
  return { redirectTo: `/api/auth/logout?redirect=${encodeURIComponent('/login?signedOut=1')}&t=${Date.now()}` }
}

export async function createTask(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'A task name is required.' }

  const [currentUser, company] = await Promise.all([getCurrentUser(), getCompany()])
  if (!currentUser || !company) return { error: 'Workspace is not ready yet.' }
  if (!canCreateWork(currentUser)) {
    return denied('You are not allowed to create tasks for the workspace.')
  }

  const assigneeId = String(formData.get('assigneeId') ?? currentUser.id)
  const assignee = assigneeId === currentUser.id ? currentUser : await getUserById(assigneeId)
  const resolvedCategory = resolveCategoryInput(formData)
  if ('error' in resolvedCategory) return { error: resolvedCategory.error }
  const category = resolvedCategory.category
  const categoryCustom = resolvedCategory.custom
  const priority = (String(formData.get('priority') || 'medium') ||
    'medium') as (typeof taskPriorityEnum.enumValues)[number]
  const startDate = String(formData.get('startDate') ?? '') || null
  const dueDate = String(formData.get('dueDate') ?? '') || null
  const description = String(formData.get('description') ?? '').trim() || null
  let departmentId =
    String(formData.get('departmentId') ?? '') ||
    assignee?.departmentId ||
    currentUser.departmentId ||
    null
  if (isDepartmentLeader(currentUser) && !isManagement(currentUser)) {
    departmentId = currentUser.departmentId
  }
  const milestoneId = String(formData.get('milestoneId') ?? '') || null

  let milestoneForTask: { id: string; projectId: string; title: string } | null = null
  if (milestoneId) {
    const milestone = await getDb().query.projectMilestones.findFirst({
      where: eq(projectMilestones.id, milestoneId),
    })
    if (!milestone) return { error: 'Milestone not found.' }
    const project = await getDb().query.projects.findFirst({ where: eq(projects.id, milestone.projectId) })
    if (!project || !canManageProject(currentUser, project)) {
      return denied('You are not allowed to link work to this project.')
    }
    milestoneForTask = milestone
  }

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
      categoryCustom,
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

  if (assigneeId && assigneeId !== currentUser.id) {
    await getDb().insert(notifications).values({
      companyId: company.id,
      userId: assigneeId,
      type: 'reminder',
      title: 'New task assigned',
      body: `${currentUser.firstName} ${currentUser.lastName} assigned you “${title}”.`,
      entityType: 'task',
      entityId: task.id,
    })
  }

  if (milestoneForTask) {
    const placed = await placeTaskOnMilestone(task.id, milestoneForTask.id)
    if ('error' in placed) return { error: placed.error }
    await getDb().insert(activityEvents).values({
      companyId: company.id,
      actorId: currentUser.id,
      entityType: 'project',
      entityId: milestoneForTask.projectId,
      action: 'task_linked',
      summary: `linked ${title} to ${milestoneForTask.title}`,
    })
  }

  refreshWorkhub()
  return { ok: true }
}

export async function createResponsibility(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'A responsibility name is required.' }

  const [currentUser, company] = await Promise.all([getCurrentUser(), getCompany()])
  if (!currentUser || !company) return { error: 'Workspace is not ready yet.' }
  if (!canCreateWork(currentUser)) {
    return denied('You are not allowed to create responsibilities.')
  }

  const ownerId = String(formData.get('ownerId') ?? currentUser.id)
  const resolvedCategory = resolveCategoryInput(formData)
  if ('error' in resolvedCategory) return { error: resolvedCategory.error }
  const category =
    resolvedCategory.category === 'other'
      ? resolvedCategory.custom ?? 'other'
      : resolvedCategory.category
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
  if (!canCreateWork(currentUser)) return denied('You are not allowed to create projects.')

  const ownerId = String(formData.get('ownerId') ?? currentUser.id)
  const description = String(formData.get('description') ?? '').trim() || null

  const status = (String(formData.get('status') || 'active') ||
    'active') as (typeof projectStatusEnum.enumValues)[number]

  let departmentId = String(formData.get('departmentId') ?? '') || null
  if (isDepartmentLeader(currentUser) && !isManagement(currentUser)) {
    departmentId = currentUser.departmentId
  }
  if (!departmentId) return { error: 'Select a department to scope the project.' }

  const milestoneTitle = String(formData.get('milestoneTitle') ?? '').trim() || 'Delivery'

  const [project] = await getDb()
    .insert(projects)
    .values({
      companyId: company.id,
      ownerId,
      departmentId,
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

  await getDb().insert(activityEvents).values({
    companyId: company.id,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'created',
    summary: `created project ${title}`,
  })

  refreshWorkhub()
  return { ok: true, id: project.id }
}

export async function updateProjectDetails(input: {
  projectId: string
  title: string
  description: string
  status: (typeof projectStatusEnum.enumValues)[number]
  ownerId: string
  departmentId: string
}) {
  const loaded = await requireManageableProject(input.projectId)
  if ('error' in loaded) return { error: loaded.error }
  const { currentUser, project } = loaded

  const title = input.title.trim()
  if (!title) return { error: 'A project name is required.' }
  if (!input.departmentId) return { error: 'Select a department to scope the project.' }
  if (!input.ownerId) return { error: 'Select who leads this project.' }

  await getDb()
    .update(projects)
    .set({
      title,
      description: input.description.trim() || null,
      status: input.status,
      ownerId: input.ownerId,
      departmentId: input.departmentId,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id))

  const existingTeam = await getDb()
    .select({ userId: projectTeams.userId })
    .from(projectTeams)
    .where(eq(projectTeams.projectId, project.id))
  if (!existingTeam.some((row) => row.userId === input.ownerId)) {
    await getDb().insert(projectTeams).values({ projectId: project.id, userId: input.ownerId })
  }

  await getDb().insert(activityEvents).values({
    companyId: project.companyId,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'edited',
    summary: `updated project ${title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function addProjectMilestone(formData: FormData) {
  const projectId = String(formData.get('projectId') ?? '')
  const loaded = await requireManageableProject(projectId)
  if ('error' in loaded) return { error: loaded.error }
  const { currentUser, project } = loaded

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'A milestone name is required.' }
  const startDate = String(formData.get('startDate') ?? '') || null
  const dueDate = String(formData.get('dueDate') ?? '') || null
  if (startDate && dueDate && dueDate < startDate) {
    return { error: 'Due date cannot be before the start date.' }
  }

  const [milestone] = await getDb()
    .insert(projectMilestones)
    .values({
      projectId: project.id,
      title,
      status: 'planned',
      startDate,
      dueDate,
      progress: 0,
    })
    .returning()

  await getDb().insert(activityEvents).values({
    companyId: project.companyId,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'milestone_added',
    summary: `added milestone ${milestone.title}`,
  })

  refreshWorkhub()
  return { ok: true, id: milestone.id }
}

export async function updateProjectMilestone(input: {
  milestoneId: string
  title: string
  status: 'planned' | 'active' | 'completed'
  startDate: string | null
  dueDate: string | null
}) {
  const milestone = await getDb().query.projectMilestones.findFirst({
    where: eq(projectMilestones.id, input.milestoneId),
  })
  if (!milestone) return { error: 'Milestone not found.' }
  const loaded = await requireManageableProject(milestone.projectId)
  if ('error' in loaded) return { error: loaded.error }
  const { currentUser, project } = loaded

  const title = input.title.trim()
  if (!title) return { error: 'A milestone name is required.' }
  if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
    return { error: 'Due date cannot be before the start date.' }
  }

  await getDb()
    .update(projectMilestones)
    .set({
      title,
      status: input.status,
      startDate: input.startDate || null,
      dueDate: input.dueDate || null,
      updatedAt: new Date(),
    })
    .where(eq(projectMilestones.id, milestone.id))

  await getDb().insert(activityEvents).values({
    companyId: project.companyId,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'milestone_updated',
    summary: `updated milestone ${title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function deleteProjectMilestone(milestoneId: string, rehomeMilestoneId?: string | null) {
  const milestone = await getDb().query.projectMilestones.findFirst({
    where: eq(projectMilestones.id, milestoneId),
    with: { milestoneTasks: true },
  })
  if (!milestone) return { error: 'Milestone not found.' }
  const loaded = await requireManageableProject(milestone.projectId)
  if ('error' in loaded) return { error: loaded.error }
  const { currentUser, project } = loaded

  const siblings = await getDb()
    .select({ id: projectMilestones.id })
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, project.id))
  const otherIds = siblings.map((row) => row.id).filter((id) => id !== milestone.id)

  if (rehomeMilestoneId) {
    if (!otherIds.includes(rehomeMilestoneId)) {
      return { error: 'Choose another milestone on this project to keep the linked work.' }
    }
    for (const entry of milestone.milestoneTasks) {
      const placed = await placeTaskOnMilestone(entry.taskId, rehomeMilestoneId)
      if ('error' in placed) return { error: placed.error }
    }
  }

  await getDb().delete(projectMilestones).where(eq(projectMilestones.id, milestone.id))
  await syncProjectProgress(project.id)

  await getDb().insert(activityEvents).values({
    companyId: project.companyId,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'milestone_removed',
    summary: rehomeMilestoneId
      ? `removed milestone ${milestone.title} and kept linked work on this project`
      : `removed milestone ${milestone.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function addProjectTeamMember(projectId: string, userId: string) {
  const loaded = await requireManageableProject(projectId)
  if ('error' in loaded) return { error: loaded.error }
  const { currentUser, project } = loaded
  if (!userId) return { error: 'Select a teammate.' }

  const already = await getDb().query.projectTeams.findFirst({
    where: and(eq(projectTeams.projectId, project.id), eq(projectTeams.userId, userId)),
  })
  if (already) return { ok: true }

  await getDb().insert(projectTeams).values({ projectId: project.id, userId })

  await getDb().insert(activityEvents).values({
    companyId: project.companyId,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'team_added',
    summary: `added a teammate to ${project.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function removeProjectTeamMember(projectId: string, userId: string) {
  const loaded = await requireManageableProject(projectId)
  if ('error' in loaded) return { error: loaded.error }
  const { currentUser, project } = loaded
  if (userId === project.ownerId) {
    return { error: 'The project lead stays on the team. Change the lead first.' }
  }

  await getDb()
    .delete(projectTeams)
    .where(and(eq(projectTeams.projectId, project.id), eq(projectTeams.userId, userId)))

  await getDb().insert(activityEvents).values({
    companyId: project.companyId,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'team_removed',
    summary: `removed a teammate from ${project.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function linkTaskToMilestone(milestoneId: string, taskId: string) {
  const milestone = await getDb().query.projectMilestones.findFirst({
    where: eq(projectMilestones.id, milestoneId),
  })
  if (!milestone) return { error: 'Milestone not found.' }
  const loaded = await requireManageableProject(milestone.projectId)
  if ('error' in loaded) return { error: loaded.error }
  const { currentUser, project } = loaded

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }

  const placed = await placeTaskOnMilestone(taskId, milestoneId)
  if ('error' in placed) return { error: placed.error }

  await getDb().insert(activityEvents).values({
    companyId: project.companyId,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'task_linked',
    summary: `linked ${task.title} to ${milestone.title}`,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function unlinkTaskFromMilestone(milestoneId: string, taskId: string) {
  const milestone = await getDb().query.projectMilestones.findFirst({
    where: eq(projectMilestones.id, milestoneId),
  })
  if (!milestone) return { error: 'Milestone not found.' }
  const loaded = await requireManageableProject(milestone.projectId)
  if ('error' in loaded) return { error: loaded.error }
  const { currentUser, project } = loaded

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)

  await getDb()
    .delete(projectMilestoneTasks)
    .where(
      and(eq(projectMilestoneTasks.milestoneId, milestoneId), eq(projectMilestoneTasks.taskId, taskId)),
    )

  await syncProjectProgress(project.id)

  await getDb().insert(activityEvents).values({
    companyId: project.companyId,
    actorId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'task_unlinked',
    summary: `unlinked ${task?.title ?? 'a task'} from ${milestone.title}`,
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
  if (!canProgressTask(currentUser, task)) return denied('You are not allowed to comment on this task.')

  const [comment] = await getDb()
    .insert(taskComments)
    .values({
      taskId,
      userId: currentUser.id,
      body: trimmed,
    })
    .returning()

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: taskId,
    action: 'commented',
    summary: `commented on ${task.title}`,
  })

  refreshWorkhub()
  return {
    ok: true as const,
    comment: {
      ...comment,
      user: {
        initials: currentUser.initials,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
      },
    },
  }
}

export async function deleteComment(commentId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [comment] = await getDb().select().from(taskComments).where(eq(taskComments.id, commentId)).limit(1)
  if (!comment) return { error: 'Comment not found.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, comment.taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  if (comment.userId !== currentUser.id && !canEditTask(currentUser, task)) {
    return denied('You can only remove your own comments.')
  }

  await getDb().delete(taskComments).where(eq(taskComments.id, commentId))
  refreshWorkhub()
  return { ok: true as const }
}

export async function updateTaskDetails(input: {
  taskId: string
  title: string
  description: string
  assigneeId: string
  priority: (typeof taskPriorityEnum.enumValues)[number]
  category?: (typeof taskCategoryEnum.enumValues)[number]
  categoryCustom?: string | null
  startDate: string | null
  dueDate: string | null
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  if (!canEditTask(currentUser, task)) {
    return denied('You are not allowed to edit this task.')
  }

  if (input.category === 'other' && !input.categoryCustom?.trim()) {
    return { error: 'Type a custom category, or pick one from the list.' }
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
    (input.category ? task.category !== input.category : false) ||
    (task.startDate ?? null) !== nextStartDate ||
    (task.dueDate ?? null) !== nextDueDate

  await getDb()
    .update(tasks)
    .set({
      title,
      description: nextDescription,
      assigneeId: input.assigneeId,
      priority: input.priority,
      ...(input.category
        ? {
            category: input.category,
            categoryCustom: input.category === 'other' ? input.categoryCustom || null : null,
          }
        : {}),
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

  await syncProjectsForTask(input.taskId)
  refreshWorkhub()
  return { ok: true }
}

export async function addAttachment(input: {
  taskId: string
  label: string
  url: string
  publicId?: string | null
  bytes?: number | null
  mimeType?: string | null
  originalName?: string | null
}) {
  const label = input.label.trim()
  const url = input.url.trim()
  if (!label || !url) return { error: 'A file or document link is required.' }
  if (!isSafeAttachmentUrl(url)) return { error: 'Use an https link, or upload a file from this device.' }

  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  if (!canProgressTask(currentUser, task)) return denied('You are not allowed to attach files to this task.')

  const [attachment] = await getDb()
    .insert(taskAttachments)
    .values({
      taskId: input.taskId,
      userId: currentUser.id,
      label,
      url,
      publicId: input.publicId?.trim() || null,
      bytes: input.bytes ?? null,
      mimeType: input.mimeType?.trim() || null,
      originalName: input.originalName?.trim() || null,
    })
    .returning()

  await getDb().insert(activityEvents).values({
    companyId: task.companyId,
    actorId: currentUser.id,
    entityType: 'task',
    entityId: input.taskId,
    action: 'attached',
    summary: `attached ${label} to ${task.title}`,
  })

  refreshWorkhub()
  return { ok: true as const, attachment }
}

export async function deleteAttachment(attachmentId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const [attachment] = await getDb().select().from(taskAttachments).where(eq(taskAttachments.id, attachmentId)).limit(1)
  if (!attachment) return { error: 'Attachment not found.' }

  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, attachment.taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  const mayDelete = attachment.userId === currentUser.id || canEditTask(currentUser, task)
  if (!mayDelete) return denied('You are not allowed to remove this attachment.')

  if (attachment.publicId) {
    await destroyCloudinaryAsset(attachment.publicId)
  }

  await getDb().delete(taskAttachments).where(eq(taskAttachments.id, attachmentId))
  refreshWorkhub()
  return { ok: true as const }
}

function isSafeAttachmentUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    return isOurCloudinaryUrl(url) || parsed.hostname.length > 0
  } catch {
    return false
  }
}

export async function updateTaskProgress(taskId: string, progress: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(progress)))
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  if (!canProgressTask(currentUser, task)) return denied('You are not allowed to update this task.')

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

  await syncProjectsForTask(taskId)
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
  if (!canEditTask(currentUser, blockingTask) || !canEditTask(currentUser, blockedTask)) {
    return denied('You are not allowed to set dependencies on these tasks.')
  }

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
  if (!canSeeTask(currentUser, task)) return denied('You are not allowed to approve this request.')

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

  await syncProjectsForTask(taskId)
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
  if (!canProgressTask(currentUser, task)) return denied('You are not allowed to add deliverables to this task.')

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
  evidence?: {
    publicId?: string | null
    bytes?: number | null
    mimeType?: string | null
    originalName?: string | null
  },
) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const trimmedEvidenceUrl = evidenceUrl.trim()
  if (!trimmedEvidenceUrl) return { error: 'Upload evidence or paste an https link before submitting.' }
  if (!isSafeAttachmentUrl(trimmedEvidenceUrl)) {
    return { error: 'Evidence must be an uploaded file or an https link.' }
  }

  const [deliverable] = await getDb()
    .select()
    .from(deliverables)
    .where(eq(deliverables.id, deliverableId))
    .limit(1)

  if (!deliverable) return { error: 'Deliverable not found.' }
  const [taskForSubmit] = await getDb().select().from(tasks).where(eq(tasks.id, deliverable.taskId)).limit(1)
  if (!taskForSubmit || !canProgressTask(currentUser, taskForSubmit)) {
    return denied('You are not allowed to submit this deliverable.')
  }

  const [updated] = await getDb()
    .update(deliverables)
    .set({
      status: 'submitted',
      evidenceUrl: trimmedEvidenceUrl,
      evidencePublicId: evidence?.publicId?.trim() || null,
      evidenceBytes: evidence?.bytes ?? null,
      evidenceMimeType: evidence?.mimeType?.trim() || null,
      evidenceOriginalName: evidence?.originalName?.trim() || null,
      submissionNotes: notes.trim() || null,
      submittedById: currentUser.id,
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deliverables.id, deliverableId))
    .returning()

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

  const target = await getUserById(userId)
  if (!target) return { error: 'User not found.' }

  const adminRole = await getDb().select().from(roles).where(eq(roles.key, 'admin')).limit(1)
  const adminIds =
    adminRole[0]
      ? await getDb().select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, adminRole[0].id))
      : []
  if (!canDeactivateUser(currentUser, target, adminIds.length)) {
    return denied('You are not allowed to change this person’s status.')
  }

  const newStatus = target.status === 'active' ? 'inactive' : 'active'
  await getDb().update(users).set({ status: newStatus }).where(eq(users.id, userId))
  if (newStatus === 'inactive') {
    await revokeAuthSessions(userId)
  }

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
  if (!currentUser) return { error: 'Not signed in.' }
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  if (!canProgressTask(currentUser, task)) return denied('You are not allowed to complete this task.')
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

  await syncProjectsForTask(taskId)
  refreshWorkhub()
  return { ok: true }
}

export async function updateTaskStatus(
  taskId: string,
  status: (typeof taskStatusEnum.enumValues)[number],
) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  const [task] = await getDb().select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
  if (!task) return { error: 'Task not found.' }
  if (!canProgressTask(currentUser, task)) return denied('You are not allowed to change this task status.')
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

  await syncProjectsForTask(taskId)
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
    .where(and(eq(notifications.userId, currentUser.id), isNull(notifications.readAt)))

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

  const wantsWork = String(formData.get('kind') ?? '') === 'work'
  let kind: (typeof managementRequestKindEnum.enumValues)[number] = 'leadership'
  if (canSubmitWorkRequest(currentUser)) {
    kind = 'work'
  } else if (canSubmitLeadershipRequest(currentUser)) {
    kind = wantsWork ? 'work' : 'leadership'
  } else {
    return denied('You are not allowed to submit this request.')
  }

  const description = String(formData.get('description') ?? '').trim() || null
  let assigneeId = String(formData.get('assigneeId') ?? '') || null
  if (kind === 'work' && currentUser.departmentId) {
    const [dept] = await getDb().select().from(departments).where(eq(departments.id, currentUser.departmentId)).limit(1)
    assigneeId = dept?.ownerId ?? assigneeId
  }
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
      kind,
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

  const requestor = await getUserById(request.requestorId)
  const canUpdate =
    isManagement(currentUser) ||
    request.assigneeId === currentUser.id ||
    request.requestorId === currentUser.id ||
    Boolean(
      isDepartmentLeader(currentUser) &&
        currentUser.departmentId &&
        requestor?.departmentId === currentUser.departmentId,
    )

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
  if (!isManagement(currentUser) && !canCreateWork(currentUser)) {
    return denied('You are not allowed to send reminders.')
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

export async function inviteEmployee(formData: FormData) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }

  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const jobTitle = String(formData.get('jobTitle') ?? '').trim()
  let departmentId = String(formData.get('departmentId') ?? '') || null
  const managerId = String(formData.get('managerId') ?? '') || null
  const roleKey = String(formData.get('roleKey') ?? 'employee').trim() || 'employee'
  if (isDepartmentHead(currentUser) && !isManagement(currentUser)) {
    departmentId = currentUser.departmentId ?? null
  }
  if (!canInvite(currentUser, { roleKey, departmentId })) {
    return denied('You are not allowed to add this person.')
  }
  if ((roleKey === 'department_head' || roleKey === 'manager') && !departmentId) {
    return { error: 'Assign a department for this role.' }
  }

  if (!firstName || !lastName) return { error: 'First and last name are required.' }
  if (!email || !email.includes('@')) return { error: 'A valid work email is required.' }
  if (!jobTitle) return { error: 'A job title is required.' }

  const existing = await getUserByEmail(email)
  if (existing) return { error: 'That email is already on WorkHub.' }

  const company = await getCompany()
  if (!company) return { error: 'Workspace is not ready yet.' }

  const [role] = await getDb().select().from(roles).where(eq(roles.key, roleKey)).limit(1)
  if (!role) return { error: 'Choose a valid role.' }

  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase() || 'G'
  const starterPassword = getInviteStarterPassword()
  const passwordHash = await bcrypt.hash(starterPassword, 10)

  const [created] = await getDb()
    .insert(users)
    .values({
      companyId: company.id,
      departmentId,
      managerId,
      email,
      firstName,
      lastName,
      jobTitle,
      passwordHash,
      initials,
      status: 'active',
    })
    .returning()

  await getDb().insert(userRoles).values({ userId: created.id, roleId: role.id })
  await getDb().insert(notificationPreferences).values({ userId: created.id })
  await provisionAuthIdentity({
    userId: created.id,
    email,
    name: `${firstName} ${lastName}`,
    passwordHash,
  })

  await getDb().insert(activityEvents).values({
    companyId: company.id,
    actorId: currentUser.id,
    entityType: 'user',
    entityId: created.id,
    action: 'invited',
    summary: `added ${firstName} ${lastName} to WorkHub`,
  })

  refreshWorkhub()
  return { ok: true, starterPassword, email }
}

export async function exportReportCsv() {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  if (!canViewCompanyReports(currentUser) && !canViewDepartmentReports(currentUser)) {
    return denied('You are not allowed to export this report.')
  }
  const scopedTasks = await listTasks({ viewer: currentUser })
  const csv = tasksToCsv(scopedTasks)
  const scope = canViewCompanyReports(currentUser) ? 'company' : 'department'
  return { ok: true as const, csv, filename: `gcs-workhub-${scope}-${new Date().toISOString().slice(0, 10)}.csv` }
}

export async function promoteWorkRequest(requestId: string) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  if (!canCreateWork(currentUser)) return denied('You are not allowed to turn this into a task.')

  const [request] = await getDb().select().from(managementRequests).where(eq(managementRequests.id, requestId)).limit(1)
  if (!request) return { error: 'Request not found.' }
  if (request.kind !== 'work') return { error: 'Only work requests can be promoted to tasks.' }
  if (request.status === 'resolved' || request.status === 'cancelled') {
    return { error: 'This request is already closed.' }
  }

  const requestor = await getUserById(request.requestorId)
  if (
    !isManagement(currentUser) &&
    request.assigneeId !== currentUser.id &&
    !(isDepartmentLeader(currentUser) && currentUser.departmentId && requestor?.departmentId === currentUser.departmentId)
  ) {
    return denied('You are not allowed to promote this request.')
  }

  const formData = new FormData()
  formData.set('title', request.title)
  formData.set('description', request.description ?? '')
  formData.set('assigneeId', request.requestorId)
  formData.set('priority', request.priority === 'urgent' ? 'high' : request.priority)
  formData.set('category', 'operational')
  if (requestor?.departmentId) formData.set('departmentId', requestor.departmentId)
  const created = await createTask(formData)
  if (created && 'error' in created && created.error) return created

  await getDb()
    .update(managementRequests)
    .set({ status: 'resolved', responseNotes: 'Promoted to a task.', respondedAt: new Date(), updatedAt: new Date() })
    .where(eq(managementRequests.id, requestId))

  await getDb().insert(notifications).values({
    companyId: request.companyId,
    userId: request.requestorId,
    type: 'management_request',
    title: 'Work request accepted',
    body: `"${request.title}" is now a task on your list.`,
    entityType: 'management_request',
    entityId: request.id,
  })

  refreshWorkhub()
  return { ok: true }
}

export async function createDepartment(formData: FormData) {
  const currentUser = await getCurrentUser()
  const company = await getCompany()
  if (!currentUser || !company) return { error: 'Workspace is not ready yet.' }
  if (!canManageOrg(currentUser)) return denied('Only an admin can change company structure.')

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Department name is required.' }
  const color = String(formData.get('color') ?? 'teal').trim() || 'teal'
  const ownerId = String(formData.get('ownerId') ?? '') || null
  let slug = slugify(String(formData.get('slug') ?? name))
  if (!slug) slug = `dept-${Date.now().toString(36)}`

  const [created] = await getDb()
    .insert(departments)
    .values({ companyId: company.id, name, slug, color, ownerId })
    .returning()

  await getDb().insert(activityEvents).values({
    companyId: company.id,
    actorId: currentUser.id,
    entityType: 'department',
    entityId: created.id,
    action: 'created',
    summary: `created department ${name}`,
  })
  refreshWorkhub()
  return { ok: true }
}

export async function updateDepartment(formData: FormData) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  if (!canManageOrg(currentUser)) return denied('Only an admin can change company structure.')

  const departmentId = String(formData.get('departmentId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!departmentId || !name) return { error: 'Department and name are required.' }
  const color = String(formData.get('color') ?? 'teal').trim() || 'teal'
  const ownerId = String(formData.get('ownerId') ?? '') || null

  await getDb()
    .update(departments)
    .set({ name, color, ownerId, slug: slugify(name) })
    .where(eq(departments.id, departmentId))
  refreshWorkhub()
  return { ok: true }
}

export async function createTeam(formData: FormData) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  if (!canManageOrg(currentUser)) return denied('Only an admin can change company structure.')

  const name = String(formData.get('name') ?? '').trim()
  const departmentId = String(formData.get('departmentId') ?? '')
  if (!name || !departmentId) return { error: 'Team name and department are required.' }

  const [created] = await getDb().insert(teams).values({ name, departmentId }).returning()
  const company = await getCompany()
  if (company) {
    await getDb().insert(activityEvents).values({
      companyId: company.id,
      actorId: currentUser.id,
      entityType: 'team',
      entityId: created.id,
      action: 'created',
      summary: `created team ${name}`,
    })
  }
  refreshWorkhub()
  return { ok: true }
}

export async function updateTeam(formData: FormData) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  if (!canManageOrg(currentUser)) return denied('Only an admin can change company structure.')
  const teamId = String(formData.get('teamId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!teamId || !name) return { error: 'Team and name are required.' }
  await getDb().update(teams).set({ name }).where(eq(teams.id, teamId))
  refreshWorkhub()
  return { ok: true }
}

export async function updateUserPlacement(formData: FormData) {
  const currentUser = await getCurrentUser()
  if (!currentUser) return { error: 'Not signed in.' }
  if (!canManageOrg(currentUser)) return denied('Only an admin can place people.')

  const userId = String(formData.get('userId') ?? '')
  if (!userId) return { error: 'Choose a person.' }
  const departmentId = String(formData.get('departmentId') ?? '') || null
  const teamId = String(formData.get('teamId') ?? '') || null
  const managerId = String(formData.get('managerId') ?? '') || null
  const roleKey = String(formData.get('roleKey') ?? '').trim()

  await getDb()
    .update(users)
    .set({ departmentId, teamId, managerId })
    .where(eq(users.id, userId))

  if (roleKey) {
    const [role] = await getDb().select().from(roles).where(eq(roles.key, roleKey)).limit(1)
    if (!role) return { error: 'Choose a valid role.' }
    if ((roleKey === 'department_head' || roleKey === 'manager') && !departmentId) {
      return { error: 'Department heads and managers need a department.' }
    }
    await getDb().delete(userRoles).where(eq(userRoles.userId, userId))
    await getDb().insert(userRoles).values({ userId, roleId: role.id })
  }

  refreshWorkhub()
  return { ok: true }
}

