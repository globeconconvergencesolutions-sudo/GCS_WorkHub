import { isOverdue } from '@/lib/format'
import { ACTIVE_TASK_STATUSES, ATTENTION_STATUSES } from '@/lib/constants'

export type ReportTask = {
  id: string
  status: string
  dueDate?: string | Date | null
  departmentId?: string | null
  assigneeId?: string | null
}

export type ReportDepartment = {
  id: string
  name: string
  total: number
  completed: number
  active: number
  progress: number
}

export type ReportProject = {
  id: string
  projectStatus?: string | null
  overdueCount?: number
  blockedCount?: number
}

export type ReportPerson = {
  id: string
  departmentId?: string | null
  status?: string | null
}

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function addDays(days: number, from = new Date()) {
  const next = new Date(from)
  next.setDate(next.getDate() + days)
  return isoDate(next)
}

export function buildReport(input: {
  tasks: ReportTask[]
  departments: ReportDepartment[]
  projects: ReportProject[]
  people: ReportPerson[]
}) {
  const today = isoDate()
  const weekEnd = addDays(7)
  const allTasks = input.tasks
  const activeTasks = allTasks.filter((task) =>
    ACTIVE_TASK_STATUSES.includes(task.status as (typeof ACTIVE_TASK_STATUSES)[number]),
  )
  const dueThisWeek = activeTasks.filter(
    (task) => task.dueDate && String(task.dueDate).slice(0, 10) >= today && String(task.dueDate).slice(0, 10) <= weekEnd,
  )
  const dueToday = activeTasks.filter((task) => String(task.dueDate ?? '').slice(0, 10) === today)
  const overdue = activeTasks.filter((task) => isOverdue(task.dueDate, task.status))
  const blocked = activeTasks.filter((task) =>
    ATTENTION_STATUSES.includes(task.status as (typeof ATTENTION_STATUSES)[number]),
  )
  const completed = allTasks.filter((task) => task.status === 'completed')
  const completionRate = allTasks.length === 0 ? 0 : Math.round((completed.length / allTasks.length) * 100)
  const openProjects = input.projects.filter((project) => project.projectStatus !== 'archived')
  const activePeople = input.people.filter((person) => person.status !== 'inactive')
  const teamCoverage = activePeople.length
    ? Math.round((activePeople.filter((person) => person.departmentId).length / activePeople.length) * 100)
    : 0

  return {
    completionRate,
    overdue: overdue.length,
    blocked: blocked.length,
    dueToday: dueToday.length,
    dueThisWeek: dueThisWeek.length,
    active: activeTasks.length,
    attention: overdue.length + blocked.length,
    activeProjects: openProjects.length,
    teamCoverage,
    departments: input.departments,
  }
}

export function tasksToCsv(tasks: Array<{
  title: string
  status: string
  priority?: string
  dueDate?: string | Date | null
  department?: { name: string } | null
  assignee?: { firstName: string; lastName: string } | null
}>) {
  const header = ['Title', 'Status', 'Priority', 'Due', 'Department', 'Assignee']
  const rows = tasks.map((task) => [
    task.title,
    task.status,
    task.priority ?? '',
    task.dueDate ? String(task.dueDate).slice(0, 10) : '',
    task.department?.name ?? '',
    task.assignee ? `${task.assignee.firstName} ${task.assignee.lastName}` : '',
  ])
  return [header, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n')
}
