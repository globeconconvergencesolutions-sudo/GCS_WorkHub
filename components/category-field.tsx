'use client'

import { TASK_CATEGORY_LABELS } from '@/lib/constants'

export function CategoryField({
  value,
  customValue,
  onChange,
  hint = '',
  showLabel = true,
  disabled = false,
}: {
  value: string
  customValue: string
  onChange: (category: string, custom: string) => void
  hint?: string
  showLabel?: boolean
  disabled?: boolean
}) {
  const isOther = value === 'other'

  return (
    <div className={isOther ? 'category-field category-field-open' : 'category-field'}>
      <label>
        {showLabel ? 'Category' : <span className="sr-only">Category</span>}
        <select
          name="category"
          value={value}
          onChange={(event) => onChange(event.target.value, event.target.value === 'other' ? customValue : '')}
          disabled={disabled}
        >
          {Object.entries(TASK_CATEGORY_LABELS)
            .filter(([option]) => option !== 'project' || value === 'project')
            .map(([option, label]) => (
            <option key={option} value={option}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {isOther && (
        <label className="category-custom">
          Custom category
          <input
            name="categoryCustom"
            value={customValue}
            onChange={(event) => onChange('other', event.target.value)}
            placeholder="e.g. Legal review, facilities, board prep"
            required
            disabled={disabled}
            autoFocus
          />
        </label>
      )}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
