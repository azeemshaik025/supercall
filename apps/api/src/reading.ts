// A linked caller's post becomes a call, a close, or "not a call" with the reason (spec, "The AI's
// rules"). Claude reads it; code checks every number against the post's own words; a second Claude
// call looks for a reason the reading is wrong. If the two disagree, the post is not a call.
import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { NotACallReason } from '@supercall/api-schema'
import { type CallType, type Direction, inBand } from '@supercall/core'
import type OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { deadlineOf, readNumber } from './numbers'

/** The coins calls can be judged on: the worker's pools, WETH and cirBTC on Arc. */
export const COINS = ['ETH', 'BTC'] as const
export type Coin = (typeof COINS)[number]

const NAMES: Record<Coin, RegExp> = {
  ETH: /(?<![\p{L}\d])\$?(eth|ether|ethereum|weth)(?![\p{L}\d])/iu,
  BTC: /(?<![\p{L}\d])\$?(btc|bitcoin|xbt|wbtc|cirbtc)(?![\p{L}\d])/iu,
}
export const coinsIn = (text: string) => COINS.filter((c) => NAMES[c].test(text))

const number = z.object({ value: z.number(), unit: z.enum(['usd', 'percent']), words: z.string() })
const coin = { coin: z.enum(COINS), coinWords: z.string() }
const NOT_MEANT = [
  'joke',
  'sarcasm',
  'hypothetical',
  'someone-elses-call',
  'past-trade',
  'two-coins',
  'two-readings',
  'not-a-close',
] as const

export const readerOutput = z.object({
  answer: z.discriminatedUnion('verdict', [
    z.object({
      verdict: z.literal('call'),
      ...coin,
      direction: z.enum(['long', 'short']),
      directionWords: z.string(),
      entry: z.union([number, z.object({ low: number, high: number })]).nullable(),
      stop: number.nullable(),
      targets: z.array(number).min(1),
      deadlineWords: z.string(),
    }),
    z.object({ verdict: z.literal('close'), ...coin, closeWords: z.string() }),
    z.object({
      verdict: z.literal('not-a-call'),
      reason: z.enum([
        'no-coin',
        'no-direction',
        'no-target',
        'no-deadline',
        'leverage',
        'coin-vs-coin',
        'news',
        'holds-a-level',
        ...NOT_MEANT,
      ]),
      detail: z.string(),
    }),
  ]),
})

export const reviewerOutput = z.object({
  agrees: z.boolean(),
  problem: z
    .enum([...NOT_MEANT, 'misread-number', 'misread-direction', 'misread-deadline', 'other'])
    .nullable(),
  detail: z.string(),
})

type Answer = z.output<typeof readerOutput>['answer']
type CallAnswer = Extract<Answer, { verdict: 'call' }>
type Quoted = z.output<typeof number>

export type Post = {
  text: string
  /** Unix seconds, from the post's id. */
  postedAt: number
  receivedAt: number
  /** X sent it as an edit of an earlier post. */
  edited: boolean
}

/** One of the caller's calls that hasn't ended, in dollars. */
export type OpenCall = {
  key: string
  coin: Coin
  direction: Direction
  entry: number
  stop?: number
  target: number
}

/** A coin's price in its judging pool at a block: anyone can read the pool's `slot0` there again. */
export type Price = { price: number; at: string; block: number }

/** Asks the model one question; its answer comes back parsed by `schema`. */
export type Ask = <S extends z.ZodType>(
  role: 'reader' | 'reviewer',
  schema: S,
  system: string,
  user: string,
) => Promise<z.output<S>>

export type Context = {
  ask: Ask
  model: string
  /** The coin's price in its judging pool at the post's block. */
  priceAt: (coin: Coin) => Promise<Price | undefined>
  openCalls: OpenCall[]
}

/** A posted call's levels in dollars. `stop` is the caller's own; without one it's absent. */
export type PostedCall = {
  coin: Coin
  direction: Direction
  type: CallType
  entry: number
  bandPct: number
  stop?: number
  target: number
  deadline: number
}

/** Kept with the verdict, and on Arkiv as a call's `reading`. */
export type Reading = {
  model: string
  reader?: Answer
  reviewer?: z.output<typeof reviewerOutput>
  /** The price at the post: an enter-now call's entry, or what a percentage level is taken from. */
  price?: Price
  /** How code turned a percentage level into a price. */
  formulas?: { stop?: string; target?: string }
}

export type Verdict =
  | { kind: 'call'; call: PostedCall; reading: Reading }
  | { kind: 'close'; call: string; price: Price; reading: Reading }
  | { kind: 'not-a-call'; reason: NotACallReason; detail: string; reading: Reading }

/** The cheapest Claude model that answers the whole test set right (`read-posts.ts`). */
export const MODEL = 'claude-sonnet-5'

