/**
 * The Departments view is the same data seen from four very different places in
 * the org, so the page name, copy, and shape are all derived from the viewer's
 * posture rather than being filtered variations of one management-shaped page.
 */
export type DepartmentPosture = 'org' | 'lead' | 'team' | 'member' | 'none'

export function departmentPosture(input: {
  roleKeys: readonly string[]
  departmentId?: string | null
}): DepartmentPosture {
  const roles = new Set(input.roleKeys)
  if (roles.has('admin') || roles.has('managing_director')) return 'org'
  if (!input.departmentId) return 'none'
  if (roles.has('department_head')) return 'lead'
  if (roles.has('manager')) return 'team'
  return 'member'
}

/** Only the org posture browses a set of departments; everyone else has exactly one. */
export function departmentPostureShowsGrid(posture: DepartmentPosture) {
  return posture === 'org'
}

export function departmentPostureCanSeeWork(posture: DepartmentPosture) {
  return posture !== 'none'
}

export function departmentHealth(input: { total: number; progress: number }) {
  if (input.total === 0) return 'No work yet'
  if (input.progress >= 80) return 'On track'
  if (input.progress >= 40) return 'In motion'
  return 'Needs attention'
}

export type DepartmentViewCopy = {
  navLabel: string
  eyebrow: string
  title: string
  description: string
  breadcrumb: string
}

export function departmentViewCopy(
  posture: DepartmentPosture,
  departmentName?: string | null,
): DepartmentViewCopy {
  const name = departmentName?.trim() || 'Your department'

  switch (posture) {
    case 'org':
      return {
        navLabel: 'Departments',
        eyebrow: 'Organization structure',
        title: 'Departments & teams',
        description: 'Leadership, people, and delivery across every function.',
        breadcrumb: 'Departments',
      }
    case 'lead':
      return {
        navLabel: 'My department',
        eyebrow: 'Your function',
        title: name,
        description: 'You lead this function. Track your people, projects, and open work.',
        breadcrumb: name,
      }
    case 'team':
      return {
        navLabel: 'My department',
        eyebrow: 'Your function',
        title: name,
        description: "Your team's people, projects, and open work.",
        breadcrumb: name,
      }
    case 'member':
      return {
        navLabel: 'My team',
        eyebrow: 'Your team',
        title: name,
        description: 'Who you work with and what your function is delivering.',
        breadcrumb: name,
      }
    case 'none':
      return {
        navLabel: 'My team',
        eyebrow: 'Your team',
        title: 'No department yet',
        description: 'You have not been assigned to a department. Ask your administrator to add you to one.',
        breadcrumb: 'My team',
      }
  }
}
