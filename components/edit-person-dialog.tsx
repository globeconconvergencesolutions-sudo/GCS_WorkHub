'use client'

import { useEffect, useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { Pencil, X } from 'lucide-react'
import { updatePerson } from '@/app/invite-actions'
import { Button } from '@/components/ui/button'
import { fullName } from '@/lib/format'
import type { Person } from '@/lib/types'

type Target = Person & {
  status?: string
  email?: string
  jobTitle?: string | null
  teamId?: string | null
  managerId?: string | null
  department?: { id?: string; name: string } | null
  team?: { id?: string; name: string } | null
  manager?: { id?: string; firstName: string; lastName: string } | null
  roles?: { role: { key: string; name: string } }[]
}

export function EditPersonDialog({
  person,
  people,
  departments,
  teams,
  roles,
  onClose,
  onSaved,
}: {
  person: Target
  people: Target[]
  departments: { id: string; name: string }[]
  teams: { id: string; name: string; departmentId: string | null }[]
  roles: { key: string; name: string }[]
  onClose: () => void
  onSaved?: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [departmentId, setDepartmentId] = useState(person.department?.id ?? person.departmentId ?? '')
  const [pending, startTransition] = useTransition()
  const firstFieldRef = useRef<HTMLInputElement | null>(null)
  const primaryRole = person.roles?.[0]?.role.key ?? 'employee'

  const managers = useMemo(
    () =>
      people.filter((entry) => {
        if (entry.id === person.id) return false
        const status = entry.status ?? 'active'
        return status === 'active' || status === 'invited'
      }),
    [people, person.id],
  )

  const filteredTeams = useMemo(
    () => teams.filter((team) => !departmentId || team.departmentId === departmentId),
    [teams, departmentId],
  )

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
      const result = await updatePerson(formData)
      if (result && 'error' in result && result.error) {
        setError(result.error)
        return
      }
      onSaved?.()
      onClose()
    })
  }

  return (
    <div className="modal-backdrop invite-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="create-modal invite-modal edit-person-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-person-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="invite-modal-head">
          <div>
            <span className="eyebrow">People</span>
            <h2 id="edit-person-title">Edit {fullName(person)}</h2>
          </div>
          <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="invite-form">
          <input type="hidden" name="userId" value={person.id} />
          <div className="invite-modal-body">
            <p className="edit-person-lead">
              Update identity, department, manager, and primary role. People cannot change these for themselves —
              only leadership can grant or revoke access.
            </p>
            <div className="invite-form-grid">
              <label>
                First name
                <input
                  ref={firstFieldRef}
                  name="firstName"
                  required
                  defaultValue={person.firstName}
                  autoComplete="given-name"
                />
              </label>
              <label>
                Last name
                <input name="lastName" required defaultValue={person.lastName} autoComplete="family-name" />
              </label>
              <label className="invite-span-all">
                Email
                <input name="email" type="email" required defaultValue={person.email ?? ''} autoComplete="email" />
              </label>
              <label className="invite-span-all">
                Job title
                <input name="jobTitle" required defaultValue={person.jobTitle ?? ''} />
              </label>
              <label>
                Department
                <select
                  name="departmentId"
                  value={departmentId}
                  onChange={(event) => setDepartmentId(event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Team
                <select name="teamId" key={departmentId} defaultValue={person.team?.id ?? person.teamId ?? ''}>
                  <option value="">No team</option>
                  {filteredTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Reports to
                <select name="managerId" defaultValue={person.manager?.id ?? person.managerId ?? ''}>
                  <option value="">No manager</option>
                  {managers.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {fullName(entry)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Primary role
                <select name="roleKey" defaultValue={primaryRole} required>
                  {roles.map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.name}
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
              <Pencil data-icon="inline-start" />
              {pending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
