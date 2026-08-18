import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    roleKeys?: string[]
    departmentId?: string | null
  }

  interface Session {
    user: {
      id: string
      roleKeys: string[]
      departmentId: string | null
    } & NonNullable<Session['user']>
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    roleKeys?: string[]
    departmentId?: string | null
  }
}
