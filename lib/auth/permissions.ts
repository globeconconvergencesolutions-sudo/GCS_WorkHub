import { auth } from '@/auth'
import { getDb } from '@/lib/db'
import { getUserById } from '@/lib/db/queries'

export async function requireSession() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error('Authentication required.')
  }
  return session
}

export async function requireCurrentUser() {
  const session = await requireSession()
  const user = await getUserById(session.user.id)
  if (!user) throw new Error('Signed-in user was not found.')
  return user
}

export function getRoleKeys(user: { roles?: { role: { key: string } }[] } | null) {
  return user?.roles?.map((entry) => entry.role.key) ?? []
}

export function hasRole(user: { roles?: { role: { key: string } }[] } | null, roleKeys: string[]) {
  const keys = new Set(getRoleKeys(user))
  return roleKeys.some((key) => keys.has(key))
}

export function isManagement(user: { roles?: { role: { key: string } }[] } | null) {
  return hasRole(user, ['admin', 'managing_director'])
}

export function isDepartmentHead(user: { roles?: { role: { key: string } }[]; departmentId?: string | null } | null) {
  return hasRole(user, ['department_head']) && Boolean(user?.departmentId)
}

export function canManageUsers(user: { roles?: { role: { key: string } }[] } | null) {
  return isManagement(user)
}

export function canCreateProjects(user: { roles?: { role: { key: string } }[] } | null) {
  return hasRole(user, ['admin', 'managing_director', 'department_head', 'manager'])
}

export function canEditTaskActor(
  user: { id: string; departmentId?: string | null; roles?: { role: { key: string } }[] } | null,
  task: { assigneeId?: string | null; departmentId?: string | null },
) {
  if (!user) return false
  if (isManagement(user)) return true
  if (task.assigneeId === user.id) return true
  if (isDepartmentHead(user) && user.departmentId && task.departmentId === user.departmentId) return true
  return false
}

export function canChangeResponsibilityOwner(
  user: { id: string; departmentId?: string | null; roles?: { role: { key: string } }[] } | null,
  responsibility: { ownerId: string; departmentId?: string | null },
) {
  if (!user) return false
  if (isManagement(user)) return true
  if (isDepartmentHead(user) && user.departmentId && responsibility.departmentId === user.departmentId) return true
  return responsibility.ownerId === user.id
}

export async function getProjectMembershipUserIds(projectId: string) {
  const rows = await getDb().query.projectTeams.findMany({
    where: (table, { eq }) => eq(table.projectId, projectId),
  })
  return rows.map((row) => row.userId)
}
