'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Check, Copy, KeyRound, Mail, X } from 'lucide-react'
import { inviteEmployee } from '@/app/invite-actions'
import { Button } from '@/components/ui/button'
import type { Person } from '@/lib/types'

function SubmitButton({ mode }: { mode: 'email' | 'temp' }) {
  const { pending } = useFormStatus()
  return (
    <Button className="create-button invite-submit" type="submit" disabled={pending}>
      {pending ? 'Working…' : mode === 'email' ? 'Send invite' : 'Create account'}
    </Button>
  )
}

type InviteSuccess =
  | { mode: 'email'; email: string; name: string; message: string }
  | { mode: 'temp'; email: string; name: string; message: string; temporaryPassword: string; emailed: boolean }

export function InviteEmployeeDialog({
  people,
  departments,
  roles,
  lockDepartmentId,
  defaultDepartmentId,
  onClose,
}: {
  people: Person[]
  departments: { id: string; name: string }[]
  roles: { key: string; name: string }[]
  lockDepartmentId?: string | null
  defaultDepartmentId?: string | null
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<InviteSuccess | null>(null)
  const [credentialMode, setCredentialMode] = useState<'email' | 'temp'>('email')
  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const firstFieldRef = useRef<HTMLInputElement | null>(null)

  const managerOptions = useMemo(
    () =>
      people.filter((person) => {
        const status = 'status' in person ? (person as { status?: string }).status : 'active'
        return status === 'active' || status == null
      }),
    [people],
  )

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const previouslyFocused = document.activeElement as HTMLElement | null
    firstFieldRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
      previouslyFocused?.focus?.()
    }
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  async function action(formData: FormData) {
    const result = await inviteEmployee(formData)
    if (result && 'error' in result && result.error) {
      setError(result.error)
      setSuccess(null)
      return
    }
    if (result && 'ok' in result && result.ok) {
      setError(null)
      if (result.mode === 'temp') {
        setSuccess({
          mode: 'temp',
          email: result.email,
          name: result.name,
          message: result.message,
          temporaryPassword: result.temporaryPassword,
          emailed: result.emailed,
        })
      } else {
        setSuccess({
          mode: 'email',
          email: result.email,
          name: result.name,
          message: result.message,
        })
      }
    }
  }

  async function copyPassword(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="modal-backdrop invite-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="create-modal invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-employee-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="invite-modal-head">
          <div>
            <span className="eyebrow">People</span>
            <h2 id="invite-employee-title">{success ? 'Person added' : 'Add a person'}</h2>
          </div>
          <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>

        {success ? (
          <div className="invite-modal-body">
            <div className="invite-success">
              <div className={`invite-success-banner invite-success-${success.mode}`}>
                {success.mode === 'email' ? <Mail aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                <div>
                  <strong>{success.name}</strong>
                  <p>{success.message}</p>
                </div>
              </div>
              {success.mode === 'temp' ? (
                <div className="invite-temp-box">
                  <div className="invite-temp-top">
                    <span>Temporary password</span>
                    <button type="button" className="row-action" onClick={() => copyPassword(success.temporaryPassword)}>
                      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <code>{success.temporaryPassword}</code>
                  <p>
                    {success.emailed
                      ? 'They also received this password by email and must change it on first sign-in.'
                      : 'Share this password securely. They must change it on first sign-in.'}
                  </p>
                </div>
              ) : (
                <p className="invite-success-note">
                  They will appear as <strong>Invited</strong> until they finish setup. You can resend or cancel the
                  invite from the people list.
                </p>
              )}
            </div>
          </div>
        ) : (
          <form action={action} className="invite-form">
            <div className="invite-modal-body">
              <div className="invite-form-grid">
                <label>
                  First name
                  <input ref={firstFieldRef} name="firstName" required autoComplete="given-name" />
                </label>
                <label>
                  Last name
                  <input name="lastName" required autoComplete="family-name" />
                </label>
                <label className="invite-span-all">
                  Email
                  <input name="email" type="email" required autoComplete="email" placeholder="name@globcons.com" />
                </label>
                <label className="invite-span-all">
                  Job title
                  <input name="jobTitle" required placeholder="Operations analyst" />
                </label>
                <label>
                  Department
                  <select
                    name="departmentId"
                    defaultValue={lockDepartmentId ?? defaultDepartmentId ?? ''}
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
                <label className="invite-span-all">
                  Reports to
                  <select name="managerId" defaultValue="">
                    <option value="">No manager</option>
                    {managerOptions.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.firstName} {person.lastName}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="invite-span-all invite-credential-field">
                  <legend>How should they sign in?</legend>
                  <label className={`invite-credential-option${credentialMode === 'email' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="credentialMode"
                      value="email"
                      checked={credentialMode === 'email'}
                      onChange={() => setCredentialMode('email')}
                    />
                    <span>
                      <strong>Send invite email</strong>
                      <em>They choose their own password from a secure link (recommended).</em>
                    </span>
                  </label>
                  <label className={`invite-credential-option${credentialMode === 'temp' ? ' is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="credentialMode"
                      value="temp"
                      checked={credentialMode === 'temp'}
                      onChange={() => setCredentialMode('temp')}
                    />
                    <span>
                      <strong>Set a temporary password</strong>
                      <em>You set or auto-generate a one-time password. They must change it on first sign-in.</em>
                    </span>
                  </label>
                </fieldset>

                {credentialMode === 'temp' ? (
                  <>
                    <label className="invite-span-all">
                      Temporary password
                      <input
                        name="temporaryPassword"
                        type="text"
                        autoComplete="new-password"
                        placeholder="Leave blank to auto-generate"
                        minLength={8}
                      />
                    </label>
                    <label className="invite-span-all invite-check">
                      <input name="emailTempPassword" type="checkbox" defaultChecked />
                      Also email the temporary password to them
                    </label>
                  </>
                ) : null}

                {error ? <p className="form-error invite-span-all">{error}</p> : null}
              </div>
            </div>

            <div className="invite-modal-footer">
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <SubmitButton mode={credentialMode} />
            </div>
          </form>
        )}

        {success ? (
          <div className="invite-modal-footer">
            <Button className="create-button invite-submit" type="button" autoFocus onClick={onClose}>
              Done
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
