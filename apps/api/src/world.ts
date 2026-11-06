// World ID routes. Only verified humans can publish calls: the web app asks here for a
// signed proof request, sends the proof back, and we verify it and keep the nullifier.
import type { Db } from '@supercall/db'
import { worldNullifiers } from '@supercall/db'
import {
  type Identify,
  verifyWorldProof,
  WORLD_ACTION,
  type WorldEnvironment,
  WorldVerifyError,
  walletSignal,
  worldRpSignature,
} from '@supercall/identity'
import type { IDKitResult } from '@worldcoin/idkit-core'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { encodePacked, type Hex, keccak256 } from 'viem'
import { z } from 'zod'
import { type AuthEnv, identityOf, requireAuth } from './auth'

export interface WorldConfig {
  rpId: string
  signingKey: string
  environment: WorldEnvironment
}

const wallet = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Expected an EVM address')
const verifyBody = z.object({ wallet, result: z.record(z.string(), z.unknown()) })

type PgError = { code?: string; constraint_name?: string }
/** The constraint a Postgres unique_violation broke, or undefined for any other error. */
const violated = (e: unknown) => {
  const pg = [e as PgError, (e as { cause?: PgError })?.cause].find((x) => x?.code === '23505')
  return pg ? (pg.constraint_name ?? 'unknown') : undefined
}

/**
 * World's hosted staging simulator proves every test identity with one server-side identity, so
 * on staging all simulated humans share a nullifier (seen 2026-10-27: three identities, one
 * nullifier). There a taken nullifier gets a stand-in per wallet, so each test caller can verify.
 * Production keeps one human, one caller.
 */
const stagingStandIn = (nullifier: bigint, wallet: string) =>
  BigInt(keccak256(encodePacked(['uint256', 'address'], [nullifier, wallet as Hex])))

export function worldRoutes(
  db: Db,
  config: WorldConfig,
  identify: Identify,
  verify = verifyWorldProof,
) {
  const app = new Hono<AuthEnv>()

  const verifiedRow = (address: string) =>
    db
      .select()
      .from(worldNullifiers)
      .where(
        and(
          eq(worldNullifiers.wallet, walletSignal(address)),
          eq(worldNullifiers.action, WORLD_ACTION),
        ),
      )
      .then((rows) => rows[0])

  // A fresh signature per request: it expires in minutes and carries its own nonce.
  app.post('/rp-signature', (c) => c.json(worldRpSignature(config.signingKey)))

  app.get('/status/:wallet', async (c) => {
    const parsed = wallet.safeParse(c.req.param('wallet'))
    if (!parsed.success)
      return c.json({ code: 'bad_wallet', detail: 'Expected an EVM address' }, 400)
    const row = await verifiedRow(parsed.data)
    return c.json({ verified: Boolean(row), verifiedAt: row?.verifiedAt ?? null })
  })

  // Signed in, and only for a wallet on your own account: nobody verifies someone else's.
  app.post('/verify', requireAuth(identify), async (c) => {
    const parsed = verifyBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success)
      return c.json({ code: 'bad_request', detail: 'Expected { wallet, result }' }, 400)
    const address = walletSignal(parsed.data.wallet)
    if (!identityOf(c).wallets.includes(address)) {
      console.warn('World ID: wallet not on the account', address)
      return c.json({ code: 'wallet_not_yours', detail: 'That wallet isn’t on your account' }, 403)
    }
    if (await verifiedRow(address)) {
      return c.json(
        { code: 'wallet_already_verified', detail: 'This wallet is already verified' },
        409,
      )
    }

    let nullifier: bigint
    try {
      ;({ nullifier } = await verify({
        rpId: config.rpId,
        result: parsed.data.result as unknown as IDKitResult,
        environment: config.environment,
        wallet: address,
      }))
    } catch (e) {
      if (e instanceof WorldVerifyError) {
        console.warn('World ID proof rejected:', e.code, e.message)
        return c.json({ code: e.code, detail: e.message }, 400)
      }
      throw e
    }

    const insert = (n: bigint) =>
      db.insert(worldNullifiers).values({
        nullifier: n.toString(),
        action: WORLD_ACTION,
        wallet: address,
        environment: config.environment,
      })
    try {
      try {
        await insert(nullifier)
      } catch (e) {
        if (config.environment !== 'staging' || violated(e) !== 'world_nullifiers_nullifier_action')
          throw e
        console.warn('World ID staging: shared simulator nullifier; a stand-in for', address)
        await insert(stagingStandIn(nullifier, address))
      }
    } catch (e) {
      // The same human on a second wallet: the reputation stays with the first one.
      if (violated(e)) {
        console.warn('World ID: this human already verified another wallet; not', address)
        return c.json(
          {
            code: 'human_already_registered',
            detail: 'This human already verified another wallet',
          },
          409,
        )
      }
      throw e
    }
    return c.json({ verified: true })
  })

  return app
}
