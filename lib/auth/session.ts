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

export async function getProjectMembershipUserIds(projectId: string) {
  const rows = await getDb().query.projectTeams.findMany({
    where: (table, { eq }) => eq(table.projectId, projectId),
  })
  return rows.map((row) => row.userId)
}
