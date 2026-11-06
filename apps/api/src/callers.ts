// Callers read from Arkiv, served as core's `Caller` (arkiv/schema.md, "From record to screen").
import {
  type Arkiv,
  type CallerRecord,
  fromMicroUsdc,
  fromMillionths,
  type SettlementRecord,
} from '@supercall/arkiv'
import { type Caller, type Outcome, superFactor } from '@supercall/core'
import { Hono } from 'hono'
import { arkivSnapshot, type PriceOf, pageOf, screenCalls } from './calls'

const isWallet = (s: string): s is `0x${string}` => /^0x[0-9a-f]{40}$/.test(s)

const OUTCOME: Record<SettlementRecord['ending']['kind'], Outcome> = {
  won: 'W',
  lost: 'L',
  'expired-profit': 'E',
  'expired-loss': 'E',
  // A call that never entered ran out of time; a void supercall scores as a stop (spec, "SuperFactor").
  unfired: 'E',
  void: 'L',
}

/**
 * A caller's settlements, newest first: from the one none of the others points back to, along
 * `previous`. Each settlement starts from the one before it, so this is the order they scored in.
 */
// ponytail: two settlements written within Arkiv's query lag could both point at one record, and
// then one branch would be followed. The worker waits for each record to show before the next.
function newestFirst(settlements: SettlementRecord[]) {
  const byKey = new Map(settlements.map((s) => [s.key, s]))
  const pointedTo = new Set(settlements.map((s) => s.previous))
  const chain: SettlementRecord[] = []
  for (let s = settlements.find((x) => !pointedTo.has(x.key)); s; ) {
    chain.push(s)
    s = s.previous ? byKey.get(s.previous) : undefined
  }
  return chain
}

/** `settlements`: every settlement record of this caller's. Without any, they score as new. */
export const toCaller = (
  c: CallerRecord,
  callCount: number,
  settlements: SettlementRecord[],
): Caller => {
  const chain = newestFirst(settlements)
  const latest = chain[0]
  const total = (pick: (s: SettlementRecord) => number) =>
    settlements.reduce((sum, s) => sum + pick(s), 0)
  const copies = total((s) => s.copies)
  return {
    handle: c.handle,
    displayName: c.displayName,
    xHandle: c.x?.username ?? '',
    // A caller record exists only after a World ID proof.
    verified: true,
    superFactor: superFactor({
      S: fromMillionths(latest?.S.after ?? 0),
      W: fromMillionths(latest?.W.after ?? 0),
    }),
    lastTen: chain.slice(0, 10).map((s) => OUTCOME[s.ending.kind]),
    callCount,
    poolUsd: latest ? fromMicroUsdc(latest.fund.after.earned + latest.fund.after.creditOnly) : 0,
    earnedUsd: fromMicroUsdc(total((s) => s.toCaller)),
    returnedToFollowersUsd: fromMicroUsdc(total((s) => s.creditTotal)),
    followersNetUsd: fromMicroUsdc(total((s) => s.followersNet)),
    followersProfitablePct: copies
      ? Math.round((100 * total((s) => s.followersProfitable)) / copies)
      : 0,
    joinedAt: new Date(c.joinedAt * 1000).toISOString(),
  }
}

export function callerRoutes(arkiv: Arkiv, priceOf: PriceOf, snapshot = arkivSnapshot(arkiv)) {
  const app = new Hono()
  // Callers come from the snapshot only: these lookups run on every signed-in page, mostly for
  // people with no caller record, and a miss must not cost a query each time.
  const lookup = async (match: (c: CallerRecord) => boolean) => {
    const s = await snapshot.read()
    const caller = s.callers.find(match)
    const calls = caller ? s.calls.filter((call) => call.caller === caller.key) : []
    return { s, caller, calls }
  }

  /**
   * The caller whose current wallet (`wallet`) or X account (`x`, the username, any case) this
   * is: the extension asks by X account on a profile page. A signed-in caller is better found
   * by session.
   */
  app.get('/', async (c) => {
    const x = c.req.query('x')?.toLowerCase()
    const wallet = c.req.query('wallet')?.toLowerCase() ?? ''
    if (x !== undefined && !/^\w{1,15}$/.test(x))
      return c.json({ code: 'bad_x', detail: 'x: an X username' }, 400)
    if (x === undefined && !isWallet(wallet))
      return c.json({ code: 'bad_wallet', detail: 'wallet: an address' }, 400)
    const { s, caller, calls } = await lookup((r) =>
      x === undefined ? r.wallet === wallet : r.x?.username.toLowerCase() === x,
    )
    return c.json({
      callers: caller ? [toCaller(caller, calls.length, s.settlementsOf(caller.key))] : [],
    })
  })

  app.get('/:handle', async (c) => {
    const handle = c.req.param('handle')
    const { s, caller, calls } = await lookup((r) => r.handle === handle)
    if (!caller) return c.json({ code: 'not_found', detail: 'No such caller' }, 404)
    return c.json(toCaller(caller, calls.length, s.settlementsOf(caller.key)))
  })

  app.get('/:handle/calls', async (c) => {
    const handle = c.req.param('handle')
    const { s, caller, calls } = await lookup((r) => r.handle === handle)
    if (!caller) return c.json({ code: 'not_found', detail: 'No such caller' }, 404)
    const records = calls.map((call) => ({ call, status: s.statusOf(call.key) }))
    const page = pageOf(
      await screenCalls(records, () => caller.handle, priceOf),
      c.req.query('limit'),
      c.req.query('cursor'),
    )
    if (!page) return c.json({ code: 'bad_limit', detail: 'limit: 1 to 200' }, 400)
    return c.json(page)
  })

  return app
}
