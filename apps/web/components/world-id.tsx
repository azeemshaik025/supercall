'use client'

import { usePrivy } from '@privy-io/react-auth'
// World ID for callers: Proof of Human, bound to the wallet the caller publishes from. The API
// signs each request and verifies the proof; nothing here is trusted on its own.
import {
  IDKitRequestWidget,
  type IDKitResult,
  proofOfHuman,
  type RpContext,
} from '@worldcoin/idkit'
import { useState } from 'react'
import { ApiError, api } from '@/lib/api'
import { Button } from './ui'

const APP_ID = process.env.NEXT_PUBLIC_WORLD_APP_ID as `app_${string}` | undefined
const RP_ID = process.env.NEXT_PUBLIC_WORLD_RP_ID
const ENVIRONMENT =
  process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT === 'staging' ? 'staging' : 'production'
/** The API's WORLD_ACTION (@supercall/identity). */
const ACTION = 'verify-caller'

const reasons: Record<string, string> = {
  human_already_registered: 'This World ID already verified another wallet: one human, one caller.',
  wallet_already_verified: 'This wallet is already verified.',
  signal_mismatch: 'That proof was made for a different wallet.',
  wallet_not_yours: 'That wallet isn’t on your account.',
  environment_mismatch: 'That proof came from the wrong World ID environment.',
  user_rejected: 'You declined in World App.',
  cancelled: 'Verification was cancelled.',
  timeout: 'World App didn’t answer in time. Try again.',
  connection_failed: 'Couldn’t reach World App. Try again.',
}
const explain = (code: string) => reasons[code] ?? `Verification failed (${code}).`

/** "Verify with World ID" for `wallet`. `onVerified` runs once the API has kept the proof. */
export function VerifyWithWorld({
  wallet,
  onVerified,
}: {
  wallet: string
  onVerified: () => void
}) {
  const { getAccessToken } = usePrivy()
  const [rp, setRp] = useState<RpContext>()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  if (!APP_ID || !RP_ID) {
    return (
      <p className="text-[13px] text-bad">
        World ID isn’t set up: add NEXT_PUBLIC_WORLD_APP_ID and NEXT_PUBLIC_WORLD_RP_ID to .env.
      </p>
    )
  }

  const start = async () => {
    setError(undefined)
    setBusy(true)
    try {
      // A fresh request signed by the API: it carries its own nonce and expires in minutes.
      const s = await api<{ sig: string; nonce: string; created_at: number; expires_at: number }>(
        '/world/rp-signature',
        { method: 'POST' },
      )
      setRp({
        rp_id: RP_ID,
        nonce: s.nonce,
        created_at: s.created_at,
        expires_at: s.expires_at,
        signature: s.sig,
      })
      setOpen(true)
    } catch {
      setError('Couldn’t start verification. Is the API running?')
    } finally {
      setBusy(false)
    }
  }

  // Runs inside the widget: a throw shows there as a failure, and the reason stays below.
  const handleVerify = async (result: IDKitResult) => {
    try {
      await api('/world/verify', {
        method: 'POST',
        token: await getAccessToken(),
        body: { wallet, result },
      })
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'verification_failed'
      setError(explain(code))
      throw e
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button className="h-[46px] w-full" onClick={start} disabled={busy}>
        {busy ? 'Starting…' : 'Verify with World ID'}
      </Button>
      {ENVIRONMENT === 'staging' && (
        <p className="text-center text-[12px] text-faint">
          Staging: scan the code with the{' '}
          <a
            href="https://simulator.worldcoin.org"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-ink"
          >
            World ID simulator
          </a>
          , not World App.
        </p>
      )}
      {error && <p className="text-[13px] text-bad">{error}</p>}
      {rp && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={APP_ID}
          action={ACTION}
          rp_context={rp}
          // v4 proofs only: a v3 and a v4 proof would give one human two nullifiers.
          allow_legacy_proofs={false}
          environment={ENVIRONMENT}
          preset={proofOfHuman({ signal: wallet.toLowerCase() })}
          handleVerify={handleVerify}
          onSuccess={() => {
            setError(undefined)
            onVerified()
          }}
          onError={(code) => setError((e) => e ?? explain(code))}
        />
      )}
    </div>
  )
}
