import type { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAMES = [
  'better-auth.session_token',
  '__Secure-better-auth.session_token',
  'better-auth.session_data',
  '__Secure-better-auth.session_data',
  'better-auth.dont_remember',
  '__Secure-better-auth.dont_remember',
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
]

export function expireAuthCookies(response: NextResponse, request: NextRequest) {
  const hostname = request.nextUrl.hostname
  const secure = request.nextUrl.protocol === 'https:'
  for (const name of COOKIE_NAMES) {
    response.cookies.set(name, '', {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    })
    if (hostname && hostname !== 'localhost') {
      response.cookies.set(name, '', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        domain: hostname,
      })
    }
  }
}
