import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { getMetadataBase } from '@/lib/env'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const metadataBase = getMetadataBase()

export const metadata: Metadata = {
  title: 'GCS WorkHub | Operational clarity for every team',
  description: 'GCS WorkHub is the single source of truth for responsibilities, tasks, deadlines, and department progress.',
  generator: 'GCS WorkHub',
  ...(metadataBase ? { metadataBase } : {}),
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#123056',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${inter.className}`}>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
