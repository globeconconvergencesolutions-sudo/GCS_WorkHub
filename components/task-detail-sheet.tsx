'use client'

import type { Dispatch, SetStateAction } from 'react'
import { GitBranch, ListChecks, MessageSquare, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CategoryField } from '@/components/category-field'
import { StatusBadge } from '@/components/status-badge'
import { FileDropzone, AttachmentRow } from '@/components/uploads/file-dropzone'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '@/lib/constants'
import { taskCategoryEnum, taskStatusEnum } from '@/lib/db/schema'
import { categoryLabel, formatDue, formatRelative, fullName, toDateInputValue } from '@/lib/format'
import type { Person } from '@/lib/types'
import type { UploadedFile } from '@/lib/uploads/client'

export type TaskDetailTab = 'overview' | 'files' | 'comments' | 'delivery' | 'links'

type TaskCategory = (typeof taskCategoryEnum.enumValues)[number]
type TaskStatus = (typeof taskStatusEnum.enumValues)[number]
type TaskPriority = keyof typeof TASK_PRIORITY_LABELS

type DetailTask = {
  id: string
  title: string
  description?: string | null
  category: TaskCategory
  categoryCustom?: string | null
  priority: TaskPriority
  status: TaskStatus
  progress?: number
  assigneeId?: string | null
  dueDate: string | Date | null
  startDate?: string | Date | null
  assignee: { initials: string; firstName: string; lastName: string } | null
  department: { id?: string; name: string; color?: string } | null
  comments?: Array<{
    id: string
    body: string
    createdAt: string | Date
    userId?: string | null
    user: { initials: string; firstName: string; lastName: string } | null
  }>
  attachments?: Array<{
    id: string
    label: string
    url: string
    bytes?: number | null
    originalName?: string | null
    userId?: string | null
  }>
  approvals?: Array<{
    id: string
    status: string
    decisionReason: string | null
    approver?: { initials: string; firstName: string; lastName: string } | null
  }>
  deliverables?: Array<{
    id: string
    title: string
    description?: string | null
    status: string
    evidenceUrl: string | null
    evidenceOriginalName?: string | null
    decisionReason?: string | null
  }>
  blockingDependencies?: Array<{ id: string; blockedTask: { id: string; title: string } }>
  blockedByDependencies?: Array<{ id: string; blockingTask: { id: string; title: string } }>
}

type TaskPatch = {
  title?: string
  description?: string | null
  category?: TaskCategory
  categoryCustom?: string | null
  priority?: TaskPriority
  progress?: number
  assigneeId?: string | null
  dueDate?: string | Date | null
  startDate?: string | Date | null
  assignee?: { initials: string; firstName: string; lastName: string } | null
}

type DepartmentOption = { id: string; name: string }

function Avatar({ initials }: { initials: string }) {
  return <span className="avatar avatar-small">{initials}</span>
}

function personDepartmentId(person: Person) {
  return person.departmentId ?? ''
}

