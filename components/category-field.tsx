'use client'

import { TASK_CATEGORY_LABELS } from '@/lib/constants'

export function CategoryField({
  value,
  customValue,
  onChange,
  hint = '',
  showLabel = true,
}: {
  value: string
  customValue: string
  onChange: (category: string, custom: string) => void
  hint?: string
  showLabel?: boolean
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
        >
          {Object.entries(TASK_CATEGORY_LABELS).map(([option, label]) => (
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
            autoFocus
          />
        </label>
      )}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  )
}
