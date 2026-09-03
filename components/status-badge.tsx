import { statusClass, statusLabel } from '@/lib/format'
import type { taskStatusEnum } from '@/lib/db/schema'

function badgeClass(status: string) {
  const normalized = status.toLowerCase().replaceAll('_', ' ').replaceAll(' ', '-')
  if (normalized.includes('progress') || normalized === 'in-progress') return 'status-in-progress'
  if (normalized === 'active' || normalized === 'on-track' || normalized === 'complete') return 'status-completed'
  if (normalized === 'in-motion') return 'status-in-progress'
  if (normalized === 'no-work-yet' || normalized === 'idle') return 'status-not-started'
  if (normalized === 'at-risk' || normalized === 'needs-review' || normalized === 'needs-attention' || normalized === 'blocked') return 'status-blocked'
  if (normalized === 'waiting' || normalized === 'pending') return 'status-waiting'
  if (normalized === 'pending-approval') return 'status-pending-approval'
  if (normalized === 'not-started') return 'status-not-started'
  if (normalized === 'contributing') return 'status-contributing'
  if (normalized === 'home') return 'status-home'
  return normalized.startsWith('status-') ? normalized : `status-${normalized}`
}

export function StatusBadge({
  status,
}: {
  status: (typeof taskStatusEnum.enumValues)[number] | string
}) {
  const isTaskStatus = (status as string).includes('_') || ['not_started', 'in_progress', 'waiting', 'blocked', 'pending_approval', 'completed', 'cancelled'].includes(status as string)
  const label = isTaskStatus
    ? statusLabel(status as (typeof taskStatusEnum.enumValues)[number])
    : status

  return (
    <span className={`status-badge ${isTaskStatus ? statusClass(status as (typeof taskStatusEnum.enumValues)[number]) : badgeClass(status)}`}>
      <span className="status-dot" />
      {label}
    </span>
  )
}
