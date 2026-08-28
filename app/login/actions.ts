'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { APIError } from 'better-auth/api'
import { auth } from '@/lib/auth/better-auth'
import { provisionAuthIdentity } from '@/lib/auth/provision-user'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getUserByEmail } from '@/lib/db/queries'
import { fullName } from '@/lib/format'

function getRoleLandingUrl(roleKeys: string[]) {
  if (roleKeys.includes('admin') || roleKeys.includes('managing_director')) {
    return '/?view=Home'
  }
  if (roleKeys.includes('department_head') || roleKeys.includes('manager')) {
    return '/?view=Departments'
  }
  return '/?view=My%20tasks'
}

function safeInternalPath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}

export async function authenticate(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const callbackUrl = String(formData.get('callbackUrl') ?? '/') || '/'
  const workhubUser = email ? await getUserByEmail(email) : null

  if (!workhubUser || workhubUser.status !== 'active' || !workhubUser.passwordHash) {
    return { error: 'Invalid email or password.' }
  }

  const requestHeaders = await headers()
  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: requestHeaders,
    })
  } catch (error) {
    if (!(error instanceof APIError)) throw error
    await provisionAuthIdentity({
      userId: workhubUser.id,
      email: workhubUser.email,
      name: fullName(workhubUser),
      passwordHash: workhubUser.passwordHash,
    })
    try {
      await auth.api.signInEmail({
        body: { email, password },
        headers: requestHeaders,
      })
    } catch (retry) {
      if (retry instanceof APIError) {
        return { error: 'Invalid email or password.' }
      }
      throw retry
    }
  }

  await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, workhubUser.id))

  const roleKeys = workhubUser.roles?.map((entry) => entry.role.key) ?? []
  const redirectTo =
    callbackUrl !== '/' ? (safeInternalPath(callbackUrl) ?? getRoleLandingUrl(roleKeys)) : getRoleLandingUrl(roleKeys)
  redirect(redirectTo)
}
