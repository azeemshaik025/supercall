import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { Badge, Card, type Shown } from '../components/card'
import { ProfileBadge, ProfilePanel } from '../components/profile'
import type { Caller } from '../lib/caller'
import '../components/card.css'
import { createQueue } from '../lib/queue'
import { contentInset, findProfile, findTweets, headerSlot, viewer } from '../lib/x-page'
import type { Message } from './background'

declare const __WEB_ORIGIN__: string
declare const __BUILD__: string

const card = 'supercall-card'
const badge = 'supercall-badge'
const profileBadge = 'supercall-profile-badge'
const panel = 'supercall-profile'

/** X's theme from its background: white is light, navy (#15202b) is dim, black is lights out. */
function theme() {
  const [r = 0, g = 0, b = 0] = (
    getComputedStyle(document.body).backgroundColor.match(/\d+/g) ?? []
  )
    .slice(0, 3)
    .map(Number)
  if (0.299 * r + 0.587 * g + 0.114 * b > 128) return 'light'
  return r + g + b > 40 ? 'dim' : 'dark'
}
// The toolbar follows the browser's theme, not X's: dark toolbars get the light icon.
function toolbarIcon() {
  const dark = matchMedia('(prefers-color-scheme: dark)')
  const send = () =>
    browser.runtime.sendMessage({ type: 'theme', dark: dark.matches } satisfies Message)
  void send()
  dark.addEventListener('change', send)
  return () => dark.removeEventListener('change', send)
}
// The calls on the page by id, so Copy hands the side panel the call it was drawn from.
const shownCalls = new Map<string, Extract<Shown, { kind: 'call' | 'close' }>['call']>()
const copy = (id: string) =>
  browser.runtime.sendMessage({ type: 'copy', id, call: shownCalls.get(id) } satisfies Message)

