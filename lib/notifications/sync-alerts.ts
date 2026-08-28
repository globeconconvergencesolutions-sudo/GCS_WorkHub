import { and, eq, inArray } from 'drizzle-orm'
import { ACTIVE_TASK_STATUSES, ATTENTION_STATUSES } from '@/lib/constants'
import { getDb } from '@/lib/db'
import {
  deadlineAlertLog,
  departments,
  notificationPreferences,
  notifications,
  roles,
  tasks,
  userRoles,
  users,
} from '@/lib/db/schema'
import { isOverdue } from '@/lib/format'
import type { CurrentUser } from '@/lib/types'

type AlertType =
  | 'deadline_7d'
  | 'deadline_3d'
  | 'deadline_1d'
  | 'deadline_today'
  | 'overdue'
  | 'escalation_department'
  | 'escalation_management'
  | 'daily_summary'
  | 'weekly_summary'
  | 'monthly_summary'

function isoDate(date = new Date()) {
  return date.toISOString().slice(0, 10)
}

function daysUntil(dueDate: string, from = new Date()) {
  const due = new Date(`${dueDate}T12:00:00`)
  const today = new Date(from)
  today.setHours(12, 0, 0, 0)
  due.setHours(12, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function dedupeKey(userId: string, alertType: AlertType, alertDate: string, taskId?: string | null) {
  return `${userId}:${alertType}:${alertDate}:${taskId ?? 'none'}`
}

async function getPreferences(userId: string) {
  const [prefs] = await getDb()
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1)

  if (prefs) return prefs

  const [created] = await getDb()
    .insert(notificationPreferences)
    .values({ userId })
    .returning()

  return created
}

async function createAlertIfNew(input: {
  companyId: string
  userId: string
  type: AlertType
  title: string
  body: string
  entityType?: string
  entityId?: string
  taskId?: string | null
  alertDate: string
}) {
  const key = dedupeKey(input.userId, input.type, input.alertDate, input.taskId)
  const db = getDb()

  const existing = await db
    .select({ id: deadlineAlertLog.id })
    .from(deadlineAlertLog)
    .where(eq(deadlineAlertLog.dedupeKey, key))
    .limit(1)

  if (existing[0]) return false

  const inserted = await db
    .insert(deadlineAlertLog)
    .values({
      companyId: input.companyId,
      userId: input.userId,
      taskId: input.taskId ?? null,
      alertType: input.type,
      alertDate: input.alertDate,
      dedupeKey: key,
    })
    .onConflictDoNothing()
    .returning({ id: deadlineAlertLog.id })

  if (!inserted[0]) return false

  await db.insert(notifications).values({
    companyId: input.companyId,
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
  })

  return true
}

async function getManagingDirectorIds(companyId: string) {
  const rows = await getDb()
    .select({ userId: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(users.companyId, companyId), inArray(roles.key, ['managing_director', 'admin'])))

  return rows.map((row) => row.userId)
}

async function getDepartmentOwnerId(departmentId: string | null) {
  if (!departmentId) return null
  const [department] = await getDb()
    .select({ ownerId: departments.ownerId })
    .from(departments)
    .where(eq(departments.id, departmentId))
    .limit(1)

  return department?.ownerId ?? null
}

export async function syncDeadlineAlertsForUser(user: CurrentUser, companyId: string) {
  const today = isoDate()
  const prefs = await getPreferences(user.id)

  const assignedTasks = await getDb().query.tasks.findMany({
    where: and(eq(tasks.assigneeId, user.id), inArray(tasks.status, [...ACTIVE_TASK_STATUSES])),
  })

  if (prefs.deadlineAlerts) {
    for (const task of assignedTasks) {
      if (!task.dueDate) continue

      const dueDate = String(task.dueDate).slice(0, 10)
      const remaining = daysUntil(dueDate)

      const alertMap: Array<{ type: AlertType; title: string; body: string }> = []
      if (remaining === 7) {
        alertMap.push({
          type: 'deadline_7d',
          title: 'Deadline in 7 days',
          body: `${task.title} is due in one week.`,
        })
      }
      if (remaining === 3) {
        alertMap.push({
          type: 'deadline_3d',
          title: 'Deadline in 3 days',
          body: `${task.title} is due in three days.`,
        })
      }
      if (remaining === 1) {
        alertMap.push({
          type: 'deadline_1d',
          title: 'Deadline tomorrow',
          body: `${task.title} is due tomorrow.`,
        })
      }
      if (remaining === 0) {
        alertMap.push({
          type: 'deadline_today',
          title: 'Due today',
          body: `${task.title} is due today.`,
        })
      }
      if (isOverdue(task.dueDate, task.status)) {
        alertMap.push({
          type: 'overdue',
          title: 'Task overdue',
          body: `${task.title} is overdue and needs attention.`,
        })
      }

      for (const alert of alertMap) {
        await createAlertIfNew({
          companyId,
          userId: user.id,
          type: alert.type,
          title: alert.title,
          body: alert.body,
          entityType: 'task',
          entityId: task.id,
          taskId: task.id,
          alertDate: today,
        })
      }
    }
  }

  if (prefs.escalationAlerts) {
    const overdueTasks = assignedTasks.filter((task) => isOverdue(task.dueDate, task.status))
    for (const task of overdueTasks) {
      const deptOwnerId = await getDepartmentOwnerId(task.departmentId)
      if (deptOwnerId && deptOwnerId !== user.id) {
        await createAlertIfNew({
          companyId,
          userId: deptOwnerId,
          type: 'escalation_department',
          title: 'Department escalation',
          body: `${task.title} assigned to a team member is overdue.`,
          entityType: 'task',
          entityId: task.id,
          taskId: task.id,
          alertDate: today,
        })
      }

      if (task.priority === 'high') {
        const executives = await getManagingDirectorIds(companyId)
        for (const executiveId of executives) {
          await createAlertIfNew({
            companyId,
            userId: executiveId,
            type: 'escalation_management',
            title: 'Management escalation',
            body: `High-priority task "${task.title}" is overdue.`,
            entityType: 'task',
            entityId: task.id,
            taskId: task.id,
            alertDate: today,
          })
        }
      }
    }
  }

  const scopedTasks = await getDb().query.tasks.findMany({
    where: inArray(tasks.status, [...ACTIVE_TASK_STATUSES, ...ATTENTION_STATUSES]),
  })
  const activeCount = scopedTasks.length
  const overdueCount = scopedTasks.filter((task) => isOverdue(task.dueDate, task.status)).length
  const blockedCount = scopedTasks.filter((task) =>
    ATTENTION_STATUSES.includes(task.status as (typeof ATTENTION_STATUSES)[number]),
  ).length

  if (prefs.dailySummary) {
    await createAlertIfNew({
      companyId,
      userId: user.id,
      type: 'daily_summary',
      title: 'Daily workspace summary',
      body: `${activeCount} active tasks, ${overdueCount} overdue, ${blockedCount} needing attention.`,
      alertDate: today,
    })
  }

  const day = new Date().getDay()
  if (day === 1 && prefs.dailySummary) {
    await createAlertIfNew({
      companyId,
      userId: user.id,
      type: 'weekly_summary',
      title: 'Weekly workspace summary',
      body: `Week ahead: ${activeCount} active tasks across your workspace scope.`,
      alertDate: today,
    })
  }

  const date = new Date()
  if (date.getDate() === 1 && prefs.dailySummary) {
    await createAlertIfNew({
      companyId,
      userId: user.id,
      type: 'monthly_summary',
      title: 'Monthly workspace summary',
      body: `Month start snapshot: ${activeCount} active tasks, ${overdueCount} overdue.`,
      alertDate: today,
    })
  }
}

export async function ensureNotificationPreferences(userId: string) {
  const [existing] = await getDb()
    .select({ userId: notificationPreferences.userId })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1)

  if (!existing) {
    await getDb().insert(notificationPreferences).values({ userId })
  }
}
