'use client'

import { useMemo, useState } from 'react'
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
  LayoutDashboard,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Target,
  UsersRound,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

import { StatusBadge } from '@/components/status-badge'
import { taskCategoryEnum, taskPriorityEnum, taskStatusEnum } from '@/lib/db/schema'

type TaskStatus = (typeof taskStatusEnum.enumValues)[number]
type TaskCategory = (typeof taskCategoryEnum.enumValues)[number]
type TaskPriority = (typeof taskPriorityEnum.enumValues)[number]
type Task = {
  id: string
  title: string
  category: TaskCategory
  priority: TaskPriority
  status: TaskStatus
  dueDate: string | Date | null
  assignee: { initials: string; firstName: string; lastName: string }
  department: { name: string; color?: string }
}

const today = new Date()
const daysFromNow = (days: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const initialTasks: Task[] = [
  {
    id: '1',
    title: 'Finalize Q3 operations review',
    category: 'administrative',
    priority: 'high',
    status: 'in_progress',
    dueDate: daysFromNow(0),
    assignee: { initials: 'AO', firstName: 'Amara', lastName: 'Okafor' },
    department: { name: 'Operations', color: 'teal' },
  },
  {
    id: '2',
    title: 'Update client onboarding checklist',
    category: 'support',
    priority: 'medium',
    status: 'waiting',
    dueDate: daysFromNow(1),
    assignee: { initials: 'DM', firstName: 'David', lastName: 'Mensah' },
    department: { name: 'Client Services', color: 'gold' },
  },
  {
    id: '3',
    title: 'Prepare campaign performance report',
    category: 'marketing',
    priority: 'medium',
    status: 'not_started',
    dueDate: daysFromNow(4),
    assignee: { initials: 'LC', firstName: 'Lina', lastName: 'Chen' },
    department: { name: 'Marketing', color: 'gold' },
  },
  {
    id: '4',
    title: 'Resolve payroll reconciliation',
    category: 'finance',
    priority: 'high',
    status: 'blocked',
    dueDate: daysFromNow(5),
    assignee: { initials: 'JW', firstName: 'James', lastName: 'Wilson' },
    department: { name: 'Finance & Admin', color: 'coral' },
  },
  {
    id: '5',
    title: 'Deploy internal knowledge base',
    category: 'technical',
    priority: 'low',
    status: 'completed',
    dueDate: daysFromNow(-1),
    assignee: { initials: 'NJ', firstName: 'Nia', lastName: 'Johnson' },
    department: { name: 'Technology', color: 'blue' },
  },
]

const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'My tasks', icon: Check, count: 12 },
  { label: 'Responsibilities', icon: ShieldCheck },
  { label: 'Departments', icon: UsersRound },
  { label: 'Projects', icon: BriefcaseBusiness },
]

const departments = [
  { name: 'Operations', owner: 'Amara Okafor', progress: 82, tasks: '24 / 29', color: 'teal' },
  { name: 'Technology', owner: 'Nia Johnson', progress: 68, tasks: '17 / 25', color: 'blue' },
  { name: 'Client Services', owner: 'David Mensah', progress: 74, tasks: '20 / 27', color: 'gold' },
  { name: 'Finance & Admin', owner: 'James Wilson', progress: 91, tasks: '21 / 23', color: 'coral' },
]

