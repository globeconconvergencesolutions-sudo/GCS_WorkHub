'use client'

import { useRef, useState } from 'react'
import { Loader2, Paperclip, Upload } from 'lucide-react'
import { uploadWorkspaceFile, type UploadedFile } from '@/lib/uploads/client'
import type { UploadKind } from '@/lib/uploads/config'

export function FileDropzone({
  kind,
  entityId,
  disabled,
  label = 'Upload a file',
  onUploaded,
}: {
  kind: UploadKind
  entityId: string
  disabled?: boolean
  label?: string
  onUploaded: (file: UploadedFile) => void | Promise<void>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file || disabled || busy) return
    setBusy(true)
    setError(null)
    try {
      const uploaded = await uploadWorkspaceFile(file, kind, entityId)
      await onUploaded(uploaded)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="file-dropzone-wrap">
      <label
        className={`file-dropzone${dragOver ? ' is-over' : ''}${busy ? ' is-busy' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          void handleFiles(event.dataTransfer.files)
        }}
      >
        <input
          ref={inputRef}
          type="file"
          disabled={disabled || busy}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
          onChange={(event) => void handleFiles(event.target.files)}
        />
        {busy ? <Loader2 className="file-dropzone-icon spin" aria-hidden="true" /> : <Upload className="file-dropzone-icon" aria-hidden="true" />}
        <strong>{busy ? 'Uploading…' : label}</strong>
        <span>PDF, Office, images, CSV, or text · up to 25 MB</span>
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function AttachmentRow({
  label,
  url,
  bytes,
  onDelete,
  deleting,
}: {
  label: string
  url: string
  bytes?: number | null
  onDelete?: () => void
  deleting?: boolean
}) {
  return (
    <div className="attachment-row">
      <a href={url} target="_blank" rel="noopener noreferrer">
        <Paperclip aria-hidden="true" />
        <span>{label}</span>
        {bytes ? <em>{formatBytes(bytes)}</em> : null}
      </a>
      {onDelete ? (
        <button type="button" className="attachment-remove" disabled={deleting} onClick={onDelete}>
          {deleting ? 'Removing…' : 'Remove'}
        </button>
      ) : null}
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
