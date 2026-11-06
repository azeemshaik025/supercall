// "Become a caller" in the side panel: username, World ID, then the caller record on Arkiv.
// Once done, the caller's posts on X are read as calls.
import { usePrivy } from '@privy-io/react-auth'
import {
  IDKitRequestWidget,
  type IDKitResult,
  proofOfHuman,
  type RpContext,
} from '@worldcoin/idkit'
import { useState } from 'react'
import { ApiError, api } from '../../lib/api'
import { useCallerSetup, usernameFromX } from '../../lib/caller-setup'

declare const __WORLD__: {
  appId: string
  rpId: string
  environment: 'production' | 'staging'
}

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

function VerifyWithWorld({ wallet, onVerified }: { wallet: string; onVerified: () => void }) {
  const { getAccessToken } = usePrivy()
  const [rp, setRp] = useState<RpContext>()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  if (!__WORLD__.appId || !__WORLD__.rpId) {
    return (
      <p className="sc-bad">
        World ID isn’t set up: NEXT_PUBLIC_WORLD_APP_ID and NEXT_PUBLIC_WORLD_RP_ID in .env.
      </p>
    )
  }

  const start = async () => {
    setError(undefined)
    setBusy(true)
    try {
      const s = await api<{ sig: string; nonce: string; created_at: number; expires_at: number }>(
        '/world/rp-signature',
        { method: 'POST' },
      )
      setRp({
        rp_id: __WORLD__.rpId,
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

  const handleVerify = async (result: IDKitResult) => {
    try {
      await api('/world/verify', {
        method: 'POST',
        token: await getAccessToken(),
        body: { wallet, result },
      })
    } catch (e) {
      setError(explain(e instanceof ApiError ? e.code : 'verification_failed'))
      throw e
    }
  }

  return (
    <>
      <button type="button" className="sc-button" onClick={start} disabled={busy}>
        {busy ? 'Starting…' : 'Verify with World ID'}
      </button>
      {__WORLD__.environment === 'staging' && (
        <p className="sc-muted sc-small">
          Staging: scan with the{' '}
          <a
            className="sc-link"
            href="https://simulator.worldcoin.org"
            target="_blank"
            rel="noreferrer"
          >
            World ID simulator
          </a>
          , not World App.
        </p>
      )}
      {error && <p className="sc-bad">{error}</p>}
      {rp && (
        <IDKitRequestWidget
          open={open}
          onOpenChange={setOpen}
          app_id={__WORLD__.appId as `app_${string}`}
          action={ACTION}
          rp_context={rp}
          allow_legacy_proofs={false}
          environment={__WORLD__.environment}
          preset={proofOfHuman({ signal: wallet.toLowerCase() })}
          handleVerify={handleVerify}
          onSuccess={() => {
            setError(undefined)
            onVerified()
          }}
          onError={(code) => setError((e) => e ?? explain(code))}
        />
      )}
    </>
  )
}

const STEPS = [
  ['username', 'Username'],
  ['world', 'World ID'],
  ['record', 'Caller record'],
] as const

/** The caller card: what's left before posts on X count as calls, or the caller's standing. */
export function CallerCard() {
  const setup = useCallerSetup()
  const { step, me, caller, error } = setup
  const [name, setName] = useState(usernameFromX(setup.xHandle) ?? '')
  const [busy, setBusy] = useState(false)
  const at = STEPS.findIndex(([s]) => s === step)
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    await work()
    setBusy(false)
  }

  if (step === 'loading')
    return <section className="sc-box sc-muted">Checking caller status…</section>

  if (step === 'done')
    return (
      <section className="sc-box">
        <div className="sc-row">
          <span className="sc-label">Caller</span>
          <span className="sc-good sc-small">Verified human</span>
        </div>
        <div className="sc-row">
          <strong className="sc-clip">@{caller?.caller?.handle ?? me?.profile?.username}</strong>
          <span className="sc-mono">SF {Math.round(caller?.caller?.superFactor ?? 50)}</span>
        </div>
        <p className="sc-muted sc-small">
          Post a call on X and it shows up here and under your post.
        </p>
      </section>
    )

  return (
    <section className="sc-box">
      <div className="sc-row">
        <span className="sc-label">Become a caller</span>
      </div>
      {step === 'error' ? (
        <>
          <p className="sc-bad">{error}</p>
          <button
            type="button"
            className="sc-button sc-quiet-button"
            onClick={() => void setup.reload()}
          >
            Try again
          </button>
        </>
      ) : (
        <>
          <p className="sc-muted sc-small">
            Copying is open to everyone. To make calls from X, verify once.
          </p>
          <ol className="sc-steps">
            {STEPS.map(([key, label], i) => (
              <li key={key} className={i < at ? 'sc-done' : i === at ? 'sc-now' : ''}>
                <span>{i < at ? '✓' : i + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {step === 'username' && (
            <form
              className="sc-form"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => setup.saveUsername(name))
              }}
            >
              <input
                className="sc-input"
                value={name}
                onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
                placeholder="username"
                aria-label="Username"
              />
              <button type="submit" className="sc-button" disabled={busy || name.length < 3}>
                {busy ? 'Saving…' : 'Save username'}
              </button>
            </form>
          )}
          {step === 'world' && me?.profile && (
            <VerifyWithWorld wallet={me.profile.wallet} onVerified={() => void setup.reload()} />
          )}
          {step === 'record' && (
            <>
              <p className="sc-muted sc-small">
                One free signature writes your caller record to Arkiv. Nobody can edit it, us
                included.
              </p>
              <button
                type="button"
                className="sc-button"
                disabled={busy}
                onClick={() => void run(setup.signRecord)}
              >
                {busy ? 'Confirm…' : 'Sign caller record'}
              </button>
            </>
          )}
          {error && <p className="sc-bad">{error}</p>}
        </>
      )}
    </section>
  )
}
