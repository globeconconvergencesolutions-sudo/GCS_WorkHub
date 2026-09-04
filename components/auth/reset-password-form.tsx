'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import Link from 'next/link'
import { resetPasswordWithToken } from '@/app/invite-actions'

type State = { error?: string; ok?: true; email?: string }
const initialState: State = {}

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [showPassword, setShowPassword] = useState(false)
  const [state, formAction, pending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const result = await resetPasswordWithToken(formData)
      if (result && 'error' in result && result.error) return { error: result.error }
      if (result && 'ok' in result) return result
      return {}
    },
    initialState,
  )

  if (state.ok) {
    return (
      <div className="space-y-4">
        <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Password updated for {state.email ?? email}. You can sign in now.
        </div>
        <Link href="/login" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-base font-medium text-white hover:bg-blue-500">
          Sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-5" aria-busy={pending}>
      <input type="hidden" name="token" value={token} />
      <p className="rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
        Resetting password for <strong className="text-white">{email}</strong>
      </p>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-medium text-slate-200">
          New password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            disabled={pending}
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950/60 pr-10 pl-10 text-base text-white outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-60 sm:text-sm"
          />
          <button
            type="button"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-200">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          minLength={8}
          disabled={pending}
          className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 text-base text-white outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-60 sm:text-sm"
        />
      </div>

      {state.error ? (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {state.error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-base font-medium text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-80"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          'Update password'
        )}
      </button>
    </form>
  )
}