/** Read more than 10 minutes after posting, a caller could pick only the posts that went their way. */
export const TOO_LATE = 10 * 60
/** An enter-now call copies within ±0.5% of its entry (spec, "Entries"). */
const BAND = 0.005

export async function readPost(post: Post, ctx: Context): Promise<Verdict> {
  const reading: Reading = { model: ctx.model }
  const no = (reason: NotACallReason, detail: string): Verdict => ({
    kind: 'not-a-call',
    reason,
    detail,
    reading,
  })

  // The cheap filters: no AI for a post that can't be a call.
  if (post.edited) return no('edited-post', 'An edit of an earlier post, which stands as read')
  if (post.receivedAt - post.postedAt > TOO_LATE) {
    return no('too-late', 'Read more than 10 minutes after it was posted')
  }
  const coins = coinsIn(post.text)
  if (!coins.length) return no('no-coin', 'Names no coin we can judge: ETH or BTC')
  const open = ctx.openCalls.filter((c) => coins.includes(c.coin))
  // A close ("took profit on ETH") has no number, so a post on a coin with an open call goes on.
  if (!/\d/.test(post.text) && !open.length) return no('no-number', 'Has no number')
  const prices = new Map<Coin, Price>()
  for (const c of coins) {
    const price = await ctx.priceAt(c)
    if (!price) return no('no-price', `No ${c} price at the time of the post`)
    prices.set(c, price)
  }

  const { answer } = await ctx.ask('reader', readerOutput, READER, postMessage(post, prices))
  reading.reader = answer
  if (answer.verdict === 'not-a-call') return no(answer.reason, answer.detail)
  const price = prices.get(answer.coin)
  if (!price) return no('words-not-in-post', `Read as ${answer.coin}, which the post doesn't name`)

  let verdict: Verdict
  let recorded: string
  if (answer.verdict === 'close') {
    const missing = [answer.coinWords, answer.closeWords].find((w) => !post.text.includes(w))
    if (missing !== undefined) return no('words-not-in-post', `"${missing}" isn't in the post`)
    const closing = open.filter((c) => c.coin === answer.coin)
    const [only] = closing
    if (!only) return no('no-open-call', `No open ${answer.coin} call to close`)
    if (closing.length > 1) {
      return no('two-open-calls', `${closing.length} open ${answer.coin} calls; not clear which`)
    }
    verdict = { kind: 'close', call: only.key, price, reading }
    recorded = `Ends the caller's open ${only.direction} ${only.coin} call (entry ${usd(only.entry)}, target ${usd(only.target)}) at ${usd(price.price)}, the price at the post.`
  } else {
    const checked = checkCall(answer, post, price.price)
    if (!('call' in checked)) return no(checked.reason, checked.detail)
    reading.price = price
    if (Object.keys(checked.formulas).length) reading.formulas = checked.formulas
    verdict = { kind: 'call', call: checked.call, reading }
    recorded = describe(checked.call, answer)
  }

  const review = await ctx.ask(
    'reviewer',
    reviewerOutput,
    REVIEWER,
    `${postMessage(post, prices)}\n\nThe reading:\n${JSON.stringify(answer, null, 2)}\n\nAs it would be recorded: ${recorded}`,
  )
  reading.reviewer = review
  if (!review.agrees) return no(review.problem ?? 'other', review.detail)
  return verdict
}

type Checked =
  | { call: PostedCall; formulas: NonNullable<Reading['formulas']> }
  | { reason: NotACallReason; detail: string }

