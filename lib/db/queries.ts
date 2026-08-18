import { and, asc, desc, eq, gte, inArray, lte, ne, or, sql } from 'drizzle-orm'
import { auth } from '@/auth'
import { ACTIVE_TASK_STATUSES, ATTENTION_STATUSES } from '@/lib/constants'
import { getDb } from '@/lib/db'
import {
  activityEvents,
  companies,
  departments,
  responsibilities,
  projects,
  responsibilityAssignees,
  roles,
  taskComments,
  tasks,
  users,
  teams,
} from '@/lib/db/schema'
import { isOverdue } from '@/lib/format'
import type { CurrentUser } from '@/lib/types'

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function addDays(days: number, from = new Date()) {
  const next = new Date(from)
  next.setDate(next.getDate() + days)
  return isoDate(next)
}

export async function getCompany() {
  const [company] = await getDb().select().from(companies).limit(1)
  return company ?? null
}

export async function getUserById(id: string) {
  return getDb().query.users.findFirst({
    where: eq(users.id, id),
    with: {
      department: true,
      roles: { with: { role: true } },
    },
  })
}

export async function getUserByEmail(email: string) {
  return getDb().query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
    with: {
      department: true,
      roles: { with: { role: true } },
    },
  })
}

function roleKeys(user: CurrentUser | null) {
  return user?.roles?.map((entry) => entry.role.key) ?? []
}

function isManagement(user: CurrentUser | null) {
  const keys = new Set(roleKeys(user))
  return keys.has('admin') || keys.has('managing_director')
}

function isDepartmentLeader(user: CurrentUser | null) {
  const keys = new Set(roleKeys(user))
  return keys.has('department_head') || keys.has('manager')
}

function canSeeTask(user: CurrentUser | null, task: { assigneeId: string | null; departmentId: string | null }) {
  if (!user) return false
  if (isManagement(user)) return true
  if (isDepartmentLeader(user) && user.departmentId && task.departmentId === user.departmentId) return true
  return task.assigneeId === user.id
}

export async function getCurrentUser() {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return null
  return getUserByEmail(email)
}

export async function getWorkspaceContext() {
  const company = await getCompany()
  const currentUser = await getCurrentUser()
  const people = currentUser ? await listPeople(currentUser) : []
  return { company, currentUser, people }
}

export async function listPeople(viewer?: CurrentUser | null) {
  const rows = await getDb().query.users.findMany({
    where: eq(users.status, 'active'),
    with: {
      department: true,
      manager: true,
    },
    orderBy: [asc(users.firstName), asc(users.lastName)],
  })

  if (!viewer) return []
  if (isManagement(viewer)) return rows
  if (isDepartmentLeader(viewer) && viewer.departmentId) {
    return rows.filter((row) => row.departmentId === viewer.departmentId)
  }
  return rows.filter((row) => row.id === viewer.id)
}

export async function listTasks(options?: { assigneeId?: string; departmentId?: string; viewer?: CurrentUser | null }) {
  const rows = await getDb().query.tasks.findMany({
    where: and(
      options?.assigneeId ? eq(tasks.assigneeId, options.assigneeId) : undefined,
      options?.departmentId ? eq(tasks.departmentId, options.departmentId) : undefined,
    ),
    with: {
      assignee: true,
      department: true,
      comments: true,
      attachments: true,
      approvals: { with: { requestor: true, approver: true } },
      deliverables: true,
      blockingDependencies: { with: { blockedTask: true } },
      blockedByDependencies: { with: { blockingTask: true } },
    },
    orderBy: [asc(tasks.dueDate), desc(tasks.createdAt)],
  })

  if (!options?.viewer) return rows
  return rows.filter((task) => canSeeTask(options.viewer ?? null, task))
}

