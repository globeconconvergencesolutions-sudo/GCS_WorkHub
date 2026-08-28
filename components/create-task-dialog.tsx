'use client'

import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Sparkles, X } from 'lucide-react'
import { createTask } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { CategoryField } from '@/components/category-field'
import { TASK_PRIORITY_LABELS } from '@/lib/constants'
import { suggestTaskFields } from '@/lib/task-suggest'
import type { Person } from '@/lib/types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="create-button" type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create task'}
    </Button>
  )
}

function localIsoDate(daysFromToday = 0) {
  const date = new Date()
  date.setDate(date.getDate() + daysFromToday)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

type DepartmentOption = { id: string; name: string; owner?: { firstName: string; lastName: string } | null }

function personDepartmentId(person: Person & { department?: { id?: string } | null }) {
  return person.departmentId ?? person.department?.id ?? ''
}

function departmentLead(departmentId: string, people: Person[], departments: DepartmentOption[]) {
  const members = people.filter((person) => personDepartmentId(person) === departmentId)
  const namedOwner = departments.find((department) => department.id === departmentId)?.owner
  return (
    members.find(
      (person) => person.firstName === namedOwner?.firstName && person.lastName === namedOwner?.lastName,
    ) ??
    members[0] ??
    null
  )
}

export function CreateTaskDialog({
  people,
  currentUserId,
  departments,
  defaultDepartmentId = '',
  defaultMilestoneId = '',
  milestones = [],
  lockDepartment = false,
  onClose,
}: {
  people: Person[]
  currentUserId: string
  departments: DepartmentOption[]
  defaultDepartmentId?: string
  defaultMilestoneId?: string
  milestones?: Array<{ id: string; title: string }>
  lockDepartment?: boolean
  onClose: () => void
}) {
  const roster = useMemo(
    () =>
      people.map((person) => ({
        ...person,
        departmentId: personDepartmentId(person) || null,
      })),
    [people],
  )
  const defaultLead = defaultDepartmentId ? departmentLead(defaultDepartmentId, roster, departments) : null
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [assigneeId, setAssigneeId] = useState(defaultLead?.id ?? currentUserId)
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId)
  const [category, setCategory] = useState('operational')
  const [categoryCustom, setCategoryCustom] = useState('')
  const [priority, setPriority] = useState('medium')
  const [startDate, setStartDate] = useState(localIsoDate(0))
  const [dueDate, setDueDate] = useState(localIsoDate(7))
  const [ownerLocked, setOwnerLocked] = useState(Boolean(defaultDepartmentId))
  const [departmentLocked, setDepartmentLocked] = useState(Boolean(defaultDepartmentId) || lockDepartment)
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [priorityLocked, setPriorityLocked] = useState(false)
  const [milestoneId, setMilestoneId] = useState(defaultMilestoneId)

  const suggestion = useMemo(
    () => suggestTaskFields(title, roster, departments),
    [title, roster, departments],
  )

  const selectedOwner = roster.find((person) => person.id === assigneeId)

  function applySuggestion(next = suggestion, force = false) {
    if ((force || !categoryLocked) && next.category) {
      setCategory(next.category)
      setCategoryCustom('')
    }
    if ((force || !priorityLocked) && next.priority) setPriority(next.priority)
    if ((force || !departmentLocked) && next.departmentId) setDepartmentId(next.departmentId)
    if ((force || !ownerLocked) && next.assigneeId) setAssigneeId(next.assigneeId)
  }

  function onTitleChange(value: string) {
    setTitle(value)
    const next = suggestTaskFields(value, roster, departments)
    if (!categoryLocked && next.category) {
      setCategory(next.category)
      setCategoryCustom('')
    }
    if (!priorityLocked && next.priority) setPriority(next.priority)
    if (!departmentLocked && next.departmentId) setDepartmentId(next.departmentId)
    if (!ownerLocked && next.assigneeId) setAssigneeId(next.assigneeId)
  }

  function onOwnerChange(value: string) {
    setOwnerLocked(true)
    setAssigneeId(value)
    const owner = roster.find((person) => person.id === value)
    if (owner?.departmentId && !departmentLocked) {
      setDepartmentId(owner.departmentId)
    }
  }

  function onDepartmentChange(value: string) {
    setDepartmentLocked(true)
    setDepartmentId(value)
    if (!value) return
    const lead = departmentLead(value, roster, departments)
    if (lead && lead.id !== assigneeId) {
      setAssigneeId(lead.id)
      setOwnerLocked(false)
    }
  }

  async function action(formData: FormData) {
    formData.set('assigneeId', assigneeId)
    formData.set('departmentId', departmentId)
    formData.set('category', category)
    formData.set('categoryCustom', categoryCustom)
    formData.set('priority', priority)
    formData.set('startDate', startDate)
    formData.set('dueDate', dueDate)
    if (milestoneId) formData.set('milestoneId', milestoneId)
    const result = await createTask(formData)
    if (result?.error) {
      setError(result.error)
      return
    }
    onClose()
  }

  const matchCopy = suggestion.reasons.slice(0, 2).join(' · ')

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="create-modal create-task-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-task-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form action={action}>
          <div className="modal-heading">
            <div>
              <span className="eyebrow">Assign work</span>
              <h2 id="create-task-title">Create a task</h2>
            </div>
            <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>

          <label htmlFor="task-title">Task name</label>
          <input
            id="task-title"
            name="title"
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            autoFocus
            required
            placeholder="e.g. UMGM tenders or Harden WorkHub access"
          />

          {title.trim() && matchCopy && (
            <p className="task-match-hint">
              <Sparkles aria-hidden="true" />
              <span>{matchCopy}</span>
              <button type="button" className="text-back" onClick={() => applySuggestion(suggestion, true)}>
                Re-apply match
              </button>
            </p>
          )}

          <div className="form-grid">
            <label>
              Led by
              <select value={assigneeId} onChange={(event) => onOwnerChange(event.target.value)}>
                {departments.map((department) => {
                  const members = roster.filter((person) => person.departmentId === department.id)
                  if (members.length === 0) return null
                  return (
                    <optgroup key={department.id} label={department.name}>
                      {members.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.firstName} {person.lastName} · {person.jobTitle}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
                {roster.some((person) => !person.departmentId) && (
                  <optgroup label="Unassigned">
                    {roster
                      .filter((person) => !person.departmentId)
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.firstName} {person.lastName} · {person.jobTitle}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            </label>
            <label>
              Department
              <select
                value={departmentId}
                disabled={lockDepartment}
                onChange={(event) => onDepartmentChange(event.target.value)}
              >
                <option value="">Match to lead</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            {milestones.length > 0 && (
              <label>
                Milestone
                <select value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)}>
                  {milestones.map((milestone) => (
                    <option key={milestone.id} value={milestone.id}>
                      {milestone.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <CategoryField
              value={category}
              customValue={categoryCustom}
              onChange={(nextCategory, nextCustom) => {
                setCategoryLocked(true)
                setCategory(nextCategory)
                setCategoryCustom(nextCustom)
              }}
            />
            <label>
              Priority
              <select
                value={priority}
                onChange={(event) => {
                  setPriorityLocked(true)
                  setPriority(event.target.value)
                }}
              >
                {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Start date
              <input type="date" name="startDate" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              Due date
              <input type="date" name="dueDate" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          </div>

          {selectedOwner && (
            <p className="task-assign-preview">
              Led by <strong>{selectedOwner.firstName} {selectedOwner.lastName}</strong>
              {selectedOwner.jobTitle ? ` · ${selectedOwner.jobTitle}` : ''}
              {departmentId ? ' in this department' : ''}
              {`. Due ${dueDate || 'unscheduled'}.`}
            </p>
          )}

          <label htmlFor="task-description">Description</label>
          <textarea
            id="task-description"
            name="description"
            placeholder="Outcome, context, and what done looks like..."
          />
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <Button variant="outline" type="button" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  )
}
