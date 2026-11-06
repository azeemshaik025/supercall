// World ID: sign proof requests and verify proofs, server-side only.
// Proof of Human is the one credential we ask for: no passport, no name, no country.
import type { IDKitResult } from '@worldcoin/idkit-core'
import { hashSignal } from '@worldcoin/idkit-core/hashing'
import { signRequest } from '@worldcoin/idkit-core/signing'

/** The action a caller proves uniqueness for. One per human, ever. */
export const WORLD_ACTION = 'verify-caller'

export type WorldEnvironment = 'production' | 'staging'

/** Proof of Human credential identifiers: v4, and the v3 Orb name for completeness. */
const HUMAN_CREDENTIALS = new Set(['proof_of_human', 'orb'])

export class WorldVerifyError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/** RP signature for one proof request. The signing key never leaves the server. */
export function worldRpSignature(signingKeyHex: string, action = WORLD_ACTION) {
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex, action })
  return { sig, nonce, created_at: createdAt, expires_at: expiresAt }
}

/** A nullifier as a number: v4 sends decimal, v3 sends hex. Casing can't create duplicates. */
export function toNullifier(value: string): bigint {
  const n = BigInt(value)
  if (n < 0n || n >= 2n ** 256n)
    throw new WorldVerifyError('bad_nullifier', 'Nullifier out of range')
  return n
}

/** The proof's signal must be the wallet we're verifying, or a proof could be replayed for another. */
export const walletSignal = (wallet: string) => wallet.toLowerCase()

/**
 * Checks an IDKit result before and after the Developer Portal verifies it: right action,
 * right environment, Proof of Human, signal bound to `wallet`. Forwards the result to the
 * Portal unchanged and returns the verified nullifier.
 */
export async function verifyWorldProof(p: {
  rpId: string
  result: IDKitResult
  environment: WorldEnvironment
  wallet: string
  fetch?: typeof fetch
}): Promise<{ nullifier: bigint }> {
  const { result } = p
  if ('session_id' in result)
    throw new WorldVerifyError('wrong_flow', 'Expected a uniqueness proof')
  if (result.environment !== p.environment) {
    throw new WorldVerifyError('environment_mismatch', `Proof is from ${result.environment}`)
  }
  if (result.action !== WORLD_ACTION)
    throw new WorldVerifyError('wrong_action', 'Unexpected action')
  const responses = result.responses as {
    identifier: string
    signal_hash?: string
    nullifier: string
  }[]
  if (responses.length === 0 || !responses.every((r) => HUMAN_CREDENTIALS.has(r.identifier))) {
    throw new WorldVerifyError('wrong_credential', 'Proof of Human is required')
  }
  const expected = BigInt(hashSignal(walletSignal(p.wallet)))
  if (!responses.every((r) => r.signal_hash !== undefined && BigInt(r.signal_hash) === expected)) {
    throw new WorldVerifyError('signal_mismatch', 'Proof is not bound to this wallet')
  }

  const res = await (p.fetch ?? fetch)(`https://developer.world.org/api/v4/verify/${p.rpId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...result, environment: p.environment }),
  })
  const body = (await res.json().catch(() => null)) as {
    success?: boolean
    environment?: string
    nullifier?: string
    code?: string
    detail?: string
    results?: { success: boolean; nullifier?: string }[]
  } | null
  if (!res.ok || body?.success !== true || body.environment !== p.environment) {
    throw new WorldVerifyError(
      body?.code ?? 'verification_failed',
      body?.detail ?? 'Verification failed',
    )
  }
  const verified = body.nullifier ?? body.results?.find((r) => r.success)?.nullifier
  if (!verified) throw new WorldVerifyError('verification_failed', 'No verified nullifier')
  return { nullifier: toNullifier(verified) }
}
