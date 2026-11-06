import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { createCallerLookup } from '../lib/caller'
import { type Call, createLookup, type Post } from '../lib/lookup'
import { savePending } from '../lib/pending'
import { SESSION_KEY } from '../lib/session'

declare const __API_URL__: string
declare const __WEB_ORIGIN__: string

export type Message =
  | { type: 'lookup'; posts: Post[] }
  | { type: 'copy'; id: string; call?: Call }
  | { type: 'session'; token: string | null }
  | { type: 'open'; path: string }
  | { type: 'theme'; dark: boolean }
  | { type: 'caller'; x: string }

// public/icon is the dark mark, for light toolbars and the manifest; public/icon-light the light one.
const icons = (dir: string) =>
  Object.fromEntries([16, 32, 48, 128].map((s) => [s, `/${dir}/${s}.png`]))

export default defineBackground(() => {
  const lookup = createLookup({ api: __API_URL__, fetch, storage: browser.storage.session })
  const callerOf = createCallerLookup({ api: __API_URL__, fetch })
  // The toolbar button opens the side panel: sign-in, wallet and copy live there.
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })

  browser.runtime.onMessage.addListener((message: Message, sender, reply) => {
    if (message.type === 'theme') {
      void browser.action.setIcon({ path: icons(message.dark ? 'icon-light' : 'icon') })
      return
    }
    if (message.type === 'caller') {
      callerOf(message.x).then(reply, (error) => {
        console.warn('Supercall caller lookup failed', error)
        reply(null)
      })
      return true
    }
    if (message.type === 'session') {
      // From the site's script: its sign-in, or null once signed out. The side panel reads it.
      void browser.storage.session.set({ [SESSION_KEY]: message.token })
      return
    }
    if (message.type === 'open') {
      // Sign-in, World ID and anything signed happen on the site, in a wallet-sized window,
      // where the session and wallet already are.
      browser.windows.create({
        url: `${__WEB_ORIGIN__}${message.path}`,
        type: 'popup',
        width: 420,
        height: 720,
      })
      return
    }
    if (message.type === 'copy') {
      const pending = { id: message.id, call: message.call, at: Date.now() }
      // Opened first, while the click still counts as the user's: Chrome opens a side panel
      // only in answer to one. The panel reads the call from storage when it loads.
      const windowId = sender.tab?.windowId
      const opened =
        windowId === undefined
          ? Promise.reject(new Error('no window'))
          : browser.sidePanel.open({ windowId })
      void savePending(browser.storage.session, pending)
      opened.catch((error) => {
        // Our site in a wallet-sized window, as before the side panel.
        console.warn('Supercall side panel did not open; opening the site', error)
        const url = `${__WEB_ORIGIN__}/m/${encodeURIComponent(message.id)}`
        browser.windows.create({ url, type: 'popup', width: 400, height: 720 })
      })
      return
    }
    lookup(message.posts).then(reply, (error) => {
      console.warn('Supercall lookup failed', error)
      reply({})
    })
    // Keeps the channel open for the reply, which comes after the lookup.
    return true
  })
})
