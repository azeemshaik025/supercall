// Calls read from Arkiv, served as core's `Call` (arkiv/schema.md, "From record to screen").

import { callResponse } from '@supercall/api-schema'
import {
  type Arkiv,
  type CallRecord,
  fromBps,
  fromMicroUsdc,
  type StatusRecord,
} from '@supercall/arkiv'
import { type Call, type CallStatus, suggestedStop } from '@supercall/core'
import { Hono } from 'hono'

/** The live price of a coin by its token address, if Flash lists it. */
export type PriceOf = (assetAddress: string) => Promise<number | undefined>

const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

export const isEntityKey = (s: string): s is `0x${string}` => /^0x[0-9a-f]{64}$/.test(s)

export function toCall(
  call: CallRecord,
  status: StatusRecord | undefined,
  handle: string,
  price: number | undefined,
): Call {
  return {
    id: call.key,
    caller: handle,
    asset: call.asset,
    assetAddress: call.assetAddress,
    quote: 'USDC',
    chain: call.chain,
    type: call.type,
    direction: call.direction,
    entry: fromMicroUsdc(call.entry),
    bandPct: fromBps(call.bandBps),
    // Without the caller's own stop, screens show the suggested one, labelled by `stopSuggested`.
    stop:
      call.stop === undefined
        ? suggestedStop({
            direction: call.direction,
            entry: fromMicroUsdc(call.entry),
            target: fromMicroUsdc(call.target),
          })
        : fromMicroUsdc(call.stop),
    stopSuggested: call.stop === undefined,
    target: fromMicroUsdc(call.target),
    // ponytail: the entry stands in when Flash doesn't list the coin; the call page streams the
    // live price itself.
    price: price ?? fromMicroUsdc(call.entry),
    status: status?.status ?? 'pending',
    thesis: call.source === 'app' ? call.thesis : call.post.text,
    createdAt: iso(call.createdAt),
    entryFilledAt: status?.entryFilledAt === undefined ? undefined : iso(status.entryFilledAt),
    expiresAt: iso(call.deadline),
    arkivKey: call.key,
    followBand: status?.followBand ?? 'low',
    opposeBand: status?.opposeBand ?? 'low',
    shareApplied: fromBps(call.shareBps),
    supercall: status?.supercall ?? false,
    boost: call.boostBps ? fromBps(call.boostBps) : undefined,
  }
}

const isCallStatus = (s: string): s is CallStatus => callResponse.shape.status.safeParse(s).success

/**
 * Arkiv as one snapshot, read at most once a minute per API instance. Every screen is served
 * from it, so a page view costs no Arkiv queries of its own (Arkiv bills each query, and
 * `getEntity` as one; arkiv/friction.md). A write through this instance marks it stale, so the
 * writer sees their record at once.
 */
// ponytail: per instance, so another instance shows a new record up to a minute late. Past a
// handful of instances, cache in Postgres (the spec allows "an optional cache of Arkiv data").
/** `voided`: the calls the void watch found void, from Postgres. */
export function arkivSnapshot(
  arkiv: Pick<Arkiv, 'snapshot'>,
  voided = async (): Promise<string[]> => [],
  maxAgeMs = 60_000,
) {
  let readAt = 0
  type Read = Awaited<ReturnType<Arkiv['snapshot']>> & { voided: string[] }
  let current: Promise<Read> | undefined
  // The last read that worked. Arkiv's reads sometimes time out; until one works again, pages
  // show this instead of failing.
  let good: Read | undefined
  async function read() {
    if (!current || Date.now() - readAt > maxAgeMs) {
      readAt = Date.now()
      current = Promise.all([arkiv.snapshot(), voided()]).then(([s, v]) => ({ ...s, voided: v }))
      current.then(
        (s) => {
          good = s
        },
        (e: unknown) => {
          // The next request tries again.
          readAt = 0
          console.error(
            'Arkiv read failed; serving the last good one:',
            (e as Error).message?.split('\n')[0],
          )
        },
      )
    }
    const s = await current.catch((e) => {
      if (good) return good
      throw e
    })
    const callers = new Map(s.callers.map((c) => [c.key, c]))
    const calls = new Map(s.calls.map((c) => [c.key, c]))
    // A settled call shows the ending its settlement record gives, and a voided one void until
    // then; its status record isn't patched (arkiv/schema.md, "status").
    const endings = new Map<string, CallStatus>(s.voided.map((call) => [call, 'void']))
    for (const st of s.settlements) endings.set(st.call, st.ending.kind)
    const settled = s.statuses.map((st) => ({ ...st, status: endings.get(st.call) ?? st.status }))
    const statuses = new Map(settled.map((st) => [st.call, st]))
    const settlementsBy = new Map<`0x${string}`, typeof s.settlements>()
    for (const st of s.settlements) {
      settlementsBy.set(st.caller, [...(settlementsBy.get(st.caller) ?? []), st])
    }
    return {
      ...s,
      statuses: settled,
      callerOf: (key: `0x${string}`) => callers.get(key),
      callOf: (key: `0x${string}`) => calls.get(key),
      statusOf: (callKey: `0x${string}`) => statuses.get(callKey),
      /** Every settlement of this caller's, for their score (`toCaller`). */
      settlementsOf: (callerKey: `0x${string}`) => settlementsBy.get(callerKey) ?? [],
    }
  }
  return {
    read,
    stale: () => {
      readAt = 0
    },
  }
}
export type Snapshot = ReturnType<typeof arkivSnapshot>