export async function listDepartments(viewer?: CurrentUser | null) {
  const db = getDb()
  const rows = await db.query.departments.findMany({
    with: { owner: true, teams: true },
    orderBy: [asc(departments.name)],
  })

  const stats = await db
    .select({
      departmentId: tasks.departmentId,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')::int`,
      active: sql<number>`count(*) filter (where ${tasks.status} not in ('completed', 'cancelled'))::int`,
    })
    .from(tasks)
    .groupBy(tasks.departmentId)

  const byId = new Map(stats.map((row) => [row.departmentId, row]))

  const scopedRows = rows
    .map((department) => {
    const stat = byId.get(department.id)
    const total = stat?.total ?? 0
    const completed = stat?.completed ?? 0
    const active = stat?.active ?? 0
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100)
    return { ...department, total, completed, active, progress }
  })

  if (!viewer) return []
  if (isManagement(viewer)) return scopedRows
  if (viewer.departmentId) return scopedRows.filter((department) => department.id === viewer.departmentId)
  return []
}

export async function getDepartmentBySlug(slug: string) {
  const department = await getDb().query.departments.findFirst({
    where: eq(departments.slug, slug),
    with: { owner: true, teams: true, users: true },
  })
  if (!department) return null

  const currentUser = await getCurrentUser()
  const departmentTasks = await listTasks({ departmentId: department.id, viewer: currentUser })
  const total = departmentTasks.length
  const completed = departmentTasks.filter((task) => task.status === 'completed').length
  const progress = total === 0 ? 0 : Math.round((completed / total) * 100)

  return { ...department, tasks: departmentTasks, total, completed, progress }
}

export async function listResponsibilities(options?: { ownerId?: string; viewer?: CurrentUser | null }) {
  const rows = await getDb().query.responsibilities.findMany({
    where: options?.ownerId ? eq(responsibilities.ownerId, options.ownerId) : undefined,
    with: {
      owner: true,
      department: true,
      assignees: { with: { user: true } },
    },
    orderBy: [asc(responsibilities.title)],
  })

  const viewer = options?.viewer ?? null
  if (!viewer) return rows
  if (isManagement(viewer)) return rows
  if (isDepartmentLeader(viewer) && viewer.departmentId) {
    return rows.filter((row) => row.departmentId === viewer.departmentId || row.ownerId === viewer.id)
  }
  return rows.filter((row) => row.ownerId === viewer.id)
}

export async function listActivity(limit = 12, viewer?: CurrentUser | null) {
  const rows = await getDb().query.activityEvents.findMany({
    with: { actor: true },
    orderBy: [desc(activityEvents.createdAt)],
    limit,
  })

  if (!viewer) return rows
  if (isManagement(viewer)) return rows
  if (isDepartmentLeader(viewer) && viewer.departmentId) {
    return rows.filter((row) => row.actor?.departmentId === viewer.departmentId || row.actorId === viewer.id)
  }
  return rows.filter((row) => row.actorId === viewer.id)
}

export async function getDashboardData(user: CurrentUser) {
  const overview = await getOverviewData(user)
  const [responsibilities, allActivity, allTasks] = await Promise.all([
    listResponsibilities({ viewer: user }),
    listActivity(20, user),
    listTasks({ viewer: user }),
  ])

  const myTasks = allTasks.filter((task) => task.assigneeId === user.id)
  const myActive = myTasks.filter(
    (task) => task.status !== 'completed' && task.status !== 'cancelled',
  )
  const myCompleted = myTasks.filter((task) => task.status === 'completed')
  const myInProgress = myTasks.filter((task) => task.status === 'in_progress')

  const projects = await listProjects({ limit: 3, viewer: user })

  return {
    ...overview,
    responsibilities,
    allActivity,
    allTasks,
    myTasks,
    myMetrics: {
      assigned: myActive.length,
      inProgress: myInProgress.length,
      completed: myCompleted.length,
    },
    projects,
    reportMetrics: {
      completionRate: overview.metrics.completionRate,
      overdue: overview.metrics.overdue,
      activeProjects: projects.length,
      teamCoverage: overview.people.length
        ? Math.round((overview.people.filter((p) => p.departmentId).length / overview.people.length) * 100)
        : 0,
    },
  }
}

