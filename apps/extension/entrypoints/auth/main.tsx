// Sign-in in a window of its own: Privy's X sign-in goes to X and back, which a side panel can't.
// When it's done the side panel is told to reload, and this window closes.
import { PrivyProvider, useLogin, usePrivy } from '@privy-io/react-auth'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { privyAppId, privyConfig } from '../../lib/privy'
import type { Message } from '../background'

function done() {
  void browser.runtime.sendMessage({ type: 'signed-in' } satisfies Message)
  window.close()
}

function SignIn() {
  const { ready, authenticated } = usePrivy()
  const [error, setError] = useState<string>()
  // Privy's own modal shows little when a sign-in fails; its error code says why.
  const { login } = useLogin({
    onComplete: done,
    onError: (code) => {
      console.error('Supercall sign-in failed:', code)
      setError(String(code))
    },
  })
  useEffect(() => {
    if (!ready) return
    if (authenticated) done()
    else login()
  }, [ready, authenticated, login])
  return (
    <main className="sc-panel sc-center">
      <p className="sc-muted">{ready ? 'Signing in…' : 'Loading…'}</p>
      {error && <p className="sc-bad sc-mono">Sign-in failed: {error}</p>}
      {ready && !authenticated && (
        <button type="button" className="sc-button" onClick={() => login()}>
          Sign in
        </button>
      )}
    </main>
  )
}

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <SignIn />
    </PrivyProvider>,
  )
