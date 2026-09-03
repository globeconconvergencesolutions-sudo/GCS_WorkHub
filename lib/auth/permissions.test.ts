import {
  canDeactivateUser,
  canDeleteTask,
  canEditTask,
  canInvite,
  canManageOrg,
  canProgressTask,
  canSeeTask,
  canSubmitLeadershipRequest,
  canSubmitWorkRequest,
  canViewCompanyReports,
  canViewDepartmentReports,
  inviteableRoleKeys,
  type Actor,
} from './permissions'

function actor(id: string, role: string, departmentId: string | null = 'dept-1'): NonNullable<Actor> {
  return {
    id,
    departmentId,
    roles: [{ role: { key: role } }],
  }
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

const admin = actor('admin', 'admin', null)
const md = actor('md', 'managing_director', null)
const head = actor('head', 'department_head', 'dept-1')
const manager = actor('mgr', 'manager', 'dept-1')
const employee = actor('emp', 'employee', 'dept-1')
const otherEmployee = actor('emp-2', 'employee', 'dept-2')
const ownTask = { assigneeId: 'emp', departmentId: 'dept-1' }
const deptTask = { assigneeId: 'emp-2', departmentId: 'dept-1' }
const otherDeptTask = { assigneeId: 'emp-2', departmentId: 'dept-2' }

assert(canManageOrg(admin) && !canManageOrg(md), 'only admin manages org')
assert(canViewCompanyReports(md) && !canViewCompanyReports(head), 'company reports are management-only')
assert(canViewDepartmentReports(head) && canViewDepartmentReports(manager), 'leaders get department reports')
assert(!canViewDepartmentReports(employee), 'employees do not get department reports')

assert(canSeeTask(employee, ownTask) && !canSeeTask(employee, deptTask), 'employee sees own tasks only')
assert(canSeeTask(head, deptTask) && !canSeeTask(head, otherDeptTask), 'head is department-scoped')
assert(canSeeTask(md, otherDeptTask), 'md sees all tasks')

assert(!canProgressTask(employee, otherDeptTask), 'employee cannot progress unseen tasks')
assert(canProgressTask(employee, ownTask), 'employee can progress own tasks')
assert(canEditTask(manager, deptTask), 'manager can edit department tasks')
assert(!canEditTask(manager, otherDeptTask), 'manager cannot edit other departments')
assert(canEditTask(employee, ownTask) && !canEditTask(employee, deptTask), 'employee edits own details only')
assert(canDeleteTask(employee, ownTask) && !canDeleteTask(employee, deptTask), 'employee deletes own tasks only')
assert(canDeleteTask(head, deptTask) && !canDeleteTask(head, otherDeptTask), 'head deletes department tasks only')

assert(canInvite(md, { roleKey: 'employee', departmentId: 'dept-1' }), 'md can invite staff')
assert(!canInvite(md, { roleKey: 'admin', departmentId: null }), 'md cannot invite admin')
assert(canInvite(head, { roleKey: 'employee', departmentId: 'dept-1' }), 'head can invite into own dept')
assert(!canInvite(head, { roleKey: 'employee', departmentId: 'dept-2' }), 'head cannot invite other depts')
assert(!canInvite(manager, { roleKey: 'employee', departmentId: 'dept-1' }), 'manager cannot invite')
assert(inviteableRoleKeys(admin).includes('admin'), 'admin can grant admin')

assert(canSubmitLeadershipRequest(head) && !canSubmitLeadershipRequest(employee), 'leadership requests')
assert(canSubmitWorkRequest(employee) && !canSubmitWorkRequest(head), 'employees request work')

assert(!canDeactivateUser(md, admin, 1), 'md cannot deactivate admin')
assert(!canDeactivateUser(admin, admin, 1), 'cannot deactivate self')
assert(!canDeactivateUser(admin, actor('a2', 'admin', null), 1), 'cannot deactivate last admin')
assert(canDeactivateUser(admin, actor('a2', 'admin', null), 2), 'can deactivate extra admin')
assert(canDeactivateUser(md, employee, 1), 'md can deactivate employees')

console.log('permissions tests passed')
