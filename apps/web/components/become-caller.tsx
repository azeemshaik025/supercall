'use client'

// The three steps to publishing: a username, World ID, then the caller record on Arkiv.
import { usePrivy } from '@privy-io/react-auth'
import { useState } from 'react'
import { useCallerSetup, usernameFromX } from '@/lib/caller'
import { Button, cx } from './ui'
import { VerifyWithWorld } from './world-id'

const STEPS = [
  ['username', 'Pick a username'],
  ['world', 'Prove you’re one human'],
  ['record', 'Sign your caller record'],
] as const

/** With its own caller status: the popup and anywhere that doesn't read one already. */
export function BecomeCaller({ onDone }: { onDone?: () => void }) {
  return <BecomeCallerSteps setup={useCallerSetup()} onDone={onDone} />
}

/** The steps, on a caller status the page already reads: one check, not two. */
export function BecomeCallerSteps({
  setup,
  onDone,
}: {
  setup: ReturnType<typeof useCallerSetup>
  onDone?: () => void
}) {
  const { login, user } = usePrivy()
  const { step, me, caller, error } = setup
  const [name, setName] = useState(usernameFromX(user?.twitter?.username) ?? '')
  const [busy, setBusy] = useState(false)
  const at = STEPS.findIndex(([s]) => s === step)
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    await work()
    setBusy(false)
  }

  if (step === 'loading') return <p className="text-[13px] text-muted">Checking your account…</p>
  if (step === 'error')
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-bad">{error}</p>
        <Button variant="secondary" className="h-10 w-full" onClick={() => void setup.reload()}>
          Try again
        </Button>
      </div>
    )
  if (step === 'signed-out')
    return (
      <Button className="h-[46px] w-full" onClick={() => login()}>
        Sign in to continue
      </Button>
    )
  if (step === 'done')
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[14px]">
          You’re a caller as <b>@{caller?.caller?.handle ?? me?.profile?.username}</b>. SuperFactor
          starts at <b>{Math.round(caller?.caller?.superFactor ?? 50)}</b> and moves with every call
          that ends.
        </p>
        {onDone && (
          <Button className="h-[46px] w-full" onClick={onDone}>
            Continue
          </Button>
        )}
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1.5">
        {STEPS.map(([key, label], i) => (
          <li
            key={key}
            className={cx(
              'flex items-center gap-2.5 text-[13px]',
              i < at ? 'text-good' : i === at ? 'text-ink' : 'text-faint',
            )}
          >
            <span className="grid size-5 place-items-center border border-current font-mono text-[11px]">
              {i < at ? '✓' : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      {step === 'username' && (
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => setup.saveUsername(name))
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s/g, ''))}
            placeholder="username"
            aria-label="Username"
            className="h-[46px] border border-line-strong bg-sidebar px-3.5 font-mono text-[14px] outline-none focus:border-steel"
          />
          <Button type="submit" className="h-[46px] w-full" disabled={busy || name.length < 3}>
            {busy ? 'Saving…' : 'Save username'}
          </Button>
        </form>
      )}

      {step === 'world' && me?.profile && (
        <VerifyWithWorld wallet={me.profile.wallet} onVerified={() => void setup.reload()} />
      )}

      {step === 'record' && (
        <div className="flex flex-col gap-2.5">
          <p className="text-[13px] leading-relaxed text-muted">
            One free signature writes your caller record to Arkiv. Nobody can edit it, us included,
            and your calls are scored against it.
          </p>
          <Button
            className="h-[46px] w-full"
            disabled={busy}
            onClick={() => void run(setup.signRecord)}
          >
            {busy ? 'Confirm in your wallet…' : 'Sign caller record'}
          </Button>
        </div>
      )}

      {error && <p className="text-[13px] text-bad">{error}</p>}
    </div>
  )
}
