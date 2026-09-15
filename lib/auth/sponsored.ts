import {
  canCreateWork,
  type Actor,
  type RoleKey,
} from '@/lib/auth/permissions'

/** Departments that always run as sponsored contributor desks. */
export const SPONSORED_DEPARTMENT_SLUGS = ['interns', 'attachees', 'volunteers'] as const

export type SponsoredDepartmentSlug = (typeof SPONSORED_DEPARTMENT_SLUGS)[number]

export type SponsoredActor = Actor & {
  managerId?: string | null
  department?: { id?: string; slug?: string; name?: string } | null
}

export function isSponsoredRole(roleKey?: string | null) {
  return roleKey === 'volunteer'
}

export function isSponsoredDepartmentSlug(slug?: string | null): slug is SponsoredDepartmentSlug {
  return Boolean(slug && (SPONSORED_DEPARTMENT_SLUGS as readonly string[]).includes(slug))
}

/** Volunteer role, or placement in Interns / Attachees / Volunteers. */
export function requiresSponsor(input: { roleKey?: string | null; departmentSlug?: string | null }) {
  return isSponsoredRole(input.roleKey) || isSponsoredDepartmentSlug(input.departmentSlug)
}

export function isSponsoredContributor(user: SponsoredActor) {
  if (!user) return false
  const roleKeys = user.roles?.map((entry) => entry.role.key) ?? []
  if (roleKeys.some((key) => isSponsoredRole(key))) return true
  return isSponsoredDepartmentSlug(user.department?.slug)
}

/**
 * Individual contributors may log their own work without waiting for approval.
 * Leadership desks keep full workspace create rights via canCreateWork.
 */
export function canSelfCreateTask(user: Actor) {
  return Boolean(user) && !canCreateWork(user)
}

export function sponsoredDeskLabel(input: { roleKey?: string | null; departmentSlug?: string | null }) {
  if (isSponsoredRole(input.roleKey)) return 'Volunteer'
  if (input.departmentSlug === 'interns') return 'Intern'
  if (input.departmentSlug === 'attachees') return 'Attachee'
  if (input.departmentSlug === 'volunteers') return 'Volunteer'
  return 'Contributor'
}

export function assertInviteableSponsoredRole(roleKey: string): roleKey is RoleKey {
  return roleKey === 'volunteer' || roleKey === 'employee'
}
