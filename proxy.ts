import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

const publicPrefixes = ['/login', '/api/auth']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  const hasSessionCookie = Boolean(getSessionCookie(request))
  const isServerAction = Boolean(request.headers.get('next-action') || request.headers.get('Next-Action'))
  const isMutating = request.method !== 'GET' && request.method !== 'HEAD'

  if (isPublic) {
    return NextResponse.next()
  }

  if (!hasSessionCookie && !isServerAction && !isMutating) {
    const login = new URL('/login', request.url)
    login.searchParams.set('callbackUrl', pathname + request.nextUrl.search)
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
