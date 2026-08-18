'use client'

import { useState } from 'react'
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react'
import { authenticate } from '@/app/login/actions'

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function action(formData: FormData) {
    setPending(true)
    setError(null)
    const result = await authenticate(formData)
    if (result?.error) {
      setError(result.error)
      setPending(false)
      return
    }
  }

  return (
    <form action={action} className="login-form">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <label className="form-field" htmlFor="email">
        <span>Work email</span>
        <div className="auth-input-shell">
          <Mail aria-hidden="true" />
          <input id="email" name="email" type="email" placeholder="md@globeconcs.com" autoComplete="email" required />
        </div>
      </label>
      <label className="form-field" htmlFor="password">
        <span>Password</span>
        <div className="auth-input-shell">
          <KeyRound aria-hidden="true" />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="auth-ghost-button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
      </label>
      {error && <p className="form-error">{error}</p>}
      <p className="login-helper-copy">WorkHub aligns your view, approvals, and controls automatically after sign-in.</p>
      <button className="create-button" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in to WorkHub'}
      </button>
    </form>
  )
}
