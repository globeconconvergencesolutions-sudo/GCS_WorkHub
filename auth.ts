import bcrypt from 'bcryptjs'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import authConfig from '@/auth.config'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const { email, password } = parsed.data
        const user = await getDb().query.users.findFirst({
          where: eq(users.email, email.toLowerCase()),
          with: {
            department: true,
            roles: { with: { role: true } },
          },
        })

        if (!user || !user.passwordHash || user.status !== 'active') return null

        const matches = await bcrypt.compare(password, user.passwordHash)
        if (!matches) return null

        await getDb()
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user.id))

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          roleKeys: user.roles.map((entry) => entry.role.key),
          departmentId: user.departmentId,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.roleKeys = Array.isArray(user.roleKeys) ? user.roleKeys : []
        token.departmentId = user.departmentId ?? null
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ''
        session.user.roleKeys = Array.isArray(token.roleKeys)
          ? token.roleKeys.filter((value): value is string => typeof value === 'string')
          : []
        session.user.departmentId =
          typeof token.departmentId === 'string' ? token.departmentId : null
      }
      return session
    },
  },
})
