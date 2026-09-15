'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { X } from 'lucide-react'
import { createTask } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { CategoryField } from '@/components/category-field'
import { TASK_PRIORITY_LABELS } from '@/lib/constants'
import { suggestTaskFields } from '@/lib/task-suggest'
import type { TaskProjectOption } from '@/components/create-task-dialog'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="create-button invite-submit" type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Add to my queue'}
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

export function CreateSelfTaskDialog({
  sponsorName,
  projects = [],
  onClose,
}: {
  sponsorName?: string | null
  projects?: TaskProjectOption[]
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('operational')
  const [categoryCustom, setCategoryCustom] = useState('')
  const [priority, setPriority] = useState('medium')
  const [categoryLocked, setCategoryLocked] = useState(false)
  const [priorityLocked, setPriorityLocked] = useState(false)
  const [placement, setPlacement] = useState<'independent' | 'project'>('independent')
  const [projectId, setProjectId] = useState('')
  const firstFieldRef = useRef<HTMLInputElement | null>(null)

  const myProjects = projects.filter((project) => Boolean(project.id))

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstFieldRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function onTitleChange(value: string) {
    setTitle(value)
    const next = suggestTaskFields(value, [], [])
    if (!categoryLocked && next.category) {
      setCategory(next.category)
      if (next.category !== 'other') setCategoryCustom('')
    }
    if (!priorityLocked && next.priority) setPriority(next.priority)
  }

  async function action(formData: FormData) {
    formData.set('placement', placement)
    formData.set('category', category)
    formData.set('categoryCustom', categoryCustom)
    formData.set('priority', priority)
    formData.set('startDate', localIsoDate(0))
    if (placement === 'independent') {
      formData.delete('projectId')
      formData.delete('milestoneId')
    } else if (projectId) {
      formData.set('projectId', projectId)
    }
    setError(null)
    const result = await createTask(formData)
    if (result && 'error' in result && result.error) {
      setError(result.error)
      return
    }
    onClose()
  }

  return (
    <div className="modal-backdrop invite-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="create-modal invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="self-task-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="invite-modal-head">
          <div>
            <span className="eyebrow">My work</span>
            <h2 id="self-task-title">Add my task</h2>
          </div>
          <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>

        <form action={action} className="invite-form">
          <div className="invite-modal-body">
            <p className="edit-person-lead">
              Log work that is already yours — including things given verbally. It lands on your queue immediately.
              {sponsorName
                ? ` ${sponsorName} is notified so your supervisor stays in the loop.`
                : ' Your department lead is notified when no personal supervisor is set.'}
            </p>

            <div className="invite-form-grid">
              <label className="invite-span-all">
                What are you working on?
                <input
                  ref={firstFieldRef}
                  name="title"
                  required
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value)}
                  placeholder="e.g. Draft volunteer onboarding checklist"
                />
              </label>

              <label className="invite-span-all">
                Notes
                <textarea name="description" rows={3} placeholder="Context, links, or what done looks like" />
              </label>

              <div className="invite-span-all">
                <CategoryField
                  value={category}
                  customValue={categoryCustom}
                  onChange={(nextCategory, nextCustom) => {
                    setCategoryLocked(true)
                    setCategory(nextCategory)
                    setCategoryCustom(nextCustom)
                  }}
                />
              </div>

              <label>
                Priority
                <select
                  name="priority"
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
                Due
                <input name="dueDate" type="date" defaultValue={localIsoDate(7)} />
              </label>

              <input type="hidden" name="placement" value={placement} />

              {myProjects.length > 0 ? (
                <fieldset className="invite-span-all invite-credential-field">
                  <legend>Where does it sit?</legend>
                  <label className={`invite-credential-option${placement === 'independent' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="placementChoice"
                      checked={placement === 'independent'}
                      onChange={() => {
                        setPlacement('independent')
                        setProjectId('')
                      }}
                    />
                    <span>
                      <strong>Standalone on my queue</strong>
                      <em>Best for quick or verbal work that is not under a project yet.</em>
                    </span>
                  </label>
                  <label className={`invite-credential-option${placement === 'project' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="placementChoice"
                      checked={placement === 'project'}
                      onChange={() => setPlacement('project')}
                    />
                    <span>
                      <strong>Attach to a project I am on</strong>
                      <em>Only projects you already belong to.</em>
                    </span>
                  </label>
                  {placement === 'project' ? (
                    <label className="invite-span-all" style={{ marginTop: 8 }}>
                      Project
                      <select
                        name="projectId"
                        required
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                      >
                        <option value="">Select a project</option>
                        {myProjects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </fieldset>
              ) : null}

              {error ? <p className="form-error invite-span-all">{error}</p> : null}
            </div>
          </div>

          <div className="invite-modal-footer">
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