export function WorkhubDashboard() {
  const [activeNav, setActiveNav] = useState('Overview')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'All' | TaskStatus>('All')
  const [tasks, setTasks] = useState(initialTasks)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newTask, setNewTask] = useState('')

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const matchesQuery = `${task.title} ${task.category} ${task.owner}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (filter === 'All' || task.status === filter)
  }), [tasks, query, filter])

  function addTask() {
    if (!newTask.trim()) return
    setTasks((current) => [{ id: Date.now(), title: newTask.trim(), category: 'Operational', owner: 'You', initials: 'YO', status: 'Not started', due: 'Aug 25', priority: 'Medium' }, ...current])
    setNewTask('')
    setShowCreate(false)
  }

  function completeTask(id: number) {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, status: 'Completed' } : task))
  }

  return (
    <main className="workhub-shell">
      <aside className="workhub-sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><span>G</span></div>
          <div><strong>GCS</strong><span>WorkHub</span></div>
        </div>
        <div className="workspace-switcher"><div className="workspace-icon">G</div><div><span>Workspace</span><strong>GCS Operations</strong></div><ChevronDown aria-hidden="true" /></div>
        <nav aria-label="Primary navigation" className="primary-nav">
          <span className="nav-caption">Workspace</span>
          {navItems.map(({ label, icon: Icon, count }) => <button key={label} className={activeNav === label ? 'nav-item active' : 'nav-item'} onClick={() => setActiveNav(label)}><Icon aria-hidden="true" /><span>{label}</span>{count && <em>{count}</em>}</button>)}
          <span className="nav-caption nav-caption-spaced">Manage</span>
          <button className="nav-item" onClick={() => setActiveNav('Reports')}><Target aria-hidden="true" /><span>Reports</span></button>
          <button className="nav-item" onClick={() => setActiveNav('Activity')}><Activity aria-hidden="true" /><span>Activity</span></button>
        </nav>
        <div className="sidebar-bottom"><button className="nav-item"><Settings2 aria-hidden="true" /><span>Settings</span></button><div className="sidebar-help"><div className="help-icon"><MessageSquare aria-hidden="true" /></div><div><strong>Need a hand?</strong><span>Visit the help center</span></div><ArrowUpRight aria-hidden="true" /></div></div>
      </aside>

      <section className="workhub-content">
        <header className="topbar"><button className="mobile-menu" aria-label="Open navigation"><Menu aria-hidden="true" /></button><div className="breadcrumbs"><span>GCS Operations</span><span>/</span><strong>{activeNav}</strong></div><div className="topbar-actions"><label className="search-field"><Search aria-hidden="true" /><input aria-label="Search tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search anything..." /><kbd>⌘ K</kbd></label><button className="icon-button" aria-label="Notifications" onClick={() => setShowNotifications(!showNotifications)}><Bell aria-hidden="true" /><i /></button><button className="profile-button" onClick={() => setShowProfile(!showProfile)}><span className="avatar avatar-navy">AO</span><span className="profile-copy"><strong>Amara Okafor</strong><small>Managing Director</small></span><ChevronDown aria-hidden="true" /></button></div></header>
        {showNotifications && <div className="popover notifications"><strong>Notifications</strong><p><CircleAlert aria-hidden="true" /> Payroll reconciliation is blocked.</p><p><Clock3 aria-hidden="true" /> 2 tasks are due this week.</p></div>}
        {showProfile && <div className="popover profile-popover"><strong>Amara Okafor</strong><span>Managing Director</span><button onClick={() => setShowProfile(false)}>View profile</button></div>}

        <div className="page-wrap">
          <div className="welcome-row"><div><p className="eyebrow">Tuesday, August 19, 2025</p><h1>Good morning, Amara<span>.</span></h1><p className="subhead">Here&apos;s what&apos;s happening across GCS today.</p></div><Button className="create-button" onClick={() => setShowCreate(true)}><Plus data-icon="inline-start" /> Create task</Button></div>

          <section className="metric-grid" aria-label="Workspace summary">
            <article className="metric-card metric-feature"><div className="metric-top"><span className="metric-icon teal-icon"><Check aria-hidden="true" /></span><span className="metric-trend positive">+12.5% <ArrowUpRight aria-hidden="true" /></span></div><div className="metric-number">42</div><div className="metric-label">Active tasks</div><div className="metric-footer"><span>Across 6 departments</span><span className="mini-bars"><i /><i /><i /><i /><i /></span></div></article>
            <article className="metric-card"><div className="metric-top"><span className="metric-icon blue-icon"><Clock3 aria-hidden="true" /></span><span className="metric-trend positive">+8.2% <ArrowUpRight aria-hidden="true" /></span></div><div className="metric-number">18</div><div className="metric-label">Due this week</div><div className="metric-footer"><span>5 due today</span><span className="metric-link">View tasks <ArrowUpRight aria-hidden="true" /></span></div></article>
            <article className="metric-card"><div className="metric-top"><span className="metric-icon gold-icon"><CircleAlert aria-hidden="true" /></span><span className="metric-trend negative">+2 this week</span></div><div className="metric-number">7</div><div className="metric-label">Need attention</div><div className="metric-footer"><span>3 overdue, 4 blocked</span><span className="metric-link">Review <ArrowUpRight aria-hidden="true" /></span></div></article>
            <article className="metric-card"><div className="metric-top"><span className="metric-icon coral-icon"><Target aria-hidden="true" /></span><span className="metric-trend positive">+5.4% <ArrowUpRight aria-hidden="true" /></span></div><div className="metric-number">76<span className="metric-unit">%</span></div><div className="metric-label">Completion rate</div><div className="metric-footer"><span>Up from 70% last week</span><span className="metric-link">Details <ArrowUpRight aria-hidden="true" /></span></div></article>
          </section>

          <div className="dashboard-grid">
            <section className="panel task-panel"><div className="panel-heading"><div><h2>Task workload</h2><p>Your team&apos;s most recent work activity</p></div><button className="more-button" aria-label="More task options"><MoreHorizontal aria-hidden="true" /></button></div><div className="task-toolbar"><div className="filter-pills" role="group" aria-label="Filter tasks">{(['All', 'In progress', 'Waiting', 'Blocked'] as const).map((item) => <button key={item} className={filter === item ? 'filter-pill selected' : 'filter-pill'} onClick={() => setFilter(item)}>{item}{item === 'All' && <span>{tasks.length}</span>}</button>)}</div><button className="view-all" onClick={() => setFilter('All')}>View all <ArrowUpRight aria-hidden="true" /></button></div><div className="task-list">{visibleTasks.map((task) => <div className="task-row" key={task.id}><div className={`priority-bar priority-${task.priority.toLowerCase()}`} /><div className="task-main"><strong>{task.title}</strong><span>{task.category} <i /> Due {task.due}</span></div><div className="task-owner"><span className="avatar avatar-small">{task.initials}</span><span>{task.owner}</span></div><StatusBadge status={task.status} /><button className="task-check" aria-label={`Mark ${task.title} complete`} onClick={() => completeTask(task.id)}><Check aria-hidden="true" /></button></div>)}{visibleTasks.length === 0 && <div className="empty-state">No tasks match your search.</div>}</div></section>
            <section className="panel deadlines-panel"><div className="panel-heading"><div><h2>Upcoming deadlines</h2><p>The next 7 days</p></div><CalendarDays aria-hidden="true" className="heading-icon" /></div><div className="deadline-list"><div className="deadline-item urgent"><div className="date-tile"><strong>19</strong><span>AUG</span></div><div><strong>Q3 operations review</strong><span>Today · Operations</span></div><CircleAlert aria-hidden="true" /></div><div className="deadline-item"><div className="date-tile"><strong>20</strong><span>AUG</span></div><div><strong>Onboarding checklist</strong><span>Tomorrow · Client Services</span></div><ChevronDown aria-hidden="true" /></div><div className="deadline-item"><div className="date-tile"><strong>22</strong><span>AUG</span></div><div><strong>Campaign performance report</strong><span>Friday · Marketing</span></div><ChevronDown aria-hidden="true" /></div><div className="deadline-item"><div className="date-tile"><strong>23</strong><span>AUG</span></div><div><strong>Payroll reconciliation</strong><span>Saturday · Finance</span></div><ChevronDown aria-hidden="true" /></div></div><button className="panel-link">Open calendar <ArrowUpRight aria-hidden="true" /></button></section>
          </div>

          <div className="lower-grid"><section className="panel department-panel"><div className="panel-heading"><div><h2>Department progress</h2><p>Completion across active work</p></div><button className="view-all">This month <ChevronDown aria-hidden="true" /></button></div><div className="department-list">{departments.map((department) => <div className="department-row" key={department.name}><div className={`department-icon department-${department.color}`}>{department.name.slice(0, 1)}</div><div className="department-name"><strong>{department.name}</strong><span>{department.owner}</span></div><div className="progress-track"><div className={`progress-fill fill-${department.color}`} style={{ width: `${department.progress}%` }} /></div><strong className="progress-number">{department.progress}%</strong><span className="task-count">{department.tasks}</span></div>)}</div></section><section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest updates from your team</p></div><button className="more-button" aria-label="More activity options"><MoreHorizontal aria-hidden="true" /></button></div><div className="activity-list"><div className="activity-row"><span className="avatar avatar-teal">NJ</span><div><strong>Nia Johnson <span>completed</span></strong><p>Deploy internal knowledge base</p><small>12 minutes ago</small></div></div><div className="activity-row"><span className="avatar avatar-gold">DM</span><div><strong>David Mensah <span>commented on</span></strong><p>Client onboarding checklist</p><small>48 minutes ago</small></div></div><div className="activity-row"><span className="avatar avatar-coral">JW</span><div><strong>James Wilson <span>flagged</span></strong><p>Payroll reconciliation as blocked</p><small>2 hours ago</small></div></div></div></section></div>
        </div>
      </section>

      {showCreate && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowCreate(false)}><div className="create-modal" role="dialog" aria-modal="true" aria-labelledby="create-task-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="eyebrow">Quick action</span><h2 id="create-task-title">Create a task</h2></div><button className="close-button" aria-label="Close dialog" onClick={() => setShowCreate(false)}><X aria-hidden="true" /></button></div><label htmlFor="task-title">Task name</label><input id="task-title" autoFocus value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addTask() }} placeholder="e.g. Review monthly report" /><p>New tasks are added to your operational workload as not started.</p><div className="modal-actions"><Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button className="create-button" onClick={addTask} disabled={!newTask.trim()}>Create task</Button></div></div></div>}
    </main>
  )
}

export default WorkhubDashboard
