'use client'

import { useState, useTransition } from 'react'
import { createDepartment, createTeam, updateDepartment, updateTeam, updateUserPlacement } from '@/app/actions'
import { Button } from '@/components/ui/button'
import type { Person } from '@/lib/types'

const COLORS = ['teal', 'navy', 'gold', 'coral', 'blue']

export function OrgSettingsPanel({
  people,
  departments,
  teams,
  roles,
}: {
  people: Person[]
  departments: { id: string; name: string; slug?: string; color?: string; ownerId?: string | null }[]
  teams: { id: string; name: string; departmentId?: string; department?: { name: string } | null }[]
  roles: { key: string; name: string }[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ error?: string } | { ok?: boolean }>, okMessage: string) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (result && 'error' in result && result.error) setError(result.error)
      else setNotice(okMessage)
    })
  }

  return (
    <div className="org-settings">
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-success">{notice}</p>}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>New department</h2>
              <p>Stand up a Globecon function</p>
            </div>
          </div>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault()
              const formData = new FormData(event.currentTarget)
              run(() => createDepartment(formData), 'Department created.')
              event.currentTarget.reset()
            }}
          >
            <label className="span-2">
              Name
              <input name="name" required placeholder="Digital technology" />
            </label>
            <label>
              Colour
              <select name="color" defaultValue="teal">
                {COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Head
              <select name="ownerId" defaultValue="">
                <option value="">No head yet</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.firstName} {person.lastName}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions span-2">
              <Button className="create-button" type="submit" disabled={isPending}>
                Create department
              </Button>
            </div>
          </form>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>New team</h2>
              <p>A named group inside a department</p>
            </div>
          </div>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault()
              const formData = new FormData(event.currentTarget)
              run(() => createTeam(formData), 'Team created.')
              event.currentTarget.reset()
            }}
          >
            <label>
              Name
              <input name="name" required placeholder="Delivery squad" />
            </label>
            <label>
              Department
              <select name="departmentId" required defaultValue={departments[0]?.id ?? ''}>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions span-2">
              <Button className="create-button" type="submit" disabled={isPending}>
                Create team
              </Button>
            </div>
          </form>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Rename a department</h2>
            <p>Keep the org chart current</p>
          </div>
        </div>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            run(() => updateDepartment(new FormData(event.currentTarget)), 'Department updated.')
          }}
        >
          <label>
            Department
            <select name="departmentId" required defaultValue={departments[0]?.id ?? ''}>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            New name
            <input name="name" required />
          </label>
          <label>
            Colour
            <select name="color" defaultValue="teal">
              {COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </label>
          <label>
            Head
            <select name="ownerId" defaultValue="">
              <option value="">No head</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions span-2">
            <Button className="create-button" type="submit" disabled={isPending}>
              Save department
            </Button>
          </div>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Rename a team</h2>
            <p>Names only — membership is on the person</p>
          </div>
        </div>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            run(() => updateTeam(new FormData(event.currentTarget)), 'Team updated.')
          }}
        >
          <label>
            Team
            <select name="teamId" required defaultValue={teams[0]?.id ?? ''}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                  {team.department?.name ? ` · ${team.department.name}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            New name
            <input name="name" required />
          </label>
          <div className="modal-actions span-2">
            <Button className="create-button" type="submit" disabled={isPending}>
              Save team
            </Button>
          </div>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-heading">
          <div>
            <h2>Place a person</h2>
            <p>Or use Edit on the Departments people list — role, department, team, and manager</p>
          </div>
        </div>
        <form
          className="form-grid"
          onSubmit={(event) => {
            event.preventDefault()
            run(() => updateUserPlacement(new FormData(event.currentTarget)), 'Placement saved.')
          }}
        >
          <label className="span-2">
            Person
            <select name="userId" required defaultValue="">
              <option value="" disabled>
                Choose someone
              </option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Department
            <select name="departmentId" defaultValue="">
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
            <select name="teamId" defaultValue="">
              <option value="">No team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Manager
            <select name="managerId" defaultValue="">
              <option value="">No manager</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.firstName} {person.lastName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Primary role
            <select name="roleKey" defaultValue="employee">
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions span-2">
            <Button className="create-button" type="submit" disabled={isPending}>
              Save placement
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
