import { and, eq, inArray } from 'drizzle-orm'
import {
  activityEvents,
  departments,
  projectDepartments,
  projectMilestones,
  projectMilestoneTasks,
  projectTeams,
  projects,
  responsibilities,
  responsibilityAssignees,
  roles,
  taskComments,
  tasks,
  teams,
  userRoles,
  users,
} from '../db/schema'
import {
  DEMO_TASK_TITLES,
  PRIORITY_PROJECTS,
  PRIORITY_RESPONSIBILITIES,
} from './priorities-2026'

export async function applyPriorityWorkload(db: unknown) {
  const client = db as ReturnType<typeof import('drizzle-orm/neon-http').drizzle>

  const [company] = await client.select().from(users).limit(1)
  if (!company) throw new Error('No people in the workspace yet. Seed first.')

  const allUsers = await client.select().from(users)
  const byEmail = new Map(allUsers.map((person) => [person.email.toLowerCase(), person]))
  const deptRows = await client.select().from(departments)
  const bySlug = new Map(deptRows.map((row) => [row.slug, row]))
  const roleRows = await client.select().from(roles)
  const roleByKey = Object.fromEntries(roleRows.map((row) => [row.key, row.id])) as Record<string, string>
  const teamRows = await client.select().from(teams)

  const requireUser = (email: string) => {
    const person = byEmail.get(email.toLowerCase())
    if (!person) throw new Error(`Person ${email} is not in WorkHub.`)
    return person
  }
  const requireDept = (slug: string) => {
    const row = bySlug.get(slug)
    if (!row) throw new Error(`Department ${slug} is missing.`)
    return row
  }

  const md = requireUser('md@globeconcs.com')
  const victor = requireUser('victor@globeconcs.com')
  const velma = requireUser('velma@globeconcs.com')
  const krystal = requireUser('krystal.markk@gmail.com')
  const patrick = requireUser('patrick@globeconcs.com')
  const tech = requireDept('technology')
  const platform = teamRows.find((team) => team.departmentId === tech.id)

  await client
    .update(users)
    .set({
      jobTitle: 'Digital Technology Team Co-Lead',
      managerId: md.id,
      departmentId: tech.id,
      teamId: platform?.id ?? victor.teamId,
    })
    .where(eq(users.id, victor.id))
  await client
    .update(users)
    .set({
      jobTitle: 'Digital Technology Team Co-Lead',
      managerId: md.id,
      departmentId: tech.id,
      teamId: platform?.id ?? velma.teamId,
    })
    .where(eq(users.id, velma.id))
  await client
    .update(users)
    .set({
      jobTitle: 'Supporting Engineer',
      managerId: victor.id,
      departmentId: tech.id,
      teamId: platform?.id ?? krystal.teamId,
    })
    .where(eq(users.id, krystal.id))
  await client
    .update(users)
    .set({
      jobTitle: 'Business Development Executive',
      managerId: md.id,
    })
    .where(eq(users.id, patrick.id))

  if (roleByKey.department_head) {
    for (const person of [victor, velma]) {
      await client.delete(userRoles).where(eq(userRoles.userId, person.id))
      await client.insert(userRoles).values({ userId: person.id, roleId: roleByKey.department_head })
    }
  }

  await client.update(departments).set({ ownerId: victor.id }).where(eq(departments.id, tech.id))

  const existingProjects = await client.select().from(projects)
  for (const project of existingProjects) {
    if (/ delivery$/i.test(project.title) && project.status !== 'archived') {
      await client.update(projects).set({ status: 'archived', updatedAt: new Date() }).where(eq(projects.id, project.id))
    }
  }

  if (DEMO_TASK_TITLES.length) {
    await client
      .update(tasks)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(inArray(tasks.title, DEMO_TASK_TITLES))
  }

  const companyId = victor.companyId

  for (const item of PRIORITY_RESPONSIBILITIES) {
    const owner = requireUser(item.ownerEmail)
    const department = requireDept(item.departmentSlug)
    const existing = await client
      .select()
      .from(responsibilities)
      .where(and(eq(responsibilities.companyId, companyId), eq(responsibilities.title, item.title)))
      .limit(1)
    const row =
      existing[0] ??
      (
        await client
          .insert(responsibilities)
          .values({
            companyId,
            departmentId: department.id,
            ownerId: owner.id,
            title: item.title,
            description: item.description,
            category: item.category,
            status: 'active',
          })
          .returning()
      )[0]
    if (existing[0]) {
      await client
        .update(responsibilities)
        .set({
          description: item.description,
          ownerId: owner.id,
          departmentId: department.id,
          category: item.category,
          status: 'active',
        })
        .where(eq(responsibilities.id, existing[0].id))
    }
    await client.delete(responsibilityAssignees).where(eq(responsibilityAssignees.responsibilityId, row.id))
    const assigneeIds = [...new Set([owner.id, ...item.assigneeEmails.map((email) => requireUser(email).id)])]
    await client
      .insert(responsibilityAssignees)
      .values(assigneeIds.map((userId) => ({ responsibilityId: row.id, userId })))
  }

  let projectsTouched = 0
  let tasksTouched = 0

  for (const spec of PRIORITY_PROJECTS) {
    const owner = requireUser(spec.ownerEmail)
    const department = requireDept(spec.departmentSlug)
    const found = await client
      .select()
      .from(projects)
      .where(and(eq(projects.companyId, companyId), eq(projects.title, spec.title)))
      .limit(1)

    const project =
      found[0] ??
      (
        await client
          .insert(projects)
          .values({
            companyId,
            ownerId: owner.id,
            departmentId: department.id,
            title: spec.title,
            description: spec.description,
            status: spec.status,
            progress: 0,
          })
          .returning()
      )[0]

    if (found[0]) {
      await client
        .update(projects)
        .set({
          ownerId: owner.id,
          departmentId: department.id,
          description: spec.description,
          status: spec.status,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, found[0].id))
    }

    const teamIds = [...new Set([owner.id, ...spec.teamEmails.map((email) => requireUser(email).id)])]
    await client.delete(projectTeams).where(eq(projectTeams.projectId, project.id))
    await client.insert(projectTeams).values(teamIds.map((userId) => ({ projectId: project.id, userId })))

    await client.delete(projectDepartments).where(eq(projectDepartments.projectId, project.id))
    const collabDepartments = new Set<string>([department.id])
    for (const userId of teamIds) {
      const member = allUsers.find((person) => person.id === userId)
      if (member?.departmentId) collabDepartments.add(member.departmentId)
    }
    await client.insert(projectDepartments).values(
      [...collabDepartments].map((deptId) => ({
        projectId: project.id,
        departmentId: deptId,
        role: (deptId === department.id ? 'home' : 'contributing') as 'home' | 'contributing',
      })),
    )

    for (const milestoneSpec of spec.milestones) {
      const existingMilestone = await client
        .select()
        .from(projectMilestones)
        .where(and(eq(projectMilestones.projectId, project.id), eq(projectMilestones.title, milestoneSpec.title)))
        .limit(1)
      const milestone =
        existingMilestone[0] ??
        (
          await client
            .insert(projectMilestones)
            .values({
              projectId: project.id,
              title: milestoneSpec.title,
              status: milestoneSpec.status,
              startDate: milestoneSpec.startDate ?? null,
              dueDate: milestoneSpec.dueDate ?? null,
              progress: 0,
            })
            .returning()
        )[0]
      if (existingMilestone[0]) {
        await client
          .update(projectMilestones)
          .set({
            status: milestoneSpec.status,
            startDate: milestoneSpec.startDate ?? null,
            dueDate: milestoneSpec.dueDate ?? null,
            updatedAt: new Date(),
          })
          .where(eq(projectMilestones.id, existingMilestone[0].id))
      }

      for (const taskSpec of milestoneSpec.tasks) {
        const assignee = requireUser(taskSpec.assigneeEmail)
        const createdBy = requireUser(taskSpec.createdByEmail ?? spec.ownerEmail)
        const existingTask = await client
          .select()
          .from(tasks)
          .where(and(eq(tasks.companyId, companyId), eq(tasks.title, taskSpec.title)))
          .limit(1)
        const payload = {
          companyId,
          departmentId: assignee.departmentId ?? department.id,
          projectId: project.id,
          assigneeId: assignee.id,
          createdById: createdBy.id,
          title: taskSpec.title,
          description: taskSpec.description,
          category: taskSpec.category,
          priority: taskSpec.priority,
          status: taskSpec.status,
          progress: taskSpec.progress,
          startDate: taskSpec.startDate ?? null,
          dueDate: taskSpec.dueDate ?? null,
          updatedAt: new Date(),
        }
        const task =
          existingTask[0] ??
          (
            await client
              .insert(tasks)
              .values(payload)
              .returning()
          )[0]
        if (existingTask[0]) {
          await client.update(tasks).set(payload).where(eq(tasks.id, existingTask[0].id))
        }

        const existingLink = await client
          .select()
          .from(projectMilestoneTasks)
          .where(
            and(eq(projectMilestoneTasks.milestoneId, milestone.id), eq(projectMilestoneTasks.taskId, task.id)),
          )
          .limit(1)
        if (!existingLink[0]) {
          await client.insert(projectMilestoneTasks).values({ milestoneId: milestone.id, taskId: task.id })
        }
        if (assignee.departmentId && assignee.departmentId !== department.id) {
          const already = await client
            .select()
            .from(projectDepartments)
            .where(
              and(
                eq(projectDepartments.projectId, project.id),
                eq(projectDepartments.departmentId, assignee.departmentId),
              ),
            )
            .limit(1)
          if (!already[0]) {
            await client.insert(projectDepartments).values({
              projectId: project.id,
              departmentId: assignee.departmentId,
              role: 'contributing',
            })
          }
        }

        if (taskSpec.comment) {
          const author = requireUser(taskSpec.comment.authorEmail)
          const comments = await client.select().from(taskComments).where(eq(taskComments.taskId, task.id)).limit(1)
          if (!comments[0]) {
            await client.insert(taskComments).values({
              taskId: task.id,
              userId: author.id,
              body: taskSpec.comment.body,
            })
          }
        }
        tasksTouched += 1
      }
    }

    const linked = await client
      .select({
        progress: tasks.progress,
        milestoneId: projectMilestoneTasks.milestoneId,
      })
      .from(projectMilestoneTasks)
      .innerJoin(projectMilestones, eq(projectMilestones.id, projectMilestoneTasks.milestoneId))
      .innerJoin(tasks, eq(tasks.id, projectMilestoneTasks.taskId))
      .where(eq(projectMilestones.projectId, project.id))

    const byMilestone = new Map<string, number[]>()
    for (const row of linked) {
      const list = byMilestone.get(row.milestoneId) ?? []
      list.push(row.progress)
      byMilestone.set(row.milestoneId, list)
    }
    for (const [milestoneId, values] of byMilestone) {
      const avg = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
      await client.update(projectMilestones).set({ progress: avg, updatedAt: new Date() }).where(eq(projectMilestones.id, milestoneId))
    }
    const allProgress = linked.map((row) => row.progress)
    const projectProgress = allProgress.length
      ? Math.round(allProgress.reduce((sum, value) => sum + value, 0) / allProgress.length)
      : 0
    await client.update(projects).set({ progress: projectProgress, updatedAt: new Date() }).where(eq(projects.id, project.id))

    if (!found[0]) {
      await client.insert(activityEvents).values({
        companyId,
        actorId: owner.id,
        entityType: 'project',
        entityId: project.id,
        action: 'created',
        summary: `opened ${spec.title} from the August 2026 priorities pack`,
      })
    }
    projectsTouched += 1
  }

  const duplicateProjectTitles = ['Kalimoni project', 'WorkHub project workspace QA']
  const duplicateProjects = await client
    .select()
    .from(projects)
    .where(inArray(projects.title, duplicateProjectTitles))
  for (const row of duplicateProjects) {
    await client.update(projects).set({ status: 'archived', updatedAt: new Date() }).where(eq(projects.id, row.id))
  }

  const duplicateTaskTitles = ['Hewane school of Music Website Revamp.']
  await client
    .update(tasks)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(inArray(tasks.title, duplicateTaskTitles))

  return { projectsTouched, tasksTouched }
}
