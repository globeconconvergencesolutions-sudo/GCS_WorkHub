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

          <p className="eyebrow">GlobeCon Convergence Solutions</p>
          <h1>Step into the WorkHub command center.</h1>
          <p>
            Sign in to continue the day’s work with the right level of visibility, from executive oversight to personal
            delivery.
          </p>

          <div className="login-stat-strip">
            <div>
              <strong>RBAC ready</strong>
              <span>Executive, department head, and staff scoped views</span>
            </div>
            <div>
              <strong>Live workspace</strong>
              <span>Projects, dependencies, approvals, deliverables, and audit trail</span>
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
          <p className="eyebrow">Secure sign-in</p>
          <h2>Tell WorkHub who you are</h2>
          <p>Use your GlobeCon credentials and WorkHub will open the right workspace for your role.</p>

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
