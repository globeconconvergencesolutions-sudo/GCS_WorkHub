/**
 * Ensures the Volunteer desk role, Volunteers department, and Martha's account exist.
 * Safe to re-run. Usage: pnpm exec tsx scripts/ensure-volunteer-martha.ts
 */
import { config } from 'dotenv'
import { and, eq, ne } from 'drizzle-orm'
import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { drizzle } from 'drizzle-orm/neon-http'
import {
  companies,
  departments,
  notificationPreferences,
  roles,
  teams,
  userRoles,
  users,
} from '../lib/db/schema'
import { provisionAuthIdentity } from '../lib/auth/provision-user'
import { fullName, makeInitials } from '../lib/format'

config({ path: '.env.local' })
config()

const MARTHA_EMAIL = 'martha@globeconcs.com'
const MARTHA_PASSWORD = 'Workhub123!'

const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED
if (!url) {
  throw new Error('DATABASE_URL is not set.')
}

const db = drizzle({ client: neon(url) })

async function ensureRole() {
  const [existing] = await db.select().from(roles).where(eq(roles.key, 'volunteer')).limit(1)
  if (existing) {
    await db
      .update(roles)
      .set({
        name: 'Volunteer',
        description:
          'Sponsored contributor desk — can log own tasks; supervisor is notified',
        rank: 15,
      })
      .where(eq(roles.id, existing.id))
    return existing.id
  }
  const [created] = await db
    .insert(roles)
    .values({
      key: 'volunteer',
      name: 'Volunteer',
      description:
        'Sponsored contributor desk — can log own tasks; supervisor is notified',
      rank: 15,
    })
    .returning()
  return created.id
}

async function ensureVolunteersDepartment(companyId: string) {
  const [existing] = await db.select().from(departments).where(eq(departments.slug, 'volunteers')).limit(1)
  if (existing) {
    await db
      .update(departments)
      .set({ name: 'Volunteers', color: 'purple' })
      .where(eq(departments.id, existing.id))
    const [team] = await db.select().from(teams).where(eq(teams.departmentId, existing.id)).limit(1)
    if (!team) {
      await db.insert(teams).values({ departmentId: existing.id, name: 'Volunteers Desk' })
    }
    return existing
  }
  const [created] = await db
    .insert(departments)
    .values({
      companyId,
      name: 'Volunteers',
      slug: 'volunteers',
      color: 'purple',
    })
    .returning()
  await db.insert(teams).values({ departmentId: created.id, name: 'Volunteers Desk' })
  return created
}

async function resolveSponsorId(companyId: string, departmentOwnerId?: string | null) {
  if (departmentOwnerId) return departmentOwnerId

  const [mdRoleRow] = await db.select().from(roles).where(eq(roles.key, 'managing_director')).limit(1)
  if (mdRoleRow) {
    const [mdLink] = await db.select().from(userRoles).where(eq(userRoles.roleId, mdRoleRow.id)).limit(1)
    if (mdLink) {
      const [mdUser] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, mdLink.userId), ne(users.status, 'inactive')))
        .limit(1)
      if (mdUser) return mdUser.id
    }
  }

  const [adminRole] = await db.select().from(roles).where(eq(roles.key, 'admin')).limit(1)
  if (adminRole) {
    const [adminLink] = await db.select().from(userRoles).where(eq(userRoles.roleId, adminRole.id)).limit(1)
    if (adminLink) return adminLink.userId
  }

  const [anyone] = await db
    .select()
    .from(users)
    .where(and(eq(users.companyId, companyId), ne(users.status, 'inactive')))
    .limit(1)
  return anyone?.id ?? null
}

async function ensureMartha(
  companyId: string,
  departmentId: string,
  roleId: string,
  sponsorId: string | null,
) {
  const passwordHash = await bcrypt.hash(MARTHA_PASSWORD, 10)
  const [desk] = await db.select().from(teams).where(eq(teams.departmentId, departmentId)).limit(1)
  const [existing] = await db.select().from(users).where(eq(users.email, MARTHA_EMAIL)).limit(1)

  let userId = existing?.id
  if (existing) {
    await db
      .update(users)
      .set({
        firstName: 'Martha',
        lastName: 'Volunteer',
        jobTitle: 'Volunteer',
        initials: makeInitials('Martha', 'Volunteer'),
        avatarColor: 'purple',
        status: 'active',
        passwordHash,
        mustChangePassword: false,
        departmentId,
        teamId: desk?.id ?? existing.teamId,
        managerId: sponsorId && sponsorId !== existing.id ? sponsorId : existing.managerId,
      })
      .where(eq(users.id, existing.id))
  } else {
    const [created] = await db
      .insert(users)
      .values({
        companyId,
        departmentId,
        teamId: desk?.id ?? null,
        managerId: sponsorId,
        email: MARTHA_EMAIL,
        firstName: 'Martha',
        lastName: 'Volunteer',
        jobTitle: 'Volunteer',
        passwordHash,
        mustChangePassword: false,
        initials: makeInitials('Martha', 'Volunteer'),
        avatarColor: 'purple',
        status: 'active',
      })
      .returning()
    userId = created.id
    await db.insert(notificationPreferences).values({ userId: created.id })
  }

  if (!userId) throw new Error('Martha account could not be created.')

  if (sponsorId && sponsorId !== userId) {
    await db.update(users).set({ managerId: sponsorId }).where(eq(users.id, userId))
  }

  await db.delete(userRoles).where(eq(userRoles.userId, userId))
  await db.insert(userRoles).values({ userId, roleId })

  const [person] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!person?.passwordHash) throw new Error('Martha password hash missing.')
  await provisionAuthIdentity({
    userId,
    email: MARTHA_EMAIL,
    name: fullName(person),
    passwordHash: person.passwordHash,
  })

  return { userId, managerId: person.managerId ?? sponsorId }
}

async function main() {
  const [company] = await db.select().from(companies).limit(1)
  if (!company) throw new Error('No company found. Run db:seed first.')

  const roleId = await ensureRole()
  const volDept = await ensureVolunteersDepartment(company.id)
  const sponsorId = await resolveSponsorId(company.id, volDept.ownerId)
  const martha = await ensureMartha(company.id, volDept.id, roleId, sponsorId)

  console.log('Volunteer desk ready')
  console.log(`  Role: volunteer`)
  console.log(`  Department: Volunteers (${volDept.id})`)
  console.log(`  Martha: ${MARTHA_EMAIL} / ${MARTHA_PASSWORD} (${martha.userId})`)
  console.log(`  Supervisor (Reports to): ${martha.managerId ?? 'none — set via Edit person'}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
