'use client'

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { Building2, X } from 'lucide-react'
import { createDepartment } from '@/app/actions'
import { Button } from '@/components/ui/button'
import type { Person } from '@/lib/types'

const COLORS = [
  { key: 'teal', label: 'Teal' },
  { key: 'navy', label: 'Navy' },
  { key: 'gold', label: 'Gold' },
  { key: 'coral', label: 'Coral' },
  { key: 'blue', label: 'Blue' },
  { key: 'slate', label: 'Slate' },
  { key: 'purple', label: 'Purple' },
]

export function CreateDepartmentDialog({
  people,
  onClose,
  onCreated,
}: {
  people: Person[]
  onClose: () => void
  onCreated?: (departmentId?: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const firstFieldRef = useRef<HTMLInputElement | null>(null)

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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(null)
    startTransition(async () => {
      const result = await createDepartment(formData)
      if (result && 'error' in result && result.error) {
        setError(result.error)
        return
      }
      const departmentId =
        result && 'ok' in result && result.ok && 'departmentId' in result
          ? String((result as { departmentId?: string }).departmentId ?? '')
          : undefined
      onCreated?.(departmentId || undefined)
      onClose()
    })
  }

  return (
    <div className="modal-backdrop invite-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="create-modal invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-department-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="invite-modal-head">
          <div>
            <span className="eyebrow">Organization</span>
            <h2 id="create-department-title">New department</h2>
          </div>
          <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="invite-form">
          <div className="invite-modal-body">
            <p className="edit-person-lead">
              Stand up a Globecon function. A default team desk is created automatically. Only workspace admins can
              change company structure.
            </p>
            <div className="invite-form-grid">
              <label className="invite-span-all">
                Name
                <input
                  ref={firstFieldRef}
                  name="name"
                  required
                  placeholder="Volunteers"
                  autoComplete="organization"
                />
              </label>
              <label>
                Colour
                <select name="color" defaultValue="teal">
                  {COLORS.map((color) => (
                    <option key={color.key} value={color.key}>
                      {color.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Department head
                <select name="ownerId" defaultValue="">
                  <option value="">No head yet</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.firstName} {person.lastName}
                    </option>
                  ))}
                </select>
              </label>
              {error ? <p className="form-error invite-span-all">{error}</p> : null}
            </div>
          </div>
          <div className="invite-modal-footer">
            <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button className="create-button invite-submit" type="submit" disabled={pending}>
              <Building2 data-icon="inline-start" />
              {pending ? 'Creating…' : 'Create department'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
