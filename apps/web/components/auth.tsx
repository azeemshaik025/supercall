'use client'

import { usePrivy, type User } from '@privy-io/react-auth'
import { type ReactNode, useState } from 'react'
import { Button, Card } from './ui'

export function userLabel(user: User | null): string {
  if (!user) return ''
  if (user.twitter?.username) return `@${user.twitter.username}`
  const address = user.wallet?.address
  if (address) return `${address.slice(0, 6)}…${address.slice(-4)}`
  return user.email?.address ?? 'Signed in'
}

export function SignInButton() {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const [open, setOpen] = useState(false)

  if (!ready) {
    return <span className="h-9 w-24 border border-line-strong bg-surface" aria-hidden="true" />
  }
  if (!authenticated) {
    return (
      <button
        type="button"
        onClick={() => login()}
        className="flex h-9 cursor-pointer items-center border border-line-strong bg-surface px-3.5 text-[13px] hover:bg-surface-2"
      >
        Sign in
      </button>
    )
  }
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={user?.wallet?.address}
        className="flex h-9 cursor-pointer items-center gap-2 border border-line-strong bg-surface px-3 text-[13px] hover:bg-surface-2"
      >
        <span className="size-1.5 rounded-full bg-good" aria-hidden="true" />
        <span className="font-mono">{userLabel(user)}</span>
      </button>
      {open && (
        <div className="surface-card absolute top-11 right-0 z-30 w-44 py-1 shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void logout()
            }}
            className="w-full cursor-pointer px-4 py-2 text-left text-[13px] text-muted hover:text-ink"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export function RequireAuth({ what, children }: { what: string; children: ReactNode }) {
  const { ready, authenticated, login } = usePrivy()
  if (!ready) return null
  if (authenticated) return <>{children}</>
  return (
    <Card className="mx-auto mt-16 max-w-md space-y-4 p-8 text-center">
      <h1 className="text-[20px] font-medium tracking-[-0.02em]">Sign in to {what}</h1>
      <p className="text-muted">Connect a wallet, or use email or X.</p>
      <Button onClick={() => login()} className="w-full">
        Sign in
      </Button>
    </Card>
  )
}
