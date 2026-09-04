'use client'

import { useActionState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import Link from 'next/link'
import { requestPasswordReset } from '@/app/invite-actions'

type State = { error?: string; ok?: true; message?: string }
const initialState: State = {}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const result = await requestPasswordReset(formData)
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
          {state.message}
        </div>
        <Link href="/login" className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 text-base font-medium text-white hover:bg-blue-500">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-5" aria-busy={pending}>
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium text-slate-200">
          Work email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            disabled={pending}
            placeholder="you@globeconcs.com"
            className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950/60 pr-3 pl-10 text-base text-white placeholder:text-slate-500 outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:opacity-60 sm:text-sm"
          />
        </div>
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
            Sending…
          </>
        ) : (
          'Send reset link'
        )}
      </button>
    </form>
  )
}
