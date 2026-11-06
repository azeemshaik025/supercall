// Publishing in the app (spec, "How a call is made", outbound). Two signatures from the caller's
// wallet: once, their caller record; then, for each call, its levels. The API prepares exactly
// what is signed, checks it again on the way back, and writes it to Arkiv with our writer key.
import {
  type AppCallPayload,
  type Arkiv,
  type CallerPayload,
  type CallerRecord,
  callerTypedData,
  callPayload,
  callTypedData,
  toBps,
  toMicroUsdc,
} from '@supercall/arkiv'
import { hasPool } from '@supercall/chains'
import { inBand, maxBoost, shareFor } from '@supercall/core'
import type { Db } from '@supercall/db'
import { profiles, worldNullifiers } from '@supercall/db'
import { type Identify, WORLD_ACTION } from '@supercall/identity'

import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { type Hex, verifyTypedData } from 'viem'
import { z } from 'zod'
import { type AuthEnv, identityOf, requireAuth } from './auth'
import { toCaller } from './callers'
import { arkivSnapshot, type Snapshot } from './calls'
import type { Hisaab } from './hisaab'
import type { createMarkets } from './market-data/markets'
import type { XFeed } from './x-feed'

const HOUR = 3600
/** How long a prepared record or call stays signable. */
const FRESH = 10 * 60
const now = () => Math.floor(Date.now() / 1000)

/** Typed data as JSON: its integers fit a JS number (seconds, micro-USDC below $9 billion). */
const asJson = (data: unknown) =>
  JSON.parse(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? Number(v) : v)))

/** World ID nullifiers are stored as numbers; Arkiv takes them as 32-byte hex. */
const nullifierHex = (n: string): Hex => `0x${BigInt(n).toString(16).padStart(64, '0')}`

const levelsBody = z.object({
  assetAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  direction: z.enum(['long', 'short']),
  entry: z.number().positive(),
  stop: z.number().positive(),
  target: z.number().positive(),
  bandPct: z.number().min(0.001).max(0.05),
  hours: z
    .number()
    .int()
    .min(1)
    .max(30 * 24),
  thesis: z.string().max(1000).default(''),
  boost: z.number().min(0).max(1).default(0),
})

