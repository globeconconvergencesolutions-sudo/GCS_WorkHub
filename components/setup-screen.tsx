import Link from 'next/link'

export function SetupScreen({
  missingSeed = false,
  error,
}: {
  missingSeed?: boolean
  error?: string
}) {
  return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="brand-lockup setup-brand">
          <div className="brand-mark">
            <span>G</span>
          </div>
          <div>
            <strong>GCS</strong>
            <span>WorkHub</span>
          </div>
        </div>
        <h1>{missingSeed ? 'Database is connected, but empty' : 'Let’s get WorkHub running'}</h1>
        <p>
          This workspace uses <strong>Neon Postgres</strong> with <strong>Drizzle ORM</strong>. Nothing else was already
          wired in, so this is the source of truth for people, responsibilities, and tasks.
        </p>
        {error && <p className="form-error">{error}</p>}
        <ol>
          {missingSeed ? (
            <>
              <li>
                From the project folder run <code>pnpm db:seed</code>
              </li>
              <li>Refresh this page to load the GCS workspace</li>
            </>
          ) : (
            <>
              <li>
                Sign in to Neon in the browser if a login tab opened, or run <code>npx neon auth</code>
              </li>
              <li>
                Link this repo with <code>npx neon link</code> and create a project named <code>gcs-work-hub</code>
              </li>
              <li>
                Apply the schema and sample GCS data with <code>pnpm db:setup</code>
              </li>
            </>
          )}
        </ol>
        <p className="setup-hint">
          Connection strings belong in <code>.env.local</code>. Use the pooled URL for the app and the direct URL for
          migrations.
        </p>
        <Link className="setup-refresh" href="/">
          Retry connection
        </Link>
      </div>
    </main>
  )
}
