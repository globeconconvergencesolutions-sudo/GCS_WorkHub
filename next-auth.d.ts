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
      name?: string | null
      email?: string | null
      image?: string | null
      roleKeys: string[]
      departmentId: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    roleKeys?: string[]
    departmentId?: string | null
  }
}
