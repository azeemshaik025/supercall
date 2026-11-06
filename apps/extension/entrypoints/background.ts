import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { createCallerLookup } from '../lib/caller'
import { createLookup, type Post } from '../lib/lookup'

declare const __API_URL__: string
declare const __WEB_ORIGIN__: string

export type Message =
  | { type: 'lookup'; posts: Post[] }
  | { type: 'copy'; id: string }
  | { type: 'theme'; dark: boolean }
  | { type: 'caller'; x: string }

// public/icon is the dark mark, for light toolbars and the manifest; public/icon-light the light one.
const icons = (dir: string) =>
  Object.fromEntries([16, 32, 48, 128].map((s) => [s, `/${dir}/${s}.png`]))

export default defineBackground(() => {
  const lookup = createLookup({ api: __API_URL__, fetch, storage: browser.storage.session })
  const callerOf = createCallerLookup({ api: __API_URL__, fetch })

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
    if (message.type === 'copy') {
      // Our site in a wallet-sized window. Not an extension page: browser wallets only reach a
      // site's own window, so the browser's address bar stays.
      const url = `${__WEB_ORIGIN__}/m/${encodeURIComponent(message.id)}`
      browser.windows.create({ url, type: 'popup', width: 400, height: 720 })
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
