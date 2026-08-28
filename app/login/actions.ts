'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { signIn } from '@/auth'
import { getUserByEmail } from '@/lib/db/queries'

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
  const user = email ? await getUserByEmail(email) : null
  const roleKeys = user?.roles?.map((entry) => entry.role.key) ?? []
  const redirectTo =
    callbackUrl !== '/' ? (safeInternalPath(callbackUrl) ?? getRoleLandingUrl(roleKeys)) : getRoleLandingUrl(roleKeys)

  try {
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })
    if (result?.error) {
      return { error: 'Invalid email or password.' }
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          error.type === 'CredentialsSignin'
            ? 'Invalid email or password.'
            : 'Unable to sign in right now.',
      }
    }
    throw error
  }

  redirect(redirectTo)
}
