import type { Metadata } from 'next'
import { BarChart3, ClipboardCheck, Users } from 'lucide-react'
import { LoginForm } from '@/app/login/login-form'

export const metadata: Metadata = {
  title: 'Sign In | GCS WorkHub',
  description: 'Sign in to GCS WorkHub to manage work, projects, and collaboration.',
}

function BrandMark() {
  return (
    <svg className="auth-logo-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M15.2 7.2h11.4l5.7 9.9-5.7 9.9H15.2L9.5 17.1 15.2 7.2Z"
        stroke="#60a5fa"
        strokeWidth="3.6"
        strokeLinejoin="round"
      />
      <path
        d="M21.4 21h11.4l5.7 9.9-5.7 9.9H21.4l-5.7-9.9L21.4 21Z"
        stroke="#22c55e"
        strokeWidth="3.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ShieldLockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.8 20 6v5.6c0 4.8-3.2 9.2-8 10.4-4.8-1.2-8-5.6-8-10.4V6L12 2.8Z"
        fill="#22c55e"
      />
      <rect x="9" y="11.1" width="6" height="4.8" rx="1" stroke="#fff" strokeWidth="1.6" />
      <path
        d="M10.3 11.1V9.6a1.7 1.7 0 0 1 3.4 0v1.5"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function FeatureShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.4 19 6.2v5.2c0 4.2-2.8 8-7 9.2-4.2-1.2-7-5-7-9.2V6.2L12 3.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect x="9.25" y="11.1" width="5.5" height="4.3" rx=".9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 11.1V9.7a1.5 1.5 0 0 1 3 0v1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const params = await searchParams
  const callbackUrl = params.callbackUrl ?? '/'

  return (
    <main className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-glow" aria-hidden="true" />
        <div className="auth-brand-city" aria-hidden="true" />
        <div className="auth-brand-fade" aria-hidden="true" />

        <div className="auth-brand-inner">
          <div className="auth-logo">
            <BrandMark />
            <div>
              <strong>GCS</strong>
              <span>WorkHub</span>
            </div>
          </div>

          <div className="auth-brand-copy">
            <h1>
              Welcome to
              <span>
                GCS <em>WorkHub</em>
              </span>
            </h1>
            <span className="auth-heading-rule" aria-hidden="true" />
            <p>The central workspace for GCS teams to manage work, projects and collaborate efficiently.</p>
          </div>

          <ul className="auth-feature-list">
            <li>
              <span className="auth-feature-icon">
                <ClipboardCheck aria-hidden="true" />
              </span>
              Manage Tasks &amp; Responsibilities
            </li>
            <li>
              <span className="auth-feature-icon">
                <Users aria-hidden="true" />
              </span>
              Track Projects &amp; Progress
            </li>
            <li>
              <span className="auth-feature-icon">
                <BarChart3 aria-hidden="true" />
              </span>
              Collaborate Seamlessly
            </li>
            <li>
              <span className="auth-feature-icon">
                <FeatureShieldIcon />
              </span>
              Secure &amp; Reliable
            </li>
          </ul>

          <blockquote className="auth-quote">
            <span className="auth-quote-mark" aria-hidden="true">
              “
            </span>
            Organized teams. Clear goals. <strong>Outstanding results.</strong>
            <span className="auth-quote-mark" aria-hidden="true">
              ”
            </span>
          </blockquote>
        </div>
      </aside>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-lock" aria-hidden="true">
            <ShieldLockIcon />
          </div>
          <h2>Sign in to your account</h2>
          <p>Enter your credentials to continue</p>
          <LoginForm callbackUrl={callbackUrl} />
        </div>
        <p className="auth-legal">© {new Date().getFullYear()} GCS WorkHub. All rights reserved.</p>
      </section>
    </main>
  )
}
