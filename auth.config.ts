import type { NextAuthConfig } from 'next-auth'

const authConfig = {
  secret: process.env.AUTH_SECRET ?? 'dev-only-auth-secret-change-me',
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  providers: [],
} satisfies NextAuthConfig

export default authConfig