export async function listProjects(options?: { limit?: number; viewer?: CurrentUser | null }) {
  const rows = await getDb().query.projects.findMany({
    with: {
      owner: { with: { department: true } },
      teams: { with: { user: true } },
      milestones: {
        with: {
          milestoneTasks: {
            with: { task: true },
          },
        },
      },
    },
    orderBy: [desc(projects.updatedAt)],
    limit: options?.limit,
  })

  const filteredRows = rows.filter((project) => {
    const viewer = options?.viewer ?? null
    if (!viewer) return true
    if (isManagement(viewer)) return true
    if (project.ownerId === viewer.id) return true
    if (project.teams.some((entry) => entry.userId === viewer.id)) return true
    if (isDepartmentLeader(viewer) && viewer.departmentId && project.owner?.departmentId === viewer.departmentId) return true
    return false
  })

  return filteredRows.map((project) => {
    const allMilestoneTasks = project.milestones.flatMap((m) => m.milestoneTasks)
    const total = allMilestoneTasks.length
    const completed = allMilestoneTasks.filter((mt) => mt.task.status === 'completed').length
    const progress = total === 0 ? project.progress : Math.round((completed / total) * 100)
    const status =
      progress >= 80 ? 'On track' : progress >= 50 ? 'At risk' : 'Needs review'

    return {
      id: project.id,
      title: project.title,
      owner: project.owner ? `${project.owner.firstName} ${project.owner.lastName}` : 'Unassigned',
      progress,
      status,
      tasks: `${completed} / ${total}`,
    }
  })
}

export async function getOverviewData(user: CurrentUser) {
  const today = isoDate()
  const weekEnd = addDays(7)

  const [allTasks, departmentRows, activity, myResponsibilities, people] = await Promise.all([
    listTasks({ viewer: user }),
    listDepartments(user),
    listActivity(6, user),
    listResponsibilities({ ownerId: user.id, viewer: user }),
    listPeople(user),
  ])

  const activeTasks = allTasks.filter((task) => ACTIVE_TASK_STATUSES.includes(task.status as (typeof ACTIVE_TASK_STATUSES)[number]))
  const dueThisWeek = activeTasks.filter((task) => task.dueDate && task.dueDate >= today && task.dueDate <= weekEnd)
  const dueToday = activeTasks.filter((task) => task.dueDate === today)
  const overdue = activeTasks.filter((task) => isOverdue(task.dueDate, task.status))
  const blocked = activeTasks.filter((task) => ATTENTION_STATUSES.includes(task.status as (typeof ATTENTION_STATUSES)[number]))
  const completed = allTasks.filter((task) => task.status === 'completed')
  const completionRate = allTasks.length === 0 ? 0 : Math.round((completed.length / allTasks.length) * 100)
  const upcoming = [...activeTasks]
    .filter((task) => task.dueDate)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 4)

  return {
    metrics: {
      active: activeTasks.length,
      departments: departmentRows.length,
      dueThisWeek: dueThisWeek.length,
      dueToday: dueToday.length,
      attention: overdue.length + blocked.length,
      overdue: overdue.length,
      blocked: blocked.length,
      completionRate,
    },
    tasks: allTasks,
    departments: departmentRows,
    activity,
    upcoming,
    myResponsibilityCount: myResponsibilities.length,
    myTaskCount: allTasks.filter((task) => task.assigneeId === user.id && task.status !== 'completed' && task.status !== 'cancelled').length,
    people,
  }
}

export async function listRoles() {
  return getDb().select().from(roles).orderBy(asc(roles.rank))
}

export async function getSettingsData() {
  const currentUser = await getCurrentUser()
  if (!currentUser || !isManagement(currentUser)) {
    return { company: null, people: [], roles: [], departments: [], teams: [] }
  }

  const [company, people, roleRows, departmentRows, teamRows] = await Promise.all([
    getCompany(),
    listPeople(currentUser),
    listRoles(),
    getDb().query.departments.findMany({ with: { owner: true }, orderBy: [asc(departments.name)] }),
    getDb().query.teams.findMany({ with: { department: true }, orderBy: [asc(teams.name)] }),
  ])

  return { company, people, roles: roleRows, departments: departmentRows, teams: teamRows }
}

export { or, and, eq, gte, lte, ne, inArray, sql, taskComments, responsibilityAssignees }
