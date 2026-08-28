import type { NextAuthConfig } from 'next-auth'
import { getAuthSecret } from '@/lib/env'

const authConfig = {
  secret: getAuthSecret(),
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  providers: [],
} satisfies NextAuthConfig

export default authConfig
