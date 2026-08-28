import { cache } from 'react'
import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/better-auth'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'

export const getAuthSession = cache(async () => {
  try {
    return await auth.api.getSession({ headers: await headers() })
  } catch {
    return null
  }
})

export async function requireSession() {
  const session = await getAuthSession()
  if (!session?.user?.id) {
    throw new Error('Authentication required.')
  }
  return session
}

export async function requireCurrentUser() {
  const session = await requireSession()
  const user = await getDb().query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      department: true,
      roles: { with: { role: true } },
    },
  })
  if (!user) throw new Error('Signed-in user was not found.')
  if (user.status !== 'active') throw new Error('This account is inactive.')
  return user
}

export async function getProjectMembershipUserIds(projectId: string) {
  const rows = await getDb().query.projectTeams.findMany({
    where: (table, { eq: equals }) => equals(table.projectId, projectId),
  })
  return rows.map((row) => row.userId)
}