/** Every word the reader quoted is in the post, every number means what it says, the levels line up. */
function checkCall(a: CallAnswer, post: Post, price: number): Checked {
  const fail = (reason: NotACallReason, detail: string) => ({ reason, detail })
  const numbers = [
    ...(a.entry === null ? [] : 'low' in a.entry ? [a.entry.low, a.entry.high] : [a.entry]),
    ...(a.stop ? [a.stop] : []),
    ...a.targets,
  ]
  const quoted = [a.coinWords, a.directionWords, a.deadlineWords, ...numbers.map((n) => n.words)]
  const missing = quoted.find((w) => !w || !post.text.includes(w))
  if (missing !== undefined) return fail('words-not-in-post', `"${missing}" isn't in the post`)
  if (!NAMES[a.coin].test(a.coinWords)) {
    return fail('words-not-in-post', `"${a.coinWords}" doesn't name ${a.coin}`)
  }
  for (const n of numbers) {
    const read = readNumber(n.words)
    const same = read && read.unit === n.unit && Math.abs(read.value - n.value) < 1e-9
    if (!same) return fail('number-mismatch', `"${n.words}" doesn't read as ${n.value} ${n.unit}`)
  }

  // An entry written as a price, or a zone whose middle is the entry and whose half-width the band.
  let entry = price
  let bandPct = BAND
  if (a.entry && 'low' in a.entry) {
    const { low, high } = a.entry
    if (low.unit !== 'usd' || high.unit !== 'usd' || low.value >= high.value) {
      return fail('number-mismatch', 'An entry zone runs from one price up to another')
    }
    entry = (low.value + high.value) / 2
    // Rounded down to whole basis points, the unit a record stores it in.
    bandPct = Math.floor(((high.value - low.value) / 2 / entry) * 10_000) / 10_000
  } else if (a.entry) {
    if (a.entry.unit !== 'usd') return fail('number-mismatch', 'An entry is a price')
    entry = a.entry.value
  }

  // A percentage level is taken from the entry, on the side its role puts it.
  const sign = a.direction === 'long' ? 1 : -1
  const formulas: NonNullable<Reading['formulas']> = {}
  const level = (n: Quoted, role: 'stop' | 'target') => {
    if (n.unit === 'usd') return n.value
    const side = role === 'target' ? sign : -sign
    const written = /\+/.test(n.words) ? 1 : /[-−–]/.test(n.words) ? -1 : side
    if (written !== side) return undefined
    const pct = Math.abs(n.value)
    formulas[role] = `entry × (1 ${side > 0 ? '+' : '−'} ${pct}%)`
    return entry + (side * entry * pct) / 100
  }
  const stop = a.stop ? level(a.stop, 'stop') : undefined
  const targets = a.targets.map((t) => level(t, 'target'))
  const priced = targets.filter((t) => t !== undefined)
  // Several targets: the nearest is the call's (spec, "Kinds of calls").
  const [target] = priced.toSorted((x, y) => Math.abs(x - entry) - Math.abs(y - entry))
  const ordered =
    priced.length === targets.length &&
    priced.every((t) => sign * (t - entry) > 0) &&
    (a.stop === null || (stop !== undefined && sign * (entry - stop) > 0))
  if (!ordered || target === undefined) {
    return fail(
      'levels-out-of-order',
      sign > 0 ? 'A long needs stop < entry < target' : 'A short needs target < entry < stop',
    )
  }

  const deadline = deadlineOf(a.deadlineWords, post.postedAt)
  if (deadline === undefined) {
    return fail('unknown-deadline', `"${a.deadlineWords}" isn't a deadline we can time`)
  }
  if (deadline <= post.receivedAt) return fail('deadline-passed', 'Its deadline has passed')

  // A written entry the price isn't at waits for it, from either side: one past the price is a
  // breakout, scored but not copyable (core's `canMirror`).
  const type: CallType = !a.entry || inBand({ entry, bandPct }, price) ? 'open' : 'future-level'
  return {
    call: { coin: a.coin, direction: a.direction, type, entry, bandPct, stop, target, deadline },
    formulas,
  }
}

const usd = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
const when = (seconds: number) => new Date(seconds * 1000).toUTCString()
/** A deadline at midnight UTC reads as the end of the day before it, as the table puts it. */
const until = (seconds: number) =>
  seconds % 86_400 === 0
    ? `the end of ${new Date((seconds - 1) * 1000).toUTCString().slice(0, 16)} (UTC)`
    : when(seconds)

function postMessage(post: Post, prices: Map<Coin, Price>) {
  const at = [...prices].map(([c, p]) => `${c} ${usd(p.price)}`).join(', ')
  return `Posted ${when(post.postedAt)}. Prices then: ${at}.\n\n<post>\n${post.text}\n</post>`
}

function describe(c: PostedCall, a: CallAnswer) {
  const entry = a.entry ? usd(c.entry) : `${usd(c.entry)} (the price at the post)`
  const band = `±${(c.bandPct * 100).toFixed(2)}%`
  return [
    `${c.direction} ${c.coin}`,
    `entry ${entry} ${band}, ${c.type === 'open' ? 'entering now' : 'waiting for that price'}`,
    c.stop === undefined ? 'no stop' : `stop ${usd(c.stop)}`,
    `target ${usd(c.target)}`,
    `deadline ${until(c.deadline)}`,
  ].join(', ')
}

