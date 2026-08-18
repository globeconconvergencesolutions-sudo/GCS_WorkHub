'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { X } from 'lucide-react'
import { createResponsibility } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { TASK_CATEGORY_LABELS } from '@/lib/constants'
import type { Person } from '@/lib/types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="create-button" type="submit" disabled={pending}>
      {pending ? 'Creating…' : 'Create responsibility'}
    </Button>
  )
}

export function CreateResponsibilityDialog({
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
    const result = await createResponsibility(formData)
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
        aria-labelledby="create-resp-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form action={action}>
          <div className="modal-heading">
            <div>
              <span className="eyebrow">Accountability</span>
              <h2 id="create-resp-title">Add a responsibility</h2>
            </div>
            <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
              <X aria-hidden="true" />
            </button>
          </div>
          <label htmlFor="resp-title">Responsibility name</label>
          <input id="resp-title" name="title" autoFocus required placeholder="e.g. Client delivery quality" />
          <div className="form-grid">
            <label>
              Owner
              <select name="ownerId" defaultValue={currentUserId}>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.firstName} {person.lastName}
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
              Department
              <select name="departmentId" defaultValue="">
                <option value="">No department</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
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
          <label htmlFor="resp-description">Description</label>
          <textarea id="resp-description" name="description" placeholder="What does this responsibility cover and why does it matter?" />
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
