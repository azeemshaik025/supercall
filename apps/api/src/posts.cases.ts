// The test set: every post in the spec's "Kinds of calls" and "What a call needs", and the tricky
// ones, each with its exact answer. `reading.test.ts` runs it against recorded Claude answers;
// `read-posts.ts` runs it against Claude itself. Synthetic posts by a synthetic caller.
import { readFileSync } from 'node:fs'
import type { NotACallReason } from '@supercall/api-schema'
import type { CallType, Direction } from '@supercall/core'
import { z } from 'zod'
import { type Ask, type Coin, type OpenCall, readPost } from './reading'

/** Raj posts on Monday 26 October 2026 at 14:00:00 UTC, with ETH at 3,010 and BTC at 100,000. */
export const POSTED = Date.UTC(2026, 9, 26, 14) / 1000
export const PRICES: Record<Coin, number> = { ETH: 3010, BTC: 100_000 }

const HOUR = 3600
const after = (hours: number) => POSTED + hours * HOUR
const midnight = (october: number) => Date.UTC(2026, 9, october) / 1000

export type Expected =
  | {
      kind: 'call'
      coin: Coin
      direction: Direction
      type: CallType
      entry: number
      bandPct: number
      stop?: number
      target: number
      deadline: number
    }
  | { kind: 'close'; call: string; price: number }
  | { kind: 'not-a-call'; reason: NotACallReason }

export type Case = {
  /** Its row in the test set. */
  n: number
  text: string
  /** Raj's open calls when he posts. */
  open?: OpenCall[]
  /** Seconds from the post until we read it: 2 unless said. */
  late?: number
  edited?: boolean
  /** The coin's price at the post, when it isn't PRICES'. */
  price?: number
  expect: Expected
}

const call = (
  levels: Partial<Extract<Expected, { kind: 'call' }>> & { target: number; deadline: number },
): Expected => ({
  kind: 'call',
  coin: 'ETH',
  direction: 'long',
  type: 'open',
  entry: 3000,
  bandPct: 0.005,
  ...levels,
})
const not = (reason: NotACallReason): Expected => ({ kind: 'not-a-call', reason })

const RAJS_ETH: OpenCall = {
  key: `0x${'e1'.repeat(32)}`,
  coin: 'ETH',
  direction: 'long',
  entry: 3000,
  stop: 2850,
  target: 3400,
}
const full = 'Long ETH 3,000, SL 2,850, TP 3,400'
const plan = { stop: 2850, target: 3400 }

