'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { ArrowRightLeft, Trash2, X } from 'lucide-react'
import { getPersonRemovalPreview, removePerson } from '@/app/invite-actions'
import { Button } from '@/components/ui/button'
import { fullName } from '@/lib/format'
import type { Person } from '@/lib/types'
import type { PersonWorkload } from '@/lib/people/workload'

type Target = Person & {
  status?: string
  department?: { id?: string; name: string } | null
  jobTitle?: string | null
}

export function RemovePersonDialog({
  person,
  people,
  onClose,
  onRemoved,
}: {
  person: Target
  people: Target[]
  onClose: () => void
  onRemoved?: () => void
}) {
  const [workload, setWorkload] = useState<PersonWorkload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [transferToId, setTransferToId] = useState('')
  const [confirmName, setConfirmName] = useState('')
  const [pending, startTransition] = useTransition()
  const expectedName = fullName(person)

  const recipients = useMemo(
    () =>
      people.filter(
        (entry) => entry.id !== person.id && (entry.status === 'active' || entry.status == null),
      ),
    [people, person.id],
  )

  useEffect(() => {
    let cancelled = false
    void getPersonRemovalPreview(person.id).then((result) => {
      if (cancelled) return
      if ('error' in result && result.error) {
        setLoadError(result.error)
        return
      }
      if ('ok' in result && result.ok) {
        setWorkload(result.workload)
        if (result.defaultTransferToId) setTransferToId(result.defaultTransferToId)
      }
    })
    return () => {
      cancelled = true
    }
  }, [person.id])

  const requiresTransfer = Boolean(workload?.requiresTransfer)
  const canSubmit =
    Boolean(workload) &&
    (!requiresTransfer || Boolean(transferToId)) &&
    confirmName.trim().toLowerCase() === expectedName.toLowerCase()

  function submit() {
    if (!canSubmit) return
    setError(null)
    startTransition(async () => {
      const result = await removePerson({
        userId: person.id,
        transferToUserId: transferToId || null,
      })
      if (result && 'error' in result && result.error) {
        setError(result.error)
        return
      }
      onRemoved?.()
      onClose()
    })
  }

  return (
    <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="create-modal remove-person-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-person-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">People</span>
            <h2 id="remove-person-title">Remove {expectedName}</h2>
          </div>
          <button className="close-button" type="button" aria-label="Close dialog" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>

        <p className="confirm-copy">
          This removes them from WorkHub (deactivates the account and signs them out). Historical activity stays for
          audit. Open work must be handed off first.
        </p>

        {loadError ? <p className="form-error">{loadError}</p> : null}

        {workload ? (
          <div className="remove-workload">
            <div className="remove-workload-head">
              <ArrowRightLeft aria-hidden="true" />
              <strong>Work that needs a home</strong>
            </div>
            <ul>
              <li>
                <span>Open tasks</span>
                <em>{workload.openTasks}</em>
              </li>
              <li>
                <span>Owned projects</span>
                <em>{workload.ownedProjects}</em>
              </li>
              <li>
                <span>Owned responsibilities</span>
                <em>{workload.ownedResponsibilities}</em>
              </li>
              <li>
                <span>Direct reports</span>
                <em>{workload.directReports}</em>
              </li>
              <li>
                <span>Departments led</span>
                <em>{workload.departmentsLed}</em>
              </li>
              <li>
                <span>Open requests</span>
                <em>{workload.openManagementRequests}</em>
              </li>
            </ul>
          </div>
        ) : !loadError ? (
          <p className="td-muted">Checking their workload…</p>
        ) : null}

        {requiresTransfer ? (
          <label className="remove-transfer">
            Transfer remaining work to
            <select value={transferToId} onChange={(event) => setTransferToId(event.target.value)} required>
              <option value="">Select a person</option>
              {recipients.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {fullName(entry)}
                  {entry.department?.name ? ` · ${entry.department.name}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : workload ? (
          <p className="form-success">No open ownership to transfer. You can remove them directly.</p>
        ) : null}

        <label className="remove-confirm">
          Type <strong>{expectedName}</strong> to confirm
          <input
            value={confirmName}
            onChange={(event) => setConfirmName(event.target.value)}
            autoComplete="off"
            placeholder={expectedName}
          />
        </label>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" type="button" disabled={!canSubmit || pending} onClick={submit}>
            <Trash2 data-icon="inline-start" />
            {pending ? 'Removing…' : 'Remove person'}
          </Button>
        </div>
      </div>
    </div>
  )
}
