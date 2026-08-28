import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import authConfig from '@/auth.config'

const { auth } = NextAuth(authConfig)

const publicRoutes = ['/login']

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = Boolean(req.auth)
  const isAuthRoute = publicRoutes.some((route) => nextUrl.pathname.startsWith(route))
  const isApiAuth = nextUrl.pathname.startsWith('/api/auth')
  const isServerAction = Boolean(req.headers.get('next-action') || req.headers.get('Next-Action'))
  const isMutating = req.method !== 'GET' && req.method !== 'HEAD'

  if (isApiAuth) return NextResponse.next()

  if (!isLoggedIn && !isAuthRoute) {
    const callbackUrl = encodeURIComponent(nextUrl.pathname + nextUrl.search)
    return NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, nextUrl))
  }

  // Never intercept the login server action. After credentials succeed the
  // session cookie is already set; a 307 here breaks Next's action protocol
  // ("An unexpected response was received from the server").
  if (isLoggedIn && isAuthRoute && !isServerAction && !isMutating) {
    return NextResponse.redirect(new URL('/?view=Home', nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_vercel|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
}
