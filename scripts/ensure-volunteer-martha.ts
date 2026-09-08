/**
 * Ensures the Volunteer desk role, Volunteers department, and Martha's account exist.
 * Safe to re-run. Usage: pnpm exec tsx scripts/ensure-volunteer-martha.ts
 */
import { config } from 'dotenv'
import { eq } from 'drizzle-orm'
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
        description: 'Supports GCS work with a focused volunteer desk — assigned tasks only',
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
      description: 'Supports GCS work with a focused volunteer desk — assigned tasks only',
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
    return existing.id
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
  return created.id
}

async function ensureMartha(companyId: string, departmentId: string, roleId: string) {
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
      })
      .where(eq(users.id, existing.id))
  } else {
    const [created] = await db
      .insert(users)
      .values({
        companyId,
        departmentId,
        teamId: desk?.id ?? null,
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

  return userId
}

async function main() {
  const [company] = await db.select().from(companies).limit(1)
  if (!company) throw new Error('No company found. Run db:seed first.')

  const roleId = await ensureRole()
  const departmentId = await ensureVolunteersDepartment(company.id)
  const marthaId = await ensureMartha(company.id, departmentId, roleId)

  console.log('Volunteer desk ready')
  console.log(`  Role: volunteer`)
  console.log(`  Department: Volunteers (${departmentId})`)
  console.log(`  Martha: ${MARTHA_EMAIL} / ${MARTHA_PASSWORD} (${marthaId})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