/** Screen calls for these records, newest first. A call whose caller isn't on record is left out. */
export async function screenCalls(
  records: { call: CallRecord; status: StatusRecord | undefined }[],
  handleOf: (callerKey: `0x${string}`) => string | undefined,
  priceOf: PriceOf,
) {
  const calls = await Promise.all(
    records.map(async ({ call, status }) => {
      const handle = handleOf(call.caller)
      if (handle === undefined) return []
      return [toCall(call, status, handle, await priceOf(call.assetAddress))]
    }),
  )
  return calls.flat().sort((a, b) => (position(a) < position(b) ? 1 : -1))
}

// A call's place in the newest-first order, and the cursor that resumes after it. ISO times
// have a fixed width, so comparing these strings compares (createdAt, id).
const position = (call: Call) => `${call.createdAt}~${call.id}`

/** One page of calls sorted newest first, or undefined when `limit` isn't 1 to 200. */
export function pageOf(calls: Call[], limit = '50', cursor?: string) {
  const size = Number(limit)
  if (!Number.isInteger(size) || size < 1 || size > 200) return undefined
  const rest = cursor ? calls.filter((call) => position(call) < cursor) : calls
  const shown = rest.slice(0, size)
  const last = shown.at(-1)
  return { calls: shown, next: rest.length > size && last ? position(last) : null }
}

export function callRoutes(arkiv: Arkiv, priceOf: PriceOf, snapshot = arkivSnapshot(arkiv)) {
  const app = new Hono()

  app.get('/', async (c) => {
    const status = c.req.query('status')?.split(',').filter(Boolean)
    if (status && !status.every(isCallStatus)) {
      return c.json({ code: 'bad_status', detail: 'status: a list of call statuses' }, 400)
    }
    const asset = c.req.query('asset')
    const s = await snapshot.read()
    const records = s.statuses
      .filter((st) => (!status || status.includes(st.status)) && (!asset || st.asset === asset))
      .flatMap((st) => {
        const call = s.callOf(st.call)
        return call ? [{ call, status: st }] : []
      })
    const page = pageOf(
      await screenCalls(records, (key) => s.callerOf(key)?.handle, priceOf),
      c.req.query('limit'),
      c.req.query('cursor'),
    )
    if (!page) return c.json({ code: 'bad_limit', detail: 'limit: 1 to 200' }, 400)
    return c.json(page)
  })

  app.get('/:id', async (c) => {
    const id = c.req.param('id').toLowerCase()
    if (!isEntityKey(id)) return c.json({ code: 'not_found', detail: 'No such call' }, 404)
    const s = await snapshot.read()
    // Missing from the snapshot: written in the last minute, through another instance.
    const call = s.callOf(id) ?? (await arkiv.call(id))
    // A call whose caller record doesn't pass its checks isn't served either.
    const caller = call && (s.callerOf(call.caller) ?? (await arkiv.caller(call.caller)))
    if (!call || !caller) return c.json({ code: 'not_found', detail: 'No such call' }, 404)
    const [status, price] = await Promise.all([
      s.statusOf(call.key) ?? arkiv.statusOf(call.key),
      priceOf(call.assetAddress),
    ])
    return c.json(toCall(call, status, caller.handle, price))
  })

  return app
}