export default defineContentScript({
  matches: ['https://x.com/*'],
  // Styles the card imports go inside its shadow root, where X's styles can't reach.
  cssInjectionMode: 'ui',
  main(ctx) {
    // Which build is running on this page: X's console shows it.
    console.info(`Supercall extension ${__BUILD__}`)
    // X drops tweets that scroll away and redraws them on the way back, as new elements.
    const asked = new WeakSet<HTMLElement>()
    const latest = new Map<string, HTMLElement>()
    const authors = new Map<string, string>()
    const drawn = new Set<{ shadowHost: HTMLElement; remove(): void }>()

    type Ui = Awaited<ReturnType<typeof createShadowRootUi>>
    const track = (ui: Ui) => {
      ui.shadowHost.dataset.theme = theme()
      drawn.add(ui)
      return ui
    }
    const render = (node: ReactNode) => ({
      onMount: (container: HTMLElement) => {
        const root = createRoot(container)
        root.render(node)
        return root
      },
      onRemove: (root?: ReturnType<typeof createRoot>) => root?.unmount(),
    })

    // After the tweet, not inside it: X lays a tweet out in a row and opens it on any click.
    async function drawCard(article: HTMLElement, answer: Shown) {
      if (answer.kind !== 'not-a-call') shownCalls.set(answer.call.id, answer.call)
      const me = viewer(document)?.toLowerCase()
      const mine = me !== undefined && authors.get(answer.postId)?.toLowerCase() === me
      const ui = await createShadowRootUi(ctx, {
        name: card,
        position: 'inline',
        anchor: article,
        append: 'after',
        ...render(<Card answer={answer} web={__WEB_ORIGIN__} onCopy={copy} mine={mine} />),
      })
      ui.mount()
      // Line the card up with the tweet's content, past the avatar in a timeline, and keep it
      // lined up as X resizes the column.
      const align = () => {
        if (!ui.shadowHost.isConnected) return sizes.disconnect()
        const inset = contentInset(article)
        if (inset !== undefined) ui.shadowHost.style.setProperty('--sc-inset', `${inset}px`)
      }
      align()
      const sizes = new ResizeObserver(align)
      sizes.observe(article)
      ctx.onInvalidated(() => sizes.disconnect())
      return track(ui)
    }

    async function draw(id: string, answer: Shown) {
      const article = latest.get(id)
      if (!article?.isConnected) return
      const slot = headerSlot(article)
      // A call gets a badge in the header that opens the card; without a header slot, or for a
      // post that isn't a call, the card or note shows as it is.
      if (answer.kind === 'not-a-call' || !slot) {
        if (article.nextElementSibling?.localName !== card) await drawCard(article, answer)
        return
      }
      if (article.querySelector(badge)) return
      let open: Ui | undefined
      const ui: Ui = await createShadowRootUi(ctx, {
        name: badge,
        position: 'inline',
        anchor: slot,
        append: 'before',
        onMount: (container) => {
          const root = createRoot(container)
          const paint = () =>
            root.render(
              <Badge
                open={open !== undefined}
                onToggle={async () => {
                  if (open) {
                    open.remove()
                    drawn.delete(open)
                    open = undefined
                  } else {
                    open = await drawCard(article, answer)
                  }
                  paint()
                }}
              />,
            )
          paint()
          return root
        },
        onRemove: (root) => root?.unmount(),
      })
      ui.mount()
      ui.shadowHost.style.display = 'inline-flex'
      // X opens the tweet on a click anywhere in it.
      ui.shadowHost.addEventListener('click', (e) => e.stopPropagation())
      track(ui)
    }

    const ask = createQueue(
      (posts) => browser.runtime.sendMessage({ type: 'lookup', posts } satisfies Message),
      (id, answer) => {
        if (answer.kind !== 'not-a-caller') draw(id, answer)
      },
    )
    // A caller's X profile: the SuperFactor badge by the name, and their record under the
    // follow counts. X swaps profiles without a page load, so each scan checks whose it is.
    let profileUis: Ui[] = []
    // Whose profile was last asked about, and what came back.
    let checked = ''
    let found: Caller | null = null
    let busy = false
    async function drawProfile() {
      // One at a time: the next scan picks up whatever changed meanwhile.
      if (busy) return
      busy = true
      try {
        await showProfile()
      } finally {
        busy = false
      }
    }
    async function showProfile() {
      const profile = findProfile(document, location.pathname)
      const x = profile?.x.toLowerCase() ?? ''
      const intact = profileUis.length > 0 && profileUis.every((ui) => ui.shadowHost.isConnected)
      if (x === checked && (!found || intact)) return
      for (const ui of profileUis) {
        ui.remove()
        drawn.delete(ui)
      }
      profileUis = []
      if (!profile) return
      if (x !== checked) {
        found = await browser.runtime
          .sendMessage({ type: 'caller', x } satisfies Message)
          .then((c: Caller | null) => c ?? null)
          .catch(() => null)
        checked = x
      }
      const caller = found
      // Moved on while asking, or not a caller.
      const now = findProfile(document, location.pathname)
      if (!caller || now?.x.toLowerCase() !== x || profileUis.length > 0) return
      const badgeUi = await createShadowRootUi(ctx, {
        name: profileBadge,
        position: 'inline',
        anchor: now.name,
        append: 'after',
        ...render(<ProfileBadge caller={caller} web={__WEB_ORIGIN__} />),
      })
      badgeUi.mount()
      badgeUi.shadowHost.style.display = 'inline-flex'
      badgeUi.shadowHost.style.alignItems = 'center'
      const panelUi = await createShadowRootUi(ctx, {
        name: panel,
        position: 'inline',
        anchor: now.after,
        append: 'after',
        ...render(<ProfilePanel caller={caller} web={__WEB_ORIGIN__} />),
      })
      panelUi.mount()
      profileUis = [track(badgeUi), track(panelUi)]
    }

    const scan = () => {
      void drawProfile()
      // Let go of what X threw away: WXT's autoMount can't watch an element anchor.
      for (const [id, article] of latest) {
        if (article.isConnected) continue
        latest.delete(id)
        authors.delete(id)
      }
      for (const ui of drawn) {
        if (ui.shadowHost.isConnected) continue
        ui.remove()
        drawn.delete(ui)
      }
      for (const { id, author, article } of findTweets(document)) {
        if (asked.has(article)) continue
        asked.add(article)
        latest.set(id, article)
        authors.set(id, author)
        ask({ id, author })
      }
    }
    const observer = new MutationObserver(scan)
    observer.observe(document.body, { childList: true, subtree: true })
    ctx.onInvalidated(() => observer.disconnect())
    ctx.onInvalidated(toolbarIcon())
    scan()
  },
})