export const CASES: Case[] = [
  // Kinds of calls, as the spec writes them.
  { n: 1, text: `${full}, 3 days`, expect: call({ ...plan, deadline: after(72) }) },
  {
    n: 2,
    text: 'ETH to 3,400 in 24h',
    expect: call({ entry: 3010, target: 3400, deadline: after(24) }),
  },
  { n: 3, text: 'Buy 2,950 to 3,000', expect: not('no-coin') },
  { n: 4, text: 'TP1 3,200, TP2 3,400', expect: not('no-coin') },
  { n: 5, text: 'Buy if ETH breaks 3,100', expect: not('no-target') },
  { n: 6, text: 'Short ETH', expect: not('no-number') },
  { n: 7, text: 'ETH looks bullish', expect: not('no-number') },
  { n: 8, text: 'ETH stays above 3,000 this week', expect: not('holds-a-level') },
  { n: 9, text: 'ETH beats BTC this week', expect: not('no-number') },
  { n: 10, text: 'ETF approved by Friday', expect: not('no-coin') },
  { n: 11, text: '10x long ETH', expect: not('leverage') },
  // The same kinds, written as complete calls.
  {
    n: 12,
    text: 'Buy ETH 2,950 to 3,000, TP 3,400 this week',
    expect: call({
      type: 'future-level',
      entry: 2975,
      bandPct: 0.0084,
      target: 3400,
      deadline: after(168),
    }),
  },
  {
    n: 13,
    text: 'Long ETH, TP1 3,200, TP2 3,400, this week',
    expect: call({ entry: 3010, target: 3200, deadline: after(168) }),
  },
  // A breakout waits for its entry from below: scored, not copyable (core's `canMirror`).
  {
    n: 14,
    text: 'Buy if ETH breaks 3,100, TP 3,400 this week',
    expect: call({ type: 'future-level', entry: 3100, target: 3400, deadline: after(168) }),
  },
  {
    n: 15,
    text: 'Short ETH 3,000, TP 2,700 this week',
    expect: call({ direction: 'short', target: 2700, deadline: after(168) }),
  },
  { n: 16, text: 'ETH beats BTC this week, ETH/BTC to 0.035', expect: not('coin-vs-coin') },
  { n: 17, text: 'ETH ETF gets approved by Friday, 100%', expect: not('news') },
  { n: 18, text: '10x long ETH 3,000, TP 3,400 this week', expect: not('leverage') },
  // What a call needs.
  { n: 19, text: 'Long 3,000, SL 2,850, TP 3,400 this week', expect: not('no-coin') },
  { n: 20, text: 'ETH this week: 3,400 or 2,700', expect: not('no-direction') },
  { n: 21, text: 'Long ETH 3,000 this week', expect: not('no-target') },
  { n: 22, text: full, expect: not('no-deadline') },
  {
    n: 23,
    text: 'Long ETH, SL 2,850, TP 3,400 this week',
    expect: call({ entry: 3010, ...plan, deadline: after(168) }),
  },
  // Each deadline phrase.
  { n: 24, text: `${full} today`, expect: call({ ...plan, deadline: after(24) }) },
  { n: 25, text: `${full} this week`, expect: call({ ...plan, deadline: after(168) }) },
  { n: 26, text: `${full} this month`, expect: call({ ...plan, deadline: after(720) }) },
  { n: 27, text: `${full} in 24h`, expect: call({ ...plan, deadline: after(24) }) },
  { n: 28, text: `${full} by Friday`, expect: call({ ...plan, deadline: midnight(31) }) },
  { n: 29, text: `${full} tomorrow`, expect: call({ ...plan, deadline: midnight(28) }) },
  { n: 30, text: `${full} soon`, expect: not('unknown-deadline') },
  { n: 31, text: `${full} by Oct 20`, expect: not('deadline-passed') },
  // Tricky posts.
  {
    n: 32,
    text: "Long ETH 3,000, TP 3,400 by Friday. Kidding, I'm not touching this market.",
    expect: not('joke'),
  },
  { n: 33, text: "Sure, ETH to 3,400 in 24h, and I'm the Pope.", expect: not('sarcasm') },
  { n: 34, text: 'Long ETH and BTC, TP 3,400 and 110k this week', expect: not('two-coins') },
  {
    n: 35,
    text: `${full} this week. NFA, DYOR`,
    expect: call({ ...plan, deadline: after(168) }),
  },
  {
    n: 36,
    text: 'ETH to 3.4k this week',
    expect: call({ entry: 3010, target: 3400, deadline: after(168) }),
  },
  {
    n: 37,
    text: 'Long ETH 3,000, TP +10%, SL -5%, this week',
    expect: call({ stop: 2850, target: 3300, deadline: after(168) }),
  },
  {
    n: 38,
    text: 'Long ETH, TP +10% today',
    expect: call({ entry: 3010, target: 3311, deadline: after(24) }),
  },
  {
    n: 39,
    text: 'BTC to 110k by Friday',
    expect: call({ coin: 'BTC', entry: 100_000, target: 110_000, deadline: midnight(31) }),
  },
  { n: 40, text: 'Long ETH, SL 2,800 or 2,850, TP 3,400 this week', expect: not('two-readings') },
  {
    n: 41,
    text: 'Long ETH 3,000, SL 3,100, TP 3,400 this week',
    expect: not('levels-out-of-order'),
  },
  {
    n: 42,
    text: 'Long ETH 3,100, SL 2,950, TP 3,400 this week',
    expect: call({
      type: 'future-level',
      entry: 3100,
      stop: 2950,
      target: 3400,
      deadline: after(168),
    }),
  },
  {
    n: 43,
    text: 'RT @whale: Long ETH 3,000, TP 3,400 this week',
    expect: not('someone-elses-call'),
  },
  { n: 44, text: 'Sold my ETH from 2,900 at 3,100 yesterday, +7%', expect: not('past-trade') },
  { n: 45, text: 'Long SOL 150, TP 180 this week', expect: not('no-coin') },
  // Closes. Raj has one open ETH call.
  {
    n: 46,
    text: "Took profit on ETH here, I'm out.",
    open: [RAJS_ETH],
    price: 3210,
    expect: { kind: 'close', call: RAJS_ETH.key, price: 3210 },
  },
  {
    n: 47,
    text: "Might take some profit on ETH soon, let's see",
    open: [RAJS_ETH],
    expect: not('not-a-close'),
  },
  {
    n: 48,
    text: 'Closing my ETH here',
    open: [RAJS_ETH, { ...RAJS_ETH, key: `0x${'e2'.repeat(32)}`, entry: 2900 }],
    expect: not('two-open-calls'),
  },
  { n: 49, text: 'Closed my ETH', expect: not('no-number') },
  // How it arrived. Row 51, a post from an account that isn't linked, is the routes' to answer.
  { n: 50, text: `${full}, 3 days`, late: 11 * 60, expect: not('too-late') },
  { n: 52, text: `${full}, 3 days`, edited: true, expect: not('edited-post') },
]

/** Claude's answers to the test set, as `read-posts.ts --record` saved them. */
export const recordings = z
  .object({
    model: z.string(),
    cases: z.record(z.string(), z.object({ reader: z.unknown(), reviewer: z.unknown() }).partial()),
  })
  .parse(JSON.parse(readFileSync(new URL('./posts.recorded.json', import.meta.url), 'utf8')))

/** Claude as recorded answering row `n`. A question it wasn't recorded answering throws. */
export const replay =
  (n: number): Ask =>
  async (role, schema) => {
    const answer = recordings.cases[n]?.[role]
    if (answer === undefined) throw new Error(`row ${n} asked the ${role}, which has no recording`)
    return schema.parse(answer)
  }

/** Reads row `c` with `ask` as Claude, as of the test set's moment, and says what it came to. */
export async function runCase(c: Case, ask: Ask, model: string): Promise<Expected> {
  const v = await readPost(
    {
      text: c.text,
      postedAt: POSTED,
      receivedAt: POSTED + (c.late ?? 2),
      edited: c.edited ?? false,
    },
    {
      ask,
      model,
      priceAt: async (coin) => ({
        at: new Date(POSTED * 1000).toISOString(),
        price: c.price ?? PRICES[coin],
        block: 41_000_000,
      }),
      openCalls: c.open ?? [],
    },
  )
  if (v.kind === 'call') return { kind: 'call', ...v.call }
  if (v.kind === 'close') return { kind: 'close', call: v.call, price: v.price.price }
  return { kind: 'not-a-call', reason: v.reason }
}
