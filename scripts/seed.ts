import { config } from 'dotenv'
import { eq, ne, sql } from 'drizzle-orm'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { drizzle } from 'drizzle-orm/neon-http'
import {
  activityEvents,
  companies,
  departments,
  managementRequests,
  notificationPreferences,
  notifications,
  projectMilestones,
  projectMilestoneTasks,
  projectTeams,
  projects,
  responsibilities,
  responsibilityAssignees,
  roles,
  taskAttachments,
  taskComments,
  tasks,
  teams,
  userRoles,
  users,
} from '../lib/db/schema'
import { requireEnv } from '../lib/env'

config({ path: '.env.local' })
config()

const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED
if (!url) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local or run `npx neon link`.')
}

const db = drizzle({ client: neon(url) })

const STAFF_PASSWORD = requireEnv('SEED_STAFF_PASSWORD')
const ADMIN_EMAIL = requireEnv('SEED_ADMIN_EMAIL')
const ADMIN_PASSWORD = requireEnv('SEED_ADMIN_PASSWORD')
const MD_EMAIL = requireEnv('SEED_MD_EMAIL')

function isoDate(daysFromToday: number, from = new Date()) {
  const date = new Date(from)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + daysFromToday)
  return date.toISOString().slice(0, 10)
}

async function roleIdByKey(key: string) {
  const [role] = await db.select().from(roles).where(eq(roles.key, key)).limit(1)
  if (!role) throw new Error(`Role "${key}" is missing. Run seed with --reset once.`)
  return role.id
}

async function setPrimaryRole(userId: string, roleKey: string) {
  await db.delete(userRoles).where(eq(userRoles.userId, userId))
  await db.insert(userRoles).values({ userId, roleId: await roleIdByKey(roleKey) })
}

function printLoginRoster() {
  console.log('')
  console.log('Sign-in roster (roles match the permission kernel)')
  console.log(`  Admin (org, people, grant any role)  ${ADMIN_EMAIL}  /  ${ADMIN_PASSWORD}`)
  console.log(`  MD (company cockpit, no org CRUD)    ${MD_EMAIL}  /  ${STAFF_PASSWORD}`)
  console.log(`  Department heads / staff             work emails  /  ${STAFF_PASSWORD}`)
}

async function syncPrivilegedAccounts() {
  const [company] = await db.select().from(companies).limit(1)
  if (!company) return false

  const [mdDepartment] = await db.select().from(departments).where(eq(departments.slug, 'md')).limit(1)
  const [execTeam] = mdDepartment
    ? await db.select().from(teams).where(eq(teams.departmentId, mdDepartment.id)).limit(1)
    : [null]
  const [md] = await db.select().from(users).where(eq(users.email, MD_EMAIL)).limit(1)
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10)

  const [existingAdmin] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1)
  let adminId = existingAdmin?.id
  if (existingAdmin) {
    await db
      .update(users)
      .set({
        firstName: 'Tony',
        lastName: 'Ouh',
        jobTitle: 'Workspace Administrator',
        initials: 'TO',
        avatarColor: 'navy',
        status: 'active',
        passwordHash: adminHash,
        departmentId: mdDepartment?.id ?? existingAdmin.departmentId,
        teamId: execTeam?.id ?? existingAdmin.teamId,
        managerId: md?.id ?? existingAdmin.managerId,
      })
      .where(eq(users.id, existingAdmin.id))
  } else {
    const [created] = await db
      .insert(users)
      .values({
        companyId: company.id,
        departmentId: mdDepartment?.id ?? null,
        teamId: execTeam?.id ?? null,
        managerId: md?.id ?? null,
        email: ADMIN_EMAIL,
        firstName: 'Tony',
        lastName: 'Ouh',
        jobTitle: 'Workspace Administrator',
        passwordHash: adminHash,
        initials: 'TO',
        avatarColor: 'navy',
        status: 'active',
      })
      .returning()
    adminId = created.id
    await db.insert(notificationPreferences).values({ userId: created.id })
  }

  if (!adminId) throw new Error('Admin account could not be created.')
  await setPrimaryRole(adminId, 'admin')

  if (md) {
    await setPrimaryRole(md.id, 'managing_director')
  }

  return true
}