const READER = `You read one post by a crypto trading caller and decide whether it is a call: a public prediction we will score the caller on. Followers copy calls with real money, so you never guess.

A call needs four parts, all written in the post: the coin (ETH or BTC; nothing else can be judged), the direction (long, buy, up; or short, sell, down), a target price, and a deadline. An entry price and a stop are optional. An entry is not a target: "Long ETH 3,000 this week" names an entry and no target, so it is not a call (no-target). Never put a number in "targets" that the post doesn't give as a target.

How to answer:
1. Read only what the post says. Never invent, round or convert a number.
2. Every number comes with "words": the exact characters it was written in, copied from the post, and nothing else ("3.4k", "+10%", "$3,000"). "value" is that number as written: 3400 for "3.4k", 10 for "+10%", -5 for "-5%". "unit" is "usd" for a price, "percent" for a percentage.
3. "coinWords", "directionWords", "deadlineWords" and "closeWords" are also copied exactly from the post. Read the direction from the words even when the levels don't fit it: code checks the order of the levels. If the direction only shows in a phrase like "ETH to 3,400", copy that phrase as "directionWords" and use the price at the post to tell up from down.
4. "entry": null when the post writes no entry price; one number; or "low" and "high" for a zone ("2,950 to 3,000"). A breakout ("buy if ETH breaks 3,100") is a call whose entry is the level it breaks: 3,100.
5. "targets": every target price, in the order written (TP1, TP2).
6. "deadlineWords": the time words exactly as written ("today", "tomorrow", "this week", "in 24h", "by Friday", "3 days", "by Oct 20", "soon"). Copy them even when they're vague or the date has passed: code times them by a fixed table and decides. Only a post with no time words at all is not a call (no-deadline).
7. Disclaimers such as "NFA" or "DYOR" change nothing.
8. A post about closing or taking profit on a position the caller holds now is about a close, never a new call. Answer "close" when it says the position is closed now ("took profit on ETH", "closing my ETH here", "out of ETH"). A post that only thinks about closing, or is unclear, is not a call with reason not-a-close.

Otherwise it's not a call. Give the first reason that applies, in this order:
- joke, sarcasm: the caller doesn't mean it.
- someone-elses-call: a retweet or quote of another person's call.
- past-trade: a whole trade reported after the fact, with its prices ("sold my ETH from 2,900 at 3,100 yesterday"). A deadline that has passed is not a past trade: quote it as the deadline.
- hypothetical: "if X happens I'd…", without committing.
- leverage: the post sets leverage ("10x").
- coin-vs-coin: one coin against another ("ETH beats BTC", an ETH/BTC ratio).
- news: a prediction about an event rather than a price.
- holds-a-level: price stays above or below a level, with no target.
- two-coins: calls on more than one coin.
- no-coin, no-direction, no-target, no-deadline: a required part is missing; give the first missing one in that order. A post that gives prices but never says up or down ("BTC 110k or 90k by Friday") is no-direction, not two-readings.
- two-readings: a number or level could mean two different things ("SL 2,800 or 2,850").
"detail" is one short sentence saying why.`

const REVIEWER = `You check another reader's work. You get a crypto trading caller's post, how it was read, and exactly what would be recorded. Followers will copy this call with real money and the caller will be scored on it, so your job is to find a reason the reading is wrong.

Look for:
- a joke or sarcasm; a retweet or quote of someone else; a trade already finished; a hypothetical;
- calls on two coins; a level that could mean two different things;
- a number read wrong ("3.4k" as 34,000), the direction read wrong, or the deadline read wrong (check the recorded deadline against when the post was made);
- for a close, whether the post clearly says the position is closed now.

Code turns the deadline words into a deadline by a fixed public table, from the time of the post: "today" is 24 hours, "this week" 7 days, "this month" 30 days, a length ("in 24h", "3 days") exactly that, and "tomorrow", a weekday or a date the end of that day, UTC. Code also computes a percentage level from the entry, takes the nearest of several targets (TP1 before TP2) as the call's, fills a missing entry with the price at the post, and reads a breakout ("buy if ETH breaks 3,100") as a call waiting for that level. Those are the rules: don't object to them. Object to a deadline only when the words read aren't the post's time words.

A disclaimer ("NFA", "DYOR") is not a reason. A missing entry or stop is not a reason: both are optional, and code fills in the entry from the price at the post.

If the reading is right, answer agrees: true with problem null. Otherwise agrees: false, the problem, and one sentence of detail.`

/** Claude through structured outputs: the answer comes back parsed and checked against `schema`. */
export function claudeAsk(client: Anthropic, model: string): Ask {
  return async (role, schema, system, user) => {
    const message = await client.messages.parse({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { format: zodOutputFormat(schema) },
    })
    if (message.parsed_output == null) {
      throw new Error(`Claude gave the ${role} no answer (${message.stop_reason})`)
    }
    return message.parsed_output
  }
}

/**
 * OpenAI through structured outputs, the same contract as claudeAsk. Strict mode needs every
 * field present, which the reader's and reviewer's schemas already are (nullable, never optional).
 */
export function openaiAsk(client: OpenAI, model: string): Ask {
  return async (role, schema, system, user) => {
    const response = await client.responses.parse({
      model,
      instructions: system,
      input: user,
      text: { format: zodTextFormat(schema, role) },
    })
    if (response.output_parsed == null) {
      throw new Error(`${model} gave the ${role} no answer (${response.status})`)
    }
    return response.output_parsed as z.output<typeof schema>
  }
}
