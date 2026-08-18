import { TASK_CATEGORY_LABELS, TASK_STATUS_LABELS } from '@/lib/constants'
import type { taskCategoryEnum, taskStatusEnum } from '@/lib/db/schema'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function parseDate(value: string | Date | null | undefined) {
  if (!value) return null
  if (value instanceof Date) return value
  return new Date(`${value}T12:00:00`)
}

export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function greeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function formatDue(value: string | Date | null | undefined, now = new Date()) {
  const date = parseDate(value)
  if (!date) return 'No due date'

  const today = startOfDay(now)
  const target = startOfDay(date)
  const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)

  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`
}

export function formatRelative(value: Date | string, now = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  const diffMs = now.getTime() - date.getTime()
  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`
}

export function fullName(user: { firstName: string; lastName: string }) {
  return `${user.firstName} ${user.lastName}`
}

export function statusLabel(status: (typeof taskStatusEnum.enumValues)[number]) {
  return TASK_STATUS_LABELS[status]
}

export function categoryLabel(category: (typeof taskCategoryEnum.enumValues)[number]) {
  return TASK_CATEGORY_LABELS[category]
}

export function statusClass(status: (typeof taskStatusEnum.enumValues)[number]) {
  return `status-${status.replaceAll('_', '-')}`
}

export function isOverdue(value: string | Date | null | undefined, status: string, now = new Date()) {
  const date = parseDate(value)
  if (!date || status === 'completed' || status === 'cancelled') return false
  return startOfDay(date) < startOfDay(now)
}
