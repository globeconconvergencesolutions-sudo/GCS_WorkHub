'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { X } from 'lucide-react'
import { createProject } from '@/app/actions'
import { Button } from '@/components/ui/button'
import type { Person } from '@/lib/types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="create-button" type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create project'}
    </Button>
  )
}

export function CreateProjectDialog({
  people,
  currentUserId,
  departments,
  onClose,
}: {
  people: Person[]
  currentUserId: string
  departments: { id: string; name: string }[]
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  async function action(formData: FormData) {
    const result = await createProject(formData)
    if (result?.error) {
      setError(result.error)
      return
    }
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form action={action}>
          <div className="modal-heading">
            <div>
              <span className="eyebrow">Projects</span>
              <h2 id="create-project-title">Create a project</h2>
            </div>
            <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>

          <label htmlFor="project-title">Project name</label>
          <input id="project-title" name="title" autoFocus required placeholder="e.g. Q4 client onboarding readiness" />

          <div className="form-grid">
            <label>
              Owner
              <select name="ownerId" defaultValue={currentUserId}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Department scope
              <select name="departmentId" defaultValue="">
                <option value="" disabled>
                  Select…
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Status
              <select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>

          <label htmlFor="project-description">Description</label>
          <textarea id="project-description" name="description" placeholder="What outcomes define success for this project?" />

          <div className="form-grid">
            <label>
              Milestone name
              <input name="milestoneTitle" placeholder="Delivery" defaultValue="Delivery" />
            </label>
            <label>
              Start date
              <input type="date" name="startDate" />
            </label>
            <label>
              Due date
              <input type="date" name="dueDate" />
            </label>
          </div>

          <fieldset style={{ border: '0', padding: 0, margin: '8px 0 0' }}>
            <legend style={{ fontSize: 11, fontWeight: 800, marginBottom: 8 }}>Project team</legend>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {people.map((p) => (
                <label key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11 }}>
                  <input
                    type="checkbox"
                    name="teamUserIds"
                    value={p.id}
                    defaultChecked={p.id === currentUserId}
                  />
                  {p.firstName} {p.lastName}
                </label>
              ))}
            </div>
          </fieldset>

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

