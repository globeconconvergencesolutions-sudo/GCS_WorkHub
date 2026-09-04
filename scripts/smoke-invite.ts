/**
 * Smoke-tests invite plumbing without a browser session:
 * Gmail send, token create/lookup, accept-path password provisioning.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
config()

async function main() {
  const { eq } = await import('drizzle-orm')
  const bcrypt = (await import('bcryptjs')).default
  const {
    createUserInvite,
    findOpenInviteByToken,
    INVITE_SETUP_DAYS,
    markInviteConsumed,
  } = await import('../lib/auth/invite-tokens')
  const { provisionAuthIdentity, revokeAuthSessions } = await import('../lib/auth/provision-user')
  const { getDb } = await import('../lib/db')
  const { getCompany } = await import('../lib/db/queries')
  const { notificationPreferences, roles, userRoles, users } = await import('../lib/db/schema')
  const { getPublicAppUrl, isMailConfigured, sendMail } = await import('../lib/mail/send')
  const { inviteSetupEmail } = await import('../lib/mail/templates')

  if (!isMailConfigured()) throw new Error('Gmail is not configured')
  const company = await getCompany()
  if (!company) throw new Error('No company')

  const email = `invite.smoke.${Date.now()}@example.com`
  const [role] = await getDb().select().from(roles).where(eq(roles.key, 'employee')).limit(1)
  if (!role) throw new Error('employee role missing')

  const [created] = await getDb()
    .insert(users)
    .values({
      companyId: company.id,
      email,
      firstName: 'Smoke',
      lastName: 'Invite',
      jobTitle: 'QA probe',
      initials: 'SI',
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

  const setupUrl = `${getPublicAppUrl()}/invite/${rawToken}`
  const mail = inviteSetupEmail({
    firstName: 'Smoke',
    inviterName: 'WorkHub Smoke Test',
    companyName: company.name,
    roleName: role.name,
    departmentName: null,
    setupUrl,
    expiresInDays: INVITE_SETUP_DAYS,
  })

  const to = process.env.GMAIL_USER!
  await sendMail({ to, subject: `[smoke] ${mail.subject}`, html: mail.html, text: mail.text })
  console.log('invite email sent to', to)
  console.log('invite url', setupUrl)

  const found = await findOpenInviteByToken(rawToken, 'setup')
  if (!found) throw new Error('token lookup failed')

  const password = 'SmokeTest123!'
  const passwordHash = await bcrypt.hash(password, 10)
  await getDb()
    .update(users)
    .set({ passwordHash, status: 'active', mustChangePassword: false, lastLoginAt: new Date() })
    .where(eq(users.id, created.id))
  await provisionAuthIdentity({
    userId: created.id,
    email,
    name: 'Smoke Invite',
    passwordHash,
  })
  await markInviteConsumed(found.id)
  await revokeAuthSessions(created.id)

  await getDb().delete(users).where(eq(users.id, created.id))
  console.log('invite accept path OK; smoke user cleaned up')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
