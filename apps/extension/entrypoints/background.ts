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

/** Whether a side panel of ours is open; true when the browser can't say, so Chrome never gets two. */
async function panelShowing() {
  const runtime = browser.runtime as unknown as {
    getContexts?: (filter: { contextTypes: string[] }) => Promise<unknown[]>
  }
  if (!runtime.getContexts) return true
  return runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).then(
    (found) => found.length > 0,
    () => true,
  )
}

/** The panel as a small window, brought forward if it's already open. */
let panelWindow: number | undefined
async function openPanelWindow() {
  if (panelWindow !== undefined) {
    const focused = await browser.windows.update(panelWindow, { focused: true }).catch(() => null)
    if (focused) return
  }
  const made = await browser.windows.create({
    url: browser.runtime.getURL('/sidepanel.html'),
    type: 'popup',
    width: 400,
    height: 760,
  })
  panelWindow = made?.id
}

export default defineBackground(() => {
  const lookup = createLookup({ api: __API_URL__, fetch, storage: browser.storage.session })
  const callerOf = createCallerLookup({ api: __API_URL__, fetch })
  // The toolbar button opens the panel: account, wallet and copies. Chrome shows it as a side
  // panel. Arc and some other Chromium browsers take the side panel calls but never show one,
  // so when no panel is up a moment later, the same page opens as a small window instead.
  // Chrome remembers the old "open the panel on click" setting, which would skip this handler.
  void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {})
  browser.action.onClicked.addListener((tab) => {
    const opened =
      tab.windowId !== undefined && browser.sidePanel?.open
        ? browser.sidePanel.open({ windowId: tab.windowId }).then(
            () => true,
            () => false,
          )
        : Promise.resolve(false)
    void opened.then(async (ok) => {
      if (ok) {
        await new Promise((r) => setTimeout(r, 600))
        if (await panelShowing()) return
      }
      await openPanelWindow()
    })
  })

  browser.runtime.onMessage.addListener((message: Message, _sender, reply) => {
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
      // Copy goes straight to the copy sheet: the Supercall site in a wallet-sized window, where
      // the sign-in and wallet are, so the follower signs right there. The call is kept for the
      // side panel too, which shows the order filling if it's open.
      void savePending(browser.storage.session, {
        id: message.id,
        call: message.call,
        at: Date.now(),
      })
      browser.windows.create({
        url: `${__WEB_ORIGIN__}/m/${encodeURIComponent(message.id)}`,
        type: 'popup',
        width: 420,
        height: 760,
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
