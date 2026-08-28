'use client'

import { useState, useSyncExternalStore } from 'react'
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react'
import { authenticate } from '@/app/login/actions'

const EMAIL_STORAGE_KEY = 'gcs-workhub-remember-email'

function subscribeRememberedEmail() {
  return () => {}
}

function getRememberedEmail() {
  return window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? ''
}

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const rememberedEmail = useSyncExternalStore(subscribeRememberedEmail, getRememberedEmail, () => '')

  async function action(formData: FormData) {
    setPending(true)
    setError(null)

    const nextEmail = String(formData.get('email') ?? '').trim()
    if (remember && nextEmail) {
      window.localStorage.setItem(EMAIL_STORAGE_KEY, nextEmail)
    } else {
      window.localStorage.removeItem(EMAIL_STORAGE_KEY)
    }

    const result = await authenticate(formData)
    if (result?.error) {
      setError(result.error)
      setPending(false)
    }
  }

  return (
    <form action={action} className="auth-form">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />

      <label className="auth-field" htmlFor="email">
        <span>Email address</span>
        <div className="auth-input">
          <Mail aria-hidden="true" />
          <input
            id="email"
            key={rememberedEmail || 'email'}
            name="email"
            type="email"
            defaultValue={rememberedEmail}
            placeholder="you@example.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
      </label>

      <label className="auth-field" htmlFor="password">
        <span>Password</span>
        <div className="auth-input">
          <Lock aria-hidden="true" />
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
            className="auth-visibility"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
      </label>

      <div className="auth-form-row">
        <label className="auth-remember">
          <input
            type="checkbox"
            name="remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>Remember me</span>
        </label>
        <button
          className="auth-link"
          type="button"
          onClick={() => setError('Password recovery is handled by your WorkHub administrator.')}
        >
          Forgot password?
        </button>
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <button className="auth-submit" type="submit" disabled={pending}>
        {pending ? (
          <>
            <span className="button-spinner" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          <>
            <LogIn aria-hidden="true" />
            Sign In
          </>
        )}
      </button>

      </button>

      <p className="auth-signup">
        Don&apos;t have an account?{' '}
        <button
          className="auth-link"
          type="button"
          onClick={() => setError('Ask your WorkHub administrator to provision your account.')}
        >
          Contact your administrator
        </button>
      </p>
    </form>
  )
}
