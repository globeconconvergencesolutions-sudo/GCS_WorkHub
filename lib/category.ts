import { STANDARD_TASK_CATEGORIES, TASK_CATEGORY_LABELS } from '@/lib/constants'

type TaskCategory = keyof typeof TASK_CATEGORY_LABELS

export function categoryLabel(category: string, custom?: string | null) {
  if (custom?.trim()) return custom.trim()
  return TASK_CATEGORY_LABELS[category as TaskCategory] ?? category
}

export function resolveCategoryInput(formData: FormData):
  | { category: TaskCategory; custom: string | null }
  | { error: string } {
  const selected = String(formData.get('category') || 'operational') as TaskCategory
  const custom = String(formData.get('categoryCustom') ?? '').trim()

  if (selected !== 'other') {
    return { category: selected in TASK_CATEGORY_LABELS ? selected : 'operational', custom: null }
  }

  if (!custom) {
    return { error: 'Type a custom category, or pick one from the list.' }
  }

  const known = STANDARD_TASK_CATEGORIES.find((key) => {
    const label = TASK_CATEGORY_LABELS[key]
    return label.toLowerCase() === custom.toLowerCase() || key === custom.toLowerCase().replaceAll(' ', '_')
  })
  if (known) return { category: known, custom: null }

  return { category: 'other', custom }
}

export function ledBy(name?: string | null) {
  return name?.trim() ? `Led by ${name.trim()}` : 'No lead assigned'
}
