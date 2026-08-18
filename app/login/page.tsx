import type { Metadata } from 'next'
import { LoginForm } from '@/app/login/login-form'

export const metadata: Metadata = {
  title: 'Sign In | GCS WorkHub',
  description: 'Secure sign-in for GCS WorkHub.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const params = await searchParams
  const callbackUrl = params.callbackUrl ?? '/'

  return (
    <main className="setup-screen login-screen">
      <section className="login-layout">
        <article className="setup-card login-showcase">
          <div className="brand-lockup setup-brand">
            <div className="brand-mark">
              <span>G</span>
            </div>
            <div>
              <strong>GCS</strong>
              <span>WorkHub</span>
            </div>
          </div>

          <div className="showcase-kicker"><span className="live-dot" /> Built for focused operations</div>
          <p className="eyebrow">GlobeCon Convergence Solutions</p>
          <h1>Make every decision visible. Make every delivery count.</h1>
          <p>
            WorkHub gives every team a shared operating picture — with the context, ownership, and momentum to move work forward.
          </p>

          <div className="login-stat-strip">
            <div>
              <strong>One source of truth</strong>
              <span>Role-aware workspaces for every layer of the organization</span>
            </div>
            <div>
              <strong>Calm momentum</strong>
              <span>Projects, dependencies, approvals, and delivery signals in one place</span>
            </div>
          </div>

          <div className="login-feature-grid">
            <article className="login-feature-card">
              <strong>Executive visibility</strong>
              <span>Cross-company insights, projects, departments, and people controls.</span>
            </article>
            <article className="login-feature-card">
              <strong>Department control</strong>
              <span>Heads and managers focus on their own teams, deadlines, approvals, and workload.</span>
            </article>
            <article className="login-feature-card">
              <strong>Individual focus</strong>
              <span>Employees, attachees, and interns land in their personal task and responsibility context.</span>
            </article>
          </div>
        </article>

        <section className="setup-card login-card">
          <div className="login-card-topline"><p className="eyebrow">Workspace access</p><span className="secure-label">Encrypted session</span></div>
          <h2>Welcome back.</h2>
          <p>Sign in with your GlobeCon credentials to pick up exactly where your team left off.</p>

          <LoginForm callbackUrl={callbackUrl} />

          <div className="login-footer-note">
            <strong>Account access</strong>
            <span>Your workspace, priorities, approvals, and reporting surface are tailored immediately after sign-in.</span>
          </div>
        </section>
      </section>
    </main>
  )
}
