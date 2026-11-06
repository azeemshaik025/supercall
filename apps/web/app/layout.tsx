import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/lib/privy'
import './globals.css'

/** Where link previews point their images: the deployed site, or this machine in dev. */
const site =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://supercall.unitlabs.xyz'
    : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: 'Supercall',
  description: 'Trading calls where callers get paid only when they’re right.',
  icons: {
    icon: [
      { url: '/brand/favicon-dark.png', media: '(prefers-color-scheme: light)' },
      { url: '/brand/favicon-light.png', media: '(prefers-color-scheme: dark)' },
    ],
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Geist+Mono:wght@400&display=swap"
        />
      </head>
      <body className="min-h-screen text-sm antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
