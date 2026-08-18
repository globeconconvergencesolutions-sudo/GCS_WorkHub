'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { X } from 'lucide-react'
import { createTask } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { TASK_CATEGORY_LABELS, TASK_PRIORITY_LABELS } from '@/lib/constants'
import type { Person } from '@/lib/types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="create-button" type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create task'}
    </Button>
  )
}

export function CreateTaskDialog({
  people,
  currentUserId,
  onClose,
}: {
  people: Person[]
  currentUserId: string
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  async function action(formData: FormData) {
    const result = await createTask(formData)
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
        aria-labelledby="create-task-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form action={action}>
          <div className="modal-heading">
            <div>
              <span className="eyebrow">Quick action</span>
              <h2 id="create-task-title">Create a task</h2>
            </div>
            <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
          <label htmlFor="task-title">Task name</label>
          <input id="task-title" name="title" autoFocus required placeholder="e.g. Review monthly report" />
          <div className="form-grid">
            <label>
              Owner
              <select name="assigneeId" defaultValue={currentUserId}>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.firstName} {person.lastName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue="medium">
                {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select name="category" defaultValue="operational">
                {Object.entries(TASK_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
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
          <label htmlFor="task-description">Description</label>
          <textarea id="task-description" name="description" placeholder="Describe the expected outcome and context..." />
          <p>Tasks can be updated later with comments, notes, and evidence.</p>
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
