export type RoleKey = 'admin' | 'managing_director' | 'department_head' | 'manager' | 'employee'

export type Actor = {
  id: string
  departmentId?: string | null
  roles?: { role: { key: string } }[]
} | null

export function getRoleKeys(user: Actor) {
  return user?.roles?.map((entry) => entry.role.key) ?? []
}

export function hasRole(user: Actor, roleKeys: string[]) {
  const keys = new Set(getRoleKeys(user))
  return roleKeys.some((key) => keys.has(key))
}

export function isAdmin(user: Actor) {
  return hasRole(user, ['admin'])
}

export function isManagingDirector(user: Actor) {
  return hasRole(user, ['managing_director'])
}

export function isManagement(user: Actor) {
  return hasRole(user, ['admin', 'managing_director'])
}

export function isDepartmentHead(user: Actor) {
  return hasRole(user, ['department_head']) && Boolean(user?.departmentId)
}

export function isManager(user: Actor) {
  return hasRole(user, ['manager']) && Boolean(user?.departmentId)
}

export function isDepartmentLeader(user: Actor) {
  return isDepartmentHead(user) || isManager(user)
}

export function canManageOrg(user: Actor) {
  return isAdmin(user)
}

export function canManageUsers(user: Actor) {
  return isManagement(user)
}

export function canCreateWork(user: Actor) {
  return hasRole(user, ['admin', 'managing_director', 'department_head', 'manager'])
}

export function canCreateProjects(user: Actor) {
  return canCreateWork(user)
}

export function canViewCompanyReports(user: Actor) {
  return isManagement(user)
}

export function canViewDepartmentReports(user: Actor) {
  return isDepartmentLeader(user)
}

export function canSubmitLeadershipRequest(user: Actor) {
  return isManagement(user) || isDepartmentLeader(user)
}

export function canSubmitWorkRequest(user: Actor) {
  return Boolean(user) && !canCreateWork(user)
}

export function inviteableRoleKeys(user: Actor): RoleKey[] {
  if (!user) return []
  if (isAdmin(user)) return ['admin', 'managing_director', 'department_head', 'manager', 'employee']
  if (isManagingDirector(user)) return ['department_head', 'manager', 'employee']
  if (isDepartmentHead(user)) return ['manager', 'employee']
  return []
}

export function canInvite(
  user: Actor,
  input: { roleKey: string; departmentId?: string | null },
) {
  const allowed = inviteableRoleKeys(user)
  if (!allowed.includes(input.roleKey as RoleKey)) return false
  if (isAdmin(user) || isManagingDirector(user)) return true
  if (isDepartmentHead(user)) {
    return Boolean(user?.departmentId) && input.departmentId === user?.departmentId
  }
  return false
}

export function canSeeTask(
  user: Actor,
  task: { assigneeId?: string | null; departmentId?: string | null },
) {
  if (!user) return false
  if (isManagement(user)) return true
  if (isDepartmentLeader(user) && user.departmentId && task.departmentId === user.departmentId) return true
  return task.assigneeId === user.id
}

export function canProgressTask(
  user: Actor,
  task: { assigneeId?: string | null; departmentId?: string | null },
) {
  return canSeeTask(user, task)
}

export function canEditTask(
  user: Actor,
  task: { assigneeId?: string | null; departmentId?: string | null },
) {
  if (!user) return false
  if (isManagement(user)) return true
  if (task.assigneeId === user.id) return true
  if (isDepartmentLeader(user) && user.departmentId && task.departmentId === user.departmentId) return true
  return false
}

export function canEditTaskActor(
  user: Actor,
  task: { assigneeId?: string | null; departmentId?: string | null },
) {
  return canEditTask(user, task)
}

export function canManageProject(
  user: Actor & { id: string } | null,
  project: { ownerId: string; departmentId?: string | null },
) {
  if (!user) return false
  if (isManagement(user)) return true
  if (project.ownerId === user.id) return true
  if (isDepartmentLeader(user) && user.departmentId && project.departmentId === user.departmentId) {
    return true
  }
  return false
}

export function canChangeResponsibilityOwner(
  user: Actor,
  responsibility: { ownerId: string; departmentId?: string | null },
) {
  if (!user) return false
  if (isManagement(user)) return true
  if (isDepartmentLeader(user) && user.departmentId && responsibility.departmentId === user.departmentId) {
    return true
  }
  return responsibility.ownerId === user.id
}

export function canDeactivateUser(actor: Actor, target: Actor, remainingAdminCount: number) {
  if (!actor || !target) return false
  if (actor.id === target.id) return false
  if (!canManageUsers(actor)) return false
  if (isAdmin(target) && !isAdmin(actor)) return false
  if (isAdmin(target) && remainingAdminCount <= 1) return false
  return true
}

export function denied(message = 'You are not allowed to do that.') {
  return { error: message }
}