export function TaskDetailSheet({
  task,
  people,
  departments,
  otherTasks,
  currentUserId,
  canEdit,
  canProgress,
  isPending,
  detailsSaving,
  detailsError,
  detailsSaved,
  detailTab,
  onTabChange,
  onClose,
  onPatch,
  onSave,
  onStatusChange,
  onProgressCommit,
  commentText,
  commentError,
  onCommentText,
  onAddComment,
  onDeleteComment,
  attachLabel,
  attachUrl,
  showAttachForm,
  attachError,
  onAttachLabel,
  onAttachUrl,
  onShowAttachForm,
  onPersistAttachment,
  onAddLink,
  deletingAttachmentId,
  onDeleteAttachment,
  approvalReason,
  approvalError,
  onApprovalReason,
  onApprove,
  onReject,
  onRequestRevision,
  deliverableTitle,
  deliverableDescription,
  deliverableError,
  onDeliverableTitle,
  onDeliverableDescription,
  onCreateDeliverable,
  deliverableEvidenceById,
  deliverableEvidenceMetaById,
  deliverableNotesById,
  deliverableDecisionById,
  setDeliverableEvidenceById,
  setDeliverableEvidenceMetaById,
  setDeliverableNotesById,
  setDeliverableDecisionById,
  onCreateDeliverableSubmit,
  onVerifyDeliverable,
  onApproveDeliverable,
  onRejectDeliverable,
  dependencyBlockingTaskId,
  onDependencyBlockingTaskId,
  onCreateDependency,
}: {
  task: DetailTask
  people: Person[]
  departments: DepartmentOption[]
  otherTasks: Array<{ id: string; title: string }>
  currentUserId: string
  canEdit: boolean
  canProgress: boolean
  isPending: boolean
  detailsSaving: boolean
  detailsError: string | null
  detailsSaved: boolean
  detailTab: TaskDetailTab
  onTabChange: (tab: TaskDetailTab) => void
  onClose: () => void
  onPatch: (patch: TaskPatch) => void
  onSave: () => void
  onStatusChange: (status: TaskStatus) => void
  onProgressCommit: (progress: number) => void
  commentText: string
  commentError: string | null
  onCommentText: (value: string) => void
  onAddComment: () => void
  onDeleteComment: (id: string) => void
  attachLabel: string
  attachUrl: string
  showAttachForm: boolean
  attachError: string | null
  onAttachLabel: (value: string) => void
  onAttachUrl: (value: string) => void
  onShowAttachForm: (value: boolean) => void
  onPersistAttachment: (file: UploadedFile) => void | Promise<void>
  onAddLink: () => void
  deletingAttachmentId: string | null
  onDeleteAttachment: (id: string) => void
  approvalReason: string
  approvalError: string | null
  onApprovalReason: (value: string) => void
  onApprove: () => void
  onReject: () => void
  onRequestRevision: () => void
  deliverableTitle: string
  deliverableDescription: string
  deliverableError: string | null
  onDeliverableTitle: (value: string) => void
  onDeliverableDescription: (value: string) => void
  onCreateDeliverable: () => void
  deliverableEvidenceById: Record<string, string>
  deliverableEvidenceMetaById: Record<string, { publicId?: string; bytes?: number; mimeType?: string; originalName?: string }>
  deliverableNotesById: Record<string, string>
  deliverableDecisionById: Record<string, string>
  setDeliverableEvidenceById: Dispatch<SetStateAction<Record<string, string>>>
  setDeliverableEvidenceMetaById: Dispatch<SetStateAction<Record<string, { publicId?: string; bytes?: number; mimeType?: string; originalName?: string }>>>
  setDeliverableNotesById: Dispatch<SetStateAction<Record<string, string>>>
  setDeliverableDecisionById: Dispatch<SetStateAction<Record<string, string>>>
  onCreateDeliverableSubmit: (id: string) => void
  onVerifyDeliverable: (id: string) => void
  onApproveDeliverable: (id: string) => void
  onRejectDeliverable: (id: string) => void
  dependencyBlockingTaskId: string
  onDependencyBlockingTaskId: (value: string) => void
  onCreateDependency: () => void
}) {
  const attachmentCount = task.attachments?.length ?? 0
  const commentCount = task.comments?.length ?? 0
  const deliverableCount = task.deliverables?.length ?? 0
  const linkCount = (task.blockedByDependencies?.length ?? 0) + (task.blockingDependencies?.length ?? 0)
  const saveDisabled = isPending || !canEdit || !task.assigneeId || !task.title.trim()

  const tabs: Array<{ id: TaskDetailTab; label: string; count?: number; icon: typeof ListChecks }> = [
    { id: 'overview', label: 'Overview', icon: ListChecks },
    { id: 'files', label: 'Files', count: attachmentCount, icon: Paperclip },
    { id: 'comments', label: 'Comments', count: commentCount, icon: MessageSquare },
    { id: 'delivery', label: 'Delivery', count: deliverableCount, icon: ListChecks },
    { id: 'links', label: 'Links', count: linkCount, icon: GitBranch },
  ]

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="create-modal task-detail-modal workspace-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="workspace-sheet-head">
          <div className="td-head-copy">
            <span className="eyebrow">
              Task details
              {task.department?.name ? ` · ${task.department.name}` : ''}
            </span>
            <input
              id="task-detail-title"
              className="td-title-field"
              value={task.title}
              aria-label="Task title"
              onChange={(event) => onPatch({ title: event.target.value })}
              disabled={isPending || !canEdit}
            />
            <div className="td-head-meta">
              <StatusBadge status={TASK_STATUS_LABELS[task.status]} />
              <StatusBadge status={TASK_PRIORITY_LABELS[task.priority]} />
              <span>
                {task.assignee ? fullName(task.assignee) : 'Unassigned'}
                {' · '}
                {formatDue(task.startDate)} → {formatDue(task.dueDate)}
              </span>
            </div>
          </div>
          <button className="close-button" type="button" aria-label="Close task details" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </div>

        <nav className="td-tabs" aria-label="Task sections">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                className={`td-tab${detailTab === tab.id ? ' is-on' : ''}`}
                onClick={() => onTabChange(tab.id)}
              >
                <Icon aria-hidden="true" />
                {tab.label}
                {typeof tab.count === 'number' ? <em>{tab.count}</em> : null}
              </button>
            )
          })}
        </nav>

        <div className="workspace-sheet-body">
          {detailTab === 'overview' ? (
            <div className="td-overview">
              <div className="td-primary">
                <label className="form-field">
                  <span>Description</span>
                  <textarea
                    value={task.description ?? ''}
                    onChange={(event) => onPatch({ description: event.target.value })}
                    placeholder="Outcome, context, and what done looks like."
                    disabled={isPending || !canEdit}
                  />
                </label>
                <div className="td-progress-card">
                  <label>
                    <span className="detail-label">Status</span>
                    <select
                      value={task.status}
                      onChange={(event) => onStatusChange(event.target.value as TaskStatus)}
                      disabled={isPending || !canProgress}
                    >
                      {taskStatusEnum.enumValues.map((status) => (
                        <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="detail-label">Progress</span>
                    <div className="td-progress-row">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={task.progress ?? 0}
                        onChange={(event) => onPatch({ progress: Number(event.target.value) })}
                        onMouseUp={(event) => onProgressCommit(Number((event.target as HTMLInputElement).value))}
                        onTouchEnd={(event) => onProgressCommit(Number((event.target as HTMLInputElement).value))}
                        disabled={isPending || !canProgress}
                      />
                      <strong>{task.progress ?? 0}%</strong>
                    </div>
                  </label>
                </div>
              </div>
              <aside className="td-aside">
                <label className="form-field">
                  <span>Led by</span>
                  <select
                    value={task.assigneeId ?? ''}
                    disabled={isPending || !canEdit}
                    onChange={(event) => {
                      const nextId = event.target.value
                      const nextPerson = people.find((person) => person.id === nextId) ?? null
                      onPatch({
                        assigneeId: nextId,
                        assignee: nextPerson
                          ? {
                              initials: nextPerson.initials,
                              firstName: nextPerson.firstName,
                              lastName: nextPerson.lastName,
                            }
                          : null,
                      })
                    }}
                  >
                    {departments.map((department) => {
                      const members = people.filter((person) => personDepartmentId(person) === department.id)
                      if (members.length === 0) return null
                      return (
                        <optgroup key={department.id} label={department.name}>
                          {members.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.firstName} {person.lastName}
                            </option>
                          ))}
                        </optgroup>
                      )
                    })}
                    {people.some((person) => !personDepartmentId(person)) && (
                      <optgroup label="Unassigned">
                        {people
                          .filter((person) => !personDepartmentId(person))
                          .map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.firstName} {person.lastName}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                <div className="form-field">
                  <span>Category</span>
                  <CategoryField
                    showLabel={false}
                    disabled={isPending || !canEdit}
                    value={task.category}
                    customValue={task.categoryCustom ?? ''}
                    onChange={(nextCategory, nextCustom) =>
                      onPatch({
                        category: nextCategory as TaskCategory,
                        categoryCustom: nextCategory === 'other' ? nextCustom : null,
                      })
                    }
                  />
                </div>
                <label className="form-field">
                  <span>Priority</span>
                  <select
                    value={task.priority}
                    disabled={isPending || !canEdit}
                    onChange={(event) => onPatch({ priority: event.target.value as TaskPriority })}
                  >
                    {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
                <div className="td-dates">
                  <label className="form-field">
                    <span>Start</span>
                    <input
                      type="date"
                      value={toDateInputValue(task.startDate)}
                      disabled={isPending || !canEdit}
                      onChange={(event) => onPatch({ startDate: event.target.value || null })}
                    />
                  </label>
                  <label className="form-field">
                    <span>Due</span>
                    <input
                      type="date"
                      value={toDateInputValue(task.dueDate)}
                      disabled={isPending || !canEdit}
                      onChange={(event) => onPatch({ dueDate: event.target.value || null })}
                    />
                  </label>
                </div>
                <p className="td-aside-note">
                  {`${categoryLabel(task.category, task.categoryCustom)} work${canEdit ? '. Change fields here, then save.' : '. You can view this task.'}`}
                </p>
              </aside>
            </div>
          ) : null}

          {detailTab === 'files' ? (
            <section className="td-section">
              <header className="td-section-head">
                <h3>Attachments</h3>
                <p>Store specs, screenshots, and working files on this task.</p>
              </header>
              {(task.attachments ?? []).length > 0 ? (
                <div className="td-stack">
                  {task.attachments!.map((attachment) => (
                    <AttachmentRow
                      key={attachment.id}
                      label={attachment.originalName || attachment.label}
                      url={attachment.url}
                      bytes={attachment.bytes}
                      deleting={deletingAttachmentId === attachment.id}
                      onDelete={
                        canProgress && (attachment.userId === currentUserId || canEdit)
                          ? () => onDeleteAttachment(attachment.id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <p className="td-empty">No files yet. Upload a document or paste an https link.</p>
              )}
              {attachError ? <p className="form-error">{attachError}</p> : null}
              {canProgress ? (
                <>
                  <FileDropzone
                    kind="task_attachment"
                    entityId={task.id}
                    disabled={isPending}
                    label="Upload a file"
                    onUploaded={onPersistAttachment}
                  />
                  {showAttachForm ? (
                    <div className="td-inline-form">
                      <input value={attachLabel} onChange={(event) => onAttachLabel(event.target.value)} placeholder="Label" />
                      <input value={attachUrl} onChange={(event) => onAttachUrl(event.target.value)} placeholder="https://..." />
                      <button className="filter-pill selected" type="button" disabled={isPending || !attachLabel.trim() || !attachUrl.trim()} onClick={onAddLink}>Add link</button>
                      <button className="filter-pill" type="button" onClick={() => { onShowAttachForm(false); onAttachLabel(''); onAttachUrl('') }}>Cancel</button>
                    </div>
                  ) : (
                    <button className="filter-pill" type="button" onClick={() => onShowAttachForm(true)}>
                      <Paperclip aria-hidden="true" /> Paste a link instead
                    </button>
                  )}
                </>
              ) : (
                <p className="td-muted">You can view attachments on this task.</p>
              )}
            </section>
          ) : null}

          {detailTab === 'comments' ? (
            <section className="td-section">
              <header className="td-section-head">
                <h3>Comments</h3>
                <p>Leave an update for the owner and anyone following this work.</p>
              </header>
              {(task.comments ?? []).length > 0 ? (
                <div className="td-comments">
                  {task.comments!.map((comment) => (
                    <div key={comment.id} className="td-comment">
                      <Avatar initials={comment.user?.initials ?? 'G'} />
                      <div>
                        <strong>{comment.user ? fullName(comment.user) : 'System'}</strong>
                        {((comment.userId ?? null) === currentUserId || canEdit) ? (
                          <button type="button" className="comment-remove" onClick={() => onDeleteComment(comment.id)}>Remove</button>
                        ) : null}
                        <p>{comment.body}</p>
                        <small>{formatRelative(new Date(comment.createdAt))}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="td-empty">No comments yet.</p>
              )}
              {commentError ? <p className="form-error">{commentError}</p> : null}
              <div className="td-composer">
                <input
                  value={commentText}
                  onChange={(event) => onCommentText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      onAddComment()
                    }
                  }}
                  placeholder="Add a comment…"
                  disabled={isPending || !canProgress}
                />
                <Button className="create-button" type="button" disabled={isPending || !canProgress || !commentText.trim()} onClick={onAddComment}>
                  Send
                </Button>
              </div>
            </section>
          ) : null}

          {detailTab === 'delivery' ? (
            <section className="td-section">
              <header className="td-section-head">
                <h3>Approvals</h3>
                <p>Decisions on this task, including reject and revision notes.</p>
              </header>
              {(task.approvals ?? []).length === 0 ? (
                <p className="td-empty">No approvals yet.</p>
              ) : (
                <div className="td-stack">
                  {task.approvals!.slice(0, 6).map((approval) => (
                    <div key={approval.id} className="td-card">
                      <span className="filter-pill">{approval.status}</span>
                      <div>
                        <strong>{approval.approver ? `${approval.approver.firstName} ${approval.approver.lastName}` : 'Approver'}</strong>
                        {approval.decisionReason ? <p>{approval.decisionReason}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {task.status === 'pending_approval' ? (
                <div className="td-card td-card-actions">
                  <label className="form-field">
                    <span>Decision note (required for reject or revision)</span>
                    <textarea
                      value={approvalReason}
                      onChange={(event) => onApprovalReason(event.target.value)}
                      placeholder="Add a clear note for the requester…"
                      disabled={isPending}
                    />
                  </label>
                  {approvalError ? <p className="form-error">{approvalError}</p> : null}
                  <div className="td-actions">
                    <button className="filter-pill selected" type="button" disabled={isPending} onClick={onApprove}>Approve</button>
                    <button className="filter-pill" type="button" disabled={isPending || !approvalReason.trim()} onClick={onReject}>Reject</button>
                    <button className="filter-pill" type="button" disabled={isPending || !approvalReason.trim()} onClick={onRequestRevision}>Request revision</button>
                  </div>
                </div>
              ) : null}

              <header className="td-section-head" style={{ marginTop: 22 }}>
                <h3>Deliverables</h3>
                <p>Define what “done” looks like, then submit evidence for verification.</p>
              </header>
              <div className="td-card">
                <label className="form-field">
                  <span>Title</span>
                  <input
                    value={deliverableTitle}
                    onChange={(event) => onDeliverableTitle(event.target.value)}
                    placeholder="e.g. Q4 handover pack"
                    disabled={isPending || !canProgress}
                  />
                </label>
                <label className="form-field">
                  <span>Description</span>
                  <textarea
                    value={deliverableDescription}
                    onChange={(event) => onDeliverableDescription(event.target.value)}
                    placeholder="Define what “done” looks like."
                    disabled={isPending || !canProgress}
                  />
                </label>
                <button className="filter-pill selected" type="button" disabled={isPending || !canProgress || !deliverableTitle.trim()} onClick={onCreateDeliverable}>
                  Create deliverable
                </button>
                {deliverableError ? <p className="form-error">{deliverableError}</p> : null}
              </div>
              {(task.deliverables ?? []).length === 0 ? (
                <p className="td-empty">No deliverables yet.</p>
              ) : (
                <div className="td-stack">
                  {task.deliverables!.map((deliverable) => (
                    <div key={deliverable.id} className="td-card">
                      <div className="td-card-top">
                        <span className="filter-pill">{deliverable.status}</span>
                        <div>
                          <strong>{deliverable.title}</strong>
                          {deliverable.description ? <p>{deliverable.description}</p> : null}
                          {deliverable.evidenceUrl ? (
                            <a href={deliverable.evidenceUrl} target="_blank" rel="noopener noreferrer">
                              {deliverable.evidenceOriginalName || 'Open evidence'}
                            </a>
                          ) : null}
                        </div>
                      </div>
                      {deliverable.status === 'draft' ? (
                        <div className="td-stack">
                          <FileDropzone
                            kind="deliverable_evidence"
                            entityId={deliverable.id}
                            disabled={isPending || !canProgress}
                            label="Upload evidence"
                            onUploaded={(file) => {
                              setDeliverableEvidenceById((current) => ({ ...current, [deliverable.id]: file.url }))
                              setDeliverableEvidenceMetaById((current) => ({
                                ...current,
                                [deliverable.id]: {
                                  publicId: file.publicId,
                                  bytes: file.bytes,
                                  mimeType: file.mimeType,
                                  originalName: file.originalName,
                                },
                              }))
                            }}
                          />
                          <label className="form-field">
                            <span>Or paste an evidence link</span>
                            <input
                              value={deliverableEvidenceById[deliverable.id] ?? ''}
                              onChange={(event) => {
                                setDeliverableEvidenceById((current) => ({ ...current, [deliverable.id]: event.target.value }))
                                setDeliverableEvidenceMetaById((current) => {
                                  const next = { ...current }
                                  delete next[deliverable.id]
                                  return next
                                })
                              }}
                              placeholder="https://..."
                              disabled={isPending || !canProgress}
                            />
                          </label>
                          <label className="form-field">
                            <span>Submission notes</span>
                            <textarea
                              value={deliverableNotesById[deliverable.id] ?? ''}
                              onChange={(event) => setDeliverableNotesById((current) => ({ ...current, [deliverable.id]: event.target.value }))}
                              placeholder="Add context for verification."
                              disabled={isPending}
                            />
                          </label>
                          <button
                            className="filter-pill selected"
                            type="button"
                            disabled={isPending || !(deliverableEvidenceById[deliverable.id] ?? '').trim()}
                            onClick={() => onCreateDeliverableSubmit(deliverable.id)}
                          >
                            Submit deliverable
                          </button>
                        </div>
                      ) : null}
                      {(deliverable.status === 'submitted' || deliverable.status === 'verified') ? (
                        <div className="td-stack">
                          <label className="form-field">
                            <span>Decision note</span>
                            <textarea
                              value={deliverableDecisionById[deliverable.id] ?? ''}
                              onChange={(event) => setDeliverableDecisionById((current) => ({ ...current, [deliverable.id]: event.target.value }))}
                              placeholder={deliverable.status === 'submitted' ? 'Verification note (optional)…' : 'Approval or rejection note…'}
                              disabled={isPending}
                            />
                          </label>
                          <div className="td-actions">
                            {deliverable.status === 'submitted' ? (
                              <>
                                <button className="filter-pill selected" type="button" disabled={isPending} onClick={() => onVerifyDeliverable(deliverable.id)}>Verify</button>
                                <button className="filter-pill" type="button" disabled={isPending || !(deliverableDecisionById[deliverable.id] ?? '').trim()} onClick={() => onRejectDeliverable(deliverable.id)}>Reject</button>
                              </>
                            ) : (
                              <>
                                <button className="filter-pill selected" type="button" disabled={isPending} onClick={() => onApproveDeliverable(deliverable.id)}>Approve</button>
                                <button className="filter-pill" type="button" disabled={isPending || !(deliverableDecisionById[deliverable.id] ?? '').trim()} onClick={() => onRejectDeliverable(deliverable.id)}>Reject</button>
                              </>
                            )}
                          </div>
                        </div>
                      ) : null}
                      {deliverable.decisionReason ? <p className="td-muted">Note: {deliverable.decisionReason}</p> : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {detailTab === 'links' ? (
            <section className="td-section">
              <header className="td-section-head">
                <h3>Dependencies</h3>
                <p>This task waits on others, or others wait on this one.</p>
              </header>
              <div className="td-link-grid">
                <div>
                  <span className="detail-label">Blocked by</span>
                  {(task.blockedByDependencies ?? []).length === 0 ? (
                    <p className="td-muted">None</p>
                  ) : (
                    <div className="td-chip-row">
                      {task.blockedByDependencies!.map((dependency) => (
                        <span key={dependency.id} className="filter-pill">{dependency.blockingTask.title}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <span className="detail-label">Blocking</span>
                  {(task.blockingDependencies ?? []).length === 0 ? (
                    <p className="td-muted">Doesn’t block others</p>
                  ) : (
                    <div className="td-chip-row">
                      {task.blockingDependencies!.map((dependency) => (
                        <span key={dependency.id} className="filter-pill">{dependency.blockedTask.title}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="td-inline-form">
                <label className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                  <span>Wait for</span>
                  <select
                    value={dependencyBlockingTaskId}
                    onChange={(event) => onDependencyBlockingTaskId(event.target.value)}
                    disabled={isPending}
                  >
                    <option value="" disabled>Select blocking task…</option>
                    {otherTasks.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.title}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="filter-pill selected"
                  type="button"
                  disabled={isPending || !dependencyBlockingTaskId || dependencyBlockingTaskId === task.id}
                  onClick={onCreateDependency}
                >
                  Add
                </button>
              </div>
            </section>
          ) : null}
        </div>

        <div className="workspace-sheet-footer">
          {detailsError ? <p className="form-error">{detailsError}</p> : null}
          {detailsSaved && !detailsError ? <p className="form-ok">Saved.</p> : <p className="td-save-hint">Ctrl/⌘ S to save</p>}
          <Button variant="outline" type="button" onClick={onClose}>Close</Button>
          <Button
            className="create-button"
            type="button"
            disabled={saveDisabled}
            onClick={onSave}
          >
            {detailsSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  )
}
