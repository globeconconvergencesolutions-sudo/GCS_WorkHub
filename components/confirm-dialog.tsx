'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  pending = false,
  destructive = true,
  onCancel,
  onConfirm,
  children,
}: {
  title: string
  description: string
  confirmLabel: string
  pending?: boolean
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
  children?: ReactNode
}) {
  return (
    <div
      className="modal-backdrop confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        event.stopPropagation()
        onCancel()
      }}
    >
      <div
        className="create-modal confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{destructive ? 'Please confirm' : 'Confirm'}</span>
            <h2 id="confirm-title">{title}</h2>
          </div>
          <button className="close-button" type="button" aria-label="Close dialog" onClick={onCancel}>
            <X aria-hidden="true" />
          </button>
        </div>
        <p className="confirm-copy">{description}</p>
        {children}
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            className={destructive ? undefined : 'create-button'}
            variant={destructive ? 'destructive' : 'default'}
            type="button"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
