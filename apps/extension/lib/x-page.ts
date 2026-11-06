// Every selector on X's page lives in this file. When X changes its markup, fix it here and
// save a fresh fixture (see README.md).

// Logged-in X marks tweets data-testid="tweet" and logged-out X doesn't, so only the tag is used.
const tweet = 'article'
// A tweet's own timestamp links to exactly /<handle>/status/<id>; photo and analytics links go deeper.
const statusPath = /^\/(\w{1,15})\/status\/(\d+)$/

export type Tweet = { id: string; author: string; article: HTMLElement }

export function findTweets(root: ParentNode): Tweet[] {
  return [...root.querySelectorAll<HTMLElement>(tweet)].flatMap((article) => {
    // Logged-out X draws a quoted tweet as an article inside the quoting one. Only the outer one counts.
    if (article.parentElement?.closest(tweet)) return []
    for (const link of article.querySelectorAll('a[href]')) {
      const [, author, id] = link.getAttribute('href')?.match(statusPath) ?? []
      if (author && id) return [{ id, author, article }]
    }
    return []
  })
}

/** The signed-in X account's handle, from X's own Profile link. Undefined when logged out. */
export const viewer = (doc: Document) =>
  doc
    .querySelector('a[data-testid="AppTabBar_Profile_Link"]')
    ?.getAttribute('href')
    ?.match(/^\/(\w{1,15})$/)?.[1]

/**
 * Where the Supercall badge goes: in the tweet's header row, before X's "More" (⋯) button.
 * Logged-out X has no such button; the card then shows open under the tweet.
 */
export const headerSlot = (article: HTMLElement) =>
  article.querySelector<HTMLElement>('[data-testid="caret"]')

// Profile pages. X keeps the header's parts as siblings: name, bio, details, follow counts.
const profileName = '[data-testid="UserName"]'
const followCounts = 'a[href$="/following"], a[href$="/verified_followers"]'
const profilePath = /^\/(\w{1,15})(?:\/(?:with_replies|media|likes|highlights|articles))?\/?$/

export type Profile = {
  x: string
  /** The display name: the SuperFactor badge goes right after it, on its row. */
  name: HTMLElement
  /** The header part the Supercall panel goes after: the follow counts, else the name. */
  after: HTMLElement
}

const isRow = (el: Element) => {
  const style = getComputedStyle(el)
  return style.display.includes('flex') && !style.flexDirection.startsWith('column')
}

/**
 * The header part with the name and "@handle". Logged-in X marks it; logged-out X has no test ids,
 * so it's the part holding the "@handle", outside any tweet, whose siblings hold the follow counts.
 */
function profileHeader(doc: Document, x: string) {
  const marked = doc.querySelector<HTMLElement>(profileName)
  if (marked) return marked
  const handle = `@${x.toLowerCase()}`
  let el: HTMLElement | null | undefined = [...doc.querySelectorAll<HTMLElement>('main span')].find(
    (s) => !s.closest(tweet) && s.textContent?.trim().toLowerCase() === handle,
  )
  while (el?.parentElement && !el.parentElement.querySelector(followCounts)) el = el.parentElement
  return el?.parentElement ? el : undefined
}

/** The profile on screen, if this page is one. */
export function findProfile(doc: Document, path: string): Profile | undefined {
  const [, x] = path.match(profilePath) ?? []
  const header = x ? profileHeader(doc, x) : undefined
  if (!x || !header) return undefined
  // The "@handle" line; the name block sits just before it.
  const at = [...header.querySelectorAll('span')].find(
    (s) => s.textContent?.trim().toLowerCase() === `@${x.toLowerCase()}`,
  )
  let line: Element | null | undefined = at
  while (line && line.parentElement !== header && !line.previousElementSibling)
    line = line.parentElement
  const block = line?.previousElementSibling ?? header.firstElementChild
  if (!block) return undefined
  // The first row in it holds the name, then X's own badges: ours goes after the name.
  const row = [block, ...block.querySelectorAll('div')].find(isRow)
  const name = (row?.firstElementChild ?? block) as HTMLElement
  const parts = [...(header.parentElement?.children ?? [])] as HTMLElement[]
  const after = parts.find((p) => p.querySelector(followCounts)) ?? header
  return { x, name, after }
}
