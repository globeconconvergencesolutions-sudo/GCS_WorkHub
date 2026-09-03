import { TASK_CATEGORY_LABELS, TASK_PRIORITY_LABELS } from '@/lib/constants'

type TaskCategory = keyof typeof TASK_CATEGORY_LABELS
type TaskPriority = keyof typeof TASK_PRIORITY_LABELS

export type SuggestPerson = {
  id: string
  firstName: string
  lastName: string
  jobTitle: string
  departmentId?: string | null
}

export type SuggestDepartment = {
  id: string
  name: string
  owner?: { firstName: string; lastName: string } | null
}

const CATEGORY_HINTS: { category: TaskCategory; words: string[] }[] = [
  { category: 'business_development', words: ['tender', 'bid', 'proposal', 'client', 'sales', 'pipeline', 'umgm', 'onboarding', 'lead'] },
  { category: 'marketing', words: ['campaign', 'brand', 'content', 'social', 'comms', 'communication', 'marketing', 'newsletter'] },
  { category: 'finance', words: ['invoice', 'budget', 'payroll', 'payment', 'finance', 'accounts', 'reconciliation'] },
  { category: 'technical', words: ['deploy', 'workhub', 'access', 'server', 'code', 'bug', 'technical', 'digital', 'it ', 'security'] },
  { category: 'administrative', words: ['recruit', 'leave', 'hr ', 'policy', 'contract', 'admin', 'onboard employee'] },
  { category: 'support', words: ['intern', 'attachee', 'helpdesk', 'support', 'ticket'] },
  { category: 'operational', words: ['milestone', 'delivery track'] },
  { category: 'operational', words: ['ops', 'operations', 'weekly update', 'scorecard'] },
]

const DEPARTMENT_HINTS: { words: string[]; nameIncludes: string[] }[] = [
  { words: ['tender', 'bid', 'proposal', 'client', 'sales', 'umgm', 'bd'], nameIncludes: ['business development'] },
  { words: ['campaign', 'brand', 'content', 'social', 'comms', 'marketing'], nameIncludes: ['communication', 'marketing'] },
  { words: ['deploy', 'workhub', 'access', 'code', 'digital', 'technical'], nameIncludes: ['digital', 'technology'] },
  { words: ['invoice', 'budget', 'payroll', 'finance', 'accounts'], nameIncludes: ['finance'] },
  { words: ['recruit', 'leave', 'hr', 'policy'], nameIncludes: ['hr'] },
  { words: ['intern'], nameIncludes: ['intern'] },
  { words: ['attachee'], nameIncludes: ['attache'] },
  { words: ['md office', 'executive'], nameIncludes: ['md'] },
]

const CATEGORY_TO_DEPT: Partial<Record<TaskCategory, string[]>> = {
  business_development: ['business development'],
  marketing: ['communication', 'marketing'],
  technical: ['digital', 'technology'],
  finance: ['finance'],
  administrative: ['hr', 'admin'],
  support: ['intern', 'attache'],
  operational: ['business development', 'md'],
}

function haystack(value: string) {
  return ` ${value.toLowerCase()} `
}

function departmentMatches(department: SuggestDepartment, needles: string[]) {
  const name = department.name.toLowerCase()
  return needles.some((needle) => name.includes(needle))
}

function pickDepartmentOwner(department: SuggestDepartment, people: SuggestPerson[]) {
  if (!department.owner) {
    return people.find((person) => person.departmentId === department.id) ?? null
  }
  const owner = people.find(
    (person) =>
      person.firstName === department.owner?.firstName && person.lastName === department.owner?.lastName,
  )
  return owner ?? people.find((person) => person.departmentId === department.id) ?? null
}

export function suggestTaskFields(
  title: string,
  people: SuggestPerson[],
  departments: SuggestDepartment[],
) {
  const text = haystack(title)
  const reasons: string[] = []
  let category: TaskCategory = 'operational'
  let department: SuggestDepartment | null = null
  let assignee: SuggestPerson | null = null
  let priority: TaskPriority = 'medium'

  if (/\b(urgent|asap|critical|immediately)\b/i.test(title)) {
    priority = 'high'
    reasons.push('High priority from the wording')
  } else if (/\b(whenever|low priority|nice to have)\b/i.test(title)) {
    priority = 'low'
  }

  for (const hint of CATEGORY_HINTS) {
    if (hint.words.some((word) => text.includes(` ${word} `) || title.toLowerCase().includes(word))) {
      category = hint.category
      reasons.push(`${TASK_CATEGORY_LABELS[category]} from the title`)
      break
    }
  }

  for (const hint of DEPARTMENT_HINTS) {
    if (hint.words.some((word) => title.toLowerCase().includes(word))) {
      department = departments.find((entry) => departmentMatches(entry, hint.nameIncludes)) ?? null
      if (department) {
        reasons.push(`${department.name} from the title`)
        break
      }
    }
  }

  if (!department) {
    const needles = CATEGORY_TO_DEPT[category] ?? []
    department = departments.find((entry) => departmentMatches(entry, needles)) ?? null
  }

  assignee =
    people.find((person) => {
      const first = person.firstName.toLowerCase()
      const last = person.lastName.toLowerCase()
      return first.length > 2 && last.length > 2 && (title.toLowerCase().includes(first) || title.toLowerCase().includes(last))
    }) ?? null

  if (assignee) {
    reasons.push(`Lead ${assignee.firstName} ${assignee.lastName} from the title`)
    department = departments.find((entry) => entry.id === assignee?.departmentId) ?? department
  } else if (department) {
    assignee = pickDepartmentOwner(department, people)
    if (assignee) reasons.push(`Lead set to the ${department.name} head`)
  }

  return {
    category,
    priority,
    departmentId: department?.id ?? '',
    assigneeId: assignee?.id ?? '',
    reasons,
  }
}
