// Posts from linked callers on X (spec, "How a call is made"): X's live feed, and the lookup the
// extension draws its cards from. Calls come only from the feed: a pasted link isn't read.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { notACallReason, type PostAnswer, postLookupRequest } from '@supercall/api-schema'
import {
  type Arkiv,
  type CallerRecord,
  type CallPayload,
  type CallRecord,
  fromMicroUsdc,
  toBps,
  toMicroUsdc,
} from '@supercall/arkiv'
import { CHAIN, poolOf, priceAt as poolPriceAt } from '@supercall/chains'
import { type CallStatus, canMirror, shareFor } from '@supercall/core'
import { type Db, posts, profiles } from '@supercall/db'
import { and, eq, inArray, isNotNull, isNull, type SQL, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { Hex, PublicClient } from 'viem'
import { z } from 'zod'
import { toCaller } from './callers'
import { isEntityKey, type PriceOf, type Snapshot, toCall } from './calls'
import type { Hisaab } from './hisaab'
import { type Ask, type Coin, type OpenCall, type Price, readPost, type Verdict } from './reading'

type Row = typeof posts.$inferSelect

export function postsOf(db: Db) {
  return {
    async claim(post: Pick<Row, 'id' | 'authorId' | 'postedAt' | 'text'>) {
      const claimed = await db
        .insert(posts)
        .values(post)
        .onConflictDoNothing()
        .returning({ id: posts.id })
      return claimed.length > 0
    },

    async release(id: string) {
      await db.delete(posts).where(and(eq(posts.id, id), isNull(posts.verdict)))
    },

    async record(
      id: string,
      read: Pick<Row, 'verdict'> & Partial<Pick<Row, 'reason' | 'reading' | 'call'>>,
    ) {
      await db
        .update(posts)
        .set({ ...read, text: null, readAt: new Date() })
        .where(eq(posts.id, id))
    },

    async deleted(id: string) {
      await db.update(posts).set({ deletedAt: new Date() }).where(eq(posts.id, id))
    },

    byIds: (ids: string[]) => db.select().from(posts).where(inArray(posts.id, ids)),
  }
}

/** X's post ids carry their time: milliseconds since X's epoch, above the low 22 bits. */
export const postedAt = (id: string) => Number((BigInt(id) >> 22n) + 1288834974657n) / 1000

const SYMBOLS: Record<Coin, string> = { ETH: 'WETH', BTC: 'cirBTC' }
const tokenOf = (coin: Coin) => {
  const token = CHAIN.tradeable.find((t) => t.symbol === SYMBOLS[coin])
  if (!token) throw new Error(`${SYMBOLS[coin]} isn't tradeable on ${CHAIN.name}`)
  return token
}
const coinOf = (assetAddress: string) =>
  (Object.keys(SYMBOLS) as Coin[]).find(
    (c) => tokenOf(c).address.toLowerCase() === assetAddress.toLowerCase(),
  )

export const priceIn =
  (arc: PublicClient) =>
  async (coin: Coin, seconds: number): Promise<Price | undefined> => {
    try {
      const { price, block } = await poolPriceAt(arc, poolOf(tokenOf(coin).address), seconds)
      return { price, block: Number(block), at: new Date(seconds * 1000).toISOString() }
    } catch (e) {
      console.error('no pool price', coin, seconds, e)
      return undefined
    }
  }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
export const fromHtml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, e: string) =>
    e.startsWith('#')
      ? String.fromCodePoint(Number(e[1] === 'x' || e[1] === 'X' ? `0${e.slice(1)}` : e.slice(1)))
      : (ENTITIES[e] ?? all),
  )

