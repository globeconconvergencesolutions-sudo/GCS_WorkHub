import { taskCategoryEnum, taskPriorityEnum, taskStatusEnum } from '@/lib/db/schema'

export const TASK_STATUS_LABELS: Record<(typeof taskStatusEnum.enumValues)[number], string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  pending_approval: 'Pending approval',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export const TASK_PRIORITY_LABELS: Record<(typeof taskPriorityEnum.enumValues)[number], string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const TASK_CATEGORY_LABELS: Record<(typeof taskCategoryEnum.enumValues)[number], string> = {
  operational: 'Operational',
  technical: 'Technical',
  administrative: 'Administrative',
  marketing: 'Marketing',
  finance: 'Finance',
  business_development: 'Business development',
  support: 'Support',
  project: 'Project',
  other: 'Other',
}

export const STANDARD_TASK_CATEGORIES = (
  Object.keys(TASK_CATEGORY_LABELS) as (keyof typeof TASK_CATEGORY_LABELS)[]
).filter((key) => key !== 'other')

export const ACTIVE_TASK_STATUSES = [
  'not_started',
  'in_progress',
  'waiting',
  'blocked',
  'pending_approval',
] as const

export const ATTENTION_STATUSES = ['blocked', 'pending_approval'] as const

export const USER_COOKIE = 'gcs_workhub_user'
