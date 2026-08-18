'use client'

import { useMemo, useState, useTransition, type ReactNode } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  FileText,
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  UsersRound,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { CreateTaskDialog } from '@/components/create-task-dialog'
import { CreateProjectDialog } from '@/components/create-project-dialog'
import { CreateResponsibilityDialog } from '@/components/create-responsibility-dialog'
import {
  TASK_CATEGORY_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '@/lib/constants'
import { formatDue, formatLongDate, formatRelative, fullName, greeting } from '@/lib/format'
import {
  addAttachment,
  addComment,
  createTaskDependency,
  approveTask,
  approveDeliverable,
  updateResponsibilityOwner,
  rejectTask,
  rejectDeliverable,
  requestTaskRevision,
  completeTask,
  createDeliverable,
  logout,
  submitDeliverable,
  verifyDeliverable,
  toggleUserStatus,
  updateTaskDetails,
  updateTaskProgress,
  updateTaskStatus,
} from '@/app/actions'
import type { Person } from '@/lib/types'
import { taskCategoryEnum, taskPriorityEnum, taskStatusEnum } from '@/lib/db/schema'

type View =
  | 'Overview'
  | 'My tasks'
  | 'Responsibilities'
  | 'Departments'
  | 'Projects'
  | 'Reports'
  | 'Activity'

type TaskStatus = (typeof taskStatusEnum.enumValues)[number]
type TaskCategory = (typeof taskCategoryEnum.enumValues)[number]
type TaskPriority = (typeof taskPriorityEnum.enumValues)[number]

type DbComment = {
  id: string
  body: string
  createdAt: string | Date
  user: { initials: string; firstName: string; lastName: string } | null
}

type DbAttachment = {
  id: string
  label: string
  url: string
  createdAt: string | Date
}

type DbTask = {
  id: string
  title: string
  description?: string | null
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  progress?: number
  assigneeId?: string | null
  dueDate: string | Date | null
  startDate?: string | Date | null
  assignee: { initials: string; firstName: string; lastName: string } | null
  department: { id?: string; name: string; color?: string } | null
  comments?: DbComment[]
  attachments?: DbAttachment[]
  approvals?: Array<{
    id: string
    status: string
    decisionReason: string | null
    createdAt: string | Date
    requestor?: { initials: string; firstName: string; lastName: string } | null
    approver?: { initials: string; firstName: string; lastName: string } | null
  }>
  deliverables?: Array<{
    id: string
    title: string
    description?: string | null
    status: string
    evidenceUrl: string | null
    submissionNotes?: string | null
    decisionReason?: string | null
  }>
  blockingDependencies?: Array<{
    id: string
    blockedTask: { id: string; title: string; status: TaskStatus; dueDate: string | Date | null }
  }>
  blockedByDependencies?: Array<{
    id: string
    blockingTask: { id: string; title: string; status: TaskStatus; dueDate: string | Date | null }
  }>
}

type DbDepartment = {
  id: string
  name: string
  owner?: { firstName: string; lastName: string } | null
  progress: number
  total: number
  completed: number
  color: string
  teams?: { id: string }[]
}

type DbResponsibility = {
  id: string
  title: string
  category: string
  status: string
  owner: { id?: string; initials: string; firstName: string; lastName: string }
  department?: { name: string } | null
}

type DbActivityEvent = {
  id: string
  action: string
  summary: string
  createdAt: string | Date
  actor?: { initials: string; firstName: string; lastName: string } | null
}

type DbProject = {
  id: string
  title: string
  owner: string
  progress: number
  status: string
  tasks: string
}

type Metrics = {
  active: number
  departments: number
  dueThisWeek: number
  dueToday: number
  attention: number
  overdue: number
  blocked: number
  completionRate: number
}

type Employee = Person & {
  department?: { id?: string; name: string } | null
  manager?: { firstName: string; lastName: string } | null
  status?: string
}

function Avatar({ initials, tone = '' }: { initials: string; tone?: string }) {
  return <span className={`avatar ${tone}`}>{initials}</span>
}

export default function WorkhubDashboardDB({
  initialTasks,
  initialDepartments,
  initialActivity,
  upcoming,
  metrics,
  people,
  responsibilities,
  allActivity,
  myTasks: initialMyTasks,
  myMetrics,
  projects,
  reportMetrics,
  currentUserId,
  currentUserRoles,
  initialView = 'Overview',
  myTaskCount,
}: {
  initialTasks: DbTask[]
  initialDepartments: DbDepartment[]
  initialActivity: DbActivityEvent[]
  upcoming: DbTask[]
  metrics: Metrics
  people: Employee[]
  responsibilities: DbResponsibility[]
  allActivity: DbActivityEvent[]
  myTasks: DbTask[]
  myMetrics: { assigned: number; inProgress: number; completed: number }
  projects: DbProject[]
  reportMetrics: { completionRate: number; overdue: number; activeProjects: number; teamCoverage: number }
  currentUserId: string
  currentUserRoles: string[]
  initialView?: View
  myTaskCount: number
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'All' | TaskStatus>('All')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [deadlineFilter, setDeadlineFilter] = useState<'all' | 'overdue' | 'today' | 'week'>('all')
  const [employeeFilter, setEmployeeFilter] = useState<string>('all')
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | 'On track' | 'At risk' | 'Needs review'>('all')
  const [tasks, setTasks] = useState(initialTasks)
  const [responsibilityRows, setResponsibilityRows] = useState(responsibilities)
  const [selectedTask, setSelectedTask] = useState<DbTask | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateProject, setShowCreateProject] = useState(false)
  const [showCreateResp, setShowCreateResp] = useState(false)
  const [respFilter, setRespFilter] = useState<'all' | 'mine'>('all')
  const [commentText, setCommentText] = useState('')
  const [attachLabel, setAttachLabel] = useState('')
  const [attachUrl, setAttachUrl] = useState('')
  const [showAttachForm, setShowAttachForm] = useState(false)
  const [dependencyBlockingTaskId, setDependencyBlockingTaskId] = useState('')
  const [approvalReason, setApprovalReason] = useState('')
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [deliverableTitle, setDeliverableTitle] = useState('')
  const [deliverableDescription, setDeliverableDescription] = useState('')
  const [deliverableEvidenceById, setDeliverableEvidenceById] = useState<Record<string, string>>({})
  const [deliverableNotesById, setDeliverableNotesById] = useState<Record<string, string>>({})
  const [deliverableError, setDeliverableError] = useState<string | null>(null)
  const [deliverableDecisionById, setDeliverableDecisionById] = useState<Record<string, string>>({})
  const [isPending, startTransition] = useTransition()

  const currentUser = useMemo(
    () => people.find((p) => p.id === currentUserId) ?? null,
    [people, currentUserId],
  )

  const roleSet = useMemo(() => new Set(currentUserRoles), [currentUserRoles])
  const isManagement = roleSet.has('admin') || roleSet.has('managing_director')
  const isDepartmentLeader = roleSet.has('department_head') || roleSet.has('manager')
  const canCreateWork = isManagement || isDepartmentLeader
  const canViewDepartments = isManagement || isDepartmentLeader
  const canViewProjects = isManagement || isDepartmentLeader
  const canViewReports = isManagement
  const canManagePeople = isManagement

  const navItems: { label: View; icon: typeof LayoutDashboard; count?: number }[] = [
    { label: 'Overview', icon: LayoutDashboard },
    { label: 'My tasks', icon: Check, count: myTaskCount },
    { label: 'Responsibilities', icon: ShieldCheck },
    ...(canViewDepartments ? [{ label: 'Departments' as const, icon: UsersRound }] : []),
    ...(canViewProjects ? [{ label: 'Projects' as const, icon: BriefcaseBusiness }] : []),
    ...(canViewReports ? [{ label: 'Reports' as const, icon: FileText }] : []),
    { label: 'Activity', icon: Activity },
  ]

  const allowedViews = new Set(navItems.map((item) => item.label))
  const defaultLandingView: View = canViewReports ? 'Reports' : canViewDepartments ? 'Departments' : 'My tasks'
  const resolvedInitialView = allowedViews.has(initialView) ? initialView : defaultLandingView
  const [activeNav, setActiveNav] = useState<View>(resolvedInitialView)

  const nav = (view: View) => {
    setActiveNav(view)
    setFilter('All')
    setDepartmentFilter('all')
    setDeadlineFilter('all')
    setEmployeeFilter('all')
    setProjectStatusFilter('all')
  }

  const taskSource = activeNav === 'My tasks' ? initialMyTasks : tasks

  const visibleTasks = useMemo(
    () =>
      taskSource.filter((task) => {
        const owner = task.assignee ? fullName(task.assignee) : ''
        const matchesQuery = `${task.title} ${task.category} ${owner}`
          .toLowerCase()
          .includes(query.toLowerCase())
        const matchesDepartment =
          departmentFilter === 'all' ||
          (task.department?.id ? task.department.id === departmentFilter : false)
        const matchesEmployee =
          employeeFilter === 'all' || task.assigneeId === employeeFilter

        const todayStr = new Date().toISOString().slice(0, 10)
        const weekEnd = new Date()
        weekEnd.setDate(weekEnd.getDate() + 7)
        const weekEndStr = weekEnd.toISOString().slice(0, 10)

        const dueDateStr = task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null
        const matchesDeadline =
          deadlineFilter === 'all' ||
          !dueDateStr ||
          (deadlineFilter === 'overdue' && dueDateStr < todayStr && !['completed', 'cancelled'].includes(task.status)) ||
          (deadlineFilter === 'today' && dueDateStr === todayStr) ||
          (deadlineFilter === 'week' && dueDateStr >= todayStr && dueDateStr <= weekEndStr)

        return (
          matchesQuery &&
          (filter === 'All' || task.status === filter) &&
          matchesDepartment &&
          matchesDeadline &&
          matchesEmployee
        )
      }),
    [taskSource, query, filter, departmentFilter, deadlineFilter, employeeFilter],
  )

  const visibleProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesQuery = `${project.title} ${project.owner}`.toLowerCase().includes(query.toLowerCase())
        const matchesStatus = projectStatusFilter === 'all' || project.status === projectStatusFilter
        const matchesOwner =
          employeeFilter === 'all' ||
          people.some((person) => person.id === employeeFilter && `${person.firstName} ${person.lastName}` === project.owner)

        return matchesQuery && matchesStatus && matchesOwner
      }),
    [projects, query, projectStatusFilter, employeeFilter, people],
  )

  function handleComplete(taskId: string) {
    startTransition(async () => {
      const res = await completeTask(taskId)
      if (!res || !('error' in res)) {
        setTasks((current) =>
          current.map((t) => (t.id === taskId ? { ...t, status: 'completed' } : t)),
        )
        setSelectedTask((current) =>
          current?.id === taskId ? { ...current, status: 'completed' } : current,
        )
      }
    })
  }

  function handleStatusChange(taskId: string, status: TaskStatus) {
    startTransition(async () => {
      const res = await updateTaskStatus(taskId, status)
      if (!res || !('error' in res)) {
        setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status } : t)))
        setSelectedTask((current) => (current?.id === taskId ? { ...current, status } : current))
      }
    })
  }

  function handleProgressChange(taskId: string, progress: number) {
    startTransition(async () => {
      const res = await updateTaskProgress(taskId, progress)
      if (!res || !('error' in res)) {
        const newStatus = progress === 100 ? 'completed' as const : progress > 0 && selectedTask?.status === 'not_started' ? 'in_progress' as const : undefined
        setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, progress, ...(newStatus ? { status: newStatus } : {}) } : t)))
        setSelectedTask((current) => current?.id === taskId ? { ...current, progress, ...(newStatus ? { status: newStatus } : {}) } : current)
      }
    })
  }

  function handleAddComment(taskId: string) {
    if (!commentText.trim()) return
    startTransition(async () => {
      const res = await addComment(taskId, commentText)
      if (!res || !('error' in res)) {
        const newComment: DbComment = {
          id: Date.now().toString(),
          body: commentText.trim(),
          createdAt: new Date().toISOString(),
          user: currentUser ? { initials: currentUser.initials, firstName: currentUser.firstName, lastName: currentUser.lastName } : null,
        }
        setSelectedTask((current) => current?.id === taskId ? { ...current, comments: [...(current.comments ?? []), newComment] } : current)
        setCommentText('')
      }
    })
  }

  function handleAddAttachment(taskId: string) {
    if (!attachLabel.trim() || !attachUrl.trim()) return
    startTransition(async () => {
      const res = await addAttachment(taskId, attachLabel, attachUrl)
      if (!res || !('error' in res)) {
        const newAttach: DbAttachment = {
          id: Date.now().toString(),
          label: attachLabel.trim(),
          url: attachUrl.trim(),
          createdAt: new Date().toISOString(),
        }
        setSelectedTask((current) => current?.id === taskId ? { ...current, attachments: [...(current.attachments ?? []), newAttach] } : current)
        setAttachLabel('')
        setAttachUrl('')
        setShowAttachForm(false)
      }
    })
  }

  function handleCreateDependency() {
    if (!selectedTask) return
    if (!dependencyBlockingTaskId) return
    if (dependencyBlockingTaskId === selectedTask.id) return

    startTransition(async () => {
      const res = await createTaskDependency(dependencyBlockingTaskId, selectedTask.id)
      if (!res || !('error' in res)) {
        // Optimistic UI: mark as blocked if dependency is not satisfied yet.
        const blocking = tasks.find((t) => t.id === dependencyBlockingTaskId)
        const shouldBlock = blocking ? blocking.status !== 'completed' : true
        if (shouldBlock) {
          setTasks((current) => current.map((t) => (t.id === selectedTask.id ? { ...t, status: 'blocked' } : t)))
          setSelectedTask((current) => (current?.id === selectedTask.id ? { ...current, status: 'blocked' } : current))
        }
        setDependencyBlockingTaskId('')
      }
    })
  }

  function handleApproveCurrentTask() {
    if (!selectedTask) return
    startTransition(async () => {
      setApprovalError(null)
      const res = await approveTask(selectedTask.id)
      if (!res || !('error' in res)) {
        setSelectedTask((c) => (c?.id === selectedTask.id ? { ...c, status: 'in_progress' } : c))
        setApprovalReason('')
      } else {
        setApprovalError(res.error)
      }
    })
  }

  function handleRejectCurrentTask() {
    if (!selectedTask) return
    if (!approvalReason.trim()) return
    startTransition(async () => {
      setApprovalError(null)
      const res = await rejectTask(selectedTask.id, approvalReason)
      if (!res || !('error' in res)) {
        setSelectedTask((c) => (c?.id === selectedTask.id ? { ...c, status: 'blocked' } : c))
        setApprovalReason('')
      } else {
        setApprovalError(res.error)
      }
    })
  }

  function handleRequestRevisionCurrentTask() {
    if (!selectedTask) return
    if (!approvalReason.trim()) return
    startTransition(async () => {
      setApprovalError(null)
      const res = await requestTaskRevision(selectedTask.id, approvalReason)
      if (!res || !('error' in res)) {
        setSelectedTask((c) => (c?.id === selectedTask.id ? { ...c, status: 'waiting' } : c))
        setApprovalReason('')
      } else {
        setApprovalError(res.error)
      }
    })
  }

  function handleCreateDeliverable() {
    if (!selectedTask) return
    if (!deliverableTitle.trim()) return

    startTransition(async () => {
      setDeliverableError(null)
      const res = await createDeliverable(selectedTask.id, deliverableTitle, deliverableDescription)
      if (!res || !('error' in res)) {
        const newDeliverable = res.deliverable as NonNullable<DbTask['deliverables']>[number]
        setSelectedTask((current) =>
          current?.id === selectedTask.id
            ? { ...current, deliverables: [...(current.deliverables ?? []), newDeliverable] }
            : current,
        )
        setTasks((current) => current.map((t) => (t.id === selectedTask.id ? { ...t, deliverables: [...(t.deliverables ?? []), newDeliverable] } : t)))
        setDeliverableTitle('')
        setDeliverableDescription('')
        setDeliverableEvidenceById({})
        setDeliverableNotesById({})
      } else {
        setDeliverableError(res.error)
      }
    })
  }

  function handleSubmitDeliverable(deliverableId: string) {
    if (!deliverableId) return
    const evidenceUrl = deliverableEvidenceById[deliverableId] ?? ''
    const notes = deliverableNotesById[deliverableId] ?? ''
    if (!evidenceUrl.trim()) return

    startTransition(async () => {
      setDeliverableError(null)
      const res = await submitDeliverable(deliverableId, evidenceUrl, notes)
      if (!res || !('error' in res)) {
        const updated = res.deliverable
        setSelectedTask((current) => {
          if (!current || current.id !== selectedTask.id) return current
          return {
            ...current,
            deliverables: (current.deliverables ?? []).map((d) => (d.id === deliverableId ? updated : d)),
          }
        })
        setTasks((current) =>
          current.map((t) => {
            if (t.id !== selectedTask.id) return t
            return {
              ...t,
              deliverables: (t.deliverables ?? []).map((d) => (d.id === deliverableId ? updated : d)),
            }
          }),
        )
        setDeliverableEvidenceById((m) => {
          const next = { ...m }
          delete next[deliverableId]
          return next
        })
        setDeliverableNotesById((m) => {
          const next = { ...m }
          delete next[deliverableId]
          return next
        })
      } else {
        setDeliverableError(res.error)
      }
    })
  }

  function handleVerifyDeliverable(deliverableId: string) {
    startTransition(async () => {
      setDeliverableError(null)
      const reason = deliverableDecisionById[deliverableId] ?? ''
      const res = await verifyDeliverable(deliverableId, reason)
      if (!res || !('error' in res)) {
        const updated = res.deliverable
        setSelectedTask((current) => {
          if (!current || current.id !== selectedTask?.id) return current
          return {
            ...current,
            deliverables: (current.deliverables ?? []).map((d) => (d.id === deliverableId ? updated : d)),
          }
        })
        setTasks((current) =>
          current.map((t) => {
            if (t.id !== selectedTask?.id) return t
            return {
              ...t,
              deliverables: (t.deliverables ?? []).map((d) => (d.id === deliverableId ? updated : d)),
            }
          }),
        )
        setDeliverableDecisionById((m) => {
          const next = { ...m }
          delete next[deliverableId]
          return next
        })
      } else {
        setDeliverableError(res.error)
      }
    })
  }

  function handleApproveDeliverable(deliverableId: string) {
    startTransition(async () => {
      setDeliverableError(null)
      const res = await approveDeliverable(deliverableId)
      if (!res || !('error' in res)) {
        const updated = res.deliverable
        setSelectedTask((current) => {
          if (!current || current.id !== selectedTask?.id) return current
          return {
            ...current,
            deliverables: (current.deliverables ?? []).map((d) => (d.id === deliverableId ? updated : d)),
          }
        })
        setTasks((current) =>
          current.map((t) => {
            if (t.id !== selectedTask?.id) return t
            return {
              ...t,
              deliverables: (t.deliverables ?? []).map((d) => (d.id === deliverableId ? updated : d)),
            }
          }),
        )
      } else {
        setDeliverableError(res.error)
      }
    })
  }

  function handleRejectDeliverable(deliverableId: string) {
    const reason = deliverableDecisionById[deliverableId] ?? ''
    if (!reason.trim()) return

    startTransition(async () => {
      setDeliverableError(null)
      const res = await rejectDeliverable(deliverableId, reason)
      if (!res || !('error' in res)) {
        const updated = res.deliverable
        setSelectedTask((current) => {
          if (!current || current.id !== selectedTask?.id) return current
          return {
            ...current,
            deliverables: (current.deliverables ?? []).map((d) => (d.id === deliverableId ? updated : d)),
          }
        })
        setTasks((current) =>
          current.map((t) => {
            if (t.id !== selectedTask?.id) return t
            return {
              ...t,
              deliverables: (t.deliverables ?? []).map((d) => (d.id === deliverableId ? updated : d)),
            }
          }),
        )
        setDeliverableDecisionById((m) => {
          const next = { ...m }
          delete next[deliverableId]
          return next
        })
      } else {
        setDeliverableError(res.error)
      }
    })
  }

  function handleSaveTaskDetails() {
    if (!selectedTask || !selectedTask.assigneeId) return

    startTransition(async () => {
      const res = await updateTaskDetails({
        taskId: selectedTask.id,
        title: selectedTask.title,
        description: selectedTask.description ?? '',
        assigneeId: selectedTask.assigneeId,
        priority: selectedTask.priority,
        startDate: selectedTask.startDate ? new Date(selectedTask.startDate).toISOString().slice(0, 10) : null,
        dueDate: selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().slice(0, 10) : null,
      })

      if (!res || !('error' in res)) {
        setTasks((current) => current.map((t) => (t.id === selectedTask.id ? { ...selectedTask } : t)))
      }
    })
  }

  function handleTakeResponsibility(responsibilityId: string) {
    if (!currentUser) return

    startTransition(async () => {
      const res = await updateResponsibilityOwner(responsibilityId, currentUser.id)
      if (!res || !('error' in res)) {
        setResponsibilityRows((current) =>
          current.map((item) =>
            item.id === responsibilityId
              ? {
                  ...item,
                  owner: {
                    id: currentUser.id,
                    initials: currentUser.initials,
                    firstName: currentUser.firstName,
                    lastName: currentUser.lastName,
                  },
                }
              : item,
          ),
        )
      }
    })
  }

  function handleToggleUserStatus(userId: string) {
    startTransition(async () => {
      await toggleUserStatus(userId)
      router.refresh()
    })
  }

  const filteredResponsibilities = respFilter === 'mine'
    ? responsibilityRows.filter((r) => r.owner.firstName === currentUser?.firstName && r.owner.lastName === currentUser?.lastName)
    : responsibilityRows

  const recentlyCompleted = useMemo(
    () => initialMyTasks.filter((t) => t.status === 'completed').slice(0, 5),
    [initialMyTasks],
  )

  const renderTasks = (title = 'Task workload', subtitle = "Your team's most recent work activity") => (
    <section className="panel task-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="more-button" aria-label="More task options">
          <MoreHorizontal aria-hidden="true" />
        </button>
      </div>
      <div className="task-toolbar">
        <div className="filter-pills" role="group" aria-label="Filter tasks">
          <button
            className={filter === 'All' ? 'filter-pill selected' : 'filter-pill'}
            onClick={() => setFilter('All')}
          >
            All<span>{taskSource.length}</span>
          </button>
          {(['in_progress', 'waiting', 'blocked'] as const).map((value) => (
            <button
              key={value}
              className={filter === value ? 'filter-pill selected' : 'filter-pill'}
              onClick={() => setFilter(value)}
            >
              {TASK_STATUS_LABELS[value]}
            </button>
          ))}
        </div>
        <button className="view-all" onClick={() => setFilter('All')}>
          View all <ArrowUpRight aria-hidden="true" />
        </button>
      </div>
      <div className="task-list">
        {visibleTasks.map((task) => (
          <div
            className="task-row task-row-clickable"
            key={task.id}
            onClick={() => setSelectedTask(task)}
          >
            <div className={`priority-bar priority-${task.priority}`} />
            <div className="task-main">
              <strong>{task.title}</strong>
              <span>
                {TASK_CATEGORY_LABELS[task.category]} <i /> Due {formatDue(task.dueDate)}
              </span>
            </div>
            <div className="task-owner">
              {task.assignee && (
                <>
                  <Avatar initials={task.assignee.initials} tone="avatar-small" />
                  <span>{fullName(task.assignee)}</span>
                </>
              )}
            </div>
            <StatusBadge status={task.status} />
            <button
              className="task-check"
              aria-label={`Mark ${task.title} complete`}
              onClick={(event) => {
                event.stopPropagation()
                if (task.status !== 'completed') handleComplete(task.id)
              }}
              disabled={task.status === 'completed' || isPending}
            >
              <Check aria-hidden="true" />
            </button>
          </div>
        ))}
        {visibleTasks.length === 0 && <div className="empty-state">No tasks match your search.</div>}
      </div>
    </section>
  )

  return (
    <main className="workhub-shell">
      <aside className="workhub-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>G</span></div>
          <div><strong>GCS</strong><span>WorkHub</span></div>
        </div>
        <div className="workspace-switcher">
          <div className="workspace-icon">G</div>
          <div><span>Workspace</span><strong>GCS Operations</strong></div>
          <ChevronDown aria-hidden="true" />
        </div>
        <nav aria-label="Primary navigation" className="primary-nav">
          <span className="nav-caption">Workspace</span>
          {navItems.map(({ label, icon: Icon, count }) => (
            <button
              key={label}
              className={activeNav === label ? 'nav-item active' : 'nav-item'}
              onClick={() => nav(label)}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {typeof count === 'number' && count > 0 && <em>{count}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item"><Settings2 aria-hidden="true" /><span>Settings</span></button>
          <div className="sidebar-help">
            <div className="help-icon"><MessageSquare aria-hidden="true" /></div>
            <div><strong>Need a hand?</strong><span>Visit the help center</span></div>
            <ArrowUpRight aria-hidden="true" />
          </div>
        </div>
      </aside>

      <section className="workhub-content">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open navigation"><Menu aria-hidden="true" /></button>
          <div className="breadcrumbs"><span>GCS Operations</span><span>/</span><strong>{activeNav}</strong></div>
          <div className="topbar-actions">
            <label className="search-field">
              <Search aria-hidden="true" />
              <input
                aria-label="Search tasks"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search anything..."
              />
              <kbd>⌘ K</kbd>
            </label>
            <select
              aria-label="Filter by department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              style={{ border: '1px solid var(--input)', borderRadius: 8, padding: '8px 10px', background: 'var(--background)', color: 'var(--foreground)', fontSize: 12, fontWeight: 800 }}
            >
              <option value="all">All departments</option>
              {initialDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by deadline"
              value={deadlineFilter}
              onChange={(e) => setDeadlineFilter(e.target.value as 'all' | 'overdue' | 'today' | 'week')}
              style={{ border: '1px solid var(--input)', borderRadius: 8, padding: '8px 10px', background: 'var(--background)', color: 'var(--foreground)', fontSize: 12, fontWeight: 800 }}
            >
              <option value="all">Any time</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="week">Due this week</option>
            </select>
            <select
              aria-label="Filter by employee"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              style={{ border: '1px solid var(--input)', borderRadius: 8, padding: '8px 10px', background: 'var(--background)', color: 'var(--foreground)', fontSize: 12, fontWeight: 800 }}
            >
              <option value="all">All people</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
            <button className="icon-button" aria-label="Notifications" onClick={() => setShowNotifications(!showNotifications)}>
              <Bell aria-hidden="true" /><i />
            </button>
            <button className="profile-button" onClick={() => setShowProfile(!showProfile)}>
              <Avatar initials={currentUser?.initials ?? 'G'} tone="avatar-navy" />
              <span className="profile-copy">
                <strong>{currentUser ? fullName(currentUser) : 'Workspace user'}</strong>
                <small>{currentUser?.jobTitle ?? 'Employee'}</small>
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
          </div>
        </header>

        {showNotifications && (
          <div className="popover notifications">
            <strong>Notifications</strong>
            <p><CircleAlert aria-hidden="true" /> {metrics.blocked} tasks are blocked.</p>
            <p><Clock3 aria-hidden="true" /> {metrics.dueToday} tasks are due today.</p>
          </div>
        )}
        {showProfile && currentUser && (
          <div className="popover profile-popover">
            <strong>{fullName(currentUser)}</strong>
            <span>{currentUser.jobTitle}</span>
            <small style={{ color: 'var(--muted-foreground)', fontSize: 10 }}>
              {currentUserRoles.map((role) => role.replaceAll('_', ' ')).join(' · ') || 'Employee'}
            </small>
            <button onClick={() => setShowProfile(false)}>Close</button>
            <button
              onClick={() =>
                startTransition(async () => {
                  await logout()
                })
              }
            >
              Sign out
            </button>
          </div>
        )}

        <div className="page-wrap">
          {activeNav === 'Overview' && (
            <>
              <ViewHeading
                eyebrow={formatLongDate()}
                title={`${greeting()}, ${currentUser?.firstName ?? 'Amara'}`}
                description="Here's what's happening across GCS today."
                action={canCreateWork ? () => setShowCreate(true) : undefined}
              />
              <section className="metric-grid" aria-label="Workspace summary">
                <MetricCard featured label="Active tasks" value={String(metrics.active)} footer={`Across ${metrics.departments} departments`} icon={<Check aria-hidden="true" />} tone="teal-icon" trend />
                <MetricCard label="Due this week" value={String(metrics.dueThisWeek)} footer={`${metrics.dueToday} due today`} icon={<Clock3 aria-hidden="true" />} tone="blue-icon" trend />
                <MetricCard label="Need attention" value={String(metrics.attention)} footer={`${metrics.overdue} overdue, ${metrics.blocked} blocked`} icon={<CircleAlert aria-hidden="true" />} tone="gold-icon" trend negative />
                <MetricCard label="Completion rate" value={`${metrics.completionRate}%`} footer="Across current workspace" icon={<Target aria-hidden="true" />} tone="coral-icon" trend />
              </section>
              <div className="dashboard-grid">
                {renderTasks()}
                <DeadlinesPanel upcoming={upcoming} onOpen={() => nav('My tasks')} />
              </div>
              <div className="lower-grid">
                <DepartmentPanel departments={initialDepartments} />
                <ActivityPanel events={initialActivity} />
              </div>
            </>
          )}

          {activeNav === 'My tasks' && (
            <>
              <ViewHeading eyebrow="Employee workspace" title="My tasks" description="Everything assigned to you, organized by urgency." action={canCreateWork ? () => setShowCreate(true) : undefined} />
              <div className="metric-grid compact-metrics">
                <MetricCard label="Assigned to me" value={String(myMetrics.assigned)} footer="Active workload" icon={<Check aria-hidden="true" />} tone="teal-icon" />
                <MetricCard label="In progress" value={String(myMetrics.inProgress)} footer="Needs movement" icon={<Clock3 aria-hidden="true" />} tone="blue-icon" />
                <MetricCard label="Completed" value={String(myMetrics.completed)} footer="Your closed work" icon={<Target aria-hidden="true" />} tone="coral-icon" />
              </div>
              {renderTasks('My task queue', `Prioritized work assigned to ${currentUser?.firstName ?? 'you'}`)}
              {recentlyCompleted.length > 0 && (
                <section className="panel" style={{ marginTop: 18 }}>
                  <div className="panel-heading">
                    <div><h2>Recently completed</h2><p>Your closed work items</p></div>
                    <Check aria-hidden="true" className="heading-icon" />
                  </div>
                  <div className="task-list">
                    {recentlyCompleted.map((task) => (
                      <div className="task-row" key={task.id} style={{ opacity: 0.7 }}>
                        <div className="priority-bar" style={{ background: 'oklch(.55 .11 175)' }} />
                        <div className="task-main">
                          <strong style={{ textDecoration: 'line-through' }}>{task.title}</strong>
                          <span>{TASK_CATEGORY_LABELS[task.category]} <i /> {formatDue(task.dueDate)}</span>
                        </div>
                        <StatusBadge status={task.status} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {activeNav === 'Responsibilities' && (
            <>
              <ViewHeading eyebrow="Accountability" title="Responsibilities" description="Clear ownership for recurring and strategic work." action={canCreateWork ? () => setShowCreateResp(true) : undefined} />
              <section className="panel table-panel">
                <div className="panel-heading">
                  <div><h2>Responsibility register</h2><p>Owners, cadence, and current status</p></div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="filter-pills">
                      <button className={respFilter === 'all' ? 'filter-pill selected' : 'filter-pill'} onClick={() => setRespFilter('all')}>All<span>{responsibilityRows.length}</span></button>
                      <button className={respFilter === 'mine' ? 'filter-pill selected' : 'filter-pill'} onClick={() => setRespFilter('mine')}>Mine</button>
                    </div>
                    {canCreateWork && <Button variant="outline" onClick={() => setShowCreateResp(true)}><Plus data-icon="inline-start" /> Add</Button>}
                  </div>
                </div>
                <div className="responsibility-list">
                  {filteredResponsibilities.map((item) => (
                    <div className="responsibility-row" key={item.id}>
                      <div className="responsibility-icon"><ShieldCheck aria-hidden="true" /></div>
                      <div className="responsibility-main">
                        <strong>{item.title}</strong>
                        <span>{item.category}{item.department ? ` · ${item.department.name}` : ''}</span>
                      </div>
                      <div className="responsibility-owner">
                        <Avatar initials={item.owner.initials} tone="avatar-small" />
                        {fullName(item.owner)}
                      </div>
                      <StatusBadge status={item.status === 'active' ? 'Active' : item.status} />
                      {currentUser && item.owner.id !== currentUser.id && (
                        <button
                          className="filter-pill"
                          style={{ fontSize: 10 }}
                          disabled={isPending}
                          onClick={() => handleTakeResponsibility(item.id)}
                        >
                          Assign to me
                        </button>
                      )}
                      <button className="more-button" aria-label={`More options for ${item.title}`}>
                        <MoreHorizontal aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeNav === 'Departments' && (
            <>
              <ViewHeading eyebrow="Organization structure" title="Departments & teams" description="Monitor ownership, people, and progress across GCS." />
              <div className="department-grid">
                {initialDepartments.map((department) => (
                  <article className="panel department-card" key={department.id}>
                    <div className={`department-icon department-${department.color}`}>{department.name.slice(0, 1)}</div>
                    <div className="department-card-heading">
                      <div>
                        <h2>{department.name}</h2>
                        <p>Owned by {department.owner ? fullName(department.owner) : 'Unassigned'}</p>
                      </div>
                      <MoreHorizontal aria-hidden="true" />
                    </div>
                    <div className="department-stat"><strong>{department.progress}%</strong><span>completion rate</span></div>
                    <div className="progress-track">
                      <div className={`progress-fill fill-${department.color}`} style={{ width: `${department.progress}%` }} />
                    </div>
                    <div className="department-meta">
                      <span>{department.completed} / {department.total} tasks</span>
                      <span>{department.teams?.length ?? 0} teams</span>
                    </div>
                    {(() => {
                      const deptDeadlines = tasks.filter((t) => t.department?.id === department.id && t.status !== 'completed' && t.status !== 'cancelled' && t.dueDate).slice(0, 2)
                      if (deptDeadlines.length === 0) return null
                      return (
                        <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 8 }}>
                          <span style={{ fontSize: 9, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700 }}>Upcoming</span>
                          {deptDeadlines.map((t) => (
                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--muted-foreground)', marginTop: 6 }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{t.title}</span>
                              <span style={{ fontWeight: 600, flexShrink: 0 }}>{formatDue(t.dueDate)}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </article>
                ))}
              </div>
              <section className="panel table-panel">
                <div className="panel-heading">
                  <div><h2>Reporting hierarchy</h2><p>Employees, roles, and manager assignments</p></div>
                  {canManagePeople && <Button variant="outline"><Plus data-icon="inline-start" /> Add employee</Button>}
                </div>
                <div className="employee-list">
                  {people.map((employee) => (
                    <div className="employee-row" key={employee.id}>
                      <Avatar initials={employee.initials} tone="avatar-teal" />
                      <div className="employee-main">
                        <strong>{fullName(employee)}</strong>
                        <span>{employee.jobTitle}</span>
                      </div>
                      <span>{employee.department?.name ?? '—'}</span>
                      <span>{employee.manager ? `Reports to ${fullName(employee.manager)}` : '—'}</span>
                      <StatusBadge status={employee.status === 'active' ? 'Active' : 'Inactive'} />
                      {canManagePeople && (
                        <button
                          className="filter-pill"
                          style={{ fontSize: 9, padding: '4px 8px' }}
                          disabled={isPending}
                          onClick={() => handleToggleUserStatus(employee.id)}
                        >
                          {employee.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeNav === 'Projects' && (
            <>
              <ViewHeading
                eyebrow="Work portfolio"
                title="Projects"
                description="A focused view of active initiatives and delivery health."
                action={canCreateWork ? () => setShowCreateProject(true) : undefined}
              />
              <div className="task-toolbar" style={{ marginBottom: 16 }}>
                <div className="filter-pills" role="group" aria-label="Filter projects by status">
                  {(['all', 'On track', 'At risk', 'Needs review'] as const).map((value) => (
                    <button
                      key={value}
                      className={projectStatusFilter === value ? 'filter-pill selected' : 'filter-pill'}
                      onClick={() => setProjectStatusFilter(value)}
                    >
                      {value === 'all' ? 'All' : value}
                    </button>
                  ))}
                </div>
              </div>
              <div className="project-grid">
                {visibleProjects.map((project) => (
                  <ProjectCard key={project.id} {...project} />
                ))}
              </div>
            </>
          )}

          {activeNav === 'Reports' && (
            <>
              <ViewHeading eyebrow="Executive view" title="Reports & insights" description="A concise read on operational health and accountability." />
              <section className="metric-grid">
                <MetricCard label="Company completion" value={`${reportMetrics.completionRate}%`} footer="Current workspace rate" icon={<Target aria-hidden="true" />} tone="coral-icon" />
                <MetricCard label="Overdue tasks" value={String(reportMetrics.overdue)} footer="Needs follow-up" icon={<CircleAlert aria-hidden="true" />} tone="gold-icon" />
                <MetricCard label="Active initiatives" value={String(reportMetrics.activeProjects)} footer="Department delivery tracks" icon={<BriefcaseBusiness aria-hidden="true" />} tone="blue-icon" />
                <MetricCard label="Team coverage" value={`${reportMetrics.teamCoverage}%`} footer="People with department assignment" icon={<UsersRound aria-hidden="true" />} tone="teal-icon" />
              </section>
              <div className="dashboard-grid">
                <section className="panel report-panel">
                  <div className="panel-heading">
                    <div><h2>Department scorecard</h2><p>Completion and attention areas</p></div>
                    <FileText aria-hidden="true" className="heading-icon" />
                  </div>
                  {initialDepartments.map((department) => (
                    <div className="report-row" key={department.id}>
                      <strong>{department.name}</strong>
                      <div className="progress-track">
                        <div className={`progress-fill fill-${department.color}`} style={{ width: `${department.progress}%` }} />
                      </div>
                      <span>{department.progress}%</span>
                      <StatusBadge status={department.progress > 80 ? 'On track' : 'Needs review'} />
                    </div>
                  ))}
                </section>
                <section className="panel report-panel">
                  <div className="panel-heading">
                    <div><h2>Management attention</h2><p>Items that need a decision</p></div>
                    <CircleAlert aria-hidden="true" className="heading-icon" />
                  </div>
                  <div className="attention-list">
                    {metrics.blocked > 0 && (
                      <div><CircleAlert aria-hidden="true" /><span><strong>{metrics.blocked} tasks</strong> are currently blocked.</span></div>
                    )}
                    {metrics.dueToday > 0 && (
                      <div><Clock3 aria-hidden="true" /><span><strong>{metrics.dueToday} tasks</strong> are due today.</span></div>
                    )}
                    {metrics.overdue > 0 && (
                      <div><UsersRound aria-hidden="true" /><span><strong>{metrics.overdue} tasks</strong> are overdue across the company.</span></div>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

          {activeNav === 'Activity' && (
            <>
              <ViewHeading eyebrow="Workspace history" title="Activity" description="A chronological record of updates across your workspace." />
              <section className="panel activity-full-panel">
                <ActivityPanel events={allActivity} full />
              </section>
            </>
          )}
        </div>
      </section>

      {selectedTask && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedTask(null)}>
          <div className="create-modal task-detail-modal" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><span className="eyebrow">Task details</span><h2 id="task-detail-title">{selectedTask.title}</h2></div>
              <button className="close-button" aria-label="Close task details" onClick={() => setSelectedTask(null)}><X aria-hidden="true" /></button>
            </div>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Owner</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  {selectedTask.assignee && (
                    <strong>
                      <Avatar initials={selectedTask.assignee.initials} tone="avatar-small" /> {fullName(selectedTask.assignee)}
                    </strong>
                  )}
                  <select
                    value={selectedTask.assigneeId ?? ''}
                    onChange={(event) => {
                      const nextId = event.target.value
                      const nextPerson = people.find((person) => person.id === nextId) ?? null
                      setSelectedTask((current) =>
                        current?.id === selectedTask.id
                          ? {
                              ...current,
                              assigneeId: nextId,
                              assignee: nextPerson
                                ? {
                                    initials: nextPerson.initials,
                                    firstName: nextPerson.firstName,
                                    lastName: nextPerson.lastName,
                                  }
                                : null,
                            }
                          : current,
                      )
                    }}
                    disabled={isPending}
                  >
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.firstName} {person.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <span className="detail-label">Priority</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  <StatusBadge status={TASK_PRIORITY_LABELS[selectedTask.priority]} />
                  <select
                    value={selectedTask.priority}
                    onChange={(event) =>
                      setSelectedTask((current) =>
                        current?.id === selectedTask.id
                          ? { ...current, priority: event.target.value as TaskPriority }
                          : current,
                      )
                    }
                    disabled={isPending}
                  >
                    {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <span className="detail-label">Timeline</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  <strong>{formatDue(selectedTask.startDate)} → {formatDue(selectedTask.dueDate)}</strong>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <input
                      type="date"
                      value={selectedTask.startDate ? new Date(selectedTask.startDate).toISOString().slice(0, 10) : ''}
                      onChange={(event) =>
                        setSelectedTask((current) =>
                          current?.id === selectedTask.id
                            ? { ...current, startDate: event.target.value || null }
                            : current,
                        )
                      }
                      disabled={isPending}
                    />
                    <input
                      type="date"
                      value={selectedTask.dueDate ? new Date(selectedTask.dueDate).toISOString().slice(0, 10) : ''}
                      onChange={(event) =>
                        setSelectedTask((current) =>
                          current?.id === selectedTask.id
                            ? { ...current, dueDate: event.target.value || null }
                            : current,
                        )
                      }
                      disabled={isPending}
                    />
                  </div>
                </div>
              </div>
              <div>
                <span className="detail-label">Evidence</span>
                <strong><Paperclip aria-hidden="true" /> {selectedTask.attachments?.length ?? 0} attachments</strong>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <label className="form-field">
                <span>Task title</span>
                <input
                  value={selectedTask.title}
                  onChange={(event) =>
                    setSelectedTask((current) =>
                      current?.id === selectedTask.id ? { ...current, title: event.target.value } : current,
                    )
                  }
                  disabled={isPending}
                />
              </label>
              <label className="form-field">
                <span>Description</span>
                <textarea
                  value={selectedTask.description ?? ''}
                  onChange={(event) =>
                    setSelectedTask((current) =>
                      current?.id === selectedTask.id
                        ? { ...current, description: event.target.value }
                        : current,
                    )
                  }
                  placeholder="No description added yet."
                  disabled={isPending}
                />
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="filter-pill selected"
                  style={{ fontSize: 10 }}
                  disabled={isPending || !selectedTask.assigneeId || !selectedTask.title.trim()}
                  onClick={handleSaveTaskDetails}
                >
                  Save task details
                </button>
              </div>
            </div>

            <div className="form-grid">
              <label>
                <span className="detail-label">Status</span>
                <select
                  value={selectedTask.status}
                  onChange={(event) => handleStatusChange(selectedTask.id, event.target.value as TaskStatus)}
                  disabled={isPending}
                >
                  {taskStatusEnum.enumValues.map((status) => (
                    <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="detail-label">Progress</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={selectedTask.progress ?? 0}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      setSelectedTask((c) => c?.id === selectedTask.id ? { ...c, progress: val } : c)
                    }}
                    onMouseUp={(e) => handleProgressChange(selectedTask.id, Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => handleProgressChange(selectedTask.id, Number((e.target as HTMLInputElement).value))}
                    style={{ flex: 1, accentColor: 'oklch(.55 .11 175)' }}
                    disabled={isPending}
                  />
                  <strong style={{ fontSize: 12, width: 36, textAlign: 'right' }}>{selectedTask.progress ?? 0}%</strong>
                </div>
              </label>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
              <span className="detail-label" style={{ marginBottom: 10, display: 'block' }}>Attachments ({selectedTask.attachments?.length ?? 0})</span>
              {(selectedTask.attachments ?? []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {selectedTask.attachments!.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'oklch(.43 .09 175)', fontWeight: 700, textDecoration: 'none' }}>
                      <Paperclip style={{ width: 12 }} aria-hidden="true" /> {a.label}
                    </a>
                  ))}
                </div>
              )}
              {showAttachForm ? (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input value={attachLabel} onChange={(e) => setAttachLabel(e.target.value)} placeholder="Label" style={{ flex: '1 1 120px', fontSize: 11, padding: '6px 8px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }} />
                  <input value={attachUrl} onChange={(e) => setAttachUrl(e.target.value)} placeholder="https://..." style={{ flex: '2 1 180px', fontSize: 11, padding: '6px 8px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }} />
                  <button className="filter-pill selected" style={{ fontSize: 10 }} disabled={isPending || !attachLabel.trim() || !attachUrl.trim()} onClick={() => handleAddAttachment(selectedTask.id)}>Add</button>
                  <button className="filter-pill" style={{ fontSize: 10 }} onClick={() => { setShowAttachForm(false); setAttachLabel(''); setAttachUrl('') }}>Cancel</button>
                </div>
              ) : (
                <button className="filter-pill" style={{ fontSize: 10 }} onClick={() => setShowAttachForm(true)}>
                  <Paperclip style={{ width: 11, marginRight: 4 }} aria-hidden="true" /> Link document
                </button>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
              <span className="detail-label" style={{ marginBottom: 10, display: 'block' }}>Comments ({selectedTask.comments?.length ?? 0})</span>
              {(selectedTask.comments ?? []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
                  {selectedTask.comments!.map((c) => (
                    <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <Avatar initials={c.user?.initials ?? 'G'} tone="avatar-small" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: 10 }}>{c.user ? fullName(c.user) : 'System'}</strong>
                        <p style={{ fontSize: 11, color: 'var(--foreground)', margin: '3px 0 2px', lineHeight: 1.5 }}>{c.body}</p>
                        <small style={{ fontSize: 9, color: 'var(--muted-foreground)' }}>{formatRelative(new Date(c.createdAt))}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(selectedTask.id) } }}
                  placeholder="Add a comment..."
                  style={{ flex: 1, fontSize: 11, padding: '8px 10px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }}
                  disabled={isPending}
                />
                <button className="filter-pill selected" style={{ fontSize: 10 }} disabled={isPending || !commentText.trim()} onClick={() => handleAddComment(selectedTask.id)}>Send</button>
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
              <span className="detail-label" style={{ marginBottom: 10, display: 'block' }}>Approvals</span>

              {(selectedTask.approvals ?? []).length === 0 && (
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>No approvals yet</span>
              )}

              {(selectedTask.approvals ?? []).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  {selectedTask.approvals!.slice(0, 4).map((a) => (
                    <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span className="filter-pill" style={{ fontSize: 10 }}>{a.status}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 800 }}>
                          {a.approver ? `${a.approver.firstName} ${a.approver.lastName}` : 'Approver'}
                        </div>
                        {a.decisionReason && (
                          <div style={{ fontSize: 11, marginTop: 4, color: 'var(--foreground)' }}>
                            {a.decisionReason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedTask.status === 'pending_approval' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <label style={{ fontSize: 10, fontWeight: 800 }}>
                    Decision note (required for reject/revision)
                    <textarea
                      value={approvalReason}
                      onChange={(e) => setApprovalReason(e.target.value)}
                      placeholder="Add a clear note for the requester…"
                      style={{ width: '100%', marginTop: 6, minHeight: 80, fontSize: 11, padding: '8px 10px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }}
                      disabled={isPending}
                    />
                  </label>

                  {approvalError && <p className="form-error">{approvalError}</p>}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button className="filter-pill selected" style={{ fontSize: 10 }} disabled={isPending} onClick={handleApproveCurrentTask}>
                      Approve
                    </button>
                    <button
                      className="filter-pill"
                      style={{ fontSize: 10 }}
                      disabled={isPending || !approvalReason.trim()}
                      onClick={handleRejectCurrentTask}
                    >
                      Reject
                    </button>
                    <button
                      className="filter-pill"
                      style={{ fontSize: 10 }}
                      disabled={isPending || !approvalReason.trim()}
                      onClick={handleRequestRevisionCurrentTask}
                    >
                      Request revision
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
              <span className="detail-label" style={{ marginBottom: 10, display: 'block' }}>Deliverables</span>

              <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                <label style={{ fontSize: 10, fontWeight: 800 }}>
                  Title
                  <input
                    value={deliverableTitle}
                    onChange={(e) => setDeliverableTitle(e.target.value)}
                    placeholder="e.g. Q4 handover pack"
                    style={{ width: '100%', marginTop: 6, fontSize: 11, padding: '8px 10px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }}
                    disabled={isPending}
                  />
                </label>
                <label style={{ fontSize: 10, fontWeight: 800 }}>
                  Description
                  <textarea
                    value={deliverableDescription}
                    onChange={(e) => setDeliverableDescription(e.target.value)}
                    placeholder="Define what “done” looks like."
                    style={{ width: '100%', marginTop: 6, minHeight: 70, fontSize: 11, padding: '8px 10px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }}
                    disabled={isPending}
                  />
                </label>

                <button className="filter-pill selected" style={{ fontSize: 10, width: 'fit-content' }} disabled={isPending || !deliverableTitle.trim()} onClick={handleCreateDeliverable}>
                  Create deliverable
                </button>

                {deliverableError && <p className="form-error" style={{ margin: 0 }}>{deliverableError}</p>}
              </div>

              {(selectedTask.deliverables ?? []).length === 0 ? (
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>No deliverables yet</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedTask.deliverables!.map((d) => (
                    <div key={d.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span className="filter-pill" style={{ fontSize: 10 }}>{d.status}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 900 }}>{d.title}</div>
                          {d.description && <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 4 }}>{d.description}</div>}
                          {d.evidenceUrl && <div style={{ fontSize: 11, marginTop: 4 }}>Evidence: <a href={d.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'oklch(.55 .11 175)', fontWeight: 800, textDecoration: 'none' }}>{d.evidenceUrl}</a></div>}
                        </div>
                      </div>

                      {d.status === 'draft' && (
                        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                          <label style={{ fontSize: 10, fontWeight: 800 }}>
                            Evidence URL
                            <input
                              value={deliverableEvidenceById[d.id] ?? ''}
                              onChange={(e) => setDeliverableEvidenceById((m) => ({ ...m, [d.id]: e.target.value }))}
                              placeholder="https://..."
                              style={{ width: '100%', marginTop: 6, fontSize: 11, padding: '8px 10px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }}
                              disabled={isPending}
                            />
                          </label>
                          <label style={{ fontSize: 10, fontWeight: 800 }}>
                            Submission notes
                            <textarea
                              value={deliverableNotesById[d.id] ?? ''}
                              onChange={(e) => setDeliverableNotesById((m) => ({ ...m, [d.id]: e.target.value }))}
                              placeholder="Add context for verification."
                              style={{ width: '100%', marginTop: 6, minHeight: 60, fontSize: 11, padding: '8px 10px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }}
                              disabled={isPending}
                            />
                          </label>
                          <button
                            className="filter-pill selected"
                            style={{ fontSize: 10, width: 'fit-content' }}
                            disabled={isPending || !(deliverableEvidenceById[d.id] ?? '').trim()}
                            onClick={() => handleSubmitDeliverable(d.id)}
                          >
                            Submit deliverable
                          </button>
                        </div>
                      )}

                      {(d.status === 'submitted' || d.status === 'verified') && (
                        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                          <label style={{ fontSize: 10, fontWeight: 800 }}>
                            Decision note
                            <textarea
                              value={deliverableDecisionById[d.id] ?? ''}
                              onChange={(e) => setDeliverableDecisionById((m) => ({ ...m, [d.id]: e.target.value }))}
                              placeholder={d.status === 'submitted' ? 'Verification note (optional)…' : 'Approval/rejection note (required for rejection)…'}
                              style={{ width: '100%', marginTop: 6, minHeight: 70, fontSize: 11, padding: '8px 10px', border: '1px solid var(--input)', borderRadius: 6, background: 'var(--background)' }}
                              disabled={isPending}
                            />
                          </label>

                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {d.status === 'submitted' && (
                              <>
                                <button
                                  className="filter-pill selected"
                                  style={{ fontSize: 10 }}
                                  disabled={isPending}
                                  onClick={() => handleVerifyDeliverable(d.id)}
                                >
                                  Verify
                                </button>
                                <button
                                  className="filter-pill"
                                  style={{ fontSize: 10 }}
                                  disabled={isPending || !(deliverableDecisionById[d.id] ?? '').trim()}
                                  onClick={() => handleRejectDeliverable(d.id)}
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {d.status === 'verified' && (
                              <>
                                <button
                                  className="filter-pill selected"
                                  style={{ fontSize: 10 }}
                                  disabled={isPending}
                                  onClick={() => handleApproveDeliverable(d.id)}
                                >
                                  Approve
                                </button>
                                <button
                                  className="filter-pill"
                                  style={{ fontSize: 10 }}
                                  disabled={isPending || !(deliverableDecisionById[d.id] ?? '').trim()}
                                  onClick={() => handleRejectDeliverable(d.id)}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {d.decisionReason && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--foreground)' }}>
                          Note: {d.decisionReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 16 }}>
              <span className="detail-label" style={{ marginBottom: 10, display: 'block' }}>Dependencies</span>

              <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 11 }}>Blocked by</strong>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(selectedTask.blockedByDependencies ?? []).length === 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>None</span>
                    ) : (
                      selectedTask.blockedByDependencies!.map((d) => (
                        <span key={d.id} className="filter-pill" style={{ fontSize: 10 }}>
                          {d.blockingTask.title}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <strong style={{ fontSize: 11 }}>Blocking</strong>
                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(selectedTask.blockingDependencies ?? []).length === 0 ? (
                      <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>Doesn’t block others</span>
                    ) : (
                      selectedTask.blockingDependencies!.map((d) => (
                        <span key={d.id} className="filter-pill" style={{ fontSize: 10 }}>
                          {d.blockedTask.title}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ flex: '1 1 240px', fontSize: 10, fontWeight: 800 }}>
                  Add dependency: wait for
                  <select
                    value={dependencyBlockingTaskId}
                    onChange={(e) => setDependencyBlockingTaskId(e.target.value)}
                    style={{ marginTop: 6, width: '100%' }}
                    disabled={isPending}
                  >
                    <option value="" disabled>
                      Select blocking task…
                    </option>
                    {tasks
                      .filter((t) => t.id !== selectedTask.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </label>

                <button
                  className="filter-pill selected"
                  style={{ fontSize: 10 }}
                  disabled={isPending || !dependencyBlockingTaskId || dependencyBlockingTaskId === selectedTask.id}
                  onClick={handleCreateDependency}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {canCreateWork && showCreate && (
        <CreateTaskDialog
          people={people}
          currentUserId={currentUserId}
          onClose={() => {
            setShowCreate(false)
            router.refresh()
          }}
        />
      )}

      {canCreateWork && showCreateProject && (
        <CreateProjectDialog
          people={people}
          currentUserId={currentUserId}
          departments={initialDepartments.map((d) => ({ id: d.id, name: d.name }))}
          onClose={() => {
            setShowCreateProject(false)
            router.refresh()
          }}
        />
      )}

      {canCreateWork && showCreateResp && (
        <CreateResponsibilityDialog
          people={people}
          currentUserId={currentUserId}
          departments={initialDepartments.map((d) => ({ id: d.id, name: d.name }))}
          onClose={() => {
            setShowCreateResp(false)
            router.refresh()
          }}
        />
      )}
    </main>
  )
}

function ViewHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description: string
  action?: () => void
}) {
  return (
    <div className="welcome-row">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}<span>.</span></h1>
        <p className="subhead">{description}</p>
      </div>
      {action && (
        <Button className="create-button" onClick={action}>
          <Plus data-icon="inline-start" /> Create task
        </Button>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  footer,
  icon,
  tone,
  featured,
  trend,
  negative,
}: {
  label: string
  value: string
  footer: string
  icon: ReactNode
  tone: string
  featured?: boolean
  trend?: boolean
  negative?: boolean
}) {
  return (
    <article className={`metric-card ${featured ? 'metric-feature' : ''}`}>
      <div className="metric-top">
        <span className={`metric-icon ${tone}`}>{icon}</span>
        {trend && <span className={`metric-trend ${negative ? 'negative' : 'positive'}`}><ArrowUpRight aria-hidden="true" /></span>}
      </div>
      <div className="metric-number">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-footer"><span>{footer}</span></div>
    </article>
  )
}

function DeadlinesPanel({ upcoming, onOpen }: { upcoming: DbTask[]; onOpen: () => void }) {
  return (
    <section className="panel deadlines-panel">
      <div className="panel-heading">
        <div><h2>Upcoming deadlines</h2><p>The next 7 days</p></div>
        <CalendarDays aria-hidden="true" className="heading-icon" />
      </div>
      <div className="deadline-list">
        {upcoming.map((task, index) => {
          const due = task.dueDate ? new Date(task.dueDate) : null
          const day = due ? due.getDate() : 0
          const month = due ? due.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase() : ''
          const urgent = task.status === 'blocked' || task.status === 'pending_approval'
          return (
            <div key={task.id} className={`deadline-item ${urgent || index === 0 ? 'urgent' : ''}`}>
              <div className="date-tile"><strong>{day}</strong><span>{month}</span></div>
              <div>
                <strong>{task.title}</strong>
                <span>{formatDue(task.dueDate)} · {task.department?.name ?? 'General'}</span>
              </div>
              {urgent ? <CircleAlert aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </div>
          )
        })}
      </div>
      <button className="panel-link" onClick={onOpen}>Open calendar <ArrowUpRight aria-hidden="true" /></button>
    </section>
  )
}

function DepartmentPanel({ departments }: { departments: DbDepartment[] }) {
  return (
    <section className="panel department-panel">
      <div className="panel-heading">
        <div><h2>Department progress</h2><p>Completion across active work</p></div>
        <button className="view-all">This month <ChevronDown aria-hidden="true" /></button>
      </div>
      <div className="department-list">
        {departments.map((department) => (
          <div className="department-row" key={department.id}>
            <div className={`department-icon department-${department.color}`}>{department.name.slice(0, 1)}</div>
            <div className="department-name">
              <strong>{department.name}</strong>
              <span>{department.owner ? fullName(department.owner) : ''}</span>
            </div>
            <div className="progress-track">
              <div className={`progress-fill fill-${department.color}`} style={{ width: `${department.progress}%` }} />
            </div>
            <strong className="progress-number">{department.progress}%</strong>
            <span className="task-count">{department.completed} / {department.total}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function ActivityPanel({ events, full = false }: { events: DbActivityEvent[]; full?: boolean }) {
  return (
    <div className={full ? 'activity-panel activity-panel-full' : 'panel activity-panel'}>
      <div className="panel-heading">
        <div><h2>Recent activity</h2><p>Latest updates from your team</p></div>
        <button className="more-button" aria-label="More activity options"><MoreHorizontal aria-hidden="true" /></button>
      </div>
      <div className="activity-list">
        {events.map((event) => (
          <div className="activity-row" key={event.id}>
            <Avatar initials={event.actor?.initials ?? 'G'} tone="avatar-teal" />
            <div>
              <strong>
                {event.actor ? fullName(event.actor) : 'Workspace'} <span>{event.action}</span>
              </strong>
              <p>{event.summary}</p>
              <small>{formatRelative(new Date(event.createdAt))}</small>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ProjectCard({
  title,
  owner,
  progress,
  status,
  tasks,
}: DbProject) {
  return (
    <article className="panel project-card">
      <div className="project-card-top">
        <span className="project-icon"><BriefcaseBusiness aria-hidden="true" /></span>
        <StatusBadge status={status} />
      </div>
      <h2>{title}</h2>
      <p>Owned by {owner}</p>
      <div className="progress-track">
        <div className="progress-fill fill-teal" style={{ width: `${progress}%` }} />
      </div>
      <div className="project-footer">
        <strong>{progress}%</strong>
        <span>{tasks} tasks</span>
        <ArrowUpRight aria-hidden="true" />
      </div>
    </article>
  )
}
