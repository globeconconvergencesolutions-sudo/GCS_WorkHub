import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth/better-auth'
import { expireAuthCookies } from '@/lib/auth/expire-cookies'
import { getDb } from '@/lib/db'
import { authSession } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function safeRedirect(path: string | null) {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('://')) {
    return '/login?signedOut=1'
  }
  return path
}

async function handleLogout(request: NextRequest) {
  const redirectTo = safeRedirect(request.nextUrl.searchParams.get('redirect'))

  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (session?.user?.id) {
      await getDb().delete(authSession).where(eq(authSession.userId, session.user.id))
    } else {
      await auth.api.signOut({ headers: request.headers })
    }
  } catch {
    // Session row may already be gone. Still clear cookies.
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="0;url=${redirectTo.replaceAll('"', '')}" />
  <title>Signing out…</title>
</head>
<body>
  <p>Signing you out…</p>
  <script>location.replace(${JSON.stringify(redirectTo)})</script>
</body>
</html>`

  const response = new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
    },
  })
  expireAuthCookies(response, request)
  return response
}

export async function GET(request: NextRequest) {
  return handleLogout(request)
}

export async function POST(request: NextRequest) {
  return handleLogout(request)
}