export function publishRoutes(deps: {
  db: Db
  identify: Identify
  arkiv: Arkiv
  markets: ReturnType<typeof createMarkets>
  snapshot?: Snapshot
  /** Absent until Hisaab is deployed and the writer key is set. */
  hisaab?: Hisaab
  /** X's live feed; absent without X_BEARER_TOKEN and X_WEBHOOK_ID. */
  xFeed?: XFeed
  /** Keeps work running after the response. */
  later?: (work: Promise<unknown>) => void
}) {
  const { db, arkiv, markets, hisaab, snapshot = arkivSnapshot(deps.arkiv) } = deps
  const later =
    deps.later ??
    ((p: Promise<unknown>) => {
      p.catch(console.error)
    })
  const app = new Hono<AuthEnv>()
  // On each route, not app.use: this router is mounted at '/', where '*' would cover every route.
  const auth = requireAuth(deps.identify)

  /** The signed-in caller's profile and World ID proof, or why they can't publish yet. */
  async function whoPublishes(userId: string, wallets: string[]) {
    const [profile] = await db.select().from(profiles).where(eq(profiles.privyUserId, userId))
    if (!profile) return { problem: ['no_profile', 'Pick a username first'] as const }
    if (!wallets.includes(profile.wallet)) {
      return { problem: ['wallet_not_yours', 'Your profile’s wallet left this account'] as const }
    }
    const [proof] = await db
      .select()
      .from(worldNullifiers)
      .where(
        and(eq(worldNullifiers.wallet, profile.wallet), eq(worldNullifiers.action, WORLD_ACTION)),
      )
    if (!proof) return { problem: ['not_verified', 'Verify with World ID first'] as const }
    return { profile, proof }
  }

  /** What the caller record should say now, from the profile, Privy's X and the proof. */
  function recordFields(
    who: Exclude<Awaited<ReturnType<typeof whoPublishes>>, { problem: unknown }>,
    joinedAt: number,
  ): Omit<CallerPayload, 'signature'> {
    const { profile, proof } = who
    const wallet = profile.wallet as Hex
    return {
      v: 1,
      handle: profile.username,
      displayName: profile.displayName ?? profile.username,
      wallet,
      wallets: [wallet],
      x:
        profile.xUserId && profile.xUsername
          ? { id: profile.xUserId, username: profile.xUsername }
          : null,
      telegram: null,
      world: {
        nullifier: nullifierHex(proof.nullifier),
        action: proof.action,
        verifiedAt: Math.floor(proof.verifiedAt.getTime() / 1000),
      },
      joinedAt,
    }
  }

  /** The caller record behind the profile's wallet, if it's on Arkiv. */
  const recordOf = (wallet: string) => arkiv.callerByWallet(wallet as Hex)

  /** A caller's settlement records, from the snapshot: their score comes from these. */
  const settlementsOf = async (record: CallerRecord) =>
    (await snapshot.read()).settlementsOf(record.key)
  // A caller's cut is fixed at publish from their SuperFactor (spec, "The caller's cut").
  const superFactorOf = async (record: CallerRecord) =>
    toCaller(record, 0, await settlementsOf(record)).superFactor

  app.get('/me/caller', auth, async (c) => {
    const id = identityOf(c)
    const who = await whoPublishes(id.userId, id.wallets)
    if (who.problem) return c.json({ code: who.problem[0], detail: who.problem[1] }, 409)
    const record = await recordOf(who.profile.wallet)
    if (record) {
      const calls = await arkiv.callsBy(record.key)
      const caller = toCaller(record, calls.length, await settlementsOf(record))
      return c.json({ key: record.key, caller, draft: null })
    }
    const fields = recordFields(who, now())
    return c.json({
      key: null,
      caller: null,
      draft: { fields, typedData: asJson(callerTypedData(fields)) },
    })
  })

  app.post('/me/caller', auth, async (c) => {
    const id = identityOf(c)
    const body = z
      .object({ joinedAt: z.number().int(), signature: z.string().regex(/^0x[0-9a-f]+$/i) })
      .safeParse(await c.req.json().catch(() => null))
    if (!body.success)
      return c.json({ code: 'bad_request', detail: 'Expected { joinedAt, signature }' }, 400)
    const who = await whoPublishes(id.userId, id.wallets)
    if (who.problem) return c.json({ code: who.problem[0], detail: who.problem[1] }, 409)
    if (Math.abs(now() - body.data.joinedAt) > FRESH) {
      return c.json({ code: 'stale', detail: 'That signature is too old; sign again' }, 400)
    }
    const existing = await recordOf(who.profile.wallet)
    if (existing) {
      return c.json({
        key: existing.key,
        caller: toCaller(existing, 0, await settlementsOf(existing)),
      })
    }
    const taken = await arkiv.callerByHandle(who.profile.username)
    if (taken)
      return c.json(
        { code: 'handle_taken', detail: 'That handle is on another caller record' },
        409,
      )

    // Rebuilt here, so the record says what we know, whatever the browser sent.
    const fields = recordFields(who, body.data.joinedAt)
    const signature = body.data.signature.toLowerCase() as Hex
    const signed = await verifyTypedData({
      address: fields.wallet,
      signature,
      ...callerTypedData(fields),
    })
    if (!signed) return c.json({ code: 'bad_signature', detail: 'Signed by another wallet' }, 400)
    try {
      await arkiv.writeCaller({ ...fields, signature })
    } catch (e) {
      // Arkiv refused the write (no funds for it, rate limit, RPC down): say so, not a bare 500.
      const reason = (e as Error).message?.split('\n')[0] ?? 'unknown'
      console.error('caller record not written to Arkiv:', reason)
      return c.json(
        { code: 'arkiv_write_failed', detail: `Arkiv didn’t take the record: ${reason}` },
        502,
      )
    }
    snapshot.stale()
    // From now on their posts on X can be calls: have X send them (spec, "How a call is made").
    const xUserId = who.profile.xUserId
    if (deps.xFeed && xUserId) {
      later(
        deps.xFeed
          .follow(xUserId)
          .catch((e) => console.error('X feed: not following', xUserId, (e as Error).message)),
      )
    }
    // Arkiv answers queries a block or two behind its writes: read back by wallet, briefly.
    const record = await settle(() => recordOf(who.profile.wallet))
    if (!record)
      return c.json({ code: 'not_yet', detail: 'Written; Arkiv is still indexing it' }, 202)
    // A caller record written just now has no settlements yet.
    return c.json({ key: record.key, caller: toCaller(record, 0, []) }, 201)
  })

  /** The call exactly as it will be signed and written, from the composer's levels. */
  async function callFields(
    record: CallerRecord,
    input: z.infer<typeof levelsBody>,
    createdAt: number,
  ) {
    const market = (await markets.list()).find(
      (m) => m.address.toLowerCase() === input.assetAddress.toLowerCase(),
    )
    if (!market)
      return { problem: ['unknown_coin', 'Flash doesn’t list that coin on Arc'] as const }
    // The worker judges a call on its coin's pool, and couldn't settle one with none.
    if (!hasPool(market.address))
      return { problem: ['not_judgeable', 'Calls on that coin can’t be judged yet'] as const }
    // A record keeps four significant digits down to $0.01 (arkiv/schema.md, "Limits").
    if (input.entry < 0.01)
      return { problem: ['price_too_small', 'Coins under $0.01 can’t be called yet'] as const }
    const long = input.direction === 'long'
    const ordered = long
      ? input.stop < input.entry && input.entry < input.target
      : input.target < input.entry && input.entry < input.stop
    if (!ordered)
      return {
        problem: [
          'bad_levels',
          long ? 'A long needs stop < entry < target' : 'A short needs target < entry < stop',
        ] as const,
      }

    const sf = await superFactorOf(record)
    const boost = Math.min(input.boost, maxBoost(sf))
    const fields: Omit<AppCallPayload, 'signature'> = {
      v: 1,
      caller: record.key,
      wallet: record.wallet,
      source: 'app',
      thesis: input.thesis,
      asset: market.symbol,
      assetAddress: market.address.toLowerCase() as Hex,
      chain: 'arc',
      type: inBand({ entry: input.entry, bandPct: input.bandPct }, market.price)
        ? 'open'
        : 'future-level',
      direction: input.direction,
      entry: toMicroUsdc(input.entry),
      bandBps: toBps(input.bandPct),
      stop: toMicroUsdc(input.stop),
      target: toMicroUsdc(input.target),
      deadline: createdAt + input.hours * HOUR,
      shareBps: toBps(Math.max(0.1, shareFor(sf) - Math.min(boost, maxBoost(sf)))),
      boostBps: toBps(boost),
      createdAt,
    }
    return { fields, sf, price: market.price }
  }

  app.post('/calls/prepare', auth, async (c) => {
    const id = identityOf(c)
    const input = levelsBody.safeParse(await c.req.json().catch(() => null))
    if (!input.success)
      return c.json(
        { code: 'bad_request', detail: input.error.issues[0]?.message ?? 'Bad levels' },
        400,
      )
    const who = await whoPublishes(id.userId, id.wallets)
    if (who.problem) return c.json({ code: who.problem[0], detail: who.problem[1] }, 409)
    const record = await recordOf(who.profile.wallet)
    if (!record)
      return c.json({ code: 'no_caller_record', detail: 'Sign your caller record first' }, 409)
    const built = await callFields(record, input.data, now())
    if (built.problem) return c.json({ code: built.problem[0], detail: built.problem[1] }, 400)
    return c.json({
      input: input.data,
      fields: built.fields,
      typedData: asJson(callTypedData(built.fields)),
    })
  })

  app.post('/calls', auth, async (c) => {
    const id = identityOf(c)
    const body = z
      .object({
        input: levelsBody,
        createdAt: z.number().int(),
        signature: z.string().regex(/^0x[0-9a-f]+$/i),
      })
      .safeParse(await c.req.json().catch(() => null))
    if (!body.success)
      return c.json(
        { code: 'bad_request', detail: 'Expected { input, createdAt, signature }' },
        400,
      )
    if (Math.abs(now() - body.data.createdAt) > FRESH) {
      return c.json(
        { code: 'stale', detail: 'That signature is too old; review and sign again' },
        400,
      )
    }
    const who = await whoPublishes(id.userId, id.wallets)
    if (who.problem) return c.json({ code: who.problem[0], detail: who.problem[1] }, 409)
    const record = await recordOf(who.profile.wallet)
    if (!record)
      return c.json({ code: 'no_caller_record', detail: 'Sign your caller record first' }, 409)

    // Built again from the same levels: the price may have moved the call's type since prepare,
    // and then the signature no longer matches, which is the right answer.
    const built = await callFields(record, body.data.input, body.data.createdAt)
    if (built.problem) return c.json({ code: built.problem[0], detail: built.problem[1] }, 400)
    const signature = body.data.signature.toLowerCase() as Hex
    const call = callPayload.parse({ ...built.fields, signature }) as AppCallPayload
    const signed = await verifyTypedData({
      address: call.wallet,
      signature,
      ...callTypedData(built.fields),
    })
    if (!signed)
      return c.json(
        { code: 'bad_signature', detail: 'The signed call doesn’t match; review and sign again' },
        400,
      )

    const { key, fingerprint } = await arkiv.writeCall(call)
    // A call opens for copying at once; a supercall waits for the caller's order (spec, "A call's life").
    await arkiv.writeStatus(
      {
        v: 2,
        call: key,
        caller: record.key,
        asset: call.asset,
        status: 'armed',
        supercall: false,
        superFactor: Math.floor(built.sf),
        boostBps: call.boostBps,
        followBand: 'low',
        opposeBand: 'low',
      },
      call.deadline,
    )
    snapshot.stale()
    return c.json({ id: key, registerTx: await register({ ...call, key, fingerprint }) }, 201)
  })

  /** Opens a published call for fees. If Hisaab doesn't take it now, its first copy registers it. */
  async function register(call: Parameters<Hisaab['registerCall']>[0]) {
    if (!hisaab) return null
    try {
      return (await hisaab.registerCall(call)).transactionHash
    } catch (e) {
      console.error('call not registered yet', call.key, e)
      return null
    }
  }

  return app
}

/** Polls `read` for a few seconds until it finds what was just written. */
async function settle<T>(read: () => Promise<T | undefined>, tries = 8): Promise<T | undefined> {
  for (let i = 0; i < tries; i++) {
    const found = await read()
    if (found) return found
    await new Promise((r) => setTimeout(r, 1500))
  }
  return undefined
}
