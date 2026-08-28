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

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46c-.28 1.5-1.12 2.77-2.39 3.62v3h3.86c2.26-2.08 3.56-5.14 3.56-8.65z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.86-3c-1.07.72-2.45 1.15-4.09 1.15-3.14 0-5.8-2.12-6.75-4.97H1.27v3.09C3.25 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.28A7.2 7.2 0 0 1 4.87 12c0-.79.14-1.56.38-2.28V6.63H1.27A12 12 0 0 0 0 12c0 1.94.46 3.78 1.27 5.37l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l3.98 3.09C6.2 6.87 8.86 4.75 12 4.75z"
      />
    </svg>
  )
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

      <div className="auth-divider">
        <span>or continue with</span>
      </div>

      <button
        className="auth-google"
        type="button"
        disabled={pending}
        onClick={() =>
          setError(
            'Google sign-in is enabled once your administrator connects Google Workspace. Use your work email for now.',
          )
        }
      >
        <GoogleMark />
        Sign in with Google
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