async function seed() {
  const defaultPasswordHash = await bcrypt.hash(STAFF_PASSWORD, 10)
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
  const reset = process.argv.includes('--reset')
  const existing = await db.select({ id: companies.id }).from(companies).limit(1)

  if (existing.length && !reset) {
    await syncPrivilegedAccounts()
    console.log('Workspace already has data. Admin and MD accounts were aligned to the permission kernel.')
    console.log('Re-run with --reset only if you want a full demo wipe.')
    printLoginRoster()
    return
  }

  if (reset) {
    await db.execute(sql`
      truncate table
        deadline_alert_log,
        notifications,
        notification_preferences,
        management_requests,
        deliverables,
        task_approvals,
        task_dependencies,
        activity_events,
        task_attachments,
        task_comments,
        tasks,
        responsibility_assignees,
        responsibilities,
        project_milestone_tasks,
        project_milestones,
        project_teams,
        projects,
        user_roles,
        users,
        teams,
        departments,
        roles,
        companies
      restart identity cascade
    `)
  }

  const [company] = await db
    .insert(companies)
    .values({
      name: 'Globcons Consulting Services',
      shortName: 'GCS',
      tagline: 'Operational clarity for every team',
    })
    .returning()

  const insertedRoles = await db
    .insert(roles)
    .values([
      { key: 'managing_director', name: 'Managing Director', description: 'Company-wide ownership and executive oversight', rank: 100 },
      { key: 'department_head', name: 'Department Head', description: 'Owns a department and its delivery', rank: 80 },
      { key: 'manager', name: 'Manager', description: 'Leads a team and assigns work', rank: 60 },
      { key: 'employee', name: 'Employee', description: 'Owns assigned tasks and responsibilities', rank: 20 },
      { key: 'admin', name: 'Workspace Admin', description: 'Manages accounts and workspace settings', rank: 90 },
    ])
    .returning()

  const roleByKey = Object.fromEntries(insertedRoles.map((role) => [role.key, role.id]))

  const insertedDepartments = await db
    .insert(departments)
    .values([
      { companyId: company.id, name: 'Business development Team', slug: 'operations', color: 'teal' },
      { companyId: company.id, name: 'Digital Technology team', slug: 'technology', color: 'blue' },
      { companyId: company.id, name: 'Communications and Marketing Team', slug: 'client-services', color: 'gold' },
      { companyId: company.id, name: 'Finance/Admin executive department', slug: 'finance-admin', color: 'coral' },
      { companyId: company.id, name: 'HR department', slug: 'marketing', color: 'gold' },
      { companyId: company.id, name: 'MD', slug: 'md', color: 'navy' },
      { companyId: company.id, name: 'Interns', slug: 'interns', color: 'slate' },
      { companyId: company.id, name: 'Attachees', slug: 'attachees', color: 'purple' },
    ])
    .returning()

  const dept = Object.fromEntries(insertedDepartments.map((row) => [row.slug, row]))

  const insertedTeams = await db
    .insert(teams)
    .values([
      { departmentId: dept.operations.id, name: 'Ops Core' },
      { departmentId: dept.technology.id, name: 'Platform' },
      { departmentId: dept['client-services'].id, name: 'Delivery' },
      { departmentId: dept['finance-admin'].id, name: 'Accounts' },
      { departmentId: dept.marketing.id, name: 'Growth' },
      { departmentId: dept.md.id, name: 'Executive Office' },
      { departmentId: dept.interns.id, name: 'Intern Desk' },
      { departmentId: dept.attachees.id, name: 'Attachees Desk' },
    ])
    .returning()

  const teamByName = Object.fromEntries(insertedTeams.map((team) => [team.name, team.id]))

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        companyId: company.id,
        departmentId: dept.md.id,
        teamId: teamByName['Executive Office'],
        email: 'md@globeconcs.com',
        firstName: 'Anthony',
        lastName: 'Waliula',
        jobTitle: 'MD',
        passwordHash: defaultPasswordHash,
        initials: 'AW',
        avatarColor: 'navy',
      },
      {
        companyId: company.id,
        departmentId: dept.md.id,
        teamId: teamByName['Executive Office'],
        email: ADMIN_EMAIL,
        firstName: 'Tony',
        lastName: 'Ouh',
        jobTitle: 'Workspace Administrator',
        passwordHash: adminPasswordHash,
        initials: 'TO',
        avatarColor: 'navy',
      },
      {
        companyId: company.id,
        departmentId: dept.operations.id,
        teamId: teamByName['Ops Core'],
        email: 'patrick@globeconcs.com',
        firstName: 'Patrick',
        lastName: 'Ihiga',
        jobTitle: 'Business Development Lead',
        passwordHash: defaultPasswordHash,
        initials: 'PI',
        avatarColor: 'teal',
      },
      {
        companyId: company.id,
        departmentId: dept.technology.id,
        teamId: teamByName.Platform,
        email: 'victor@globeconcs.com',
        firstName: 'Victor',
        lastName: 'Kibiwott',
        jobTitle: 'Digital Technology Officer',
        passwordHash: defaultPasswordHash,
        initials: 'VK',
        avatarColor: 'teal',
      },
      {
        companyId: company.id,
        departmentId: dept['client-services'].id,
        teamId: teamByName['Delivery'],
        email: 'calvin@globeoncs.com',
        firstName: 'Calvin',
        lastName: 'Klein',
        jobTitle: 'Communications & Marketing Lead',
        passwordHash: defaultPasswordHash,
        initials: 'CK',
        avatarColor: 'coral',
      },
      {
        companyId: company.id,
        departmentId: dept['finance-admin'].id,
        teamId: teamByName.Accounts,
        email: 'carolyne@globeconcs.com',
        firstName: 'Carolyne',
        lastName: 'Mutuku Ndunge',
        jobTitle: 'Admin Executive',
        passwordHash: defaultPasswordHash,
        initials: 'CM',
        avatarColor: 'gold',
      },
      {
        companyId: company.id,
        departmentId: dept.marketing.id,
        teamId: teamByName.Growth,
        email: 'elsia@globeconcs.com',
        firstName: 'Elsia',
        lastName: 'Mutuku',
        jobTitle: 'HR',
        passwordHash: defaultPasswordHash,
        initials: 'EM',
        avatarColor: 'gold',
      },
      {
        companyId: company.id,
        departmentId: dept.technology.id,
        teamId: teamByName.Platform,
        email: 'velma@globeconcs.com',
        firstName: 'Velma',
        lastName: 'Muyuku',
        jobTitle: 'Digital Technology Officer',
        passwordHash: defaultPasswordHash,
        initials: 'VM',
        avatarColor: 'blue',
      },
      {
        companyId: company.id,
        departmentId: dept.attachees.id,
        teamId: teamByName['Attachees Desk'],
        email: 'krystal.markk@gmail.com',
        firstName: 'Krystal',
        lastName: 'Mark',
        jobTitle: 'Attachee',
        passwordHash: defaultPasswordHash,
        initials: 'KM',
        avatarColor: 'purple',
      },
      {
        companyId: company.id,
        departmentId: dept.attachees.id,
        teamId: teamByName['Attachees Desk'],
        email: 'john@globeconcs.com',
        firstName: 'John',
        lastName: 'Ndugu',
        jobTitle: 'Attachee',
        passwordHash: defaultPasswordHash,
        initials: 'JN',
        avatarColor: 'purple',
      },
      {
        companyId: company.id,
        departmentId: dept.interns.id,
        teamId: teamByName['Intern Desk'],
        email: 'interns.intern@globcons.com',
        firstName: 'Intern',
        lastName: '—',
        jobTitle: 'Intern',
        passwordHash: defaultPasswordHash,
        initials: 'IN',
        avatarColor: 'slate',
      },
    ])
    .returning()

  const amara = insertedUsers.find((user) => user.email === MD_EMAIL)!
  const tony = insertedUsers.find((user) => user.email === ADMIN_EMAIL)!
  const nia = insertedUsers.find((user) => user.email === 'patrick@globeconcs.com')!
  const david = insertedUsers.find((user) => user.email === 'victor@globeconcs.com')!
  const james = insertedUsers.find((user) => user.email === 'calvin@globeoncs.com')!
  const lina = insertedUsers.find((user) => user.email === 'carolyne@globeconcs.com')!
  const sofia = insertedUsers.find((user) => user.email === 'elsia@globeconcs.com') ?? insertedUsers.find((user) => user.firstName === 'Elsia')!
  const kwame = insertedUsers.find((user) => user.email === 'velma@globeconcs.com')!
  const krystal = insertedUsers.find((user) => user.email === 'krystal.markk@gmail.com')!
  const john = insertedUsers.find((user) => user.email === 'john@globeconcs.com')!
  const intern = insertedUsers.find((user) => user.email === 'interns.intern@globcons.com')!

  await db.update(users).set({ managerId: amara.id }).where(ne(users.id, amara.id))
  await db.update(users).set({ managerId: nia.id }).where(eq(users.id, kwame.id))
  await db.update(users).set({ managerId: amara.id }).where(eq(users.id, sofia.id))
  await db.update(users).set({ managerId: amara.id }).where(eq(users.id, tony.id))

  await db.update(departments).set({ ownerId: nia.id }).where(eq(departments.id, dept.operations.id))
  await db.update(departments).set({ ownerId: david.id }).where(eq(departments.id, dept.technology.id))
  await db.update(departments).set({ ownerId: james.id }).where(eq(departments.id, dept['client-services'].id))
  await db.update(departments).set({ ownerId: lina.id }).where(eq(departments.id, dept['finance-admin'].id))
  await db.update(departments).set({ ownerId: sofia.id }).where(eq(departments.id, dept.marketing.id))
  await db.update(departments).set({ ownerId: amara.id }).where(eq(departments.id, dept.md.id))

  await db.insert(userRoles).values([
    { userId: amara.id, roleId: roleByKey.managing_director },
    { userId: tony.id, roleId: roleByKey.admin },
    { userId: nia.id, roleId: roleByKey.department_head },
    { userId: david.id, roleId: roleByKey.department_head },
    { userId: james.id, roleId: roleByKey.department_head },
    { userId: lina.id, roleId: roleByKey.department_head },
    { userId: sofia.id, roleId: roleByKey.department_head },
    { userId: kwame.id, roleId: roleByKey.employee },
    { userId: krystal.id, roleId: roleByKey.employee },
    { userId: john.id, roleId: roleByKey.employee },
    { userId: intern.id, roleId: roleByKey.employee },
  ])

  const insertedResponsibilities = await db
    .insert(responsibilities)
    .values([
      {
        companyId: company.id,
        departmentId: dept.operations.id,
        ownerId: nia.id,
        title: 'Company operating cadence',
        description: 'Keep weekly reviews, department check-ins, and executive visibility on track.',
        category: 'operational',
      },
      {
        companyId: company.id,
        departmentId: dept.technology.id,
        ownerId: david.id,
        title: 'Internal platform reliability',
        description: 'Own uptime, access, and the GCS knowledge base.',
        category: 'technical',
      },
      {
        companyId: company.id,
        departmentId: dept['client-services'].id,
        ownerId: james.id,
        title: 'Client onboarding quality',
        description: 'Standardise onboarding, handoffs, and first-30-day client experience.',
        category: 'support',
      },
      {
        companyId: company.id,
        departmentId: dept['finance-admin'].id,
        ownerId: lina.id,
        title: 'Payroll accuracy',
        description: 'Reconcile payroll, approvals, and month-end finance close.',
        category: 'finance',
      },
      {
        companyId: company.id,
        departmentId: dept.marketing.id,
        ownerId: sofia.id,
        title: 'Campaign performance reporting',
        description: 'Publish campaign results and pipeline contribution every week.',
        category: 'marketing',
      },
      {
        companyId: company.id,
        departmentId: dept.operations.id,
        ownerId: nia.id,
        title: 'Meeting and follow-up discipline',
        description: 'Capture actions from ops reviews and chase owners before they slip.',
        category: 'administrative',
      },
    ])
    .returning()

  await db.insert(responsibilityAssignees).values([
    { responsibilityId: insertedResponsibilities[0].id, userId: nia.id },
    { responsibilityId: insertedResponsibilities[0].id, userId: sofia.id },
    { responsibilityId: insertedResponsibilities[1].id, userId: david.id },
    { responsibilityId: insertedResponsibilities[1].id, userId: kwame.id },
    { responsibilityId: insertedResponsibilities[2].id, userId: james.id },
    { responsibilityId: insertedResponsibilities[3].id, userId: lina.id },
    { responsibilityId: insertedResponsibilities[4].id, userId: sofia.id },
    { responsibilityId: insertedResponsibilities[5].id, userId: nia.id },
  ])

  const insertedTasks = await db
    .insert(tasks)
    .values([
      {
        companyId: company.id,
        departmentId: dept.operations.id,
        assigneeId: nia.id,
        createdById: amara.id,
        title: 'Finalize Q3 operations review',
        description: 'Close the quarterly review pack for department heads and the MD briefing.',
        category: 'administrative',
        priority: 'high',
        status: 'in_progress',
        progress: 62,
        startDate: isoDate(-5),
        dueDate: isoDate(0),
      },
      {
        companyId: company.id,
        departmentId: dept['client-services'].id,
        assigneeId: james.id,
        createdById: amara.id,
        title: 'Update client onboarding checklist',
        description: 'Refresh the checklist with the new KYC and kickoff steps.',
        category: 'support',
        priority: 'medium',
        status: 'waiting',
        progress: 40,
        startDate: isoDate(-8),
        dueDate: isoDate(1),
      },
      {
        companyId: company.id,
        departmentId: dept.marketing.id,
        assigneeId: sofia.id,
        createdById: amara.id,
        title: 'Prepare campaign performance report',
        description: 'Summarise August campaign results and recommended spend shifts.',
        category: 'marketing',
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        dueDate: isoDate(4),
      },
      {
        companyId: company.id,
        departmentId: dept['finance-admin'].id,
        assigneeId: lina.id,
        createdById: amara.id,
        title: 'Resolve payroll reconciliation',
        description: 'Unblock the variance between payroll export and the ledger.',
        category: 'finance',
        priority: 'high',
        status: 'blocked',
        progress: 35,
        startDate: isoDate(-6),
        dueDate: isoDate(5),
      },
      {
        companyId: company.id,
        departmentId: dept.technology.id,
        assigneeId: david.id,
        createdById: david.id,
        title: 'Deploy internal knowledge base',
        description: 'Ship the first GCS knowledge base to operations and client services.',
        category: 'technical',
        priority: 'low',
        status: 'completed',
        progress: 100,
        startDate: isoDate(-14),
        dueDate: isoDate(0),
      },
      {
        companyId: company.id,
        departmentId: dept.technology.id,
        assigneeId: kwame.id,
        createdById: nia.id,
        title: 'Harden WorkHub access roles',
        description: 'Map MD, department head, and employee permissions for the first live workspace.',
        category: 'technical',
        priority: 'high',
        status: 'in_progress',
        progress: 55,
        startDate: isoDate(-3),
        dueDate: isoDate(2),
      },
      {
        companyId: company.id,
        departmentId: dept.operations.id,
        assigneeId: nia.id,
        createdById: amara.id,
        title: 'Collect department weekly updates',
        description: 'Chase missing updates before Thursday ops review.',
        category: 'operational',
        priority: 'medium',
        status: 'in_progress',
        progress: 48,
        dueDate: isoDate(2),
      },
      {
        companyId: company.id,
        departmentId: dept['client-services'].id,
        assigneeId: james.id,
        createdById: james.id,
        title: 'Confirm Q4 delivery capacity',
        description: 'Check team availability against committed client work.',
        category: 'business_development',
        priority: 'high',
        status: 'pending_approval',
        progress: 80,
        dueDate: isoDate(3),
      },
      {
        companyId: company.id,
        departmentId: dept['finance-admin'].id,
        assigneeId: james.id,
        createdById: james.id,
        title: 'Issue August vendor payments',
        category: 'finance',
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        dueDate: isoDate(6),
      },
      {
        companyId: company.id,
        departmentId: dept.marketing.id,
        assigneeId: lina.id,
        createdById: lina.id,
        title: 'Refresh GCS service one-pagers',
        category: 'marketing',
        priority: 'low',
        status: 'waiting',
        progress: 20,
        dueDate: isoDate(8),
      },
      {
        companyId: company.id,
        departmentId: dept.operations.id,
        assigneeId: amara.id,
        createdById: amara.id,
        title: 'Approve department scorecard draft',
        category: 'administrative',
        priority: 'medium',
        status: 'not_started',
        progress: 0,
        dueDate: isoDate(7),
      },
      {
        companyId: company.id,
        departmentId: dept.technology.id,
        assigneeId: nia.id,
        createdById: kwame.id,
        title: 'Document backup and restore runbook',
        category: 'technical',
        priority: 'medium',
        status: 'completed',
        progress: 100,
        dueDate: isoDate(-2),
      },
    ])
    .returning()

  // Phase 2: Projects + milestones
  const insertedProjects = await db
    .insert(projects)
    .values([
      {
        companyId: company.id,
        ownerId: amara.id,
        departmentId: dept.operations.id,
        title: `${dept.operations.name} delivery`,
        description: 'Managed delivery track for Operations outcomes.',
        status: 'active',
        progress: 0,
      },
      {
        companyId: company.id,
        ownerId: nia.id,
        departmentId: dept.technology.id,
        title: `${dept.technology.name} delivery`,
        description: 'Managed delivery track for Technology outcomes.',
        status: 'active',
        progress: 0,
      },
      {
        companyId: company.id,
        ownerId: david.id,
        departmentId: dept['client-services'].id,
        title: `${dept['client-services'].name} delivery`,
        description: 'Managed delivery track for Client Services outcomes.',
        status: 'active',
        progress: 0,
      },
      {
        companyId: company.id,
        ownerId: james.id,
        departmentId: dept['finance-admin'].id,
        title: `${dept['finance-admin'].name} delivery`,
        description: 'Managed delivery track for Finance & Admin outcomes.',
        status: 'active',
        progress: 0,
      },
      {
        companyId: company.id,
        ownerId: lina.id,
        departmentId: dept.marketing.id,
        title: `${dept.marketing.name} delivery`,
        description: 'Managed delivery track for Marketing outcomes.',
        status: 'active',
        progress: 0,
      },
    ])
    .returning()

  // Project team membership defaults to all employees in the same department.
  await Promise.all(
    insertedProjects.map(async (project) => {
      const projectOwner = insertedUsers.find((u) => u.id === project.ownerId)!
      const usersInDept = insertedUsers.filter((u) => u.departmentId === projectOwner.departmentId)
      if (usersInDept.length === 0) return

      await db.insert(projectTeams).values(
        usersInDept.map((u) => ({
          projectId: project.id,
          userId: u.id,
        })),
      )
    }),
  )

  const milestoneRows = await db
    .insert(projectMilestones)
    .values(
      insertedProjects.map((p) => ({
        projectId: p.id,
        title: 'Delivery',
        status: 'active' as const,
        startDate: isoDate(-2),
        dueDate: isoDate(12),
        progress: 0,
      })),
    )
    .returning()

  const milestoneByProjectId = new Map(milestoneRows.map((m) => [m.projectId, m]))
  const projectTasksRows: { milestoneId: string; taskId: string }[] = []

  for (const project of insertedProjects) {
    const milestone = milestoneByProjectId.get(project.id)
    if (!milestone) continue
    const chosen = insertedTasks.filter((task) => task.departmentId === project.departmentId).slice(0, 2)
    for (const task of chosen) {
      projectTasksRows.push({ milestoneId: milestone.id, taskId: task.id })
    }
    const completed = chosen.filter((task) => task.status === 'completed').length
    const progress = chosen.length === 0 ? 0 : Math.round((completed / chosen.length) * 100)
    await db.update(projects).set({ progress }).where(eq(projects.id, project.id))
    await db.update(projectMilestones).set({ progress }).where(eq(projectMilestones.id, milestone.id))
  }

  if (projectTasksRows.length) {
    await db.insert(projectMilestoneTasks).values(projectTasksRows)
  }

  const byTitle = Object.fromEntries(insertedTasks.map((task) => [task.title, task]))

  await db.insert(taskComments).values([
    {
      taskId: byTitle['Update client onboarding checklist'].id,
      userId: david.id,
      body: 'Waiting on compliance to confirm the new KYC evidence list before I can close this.',
    },
    {
      taskId: byTitle['Resolve payroll reconciliation'].id,
      userId: james.id,
      body: 'Blocked on a missing overtime export from last week. Flagging for ops follow-up.',
    },
    {
      taskId: byTitle['Finalize Q3 operations review'].id,
      userId: sofia.id,
      body: 'Technology and Finance packs are in. Marketing is still outstanding.',
    },
  ])

  await db.insert(taskAttachments).values([
    {
      taskId: byTitle['Finalize Q3 operations review'].id,
      userId: amara.id,
      label: 'Q3 operations review outline',
      url: 'https://docs.google.com',
    },
    {
      taskId: byTitle['Deploy internal knowledge base'].id,
      userId: nia.id,
      label: 'Knowledge base launch notes',
      url: 'https://notion.so',
    },
  ])

  await db.insert(activityEvents).values([
    {
      companyId: company.id,
      actorId: nia.id,
      entityType: 'task',
      entityId: byTitle['Deploy internal knowledge base'].id,
      action: 'completed',
      summary: 'completed Deploy internal knowledge base',
      createdAt: new Date(Date.now() - 12 * 60_000),
    },
    {
      companyId: company.id,
      actorId: david.id,
      entityType: 'task',
      entityId: byTitle['Update client onboarding checklist'].id,
      action: 'commented',
      summary: 'commented on Client onboarding checklist',
      createdAt: new Date(Date.now() - 48 * 60_000),
    },
    {
      companyId: company.id,
      actorId: james.id,
      entityType: 'task',
      entityId: byTitle['Resolve payroll reconciliation'].id,
      action: 'flagged',
      summary: 'flagged Payroll reconciliation as blocked',
      createdAt: new Date(Date.now() - 2 * 60 * 60_000),
    },
    {
      companyId: company.id,
      actorId: sofia.id,
      entityType: 'task',
      entityId: byTitle['Collect department weekly updates'].id,
      action: 'updated',
      summary: 'updated Collect department weekly updates',
      createdAt: new Date(Date.now() - 3 * 60 * 60_000),
    },
  ])

  await db.insert(notificationPreferences).values(
    insertedUsers.map((user) => ({ userId: user.id })),
  )

  await db.insert(notifications).values([
    {
      companyId: company.id,
      userId: amara.id,
      type: 'daily_summary',
      title: 'Daily workspace summary',
      body: 'Review company-wide delivery, overdue work, and management requests.',
    },
    {
      companyId: company.id,
      userId: nia.id,
      type: 'deadline_3d',
      title: 'Deadline in 3 days',
      body: 'Client onboarding checklist is due in three days.',
      entityType: 'task',
      entityId: byTitle['Update client onboarding checklist'].id,
    },
    {
      companyId: company.id,
      userId: david.id,
      type: 'escalation_department',
      title: 'Department escalation',
      body: 'Payroll reconciliation is overdue in Finance/Admin.',
      entityType: 'task',
      entityId: byTitle['Resolve payroll reconciliation'].id,
    },
  ])

  await db.insert(managementRequests).values([
    {
      companyId: company.id,
      requestorId: nia.id,
      assigneeId: amara.id,
      title: 'Approve Q3 campaign budget',
      description: 'Need executive sign-off before the communications rollout.',
      priority: 'high',
      status: 'open',
    },
    {
      companyId: company.id,
      requestorId: david.id,
      assigneeId: amara.id,
      title: 'Confirm intern onboarding capacity',
      description: 'Digital Technology needs guidance on intern placement for August.',
      priority: 'medium',
      status: 'in_progress',
    },
  ])

  console.log(`Seeded ${company.shortName} WorkHub: ${insertedUsers.length} people, ${insertedTasks.length} tasks.`)
  printLoginRoster()
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
