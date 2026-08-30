'use client'

import { useEffect, useRef, useState } from 'react'

export function LoginSignedOutNotice({ signedOut }: { signedOut: boolean }) {
  const [toast, setToast] = useState(false)
  const shown = useRef(false)

  useEffect(() => {
    if (!signedOut || shown.current) return
    shown.current = true
    setToast(true)
    const timer = window.setTimeout(() => setToast(false), 4200)
    return () => window.clearTimeout(timer)
  }, [signedOut])

  return (
    <>
      {signedOut ? (
        <p className="mb-6 rounded-lg border border-slate-700/80 bg-slate-800/50 px-4 py-3 text-sm text-slate-300">
          Signed out. Enter your work email to sign in again — each person only sees the work they are allowed to see.
        </p>
      ) : null}
      {toast ? (
        <div
          role="status"
          className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(calc(100vw-2rem),22rem)] -translate-x-1/2 rounded-lg border border-emerald-500/30 bg-slate-900 px-4 py-3 text-center text-sm text-emerald-100 shadow-xl shadow-black/40"
        >
          You have been signed out
        </div>
      ) : null}
    </>
  )
}
