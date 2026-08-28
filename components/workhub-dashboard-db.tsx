'use client'

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import {
  Activity,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  FileText,
  Home,
  LayoutDashboard,
  MessageSquare,
  Paperclip,
  Plus,
  Settings2,
  ShieldCheck,
  Target,
  UsersRound,
  X,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/status-badge'
import { CreateTaskDialog } from '@/components/create-task-dialog'
import { CreateProjectDialog } from '@/components/create-project-dialog'
import { CreateResponsibilityDialog } from '@/components/create-responsibility-dialog'
import { InviteEmployeeDialog } from '@/components/invite-employee-dialog'
import { OrgSettingsPanel } from '@/components/org-settings-panel'
import { ProjectWorkspace } from '@/components/project-workspace'
import { WorkhubShell, useCollapsedSidebar } from '@/components/workhub-shell'
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '@/lib/constants'
import { CategoryField } from '@/components/category-field'
import { formatDue, formatLongDate, formatRelative, fullName, greeting, categoryLabel, ledBy } from '@/lib/format'
import { resolveWorkspaceView, type WorkspaceView } from '@/lib/workspace-nav'
import {
  canCreateWork as roleCanCreateWork,
  canEditTask,
  canManageOrg,
  canManageUsers,
  canSubmitLeadershipRequest,
  canSubmitWorkRequest,
  canViewCompanyReports,
  canViewDepartmentReports,
  inviteableRoleKeys,
} from '@/lib/auth/permissions'
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
  markAllNotificationsRead,
  markNotificationRead,
  createManagementRequest,
  exportReportCsv,
  updateManagementRequestStatus,
  updateNotificationPreferences,
  sendWorkspaceReminder,
  promoteWorkRequest,
  submitDeliverable,
  verifyDeliverable,
  toggleUserStatus,
  updateTaskDetails,
  updateTaskProgress,
  updateTaskStatus,
} from '@/app/actions'
import type { Person } from '@/lib/types'
import { taskCategoryEnum, taskPriorityEnum, taskStatusEnum } from '@/lib/db/schema'

type View = WorkspaceView

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
  categoryCustom?: string | null
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

type DeadlineFilter = 'all' | 'overdue' | 'today' | 'week' | 'attention' | 'stuck'

const TASK_STATUSES = taskStatusEnum.enumValues

function parseDeadlineFilter(value: string | null): DeadlineFilter {
  if (value === 'overdue' || value === 'today' || value === 'week' || value === 'attention' || value === 'stuck') return value
  return 'all'
}

function parseTaskFilter(value: string | null): 'All' | TaskStatus {
  if (value && (TASK_STATUSES as readonly string[]).includes(value)) return value as TaskStatus
  return 'All'
}

function departmentHealth(department: DbDepartment) {
  if (department.total === 0) return 'No work yet'
  if (department.progress >= 80) return 'On track'
  if (department.progress >= 40) return 'In motion'
  return 'Needs attention'
}

function sortDepartmentsForScorecard(departments: DbDepartment[]) {
  return [...departments].sort((left, right) => {
    if (left.total === 0 && right.total !== 0) return 1
    if (right.total === 0 && left.total !== 0) return -1
    if (left.progress !== right.progress) return left.progress - right.progress
    return left.name.localeCompare(right.name)
  })
}

