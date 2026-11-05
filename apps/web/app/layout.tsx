import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Supercall',
  description: "Trading calls where callers get paid only when they're right.",
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
      <body className="min-h-screen text-sm antialiased">{children}</body>
    </html>
  )
}
