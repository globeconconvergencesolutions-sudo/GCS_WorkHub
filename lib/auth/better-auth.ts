import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import bcrypt from 'bcryptjs'
import { getAppUrl, getAuthSecret } from '@/lib/env'
import { getDb } from '@/lib/db'
import { authAccount, authSession, authUser, authVerification } from '@/lib/db/schema'

function appOrigin() {
  return getAppUrl() ?? 'http://localhost:3000'
}

function collectTrustedOrigins(primary: string) {
  const origins = new Set<string>([primary, 'http://localhost:3000'])
  for (const value of [process.env.URL, process.env.DEPLOY_URL, process.env.DEPLOY_PRIME_URL, process.env.AUTH_URL, process.env.BETTER_AUTH_URL]) {
    const trimmed = value?.trim().replace(/\/$/, '')
    if (trimmed) origins.add(trimmed)
  }
  return [...origins]
}

const origin = appOrigin()
const secure = origin.startsWith('https')

export const auth = betterAuth({
  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: {
      user: authUser,
      session: authSession,
      account: authAccount,
      verification: authVerification,
    },
  }),
  secret: getAuthSecret(),
  baseURL: origin,
  trustedOrigins: collectTrustedOrigins(origin),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    password: {
      hash: async (password) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 12,
    cookieCache: {
      enabled: false,
    },
  },
  user: {
    modelName: 'user',
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
    useSecureCookies: secure,
    defaultCookieAttributes: {
      sameSite: 'lax',
      path: '/',
      httpOnly: true,
      secure,
    },
  },
  plugins: [nextCookies()],
})
