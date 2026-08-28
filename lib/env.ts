function readEnv(name: string) {
  const value = process.env[name]
  if (value == null) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function requireEnv(name: string) {
  const value = readEnv(name)
  if (!value) {
    throw new Error(`${name} is not set. Add it to .env.local and to the host environment.`)
  }
  return value
}

export function getAuthSecret() {
  const secret = readEnv('AUTH_SECRET')
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production.')
  }
  return 'dev-only-auth-secret-change-me'
}

export function getAppUrl() {
  return readEnv('AUTH_URL') ?? readEnv('NEXT_PUBLIC_APP_URL')
}

export function getInviteStarterPassword() {
  const password = readEnv('INVITE_STARTER_PASSWORD') ?? readEnv('SEED_STAFF_PASSWORD')
  if (password) return password
  if (process.env.NODE_ENV === 'production') {
    throw new Error('INVITE_STARTER_PASSWORD is required in production.')
  }
  return 'Workhub123!'
}
