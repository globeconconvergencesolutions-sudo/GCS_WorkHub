import { config } from 'dotenv'
config({ path: '.env.local' })
config()

async function main() {
  const { eq } = await import('drizzle-orm')
  const {
    createUserInvite,
    INVITE_SETUP_DAYS,
  } = await import('../lib/auth/invite-tokens')
  const { getDb } = await import('../lib/db')
  const { getCompany } = await import('../lib/db/queries')
  const { notificationPreferences, roles, userRoles, users } = await import('../lib/db/schema')
  const { getPublicAppUrl } = await import('../lib/mail/send')

  const company = await getCompany()
  if (!company) throw new Error('No company')
  const email = `ui.invite.${Date.now()}@example.com`
  const [role] = await getDb().select().from(roles).where(eq(roles.key, 'employee')).limit(1)
  if (!role) throw new Error('no role')

  const [created] = await getDb()
    .insert(users)
    .values({
      companyId: company.id,
      email,
      firstName: 'Amina',
      lastName: 'Otieno',
      jobTitle: 'Operations analyst',
      initials: 'AO',
      status: 'invited',
      passwordHash: null,
      mustChangePassword: false,
    })
    .returning()
  await getDb().insert(userRoles).values({ userId: created.id, roleId: role.id })
  await getDb().insert(notificationPreferences).values({ userId: created.id })

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + INVITE_SETUP_DAYS)
  const { rawToken } = await createUserInvite({
    userId: created.id,
    invitedById: null,
    purpose: 'setup',
    expiresAt,
  })

  console.log(JSON.stringify({
    url: `${getPublicAppUrl()}/invite/${rawToken}`,
    userId: created.id,
    email,
  }))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
