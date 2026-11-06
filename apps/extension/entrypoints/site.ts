// Runs on the Supercall site (the manifest lists its origins, wxt.config.ts). Hands the site's
// sign-in to the extension whenever it changes, so the extension never asks to sign in again.
import { browser } from 'wxt/browser'
import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'
import { readSession } from '../lib/session'
import type { Message } from './background'

export default defineUnlistedScript(() => {
  let last: string | null | undefined
  const send = () => {
    const token = readSession(localStorage)
    if (token === last) return
    last = token
    void browser.runtime.sendMessage({ type: 'session', token } satisfies Message)
  }
  send()
  // Privy renews the token every so often while the site is open; pick each new one up.
  setInterval(send, 10_000)
  document.addEventListener('visibilitychange', send)
})
