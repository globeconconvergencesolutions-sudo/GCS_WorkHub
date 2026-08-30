'use client'

const SIGN_OUT_STORAGE_KEY = 'gcs-workhub-signing-out'
const LOGIN_PATH = '/login'

function buildLoginUrl(signedOut = true) {
  return signedOut ? `${LOGIN_PATH}?signedOut=1` : LOGIN_PATH
}

const listeners = new Set<() => void>()
let signingOut = false

function emit() {
  for (const listener of listeners) listener()
}

export function subscribeSigningOut(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getSigningOutSnapshot() {
  return signingOut
}

export function getSigningOutServerSnapshot() {
  return false
}

export function markSigningOut() {
  signingOut = true
  try {
    sessionStorage.setItem(SIGN_OUT_STORAGE_KEY, '1')
  } catch {
    // Private browsing can block storage; in-memory state still drives the overlay.
  }
  emit()
}

export function clearSignOutState() {
  signingOut = false
  try {
    sessionStorage.removeItem(SIGN_OUT_STORAGE_KEY)
  } catch {
    // ignore
  }
  emit()
}

export function signOutToLogin() {
  markSigningOut()
  const login = buildLoginUrl(true)
  const url = `/api/auth/logout?redirect=${encodeURIComponent(login)}&t=${Date.now()}`
  window.setTimeout(() => {
    window.location.replace(url)
  }, 90)
}

export function hydrateSigningOutFromStorage() {
  if (typeof window === 'undefined') return
  if (window.location.pathname.startsWith(LOGIN_PATH)) {
    clearSignOutState()
    return
  }
  try {
    if (sessionStorage.getItem(SIGN_OUT_STORAGE_KEY) === '1') {
      signingOut = true
      emit()
    }
  } catch {
    // ignore
  }
}
