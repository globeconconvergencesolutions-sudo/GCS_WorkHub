'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { X } from 'lucide-react'
import { inviteEmployee } from '@/app/actions'
import { Button } from '@/components/ui/button'
import type { Person } from '@/lib/types'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button className="create-button" type="submit" disabled={pending}>
      {pending ? 'Adding…' : 'Add employee'}
    </Button>
  )
}

export function InviteEmployeeDialog({
  people,
  departments,
  roles,
  lockDepartmentId,
  onClose,
}: {
  people: Person[]
  departments: { id: string; name: string }[]
  roles: { key: string; name: string }[]
  lockDepartmentId?: string | null
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function action(formData: FormData) {
    const result = await inviteEmployee(formData)
    if (result && 'error' in result && result.error) {
      setError(result.error)
      setSuccess(null)
      return
    }
    if (result && 'starterPassword' in result) {
      setError(null)
      setSuccess(`Account created for ${result.email}. Starter password: ${result.starterPassword}`)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-employee-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">People</span>
            <h2 id="invite-employee-title">Add a person</h2>
          </div>
          <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>
        <form action={action} className="form-grid">
          <label>
            First name
            <input name="firstName" required autoComplete="given-name" />
          </label>
          <label>
            Last name
            <input name="lastName" required autoComplete="family-name" />
          </label>
          <label className="span-2">
            Email
            <input name="email" type="email" required autoComplete="email" placeholder="name@globcons.com" />
          </label>
          <label className="span-2">
            Job title
            <input name="jobTitle" required placeholder="Operations analyst" />
          </label>
          <label>
            Department
            <select
              name="departmentId"
              defaultValue={lockDepartmentId ?? ''}
              disabled={Boolean(lockDepartmentId)}
              required={Boolean(lockDepartmentId)}
            >
              {!lockDepartmentId && <option value="">Unassigned</option>}
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            {lockDepartmentId ? <input type="hidden" name="departmentId" value={lockDepartmentId} /> : null}
          </label>
          <label>
            Role
            <select name="roleKey" defaultValue="employee">
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label className="span-2">
            Reports to
            <select name="managerId" defaultValue="">
              <option value="">No manager</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="form-error span-2">{error}</p>}
          {success && <p className="form-success span-2">{success}</p>}
          <div className="modal-actions span-2">
            <Button variant="outline" type="button" onClick={onClose}>
              {success ? 'Done' : 'Cancel'}
            </Button>
            {!success && <SubmitButton />}
          </div>
        </form>
      </div>
    </div>
  )
}
