'use client'

// The extension's Sign in: a small window on this site, so the extension shares the site's
// session instead of keeping its own. Signs in if needed, then closes itself.
import { usePrivy } from '@privy-io/react-auth'
import { useEffect, useRef } from 'react'
import { Button, Card } from '@/components/ui'

export default function ConnectPopup() {
  const { ready, authenticated, login } = usePrivy()
  const asked = useRef(false)
  useEffect(() => {
    if (!ready) return
    if (authenticated) {
      // A moment for the extension to read the session before the window goes.
      const timer = setTimeout(() => window.close(), 1200)
      return () => clearTimeout(timer)
    }
    if (!asked.current) {
      asked.current = true
      login()
    }
  }, [ready, authenticated, login])
  return (
    <Card className="mt-10 flex flex-col items-center gap-4 p-8 text-center">
      <img src="/brand/mark.svg" alt="" className="size-10" />
      {authenticated ? (
        <>
          <h1 className="text-[20px] font-medium tracking-[-0.02em]">You’re signed in</h1>
          <p className="text-[13px] text-muted">The extension uses this session. Closing…</p>
        </>
      ) : (
        <>
          <h1 className="text-[20px] font-medium tracking-[-0.02em]">Sign in to Supercall</h1>
          <p className="text-[13px] text-muted">One sign-in for the site and the extension.</p>
          <Button className="h-[46px] w-full" onClick={() => login()} disabled={!ready}>
            Sign in
          </Button>
        </>
      )}
    </Card>
  )
}