function AttentionTiles({
  blocked,
  overdue,
  dueToday,
  dueThisWeek,
  unreadCount,
  onStuck,
  onOverdue,
  onToday,
  onWeek,
  onAlerts,
}: {
  blocked: number
  overdue: number
  dueToday: number
  dueThisWeek: number
  unreadCount: number
  onStuck: () => void
  onOverdue: () => void
  onToday: () => void
  onWeek: () => void
  onAlerts: () => void
}) {
  const tiles = [
    { key: 'stuck', count: blocked, label: 'Stuck', detail: 'Blocked or waiting on approval', tone: 'attention-tile-alert', icon: <CircleAlert aria-hidden="true" />, onClick: onStuck },
    { key: 'overdue', count: overdue, label: 'Overdue', detail: 'Past due and still open', tone: 'attention-tile-warn', icon: <Clock3 aria-hidden="true" />, onClick: onOverdue },
    { key: 'today', count: dueToday, label: 'Due today', detail: 'Needs a decision before close of day', tone: 'attention-tile-info', icon: <CalendarDays aria-hidden="true" />, onClick: onToday },
    { key: 'week', count: dueThisWeek, label: 'This week', detail: 'Coming due in the next 7 days', tone: 'attention-tile-note', icon: <Target aria-hidden="true" />, onClick: onWeek },
    { key: 'alerts', count: unreadCount, label: 'Alerts', detail: 'Unread items in your inbox', tone: 'attention-tile-navy', icon: <Bell aria-hidden="true" />, onClick: onAlerts },
  ]

  return (
    <div className="attention-tiles">
      {tiles.map((tile) => (
        <button
          key={tile.key}
          type="button"
          className={`attention-tile ${tile.tone}${tile.count === 0 ? ' is-quiet' : ''}`}
          onClick={tile.onClick}
        >
          <span className="attention-tile-icon">{tile.icon}</span>
          <span className="attention-tile-copy">
            <strong>{tile.label}</strong>
            <span>{tile.detail}</span>
          </span>
          <em>{tile.count}</em>
          <ChevronRight aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

function ScorecardList({
  departments,
  onOpen,
}: {
  departments: DbDepartment[]
  onOpen: (id: string) => void
}) {
  return (
    <div className="scorecard-list">
      {sortDepartmentsForScorecard(departments).map((department) => (
        <button
          key={department.id}
          type="button"
          className="scorecard-row"
          onClick={() => onOpen(department.id)}
        >
          <i className={`scorecard-swatch fill-${department.color}`} />
          <div className="scorecard-copy">
            <strong>{department.name}</strong>
            <span>
              {department.completed}/{department.total} tasks
              {department.owner ? ` · ${fullName(department.owner)}` : ''}
            </span>
            <div className="progress-track">
              <div className={`progress-fill fill-${department.color}`} style={{ width: `${department.progress}%` }} />
            </div>
          </div>
          <em>{department.progress}%</em>
          <StatusBadge status={departmentHealth(department)} />
        </button>
      ))}
    </div>
  )
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
  description?: string | null
  owner: string
  ownerId?: string
  progress: number
  completionRate: number
  status: string
  risk: string
  overdueCount: number
  blockedCount: number
  milestoneCount: number
  nextMilestone: string
  nextMilestoneDue?: string | Date | null
  tasks: string
  taskIds?: string[]
  departmentId?: string | null
  department?: string | null
  projectStatus?: string
  health?: string
  activity?: Array<{
    id: string
    summary: string
    createdAt: string | Date
    actor?: { initials: string; firstName: string; lastName: string } | null
  }>
  milestones?: Array<{
    id: string
    title: string
    status: string
    startDate?: string | Date | null
    dueDate: string | Date | null
    progress: number
    taskIds: string[]
  }>
  team?: Array<{ id: string; firstName: string; lastName: string; initials: string }>
}

type DbNotification = {
  id: string
  type: string
  title: string
  body: string
  entityType?: string | null
  entityId?: string | null
  readAt: string | Date | null
  createdAt: string | Date
}

type DbManagementRequest = {
  id: string
  title: string
  description?: string | null
  priority: string
  status: string
  kind?: string | null
  responseNotes?: string | null
  requestor?: { firstName: string; lastName: string } | null
  assignee?: { firstName: string; lastName: string } | null
}

type NotificationPreferences = {
  deadlineAlerts: number
  escalationAlerts: number
  approvalAlerts: number
  managementRequestAlerts: number
  dailySummary: number
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
  initialNotifications = [],
  unreadNotificationCount = 0,
  managementRequests: initialManagementRequests = [],
  notificationPreferences: initialNotificationPreferences = {
    deadlineAlerts: 1,
    escalationAlerts: 1,
    approvalAlerts: 1,
    managementRequestAlerts: 1,
    dailySummary: 1,
  },
  workspaceRoles = [],
  workspaceTeams = [],
  companyName = 'GCS Operations',
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
  initialNotifications: DbNotification[]
  unreadNotificationCount: number
  managementRequests: DbManagementRequest[]
  notificationPreferences: NotificationPreferences
  workspaceRoles?: { key: string; name: string }[]
  workspaceTeams?: { id: string; name: string; departmentId?: string; department?: { name: string } | null }[]
  companyName?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { collapsed, toggle: toggleCollapsed } = useCollapsedSidebar()
  const [query, setQuery] = useState('')
  const commandQuery = query.trim().toLowerCase()
  const [projectStatusFilter, setProjectStatusFilter] = useState<'all' | 'On track' | 'At risk' | 'Needs review'>('all')
  const [tasks, setTasks] = useState(initialTasks)
  const [responsibilityRows, setResponsibilityRows] = useState(responsibilities)
  const [selectedTask, setSelectedTask] = useState<DbTask | null>(null)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [notificationRows, setNotificationRows] = useState(initialNotifications)
  const [unreadCount, setUnreadCount] = useState(unreadNotificationCount)
  const [managementRequestRows, setManagementRequestRows] = useState(initialManagementRequests)
  const [requestTitle, setRequestTitle] = useState('')
  const [requestDescription, setRequestDescription] = useState('')
  const [requestPriority, setRequestPriority] = useState('medium')
  const [requestAssigneeId, setRequestAssigneeId] = useState('')
  const [reminderMessage, setReminderMessage] = useState('')
  const [reminderTargetId, setReminderTargetId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createTaskMilestoneId, setCreateTaskMilestoneId] = useState('')
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
  const activePeople = useMemo(
    () => people.filter((person) => person.status !== 'inactive'),
    [people],
  )

  const roleSet = useMemo(() => new Set(currentUserRoles), [currentUserRoles])
  const actor = useMemo(
    () => ({
      id: currentUserId,
      departmentId: currentUser?.departmentId ?? null,
      roles: currentUserRoles.map((key) => ({ role: { key } })),
    }),
    [currentUserId, currentUser?.departmentId, currentUserRoles],
  )
  const isManagement = roleSet.has('admin') || roleSet.has('managing_director')
  const isDepartmentLeader = roleSet.has('department_head') || roleSet.has('manager')
  const canCreateWork = roleCanCreateWork(actor)
  const canViewDepartments = isManagement || isDepartmentLeader
  const canViewProjects = isManagement || isDepartmentLeader || projects.length > 0
  const canViewReports = canViewCompanyReports(actor) || canViewDepartmentReports(actor)
  const canManagePeople = canManageUsers(actor)
  const canEditOrg = canManageOrg(actor)
  const canSubmitRequests = canSubmitLeadershipRequest(actor)
  const canRequestWork = canSubmitWorkRequest(actor)
  const inviteRoleKeys = inviteableRoleKeys(actor)
  const canInvitePeople = inviteRoleKeys.length > 0
  const inviteRoles = workspaceRoles.filter((role) => inviteRoleKeys.includes(role.key as (typeof inviteRoleKeys)[number]))

  const navItems: { label: View; icon: typeof LayoutDashboard; count?: number; group: string }[] = [
    ...(isManagement
      ? [{ label: 'Home' as const, icon: Home, group: 'Lead' }]
      : [{ label: 'Overview' as const, icon: LayoutDashboard, group: 'Workspace' }]),
    { label: 'My tasks', icon: Check, count: myTaskCount, group: isManagement ? 'Work' : 'Workspace' },
    { label: 'Responsibilities', icon: ShieldCheck, group: isManagement ? 'Work' : 'Workspace' },
    ...(canViewDepartments ? [{ label: 'Departments' as const, icon: UsersRound, group: 'Delivery' }] : []),
    ...(canViewProjects ? [{ label: 'Projects' as const, icon: BriefcaseBusiness, group: 'Delivery' }] : []),
    ...(canViewReports ? [{ label: 'Reports' as const, icon: FileText, group: isManagement ? 'Lead' : 'Delivery' }] : []),
    { label: 'Activity', icon: Activity, group: isManagement ? 'Work' : 'Workspace' },
    ...((canManagePeople || canEditOrg) ? [{ label: 'Settings' as const, icon: Settings2, group: 'Account' }] : []),
  ]

  const allowedViews = new Set(navItems.map((item) => item.label))
  const defaultLandingView: View = isManagement ? 'Home' : canViewDepartments ? 'Departments' : 'My tasks'
  const activeNav = resolveWorkspaceView(
    searchParams.get('view') ?? initialView,
    allowedViews,
    defaultLandingView,
    isManagement,
  )
  const selectedProjectId = searchParams.get('project')
  const selectedDepartmentId = searchParams.get('department')
  const allWorkScope = searchParams.get('scope') === 'all'
  const deadlineFilter = parseDeadlineFilter(searchParams.get('deadline'))
  const filter = parseTaskFilter(searchParams.get('status'))
  const employeeFilter = searchParams.get('employee') ?? 'all'
  const departmentFilter = searchParams.get('dept') ?? 'all'
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null
  const selectedDepartment = initialDepartments.find((department) => department.id === selectedDepartmentId) ?? null
  const canManageSelectedProject = Boolean(
    selectedProject &&
      (isManagement ||
        selectedProject.ownerId === currentUserId ||
        (isDepartmentLeader &&
          currentUser?.departmentId &&
          selectedProject.departmentId === currentUser.departmentId)),
  )

  function patchQuery(updates: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === 'all' || value === 'All') params.delete(key)
      else params.set(key, value)
    }
    router.push(`/?${params.toString()}`, { scroll: false })
  }

  function nav(
    view: View,
    extras?: {
      project?: string | null
      department?: string | null
      deadline?: DeadlineFilter
      departmentFilter?: string
      employee?: string
      status?: 'All' | TaskStatus
      scope?: 'all'
    },
  ) {
    setMobileOpen(false)
    setCommandOpen(false)
    setShowNotifications(false)
    setShowProfile(false)
    if (!extras) setProjectStatusFilter('all')

    const params = new URLSearchParams()
    params.set('view', view)
    if (extras?.project) params.set('project', extras.project)
    if (extras?.department) params.set('department', extras.department)
    if (extras?.scope === 'all') params.set('scope', 'all')
    if (extras?.deadline && extras.deadline !== 'all') params.set('deadline', extras.deadline)
    if (extras?.status && extras.status !== 'All') params.set('status', extras.status)
    if (extras?.employee && extras.employee !== 'all') params.set('employee', extras.employee)
    if (extras?.departmentFilter && extras.departmentFilter !== 'all') params.set('dept', extras.departmentFilter)
    router.push(`/?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen(true)
        setShowNotifications(false)
        setShowProfile(false)
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setMobileOpen(false)
        setShowNotifications(false)
        setShowProfile(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const currentView = activeNav
  const currentProjectId = selectedProjectId
  const currentDepartmentId = selectedDepartmentId
  const currentProjectTaskIds = selectedProject?.taskIds ?? []
  const taskSource = currentView === 'My tasks' && !allWorkScope ? initialMyTasks : tasks

  const visibleTasks = taskSource.filter((task) => {
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
        const isClosed = ['completed', 'cancelled'].includes(task.status)
        const isOverdueTask = Boolean(dueDateStr && dueDateStr < todayStr && !isClosed)
        const matchesDeadline =
          deadlineFilter === 'all' ||
          (deadlineFilter === 'overdue' && isOverdueTask) ||
          (deadlineFilter === 'today' && dueDateStr === todayStr) ||
          (deadlineFilter === 'week' && Boolean(dueDateStr && dueDateStr >= todayStr && dueDateStr <= weekEndStr)) ||
          (deadlineFilter === 'attention' && (isOverdueTask || task.status === 'blocked' || task.status === 'pending_approval')) ||
          (deadlineFilter === 'stuck' && (task.status === 'blocked' || task.status === 'pending_approval'))

        const matchesProject =
          currentView !== 'Projects' ||
          !currentProjectId ||
          currentProjectTaskIds.includes(task.id)
        const matchesDepartmentFocus =
          !currentDepartmentId ||
          (task.department?.id ? task.department.id === currentDepartmentId : false)

        return (
          (filter === 'All' || task.status === filter) &&
          matchesDepartment &&
          matchesDeadline &&
          matchesEmployee &&
          matchesProject &&
          (currentView === 'Departments' ? matchesDepartmentFocus : true)
        )
      })

  const visibleProjects = useMemo(
    () =>
      projects.filter((project) => {
        const matchesStatus = projectStatusFilter === 'all' || project.status === projectStatusFilter
        const matchesOwner =
          employeeFilter === 'all' ||
          people.some((person) => person.id === employeeFilter && `${person.firstName} ${person.lastName}` === project.owner)
        const isArchived = project.projectStatus === 'archived'

        return !isArchived && matchesStatus && matchesOwner
      }),
    [projects, projectStatusFilter, employeeFilter, people],
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
    const task = selectedTask
    startTransition(async () => {
      setApprovalError(null)
      const res = await approveTask(task.id)
      if (!res || !('error' in res)) {
        setSelectedTask((c) => (c?.id === task.id ? { ...c, status: 'in_progress' } : c))
        setApprovalReason('')
      } else {
        setApprovalError(res.error ?? 'Unable to complete this action.')
      }
    })
  }

  function handleRejectCurrentTask() {
    if (!selectedTask) return
    if (!approvalReason.trim()) return
    const task = selectedTask
    startTransition(async () => {
      setApprovalError(null)
      const res = await rejectTask(task.id, approvalReason)
      if (!res || !('error' in res)) {
        setSelectedTask((c) => (c?.id === task.id ? { ...c, status: 'blocked' } : c))
        setApprovalReason('')
      } else {
        setApprovalError(res.error ?? 'Unable to complete this action.')
      }
    })
  }

  function handleRequestRevisionCurrentTask() {
    if (!selectedTask) return
    if (!approvalReason.trim()) return
    const task = selectedTask
    startTransition(async () => {
      setApprovalError(null)
      const res = await requestTaskRevision(task.id, approvalReason)
      if (!res || !('error' in res)) {
        setSelectedTask((c) => (c?.id === task.id ? { ...c, status: 'waiting' } : c))
        setApprovalReason('')
      } else {
        setApprovalError(res.error ?? 'Unable to complete this action.')
      }
    })
  }

  function handleCreateDeliverable() {
    if (!selectedTask) return
    if (!deliverableTitle.trim()) return
    const task = selectedTask

    startTransition(async () => {
      setDeliverableError(null)
      const res = await createDeliverable(task.id, deliverableTitle, deliverableDescription)
      if (!res || !('error' in res)) {
        const newDeliverable = res.deliverable as NonNullable<DbTask['deliverables']>[number]
        setSelectedTask((current) =>
          current?.id === task.id
            ? { ...current, deliverables: [...(current.deliverables ?? []), newDeliverable] }
            : current,
        )
        setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, deliverables: [...(t.deliverables ?? []), newDeliverable] } : t)))
        setDeliverableTitle('')
        setDeliverableDescription('')
        setDeliverableEvidenceById({})
        setDeliverableNotesById({})
      } else {
        setDeliverableError(res.error ?? 'Unable to complete this action.')
      }
    })
  }

  function handleSubmitDeliverable(deliverableId: string) {
    if (!deliverableId || !selectedTask) return
    const task = selectedTask
    const evidenceUrl = deliverableEvidenceById[deliverableId] ?? ''
    const notes = deliverableNotesById[deliverableId] ?? ''
    if (!evidenceUrl.trim()) return

    startTransition(async () => {
      setDeliverableError(null)
      const res = await submitDeliverable(deliverableId, evidenceUrl, notes)
      if (!res || !('error' in res)) {
        const updated = res.deliverable
        setSelectedTask((current) => {
          if (!current || current.id !== task.id) return current
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
        setDeliverableError(res.error ?? 'Unable to complete this action.')
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
        setDeliverableError(res.error ?? 'Unable to complete this action.')
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
        setDeliverableError(res.error ?? 'Unable to complete this action.')
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
        setDeliverableError(res.error ?? 'Unable to complete this action.')
      }
    })
  }

  function handleSaveTaskDetails() {
    if (!selectedTask || !selectedTask.assigneeId) return
    const task = selectedTask
    const assigneeId = selectedTask.assigneeId

    startTransition(async () => {
      const res = await updateTaskDetails({
        taskId: task.id,
        title: task.title,
        description: task.description ?? '',
        assigneeId,
        priority: task.priority,
        category: task.category,
        categoryCustom: task.categoryCustom ?? null,
        startDate: task.startDate ? new Date(task.startDate).toISOString().slice(0, 10) : null,
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : null,
      })

      if (!res || !('error' in res)) {
        setTasks((current) => current.map((t) => (t.id === task.id ? { ...task } : t)))
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

  function handleMarkNotificationRead(notification: DbNotification) {
    startTransition(async () => {
      await markNotificationRead(notification.id)
      setNotificationRows((rows) =>
        rows.map((row) => (row.id === notification.id ? { ...row, readAt: new Date().toISOString() } : row)),
      )
      setUnreadCount((count) => (notification.readAt ? count : Math.max(0, count - 1)))
      setShowNotifications(false)
      if (notification.entityType === 'task' && notification.entityId) {
        const task =
          tasks.find((item) => item.id === notification.entityId) ??
          initialMyTasks.find((item) => item.id === notification.entityId) ??
          null
        if (task) setSelectedTask(task)
        else nav('My tasks', { scope: 'all', deadline: notification.title.toLowerCase().includes('overdue') ? 'overdue' : 'all' })
      } else if (notification.entityType === 'management_request') {
        nav(isManagement ? 'Home' : 'Overview')
      } else {
        nav(isManagement ? 'Home' : 'My tasks')
      }
      router.refresh()
    })
  }

  function handleMarkAllNotificationsRead() {
    startTransition(async () => {
      await markAllNotificationsRead()
      setNotificationRows((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })))
      setUnreadCount(0)
      router.refresh()
    })
  }

  function handleCreateManagementRequest(kind?: 'work' | 'leadership') {
    if (!requestTitle.trim()) return
    const formData = new FormData()
    formData.set('title', requestTitle)
    formData.set('description', requestDescription)
    formData.set('priority', requestPriority)
    if (kind) formData.set('kind', kind)
    if (requestAssigneeId) formData.set('assigneeId', requestAssigneeId)
    startTransition(async () => {
      await createManagementRequest(formData)
      setRequestTitle('')
      setRequestDescription('')
      setRequestAssigneeId('')
      router.refresh()
    })
  }

  function handleExportReport() {
    startTransition(async () => {
      const result = await exportReportCsv()
      if (!result || 'error' in result || !result.csv) return
      const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(url)
    })
  }

  function handleSendReminder() {
    if (!reminderTargetId || !reminderMessage.trim()) return
    startTransition(async () => {
      await sendWorkspaceReminder({ userId: reminderTargetId, message: reminderMessage })
      setReminderMessage('')
      setReminderTargetId('')
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
      </div>
      <div className="task-toolbar">
        <div className="filter-pills" role="group" aria-label="Filter tasks">
          <button
            className={filter === 'All' ? 'filter-pill selected' : 'filter-pill'}
            onClick={() => patchQuery({ status: null })}
          >
            All<span>{taskSource.length}</span>
          </button>
          {(['in_progress', 'waiting', 'blocked'] as const).map((value) => (
            <button
              key={value}
              className={filter === value ? 'filter-pill selected' : 'filter-pill'}
              onClick={() => patchQuery({ status: value })}
            >
              {TASK_STATUS_LABELS[value]}
            </button>
          ))}
        </div>
        <button className="view-all" onClick={() => patchQuery({ status: null, deadline: null, dept: null, employee: null })}>
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
                {categoryLabel(task.category, task.categoryCustom)} <i /> Due {formatDue(task.dueDate)}
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

  const commandResults = [
    ...navItems
      .filter((item) => !commandQuery || item.label.toLowerCase().includes(commandQuery))
      .map((item) => ({
        id: `view-${item.label}`,
        label: item.label,
        hint: 'Workspace view',
        onSelect: () => nav(item.label),
      })),
    ...(commandQuery
      ? [
          ...tasks
            .filter((task) => task.title.toLowerCase().includes(commandQuery))
            .slice(0, 6)
            .map((task) => ({
              id: `task-${task.id}`,
              label: task.title,
              hint: 'Open task',
              onSelect: () => {
                setCommandOpen(false)
                setSelectedTask(task)
              },
            })),
          ...projects
            .filter((project) => project.title.toLowerCase().includes(commandQuery))
            .slice(0, 6)
            .map((project) => ({
              id: `project-${project.id}`,
              label: project.title,
              hint: 'Open project',
              onSelect: () => nav('Projects', { project: project.id }),
            })),
          ...people
            .filter((person) => fullName(person).toLowerCase().includes(commandQuery))
            .slice(0, 6)
            .map((person) => ({
              id: `person-${person.id}`,
              label: fullName(person),
              hint: person.jobTitle,
              onSelect: () => nav('Departments', { employee: person.id }),
            })),
        ]
      : []),
  ]

  const taskFilterBar = (activeNav === 'My tasks' || activeNav === 'Overview' || activeNav === 'Departments') && (
    <div className="filter-toolbar">
      <label>
        Department
        <select value={departmentFilter} onChange={(event) => patchQuery({ dept: event.target.value })} aria-label="Filter by department">
          <option value="all">All departments</option>
          {initialDepartments.map((department) => (
            <option key={department.id} value={department.id}>{department.name}</option>
          ))}
        </select>
      </label>
      <label>
        Deadline
        <select
          value={deadlineFilter}
          onChange={(event) => patchQuery({ deadline: event.target.value })}
          aria-label="Filter by deadline"
        >
          <option value="all">Any time</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due this week</option>
          <option value="attention">Overdue or stuck</option>
          <option value="stuck">Blocked or pending approval</option>
        </select>
      </label>
      <label>
        Person
        <select value={employeeFilter} onChange={(event) => patchQuery({ employee: event.target.value })} aria-label="Filter by employee">
          <option value="all">All people</option>
          {activePeople.map((person) => (
            <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>
          ))}
        </select>
      </label>
    </div>
  )

  return (
    <WorkhubShell
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      mobileOpen={mobileOpen}
      onMobileOpen={() => setMobileOpen(true)}
      onMobileClose={() => setMobileOpen(false)}
      navItems={navItems}
      activeNav={activeNav}
      onNavigate={(view) => nav(view)}
      searchQuery={query}
      onSearchChange={setQuery}
      onOpenCommand={() => {
        setCommandOpen(true)
        setShowNotifications(false)
        setShowProfile(false)
      }}
      commandOpen={commandOpen}
      onCloseCommand={() => {
        setCommandOpen(false)
        setQuery('')
      }}
      commandResults={commandResults}
      onSelectCommand={(id) => {
        const match = commandResults.find((item) => item.id === id)
        match?.onSelect()
      }}
      unreadCount={unreadCount}
      onToggleNotifications={() => {
        setShowNotifications((value) => !value)
        setShowProfile(false)
        setCommandOpen(false)
      }}
      notificationsOpen={showNotifications}
      notifications={
        showNotifications ? (
          <div className="popover notifications notification-center">
            <div className="notification-center-head">
              <strong>Notification center</strong>
              <button className="view-all" type="button" onClick={handleMarkAllNotificationsRead}>
                Mark all read
              </button>
            </div>
            <div className="notification-list">
              {notificationRows.length === 0 ? (
                <p className="empty-state">You are fully caught up.</p>
              ) : (
                notificationRows.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className={notification.readAt ? 'notification-item read' : 'notification-item unread'}
                    onClick={() => handleMarkNotificationRead(notification)}
                  >
                    <strong>{notification.title}</strong>
                    <span>{notification.body}</span>
                    <small>{formatRelative(notification.createdAt)}</small>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null
      }
      profileOpen={showProfile}
      onToggleProfile={() => {
        setShowProfile((value) => !value)
        setShowNotifications(false)
        setCommandOpen(false)
      }}
      profileMenu={
        showProfile && currentUser ? (
          <div className="popover profile-popover">
            <strong>{fullName(currentUser)}</strong>
            <span>{currentUser.jobTitle}</span>
            <small>
              {currentUserRoles.map((role) => role.replaceAll('_', ' ')).join(' · ') || 'Employee'}
            </small>
            <form
              className="notification-preferences"
              action={async (formData) => {
                startTransition(async () => {
                  await updateNotificationPreferences(formData)
                  router.refresh()
                })
              }}
            >
              <strong>Alert preferences</strong>
              <label><input type="checkbox" name="deadlineAlerts" defaultChecked={Boolean(initialNotificationPreferences.deadlineAlerts)} /> Deadline alerts</label>
              <label><input type="checkbox" name="escalationAlerts" defaultChecked={Boolean(initialNotificationPreferences.escalationAlerts)} /> Escalation alerts</label>
              <label><input type="checkbox" name="approvalAlerts" defaultChecked={Boolean(initialNotificationPreferences.approvalAlerts)} /> Approval alerts</label>
              <label><input type="checkbox" name="managementRequestAlerts" defaultChecked={Boolean(initialNotificationPreferences.managementRequestAlerts)} /> Management request alerts</label>
              <label><input type="checkbox" name="dailySummary" defaultChecked={Boolean(initialNotificationPreferences.dailySummary)} /> Daily and periodic summaries</label>
              <button type="submit">Save preferences</button>
            </form>
            <button
              type="button"
              onClick={() => {
                window.location.replace(`/api/auth/logout?redirect=${encodeURIComponent('/login?signedOut=1')}&t=${Date.now()}`)
              }}
            >
              Sign out
            </button>
          </div>
        ) : null
      }
      currentName={currentUser ? fullName(currentUser) : 'Workspace user'}
      currentTitle={currentUser?.jobTitle ?? 'Employee'}
      currentInitials={currentUser?.initials ?? 'G'}
      companyName={companyName}
      breadcrumb={activeNav}
    >
        <div className="page-wrap">
          {activeNav === 'Home' && (
            <>
              <ViewHeading
                eyebrow={formatLongDate()}
                title={`${greeting()}, ${currentUser?.firstName ?? 'there'}`}
                description="What needs a decision across GCS today."
                action={canCreateWork ? () => setShowCreate(true) : undefined}
                actionLabel="Create task"
              />
              <section className="metric-grid" aria-label="Executive summary">
                <MetricCard label="Company completion" value={`${metrics.completionRate}%`} footer="Open work completed" icon={<Target aria-hidden="true" />} tone="coral-icon" onClick={() => nav('My tasks', { scope: 'all' })} />
                <MetricCard label="Overdue tasks" value={String(metrics.overdue)} footer="Past due and still open" icon={<CircleAlert aria-hidden="true" />} tone="gold-icon" negative onClick={() => nav('My tasks', { scope: 'all', deadline: 'overdue' })} />
                <MetricCard label="Stuck work" value={String(metrics.blocked)} footer="Blocked or pending approval" icon={<Clock3 aria-hidden="true" />} tone="gold-icon" negative onClick={() => nav('My tasks', { scope: 'all', deadline: 'stuck' })} />
                <MetricCard label="Active initiatives" value={String(reportMetrics.activeProjects)} footer="Open projects" icon={<BriefcaseBusiness aria-hidden="true" />} tone="blue-icon" onClick={() => nav('Projects')} />
              </section>
              <div className="dashboard-grid home-top-grid">
                <section className="panel report-panel attention-panel">
                  <div className="panel-heading">
                    <div><h2>Management attention</h2><p>Open these first</p></div>
                    <CircleAlert aria-hidden="true" className="heading-icon" />
                  </div>
                  <AttentionTiles
                    blocked={metrics.blocked}
                    overdue={metrics.overdue}
                    dueToday={metrics.dueToday}
                    dueThisWeek={metrics.dueThisWeek}
                    unreadCount={unreadCount}
                    onStuck={() => nav('My tasks', { scope: 'all', deadline: 'stuck' })}
                    onOverdue={() => nav('My tasks', { scope: 'all', deadline: 'overdue' })}
                    onToday={() => nav('My tasks', { scope: 'all', deadline: 'today' })}
                    onWeek={() => nav('My tasks', { scope: 'all', deadline: 'week' })}
                    onAlerts={() => setShowNotifications(true)}
                  />
                </section>
                <section className="panel report-panel scorecard-panel">
                  <div className="panel-heading">
                    <div><h2>Department scorecard</h2><p>Work first, idle teams last</p></div>
                    <FileText aria-hidden="true" className="heading-icon" />
                  </div>
                  <ScorecardList
                    departments={initialDepartments}
                    onOpen={(id) => nav('Departments', { department: id })}
                  />
                </section>
              </div>
              <div className="dashboard-grid">
                <section className="panel report-panel">
                  <div className="panel-heading">
                    <div><h2>Management requests</h2><p>Track leadership asks and responses</p></div>
                    <Target aria-hidden="true" className="heading-icon" />
                  </div>
                  {canSubmitRequests && (
                    <div className="management-request-form">
                      <input value={requestTitle} onChange={(event) => setRequestTitle(event.target.value)} placeholder="Request title" />
                      <select value={requestPriority} onChange={(event) => setRequestPriority(event.target.value)} aria-label="Request priority">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                      <select value={requestAssigneeId} onChange={(event) => setRequestAssigneeId(event.target.value)} aria-label="Assign request">
                        <option value="">Unassigned</option>
                        {activePeople.filter((person) => person.id !== currentUserId).map((person) => (
                          <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>
                        ))}
                      </select>
                      <textarea value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} placeholder="What do you need from leadership?" />
                      <button className="create-button" type="button" onClick={() => handleCreateManagementRequest()}>Submit request</button>
                    </div>
                  )}
                  <div className="responsibility-list">
                    {managementRequestRows.length === 0 ? (
                      <p className="empty-state">No management requests yet.</p>
                    ) : (
                      [...managementRequestRows]
                        .sort((left, right) => Number(left.status === 'resolved') - Number(right.status === 'resolved'))
                        .map((request) => (
                        <div className="responsibility-row" key={request.id}>
                          <div className="responsibility-main">
                            <strong>{request.title}</strong>
                            <span>{request.requestor ? fullName(request.requestor) : 'Unknown'} · {request.priority} priority</span>
                          </div>
                          <StatusBadge status={request.status.replaceAll('_', ' ')} />
                          {canViewReports && request.status !== 'resolved' && (
                            <button
                              className="filter-pill"
                              type="button"
                              onClick={() =>
                                startTransition(async () => {
                                  await updateManagementRequestStatus(request.id, 'resolved')
                                  setManagementRequestRows((rows) => rows.map((row) => row.id === request.id ? { ...row, status: 'resolved' } : row))
                                  router.refresh()
                                })
                              }
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>
                <section className="panel report-panel">
                  <div className="panel-heading">
                    <div><h2>Communication</h2><p>Send reminders and request updates</p></div>
                    <MessageSquare aria-hidden="true" className="heading-icon" />
                  </div>
                  {canCreateWork && (
                    <div className="management-request-form">
                      <select value={reminderTargetId} onChange={(event) => setReminderTargetId(event.target.value)}>
                        <option value="">Select team member</option>
                        {activePeople.map((person) => (
                          <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>
                        ))}
                      </select>
                      <textarea value={reminderMessage} onChange={(event) => setReminderMessage(event.target.value)} placeholder="Write a reminder or update request" />
                      <button className="create-button" type="button" onClick={handleSendReminder}>Send reminder</button>
                    </div>
                  )}
                </section>
              </div>
              <DeadlinesPanel upcoming={upcoming} onOpen={() => nav('My tasks', { scope: 'all', deadline: 'week' })} onOpenTask={setSelectedTask} />
            </>
          )}

          {activeNav === 'Overview' && (
            <>
              <ViewHeading
                eyebrow={formatLongDate()}
                title={`${greeting()}, ${currentUser?.firstName ?? 'there'}`}
                description={
                  canRequestWork
                    ? 'Your assignments, requests, and anything you have been invited into.'
                    : 'What is moving in your department today.'
                }
                action={canCreateWork ? () => setShowCreate(true) : undefined}
                actionLabel="Create task"
              />
              <section className="metric-grid" aria-label="Workspace summary">
                <MetricCard featured label="Active tasks" value={String(metrics.active)} footer={`Across ${metrics.departments} departments`} icon={<Check aria-hidden="true" />} tone="teal-icon" onClick={() => nav('My tasks', { scope: 'all' })} />
                <MetricCard label="Due this week" value={String(metrics.dueThisWeek)} footer={`${metrics.dueToday} due today`} icon={<Clock3 aria-hidden="true" />} tone="blue-icon" onClick={() => nav('My tasks', { scope: 'all', deadline: 'week' })} />
                <MetricCard label="Need attention" value={String(metrics.attention)} footer={`${metrics.overdue} overdue, ${metrics.blocked} blocked`} icon={<CircleAlert aria-hidden="true" />} tone="gold-icon" negative onClick={() => nav('My tasks', { scope: 'all', deadline: 'attention' })} />
                <MetricCard label="Completion rate" value={`${metrics.completionRate}%`} footer="Across current workspace" icon={<Target aria-hidden="true" />} tone="coral-icon" onClick={() => nav('My tasks', { scope: 'all' })} />
              </section>
              {taskFilterBar}
              {canRequestWork && (
                <section className="panel request-work-panel" style={{ marginBottom: 18 }}>
                  <div className="panel-heading">
                    <div>
                      <h2>Request work</h2>
                      <p>Your department head will review this and can turn it into a task</p>
                    </div>
                  </div>
                  <div className="management-request-form">
                    <input value={requestTitle} onChange={(event) => setRequestTitle(event.target.value)} placeholder="What do you need assigned?" />
                    <select value={requestPriority} onChange={(event) => setRequestPriority(event.target.value)} aria-label="Request priority">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    <textarea value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} placeholder="Context, deadline, or why it matters" />
                    <button className="create-button" type="button" onClick={() => handleCreateManagementRequest('work')}>
                      Send to my head
                    </button>
                  </div>
                  {managementRequestRows.filter((row) => row.kind === 'work').length > 0 && (
                    <div className="responsibility-list" style={{ marginTop: 12 }}>
                      {managementRequestRows
                        .filter((row) => row.kind === 'work')
                        .map((request) => (
                          <div className="responsibility-row" key={request.id}>
                            <div className="responsibility-main">
                              <strong>{request.title}</strong>
                              <span>{request.status.replaceAll('_', ' ')}</span>
                            </div>
                            <StatusBadge status={request.status.replaceAll('_', ' ')} />
                          </div>
                        ))}
                    </div>
                  )}
                </section>
              )}
              {canSubmitRequests && !isManagement && (
                <section className="panel" style={{ marginBottom: 18 }}>
                  <div className="panel-heading">
                    <div><h2>Ask leadership</h2><p>Send a management request</p></div>
                  </div>
                  <div className="management-request-form">
                    <input value={requestTitle} onChange={(event) => setRequestTitle(event.target.value)} placeholder="Request title" />
                    <select value={requestPriority} onChange={(event) => setRequestPriority(event.target.value)} aria-label="Request priority">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                    <select value={requestAssigneeId} onChange={(event) => setRequestAssigneeId(event.target.value)} aria-label="Assign request">
                      <option value="">Unassigned</option>
                      {activePeople.filter((person) => person.id !== currentUserId).map((person) => (
                        <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>
                      ))}
                    </select>
                    <textarea value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} placeholder="What do you need from leadership?" />
                    <button className="create-button" type="button" onClick={() => handleCreateManagementRequest()}>Submit request</button>
                  </div>
                </section>
              )}
              <div className="dashboard-grid">
                {renderTasks()}
                <DeadlinesPanel upcoming={upcoming} onOpen={() => nav('My tasks', { deadline: 'week' })} onOpenTask={setSelectedTask} />
              </div>
              <div className="lower-grid">
                <DepartmentPanel departments={initialDepartments} onOpen={canViewDepartments ? (id) => nav('Departments', { department: id }) : undefined} />
                <ActivityPanel events={initialActivity} />
              </div>
            </>
          )}

          {activeNav === 'My tasks' && (
            <>
              <ViewHeading
                eyebrow={allWorkScope ? 'Company workload' : 'Employee workspace'}
                title={allWorkScope ? 'All open work' : 'My tasks'}
                description={
                  allWorkScope
                    ? 'Every task you are allowed to see, filtered to the attention item you opened.'
                    : 'Everything assigned to you, organized by urgency.'
                }
                action={canCreateWork ? () => setShowCreate(true) : undefined}
                actionLabel="Create task"
              />
              {allWorkScope && (
                <div className="drill-banner">
                  <button type="button" className="text-back" onClick={() => nav('My tasks')}>Back to my assignments</button>
                  <strong>Company workload</strong>
                  <span>
                    {deadlineFilter === 'overdue' && 'Showing overdue tasks'}
                    {deadlineFilter === 'today' && 'Showing work due today'}
                    {deadlineFilter === 'week' && 'Showing work due this week'}
                    {deadlineFilter === 'attention' && 'Showing overdue or stuck work'}
                    {deadlineFilter === 'stuck' && 'Showing blocked or pending-approval work'}
                    {filter === 'blocked' && deadlineFilter !== 'stuck' && 'Showing blocked tasks'}
                    {deadlineFilter === 'all' && filter === 'All' && 'Showing all visible tasks'}
                  </span>
                </div>
              )}
              {taskFilterBar}
              {!allWorkScope && (
              <div className="metric-grid compact-metrics">
                <MetricCard label="Assigned to me" value={String(myMetrics.assigned)} footer="Active workload" icon={<Check aria-hidden="true" />} tone="teal-icon" />
                <MetricCard label="In progress" value={String(myMetrics.inProgress)} footer="Needs movement" icon={<Clock3 aria-hidden="true" />} tone="blue-icon" />
                <MetricCard label="Completed" value={String(myMetrics.completed)} footer="Your closed work" icon={<Target aria-hidden="true" />} tone="coral-icon" />
              </div>
              )}
              {renderTasks(
                allWorkScope ? 'Matching work' : 'My task queue',
                allWorkScope
                  ? 'Filtered from the workspace, not only your assignments'
                  : `Prioritized work assigned to ${currentUser?.firstName ?? 'you'}`,
              )}
              {!allWorkScope && recentlyCompleted.length > 0 && (
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
                          <span>{categoryLabel(task.category, task.categoryCustom)} <i /> {formatDue(task.dueDate)}</span>
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
              <ViewHeading eyebrow="Accountability" title="Responsibilities" description="Clear leads for recurring and strategic work." action={canCreateWork ? () => setShowCreateResp(true) : undefined} actionLabel="Add responsibility" />
              <section className="panel table-panel">
                <div className="panel-heading">
                  <div><h2>Responsibility register</h2><p>Leads, cadence, and current status</p></div>
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
                        <span>{categoryLabel(item.category)}{item.department ? ` · ${item.department.name}` : ''}</span>
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
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeNav === 'Departments' && (
            <>
              <ViewHeading
                eyebrow="Organization structure"
                title="Departments & teams"
                description="Monitor leadership, people, and progress across GCS."
                action={canInvitePeople ? () => setShowInvite(true) : undefined}
                actionLabel="Add person"
              />
              {selectedDepartment && (
                <div className="drill-banner">
                  <button type="button" className="text-back" onClick={() => nav('Departments')}>Back to all departments</button>
                  <strong>{selectedDepartment.name}</strong>
                  <span>{ledBy(selectedDepartment.owner ? fullName(selectedDepartment.owner) : null)}</span>
                </div>
              )}
              <div className="department-grid">
                {initialDepartments.map((department) => (
                  <article
                    className={`panel department-card${selectedDepartmentId === department.id ? ' is-selected' : ''}`}
                    key={department.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => nav('Departments', { department: department.id })}
                    onKeyDown={(event) => event.key === 'Enter' && nav('Departments', { department: department.id })}
                  >
                    <div className={`department-icon department-${department.color}`}>{department.name.slice(0, 1)}</div>
                    <div className="department-card-heading">
                      <div>
                        <h2>{department.name}</h2>
                        <p>{ledBy(department.owner ? fullName(department.owner) : null)}</p>
                      </div>
                    </div>
                    <div className="department-stat"><strong>{department.progress}%</strong><span>completion rate</span></div>
                    <div className="progress-track">
                      <div className={`progress-fill fill-${department.color}`} style={{ width: `${department.progress}%` }} />
                    </div>
                    <div className="department-meta">
                      <span>{department.completed} / {department.total} tasks</span>
                      <span>{department.teams?.length ?? 0} teams</span>
                    </div>
                  </article>
                ))}
              </div>
              {selectedDepartment && (
                <>
                  {taskFilterBar}
                  {renderTasks(`${selectedDepartment.name} work`, 'Tasks in this department')}
                </>
              )}
              <section className="panel table-panel">
                <div className="panel-heading">
                  <div><h2>Reporting hierarchy</h2><p>Employees, roles, and manager assignments</p></div>
                  {canInvitePeople && (
                    <Button variant="outline" onClick={() => setShowInvite(true)}>
                      <Plus data-icon="inline-start" /> Add person
                    </Button>
                  )}
                </div>
                <div className="employee-list">
                  {people
                    .filter((employee) =>
                      (!selectedDepartmentId || employee.department?.id === selectedDepartmentId) &&
                      (employeeFilter === 'all' || employee.id === employeeFilter),
                    )
                    .map((employee) => (
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

          {activeNav === 'Projects' && selectedProject && (
            <ProjectWorkspace
              project={selectedProject}
              people={activePeople}
              departments={initialDepartments.map((department) => ({ id: department.id, name: department.name }))}
              tasks={tasks.map((task) => ({
                id: task.id,
                title: task.title,
                status: task.status,
                dueDate: task.dueDate,
                assignee: task.assignee,
              }))}
              canManage={canManageSelectedProject}
              canCreateWork={canCreateWork}
              onBack={() => nav('Projects')}
              onCreateTask={(milestoneId) => {
                setCreateTaskMilestoneId(milestoneId)
                setShowCreate(true)
              }}
              onOpenTask={(taskId) => {
                const task = tasks.find((entry) => entry.id === taskId)
                if (task) setSelectedTask(task)
              }}
            />
          )}

          {activeNav === 'Projects' && !selectedProject && (
            <>
              <ViewHeading
                eyebrow="Work portfolio"
                title="Projects"
                description="A focused view of active initiatives and delivery health."
                action={canCreateWork ? () => setShowCreateProject(true) : undefined}
                actionLabel="Create project"
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
                  <ProjectCard key={project.id} {...project} onOpen={() => nav('Projects', { project: project.id })} />
                ))}
              </div>
            </>
          )}

          {activeNav === 'Reports' && canViewReports && (
            <>
              <div className="report-pack">
              <ViewHeading
                eyebrow={isManagement ? 'Company pack' : 'Department pack'}
                title={isManagement ? 'Reports & insights' : 'Department report'}
                description={
                  isManagement
                    ? 'The operational pack you can stand behind in a meeting. Home is for decisions today; this is the picture.'
                    : 'The same operational questions, scoped to your function — not the whole company.'
                }
                action={handleExportReport}
                actionLabel="Download CSV"
              />
              <p className="report-pack-note">Print this page for Monday meetings. Numbers match the work you are allowed to see.</p>
              <section className="metric-grid">
                <MetricCard label={isManagement ? 'Company completion' : 'Department completion'} value={`${reportMetrics.completionRate}%`} footer="Current workspace rate" icon={<Target aria-hidden="true" />} tone="coral-icon" />
                <MetricCard label="Overdue tasks" value={String(reportMetrics.overdue)} footer="Needs follow-up" icon={<CircleAlert aria-hidden="true" />} tone="gold-icon" />
                <MetricCard label="Active initiatives" value={String(reportMetrics.activeProjects)} footer="Department delivery tracks" icon={<BriefcaseBusiness aria-hidden="true" />} tone="blue-icon" />
                <MetricCard label="Team coverage" value={`${reportMetrics.teamCoverage}%`} footer="People with department assignment" icon={<UsersRound aria-hidden="true" />} tone="teal-icon" />
              </section>
              <div className="dashboard-grid home-top-grid">
                <section className="panel report-panel attention-panel">
                  <div className="panel-heading">
                    <div><h2>Management attention</h2><p>Open these first</p></div>
                    <CircleAlert aria-hidden="true" className="heading-icon" />
                  </div>
                  <AttentionTiles
                    blocked={metrics.blocked}
                    overdue={metrics.overdue}
                    dueToday={metrics.dueToday}
                    dueThisWeek={metrics.dueThisWeek}
                    unreadCount={unreadCount}
                    onStuck={() => nav('My tasks', { scope: 'all', deadline: 'stuck' })}
                    onOverdue={() => nav('My tasks', { scope: 'all', deadline: 'overdue' })}
                    onToday={() => nav('My tasks', { scope: 'all', deadline: 'today' })}
                    onWeek={() => nav('My tasks', { scope: 'all', deadline: 'week' })}
                    onAlerts={() => setShowNotifications(true)}
                  />
                </section>
                <section className="panel report-panel scorecard-panel">
                  <div className="panel-heading">
                    <div><h2>Department scorecard</h2><p>Completion and attention areas</p></div>
                    <FileText aria-hidden="true" className="heading-icon" />
                  </div>
                  <ScorecardList
                    departments={initialDepartments}
                    onOpen={(id) => nav('Departments', { department: id })}
                  />
                </section>
              </div>
              <div className="dashboard-grid">
                <section className="panel report-panel">
                  <div className="panel-heading">
                    <div><h2>Management requests</h2><p>Track leadership asks and responses</p></div>
                    <Target aria-hidden="true" className="heading-icon" />
                  </div>
                  <div className="management-request-form">
                    {canSubmitRequests && (
                      <>
                        <input value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)} placeholder="Request title" />
                        <textarea value={requestDescription} onChange={(e) => setRequestDescription(e.target.value)} placeholder="What do you need from leadership?" />
                        <button className="create-button" type="button" onClick={() => handleCreateManagementRequest()}>Submit request</button>
                      </>
                    )}
                  </div>
                  <div className="responsibility-list">
                    {managementRequestRows.length === 0 ? (
                      <p className="empty-state">No management requests yet.</p>
                    ) : (
                      [...managementRequestRows]
                        .sort((left, right) => Number(left.status === 'resolved') - Number(right.status === 'resolved'))
                        .map((request) => (
                        <div className="responsibility-row" key={request.id}>
                          <div className="responsibility-main">
                            <strong>{request.title}</strong>
                            <span>
                              {request.requestor ? fullName(request.requestor) : 'Unknown'} · {request.priority} priority
                              {request.kind === 'work' ? ' · work request' : ''}
                            </span>
                          </div>
                          <StatusBadge status={request.status.replaceAll('_', ' ')} />
                          {canCreateWork && request.kind === 'work' && request.status !== 'resolved' && request.status !== 'cancelled' && (
                            <button
                              className="filter-pill"
                              type="button"
                              onClick={() =>
                                startTransition(async () => {
                                  await promoteWorkRequest(request.id)
                                  router.refresh()
                                })
                              }
                            >
                              Make task
                            </button>
                          )}
                          {canViewReports && request.status !== 'resolved' && (
                            <button
                              className="filter-pill"
                              type="button"
                              onClick={() =>
                                startTransition(async () => {
                                  await updateManagementRequestStatus(request.id, 'resolved')
                                  router.refresh()
                                })
                              }
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>
                <section className="panel report-panel">
                  <div className="panel-heading">
                    <div><h2>Communication</h2><p>Send reminders and request updates</p></div>
                    <MessageSquare aria-hidden="true" className="heading-icon" />
                  </div>
                  {canCreateWork && (
                    <div className="management-request-form">
                      <select value={reminderTargetId} onChange={(e) => setReminderTargetId(e.target.value)}>
                        <option value="">Select team member</option>
                        {activePeople.map((person) => (
                          <option key={person.id} value={person.id}>{person.firstName} {person.lastName}</option>
                        ))}
                      </select>
                      <textarea value={reminderMessage} onChange={(e) => setReminderMessage(e.target.value)} placeholder="Write a reminder or update request" />
                      <button className="create-button" type="button" onClick={handleSendReminder}>Send reminder</button>
                    </div>
                  )}
                  <div className="attention-list">
                    <div><Activity aria-hidden="true" /><span><strong>{allActivity.length} recent events</strong> tracked across your workspace scope.</span></div>
                    <div><UsersRound aria-hidden="true" /><span><strong>{people.length} people</strong> visible in your current access context.</span></div>
                    <div><BriefcaseBusiness aria-hidden="true" /><span><strong>{projects.length} projects</strong> currently in view with health and risk indicators.</span></div>
                  </div>
                </section>
              </div>
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

          {activeNav === 'Settings' && (canManagePeople || canEditOrg) && (
            <>
              <ViewHeading
                eyebrow="Workspace"
                title="Settings"
                description={canEditOrg ? 'Company structure, roles, and how WorkHub is configured.' : 'People, roles, and how this workspace is configured.'}
                action={canInvitePeople ? () => setShowInvite(true) : undefined}
                actionLabel="Add person"
              />
              <section className="metric-grid compact-metrics">
                <MetricCard label="Company" value={companyName} footer="Active workspace" icon={<BriefcaseBusiness aria-hidden="true" />} tone="blue-icon" />
                <MetricCard label="People" value={String(people.length)} footer="Including inactive accounts" icon={<UsersRound aria-hidden="true" />} tone="teal-icon" onClick={() => nav('Departments')} />
                <MetricCard label="Teams" value={String(workspaceTeams.length)} footer="Department teams" icon={<UsersRound aria-hidden="true" />} tone="gold-icon" />
              </section>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div><h2>Roles</h2><p>Access levels in this workspace</p></div>
                  </div>
                  <div className="responsibility-list">
                    {workspaceRoles.map((role) => (
                      <div className="responsibility-row" key={role.key}>
                        <div className="responsibility-main">
                          <strong>{role.name}</strong>
                          <span>{role.key.replaceAll('_', ' ')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div><h2>Teams</h2><p>How departments are grouped</p></div>
                  </div>
                  <div className="responsibility-list">
                    {workspaceTeams.length === 0 ? (
                      <p className="empty-state">No teams yet.</p>
                    ) : (
                      workspaceTeams.map((team) => (
                        <div className="responsibility-row" key={team.id}>
                          <div className="responsibility-main">
                            <strong>{team.name}</strong>
                            <span>{team.department?.name ?? 'Unassigned department'}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
              {canEditOrg && (
                <OrgSettingsPanel
                  people={people}
                  departments={initialDepartments.map((department) => ({
                    id: department.id,
                    name: department.name,
                    color: department.color,
                    ownerId: null,
                  }))}
                  teams={workspaceTeams}
                  roles={workspaceRoles}
                />
              )}
              <section className="panel" style={{ marginTop: 18 }}>
                <div className="panel-heading">
                  <div><h2>Your alert preferences</h2><p>These also live in your profile menu</p></div>
                </div>
                <form
                  className="notification-preferences settings-preferences"
                  action={async (formData) => {
                    startTransition(async () => {
                      await updateNotificationPreferences(formData)
                      router.refresh()
                    })
                  }}
                >
                  <label><input type="checkbox" name="deadlineAlerts" defaultChecked={Boolean(initialNotificationPreferences.deadlineAlerts)} /> Deadline alerts</label>
                  <label><input type="checkbox" name="escalationAlerts" defaultChecked={Boolean(initialNotificationPreferences.escalationAlerts)} /> Escalation alerts</label>
                  <label><input type="checkbox" name="approvalAlerts" defaultChecked={Boolean(initialNotificationPreferences.approvalAlerts)} /> Approval alerts</label>
                  <label><input type="checkbox" name="managementRequestAlerts" defaultChecked={Boolean(initialNotificationPreferences.managementRequestAlerts)} /> Management request alerts</label>
                  <label><input type="checkbox" name="dailySummary" defaultChecked={Boolean(initialNotificationPreferences.dailySummary)} /> Daily and periodic summaries</label>
                  <button className="create-button" type="submit">Save preferences</button>
                </form>
              </section>
            </>
          )}
        </div>

      {selectedTask && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedTask(null)}>
          <div className="create-modal task-detail-modal" role="dialog" aria-modal="true" aria-labelledby="task-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><span className="eyebrow">Task details</span><h2 id="task-detail-title">{selectedTask.title}</h2></div>
              <button className="close-button" aria-label="Close task details" onClick={() => setSelectedTask(null)}><X aria-hidden="true" /></button>
            </div>
            <div className="detail-grid">
              <div>
                <span className="detail-label">Led by</span>
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
                    {activePeople.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.firstName} {person.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <span className="detail-label">Category</span>
                <CategoryField
                  showLabel={false}
                  value={selectedTask.category}
                  customValue={selectedTask.categoryCustom ?? ''}
                  onChange={(nextCategory, nextCustom) =>
                    setSelectedTask((current) =>
                      current?.id === selectedTask.id
                        ? {
                            ...current,
                            category: nextCategory as TaskCategory,
                            categoryCustom: nextCategory === 'other' ? nextCustom : null,
                          }
                        : current,
                    )
                  }
                />
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
          people={activePeople}
          currentUserId={currentUserId}
          departments={initialDepartments.map((department) => ({
            id: department.id,
            name: department.name,
            owner: department.owner ?? null,
          }))}
          defaultDepartmentId={selectedProject?.departmentId ?? selectedDepartmentId ?? ''}
          defaultMilestoneId={createTaskMilestoneId}
          milestones={selectedProject?.milestones?.map((milestone) => ({ id: milestone.id, title: milestone.title })) ?? []}
          lockDepartment={Boolean(selectedProject?.departmentId)}
          onClose={() => {
            setShowCreate(false)
            setCreateTaskMilestoneId('')
            router.refresh()
          }}
        />
      )}

      {canCreateWork && showCreateProject && (
        <CreateProjectDialog
          people={activePeople}
          currentUserId={currentUserId}
          departments={initialDepartments.map((department) => ({
            id: department.id,
            name: department.name,
            owner: department.owner ?? null,
          }))}
          onClose={(projectId) => {
            setShowCreateProject(false)
            if (projectId) nav('Projects', { project: projectId })
            else router.refresh()
          }}
        />
      )}

      {canCreateWork && showCreateResp && (
        <CreateResponsibilityDialog
          people={activePeople}
          currentUserId={currentUserId}
          departments={initialDepartments.map((d) => ({ id: d.id, name: d.name }))}
          onClose={() => {
            setShowCreateResp(false)
            router.refresh()
          }}
        />
      )}
      {canInvitePeople && showInvite && (
        <InviteEmployeeDialog
          people={activePeople}
          departments={initialDepartments.map((department) => ({ id: department.id, name: department.name }))}
          roles={inviteRoles.length > 0 ? inviteRoles : workspaceRoles}
          lockDepartmentId={!isManagement && isDepartmentLeader ? currentUser?.departmentId ?? null : null}
          onClose={() => {
            setShowInvite(false)
            router.refresh()
          }}
        />
      )}
    </WorkhubShell>
  )
}

function ViewHeading({
  eyebrow,
  title,
  description,
  action,
  actionLabel = 'Create task',
}: {
  eyebrow: string
  title: string
  description: string
  action?: () => void
  actionLabel?: string
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
          {actionLabel.toLowerCase().includes('download') ? (
            <Download data-icon="inline-start" />
          ) : (
            <Plus data-icon="inline-start" />
          )}{' '}
          {actionLabel}
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
  onClick,
}: {
  label: string
  value: string
  footer: string
  icon: ReactNode
  tone: string
  featured?: boolean
  trend?: boolean
  negative?: boolean
  onClick?: () => void
}) {
  const content = (
    <>
      <div className="metric-top">
        <span className={`metric-icon ${tone}`}>{icon}</span>
        {trend && <span className={`metric-trend ${negative ? 'negative' : 'positive'}`}><ArrowUpRight aria-hidden="true" /></span>}
      </div>
      <div className="metric-number">{value}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-footer"><span>{footer}</span></div>
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={`metric-card metric-clickable ${featured ? 'metric-feature' : ''}`} onClick={onClick}>
        {content}
      </button>
    )
  }
  return (
    <article className={`metric-card ${featured ? 'metric-feature' : ''}`}>
      {content}
    </article>
  )
}

function DeadlinesPanel({ upcoming, onOpen, onOpenTask }: { upcoming: DbTask[]; onOpen: () => void; onOpenTask?: (task: DbTask) => void }) {
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
            <button
              type="button"
              key={task.id}
              className={`deadline-item ${urgent || index === 0 ? 'urgent' : ''}`}
              onClick={() => onOpenTask?.(task)}
            >
              <div className="date-tile"><strong>{day}</strong><span>{month}</span></div>
              <div>
                <strong>{task.title}</strong>
                <span>{formatDue(task.dueDate)} · {task.department?.name ?? 'General'}</span>
              </div>
              {urgent ? <CircleAlert aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <button className="panel-link" onClick={onOpen}>Open calendar <ArrowUpRight aria-hidden="true" /></button>
    </section>
  )
}

function DepartmentPanel({ departments, onOpen }: { departments: DbDepartment[]; onOpen?: (id: string) => void }) {
  return (
    <section className="panel department-panel">
      <div className="panel-heading">
        <div><h2>Department progress</h2><p>Completion across active work</p></div>
      </div>
      <div className="department-list">
        {departments.map((department) => (
          <button type="button" className="department-row" key={department.id} onClick={() => onOpen?.(department.id)}>
            <div className={`department-icon department-${department.color}`}>{department.name.slice(0, 1)}</div>
            <div className="department-name">
              <strong>{department.name}</strong>
              <span>{department.owner ? ledBy(fullName(department.owner)) : 'No lead assigned'}</span>
            </div>
            <div className="progress-track">
              <div className={`progress-fill fill-${department.color}`} style={{ width: `${department.progress}%` }} />
            </div>
            <strong className="progress-number">{department.progress}%</strong>
            <span className="task-count">{department.completed} / {department.total}</span>
          </button>
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
  completionRate,
  status,
  risk,
  overdueCount,
  blockedCount,
  nextMilestone,
  tasks,
  onOpen,
}: DbProject & { onOpen?: () => void }) {
  return (
    <article className="panel project-card project-card-interactive" onClick={onOpen} onKeyDown={(event) => event.key === 'Enter' && onOpen?.()} role={onOpen ? 'button' : undefined} tabIndex={onOpen ? 0 : undefined}>
      <div className="project-card-top">
        <span className="project-icon"><BriefcaseBusiness aria-hidden="true" /></span>
        <div className="project-card-badges">
          <StatusBadge status={status} />
          <StatusBadge status={risk} />
        </div>
      </div>
      <h2>{title}</h2>
      <p>{ledBy(owner)}</p>
      <div className="project-progress">
        <strong>{completionRate}%</strong>
        <span>completion</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill fill-teal" style={{ width: `${progress}%` }} />
      </div>
      <div className="project-meta">
        <span>{tasks} tasks</span>
        <span>{overdueCount} overdue</span>
        <span>{blockedCount} blocked</span>
      </div>
      <div className="project-risk">
        <CircleAlert aria-hidden="true" />
        <span>Next milestone: {nextMilestone}</span>
      </div>
      <div className="project-footer">
        <strong>{progress}%</strong>
        <span>tracked progress</span>
        <ArrowUpRight aria-hidden="true" />
      </div>
    </article>
  )
}