function sharedCall(links: string[], origins: string[]) {
  for (const link of links) {
    for (const origin of origins) {
      const key = link.startsWith(`${origin}/c/`) && link.slice(origin.length + 3).split(/[/?#]/)[0]
      if (key && isEntityKey(key)) return key
    }
  }
  return undefined
}

const jsonOf = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const signed = (secret: string, message: string) =>
  `sha256=${createHmac('sha256', secret).update(message).digest('base64')}`

const xEvent = z.object({
  data: z.discriminatedUnion('event_type', [
    z.object({
      event_type: z.literal('post.create'),
      payload: z.object({
        id: z.string().regex(/^\d{1,20}$/),
        author_id: z.string(),
        text: z.string(),
        edit_history_tweet_ids: z.array(z.string()).optional(),
        referenced_tweets: z.array(z.object({ type: z.string() })).optional(),
        entities: z
          .object({ urls: z.array(z.object({ expanded_url: z.string() })).optional() })
          .optional(),
      }),
    }),
    z.object({
      event_type: z.literal('post.delete'),
      payload: z.object({ id: z.string(), author_id: z.string() }),
    }),
  ]),
})

const OPEN = new Set<CallStatus>(['pending', 'armed', 'live'])
const detailOf = z.object({ detail: z.string() })
const closedAt = z.object({ price: z.object({ price: z.number(), at: z.string() }) })

type Progress = { written: boolean }

export type Incoming = {
  id: string
  authorId: string
  url: string
  text: string
  links: string[]
  edited: boolean
}

export function postRoutes(deps: {
  db: Db
  arkiv: Arkiv
  snapshot: Snapshot
  hisaab?: Hisaab
  ask?: Ask
  model: string
  priceAt: (coin: Coin, seconds: number) => Promise<Price | undefined>
  priceOf: PriceOf
  webOrigins: string[]
  xSecret?: string
  later?: (work: Promise<unknown>) => void
}) {
  const { db, arkiv, snapshot, hisaab, ask, priceAt, priceOf, webOrigins, xSecret } = deps
  const later =
    deps.later ??
    ((p: Promise<unknown>) => {
      p.catch(console.error)
    })
  const store = postsOf(db)
  const app = new Hono()

  const profileWhere = async (where: SQL) => (await db.select().from(profiles).where(where))[0]

  async function callerOf(where: SQL) {
    const profile = await profileWhere(where)
    const record = profile?.xUserId && (await arkiv.callerByWallet(profile.wallet as Hex))
    if (!profile?.xUserId || !record) return undefined
    return { xUserId: profile.xUserId, xUsername: profile.xUsername, record }
  }

  async function view(call: CallRecord) {
    const s = await snapshot.read()
    const handle = s.callerOf(call.caller)?.handle ?? ''
    return toCall(call, s.statusOf(call.key), handle, await priceOf(call.assetAddress))
  }

  async function openCalls(caller: Hex): Promise<OpenCall[]> {
    const s = await snapshot.read()
    const now = Date.now() / 1000
    return s.calls.flatMap((c) => {
      const coin = coinOf(c.assetAddress)
      const open =
        c.caller === caller && c.deadline > now && OPEN.has(s.statusOf(c.key)?.status ?? 'pending')
      if (!open || !coin) return []
      return [
        {
          key: c.key,
          coin,
          direction: c.direction,
          entry: fromMicroUsdc(c.entry),
          stop: c.stop === undefined ? undefined : fromMicroUsdc(c.stop),
          target: fromMicroUsdc(c.target),
        },
      ]
    })
  }

  async function answerOf(row: Row): Promise<PostAnswer> {
    const postId = row.id
    if (!row.verdict) return { kind: 'not-read-yet', postId }
    if (row.verdict === 'not-a-call') {
      const reason = notACallReason.safeParse(row.reason)
      const detail = detailOf.safeParse(row.reading)
      return {
        kind: 'not-a-call',
        postId,
        reason: reason.success ? reason.data : 'other',
        detail: detail.success ? detail.data.detail : '',
      }
    }
    const s = await snapshot.read()
    const call = row.call && isEntityKey(row.call) ? s.callOf(row.call) : undefined
    if (!call) return { kind: 'not-read-yet', postId }
    const record = s.callerOf(call.caller)
    const superFactor = record
      ? toCaller(
          record,
          s.calls.filter((c) => c.caller === record.key).length,
          s.settlementsOf(record.key),
        ).superFactor
      : undefined
    if (row.verdict === 'call') {
      const shown = await view(call)
      return { kind: 'call', postId, call: shown, superFactor, copyable: canMirror(shown) }
    }
    const closed = closedAt.parse(row.reading).price
    return {
      kind: 'close',
      postId,
      call: await view(call),
      superFactor,
      at: closed.at,
      price: closed.price,
    }
  }

  async function writeCall(
    post: Incoming,
    caller: CallerRecord,
    { call, reading }: Extract<Verdict, { kind: 'call' }>,
    progress: Progress,
  ) {
    const token = tokenOf(call.coin)
    const posted = Math.floor(postedAt(post.id))
    const sf = toCaller(caller, 0, (await snapshot.read()).settlementsOf(caller.key)).superFactor
    const payload: CallPayload = {
      v: 1,
      caller: caller.key,
      wallet: caller.wallet,
      source: 'x',
      post: {
        url: post.url,
        id: post.id,
        authorId: post.authorId,
        text: post.text,
        postedAt: posted,
      },
      reading,
      asset: token.symbol,
      assetAddress: token.address.toLowerCase() as Hex,
      chain: 'arc',
      type: call.type,
      direction: call.direction,
      entry: toMicroUsdc(call.entry),
      bandBps: toBps(call.bandPct),
      stop: call.stop === undefined ? undefined : toMicroUsdc(call.stop),
      target: toMicroUsdc(call.target),
      deadline: call.deadline,
      shareBps: toBps(shareFor(sf)),
      boostBps: 0,
      createdAt: posted,
    }
    progress.written = true
    const { key, fingerprint, txHash } = await arkiv.writeCall(payload)
    await store.record(post.id, { verdict: 'call', call: key, reading })
    const entering = payload.type === 'open'
    const status = {
      v: 2 as const,
      call: key,
      caller: caller.key,
      asset: payload.asset,
      status: entering ? ('live' as const) : ('armed' as const),
      supercall: false as const,
      superFactor: Math.floor(sf),
      boostBps: 0,
      followBand: 'low' as const,
      opposeBand: 'low' as const,
      ...(entering ? { entryFilledAt: posted } : {}),
    }
    const statusKey = await arkiv.writeStatus(status, payload.deadline)
    snapshot.stale()
    let registerTx: Hex | null = null
    if (hisaab) {
      try {
        registerTx = (await hisaab.registerCall({ ...payload, key, fingerprint })).transactionHash
      } catch (e) {
        console.error('posted call not registered yet', key, e)
      }
    }
    console.info('posted call written', { post: post.id, call: key, arkivTx: txHash, registerTx })
    const record = { ...payload, key, fingerprint }
    const price = await priceOf(payload.assetAddress)
    return {
      registerTx,
      call: toCall(record, { key: statusKey, ...status }, caller.handle, price),
    }
  }

  async function writeClose(
    post: Incoming,
    caller: CallerRecord,
    { call: callKey, price, reading }: Extract<Verdict, { kind: 'close' }>,
    progress: Progress,
  ): Promise<PostAnswer> {
    const s = await snapshot.read()
    const call = isEntityKey(callKey) ? s.callOf(callKey) : undefined
    if (!call) throw new Error(`closing ${callKey}, which isn't on record`)
    const posted = Math.floor(postedAt(post.id))
    progress.written = true
    await arkiv.writeClose(
      {
        v: 1,
        call: call.key,
        caller: caller.key,
        post: {
          url: post.url,
          id: post.id,
          authorId: post.authorId,
          text: post.text,
          postedAt: posted,
        },
        reading,
        price: toMicroUsdc(price.price),
        at: posted,
        pool: poolOf(call.assetAddress).address,
        block: price.block,
      },
      call.deadline,
    )
    await store.record(post.id, {
      verdict: 'close',
      call: call.key,
      reading: { ...reading, price },
    })
    const above =
      (call.direction === 'long' ? 1 : -1) * (price.price - fromMicroUsdc(call.entry)) > 0
    const ending = above ? 'expired-profit' : 'expired-loss'
    const status = s.statusOf(call.key)
    if (status) await arkiv.updateStatus(status.key, { status: ending })
    snapshot.stale()
    return {
      kind: 'close',
      postId: post.id,
      call: { ...(await view(call)), status: ending },
      at: price.at,
      price: price.price,
    }
  }

  async function read(
    post: Incoming,
    caller: CallerRecord,
    receivedAt: number,
    progress: Progress,
  ): Promise<{ answer: PostAnswer; registerTx: Hex | null }> {
    const postId = post.id
    const answered = (answer: PostAnswer) => ({ answer, registerTx: null })
    const shared = sharedCall(post.links, webOrigins)
    if (shared) {
      const call = await arkiv.call(shared)
      if (!call) {
        const detail = "Links to a call that isn't on record"
        await store.record(postId, {
          verdict: 'not-a-call',
          reason: 'no-such-call',
          reading: { detail },
        })
        return answered({ kind: 'not-a-call', postId, reason: 'no-such-call', detail })
      }
      await store.record(postId, { verdict: 'call', call: shared, reading: { shared: true } })
      return answered({ kind: 'call', postId, call: await view(call) })
    }
    if (!ask) throw new Error('no reader: set ANTHROPIC_API_KEY or OPENAI_API_KEY')

    const posted = Math.floor(postedAt(postId))
    const verdict = await readPost(
      { text: post.text, postedAt: posted, receivedAt, edited: post.edited },
      {
        ask,
        model: deps.model,
        priceAt: (coin) => priceAt(coin, posted),
        openCalls: await openCalls(caller.key),
      },
    )
    if (verdict.kind === 'call') {
      const { call, registerTx } = await writeCall(post, caller, verdict, progress)
      return { answer: { kind: 'call', postId, call }, registerTx }
    }
    if (verdict.kind === 'close') {
      return answered(await writeClose(post, caller, verdict, progress))
    }
    const { reason, detail } = verdict
    await store.record(postId, {
      verdict: 'not-a-call',
      reason,
      reading: { ...verdict.reading, detail },
    })
    return answered({ kind: 'not-a-call', postId, reason, detail })
  }

  async function claimAndRead(post: Incoming, caller: CallerRecord) {
    const receivedAt = Date.now() / 1000
    const claimed = await store.claim({
      id: post.id,
      authorId: post.authorId,
      postedAt: new Date(postedAt(post.id) * 1000),
      text: post.text,
    })
    if (!claimed) return undefined
    const progress = { written: false }
    try {
      return await read(post, caller, receivedAt, progress)
    } catch (e) {
      if (progress.written) console.error('post kept unread after its Arkiv write', post.id, e)
      else await store.release(post.id)
      throw e
    }
  }

  const small = bodyLimit({ maxSize: 64 * 1024 })

  app.post('/post-lookups', small, async (c) => {
    const body = postLookupRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success) {
      const detail = body.error.issues[0]?.message ?? 'Expected { posts: [{ id, author }] }'
      return c.json({ code: 'bad_request', detail }, 400)
    }
    const asked = body.data.posts
    const rows = new Map((await store.byIds(asked.map((p) => p.id))).map((r) => [r.id, r]))
    const unread = [
      ...new Set(asked.filter((p) => !rows.has(p.id)).map((p) => p.author.toLowerCase())),
    ]
    const lower = sql<string>`lower(${profiles.xUsername})`
    const linked = new Set(
      unread.length
        ? (
            await db
              .select({ handle: lower })
              .from(profiles)
              .where(and(isNotNull(profiles.xUserId), inArray(lower, unread)))
          ).map((p) => p.handle)
        : [],
    )
    const answers = await Promise.all(
      asked.map((p): Promise<PostAnswer> | PostAnswer => {
        const row = rows.get(p.id)
        if (row) return answerOf(row)
        const kind = linked.has(p.author.toLowerCase()) ? 'not-read-yet' : 'not-a-caller'
        return { kind, postId: p.id }
      }),
    )
    return c.json({ answers })
  })

  app.get('/x-events', (c) => {
    const token = c.req.query('crc_token')
    if (!xSecret) return c.json({ code: 'no_feed', detail: 'The live feed is off here' }, 503)
    if (!token) return c.json({ code: 'bad_request', detail: 'Expected crc_token' }, 400)
    return c.json({ response_token: signed(xSecret, token) })
  })

  app.post('/x-events', small, async (c) => {
    if (!xSecret) return c.json({ code: 'no_feed', detail: 'The live feed is off here' }, 503)
    const body = await c.req.text()
    const given = Buffer.from(c.req.header('x-twitter-webhooks-signature') ?? '')
    const expected = Buffer.from(signed(xSecret, body))
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      console.warn('X feed: bad signature', given.length ? 'given' : 'missing')
      return c.json({ code: 'bad_signature', detail: "X didn't sign this" }, 401)
    }
    const event = xEvent.safeParse(jsonOf(body))
    if (!event.success) {
      const json = jsonOf(body) as { data?: Record<string, unknown> } | null
      console.warn(
        'X feed: event not read at',
        event.error.issues[0]?.path.join('.'),
        'keys',
        Object.keys(json ?? {}).join(','),
        'data keys',
        Object.keys(json?.data ?? {}).join(','),
        'type',
        json?.data?.event_type,
      )
      return c.json({})
    }
    const { data } = event.data
    if (data.event_type === 'post.delete') {
      await store.deleted(data.payload.id)
      return c.json({})
    }
    const p = data.payload
    if (p.referenced_tweets?.some((r) => r.type === 'retweeted')) return c.json({})
    const caller = await callerOf(eq(profiles.xUserId, p.author_id))
    console.log('X feed: post', p.id, 'from', p.author_id, caller ? 'reading' : 'not a caller')
    if (!caller) return c.json({})
    const [first] = p.edit_history_tweet_ids ?? []
    const read = claimAndRead(
      {
        id: p.id,
        authorId: p.author_id,
        url: `https://x.com/${caller.xUsername ?? 'i'}/status/${p.id}`,
        text: fromHtml(p.text),
        links: p.entities?.urls?.map((u) => u.expanded_url) ?? [],
        edited: first !== undefined && first !== p.id,
      },
      caller.record,
    ).catch((e) => console.error('post not read', p.id, e))
    later(read)
    return c.json({})
  })

  return app
}
