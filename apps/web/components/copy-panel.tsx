'use client'

import { usePrivy } from '@privy-io/react-auth'
import { canMirror, MIN_TARGET_DISTANCE, rewardPct } from '@supercall/core'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type CSSProperties, useEffect, useState } from 'react'
import { ApiError } from '@/lib/api'
import {
  BACK_STEP,
  type BackStep,
  COPY_STEP,
  type Copied,
  type CopyStep,
  orderState,
  useBack,
  useCopies,
  useCopy,
} from '@/lib/copy'
import { ENDED, statusLabel } from '@/lib/data'
import { price, signedUsd, usd } from '@/lib/format'
import { useLivePrice } from '@/lib/live-price'
import { useMe, useUsdc, walletOf } from '@/lib/me'
import { estimate } from '@/lib/money'
import type { Call } from '@/lib/types'
import { cx, Info } from './ui'

const STOPS = [0, 25, 50, 75, 100] as const
const TONE = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', muted: 'text-muted' }

function Lock() {
  return (
    <svg
      role="img"
      aria-label="Set by the caller"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
    >
      <rect x="5" y="11" width="14" height="10" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Copy this call" className="surface-card flex flex-col">
      <div className="flex h-[54px] items-center justify-between border-b border-line px-5">
        <h2 className="text-[15px] font-medium">Copy</h2>
        <span className="text-[12px] text-muted">Market</span>
      </div>
      <div className="px-5 pt-[22px] pb-5">{children}</div>
    </section>
  )
}

function Note({
  tag,
  tone,
  text,
  action,
}: {
  tag: string
  tone: 'warn' | 'muted' | 'good' | 'bad'
  text: string
  action?: React.ReactNode
}) {
  const tones = {
    warn: 'bg-warn-soft text-warn',
    muted: 'bg-surface-2 text-muted',
    good: 'bg-good-soft text-good',
    bad: 'bg-bad-soft text-bad',
  }
  return (
    <div className="flex flex-col gap-3.5">
      <span className={cx('self-start px-2 py-0.5 text-[12px]', tones[tone])}>{tag}</span>
      <p className="text-[13px] leading-relaxed text-silver">{text}</p>
      {action}
    </div>
  )
}

export function CopyPanel({ call, popup = false }: { call: Call; popup?: boolean }) {
  const { ready, authenticated, login } = usePrivy()
  const { me } = useMe()
  const wallet = authenticated ? walletOf(me) : undefined
  const balance = useUsdc(wallet) ?? 0
  const copy = useCopy()
  const { copies } = useCopies(wallet)
  const mine = copies?.filter((c) => c.call === call.id) ?? []
  const [pctOfBalance, setPct] = useState<number | null>(null)
  const [typed, setTyped] = useState('100')
  const [bought, setBought] = useState<(Copied & { size: number }) | null>(null)
  const [step, setStep] = useState<CopyStep | null>(null)
  const [error, setError] = useState<string>()
  // Opened from the extension: the side panel tracks the order, so the window closes itself.
  useEffect(() => {
    if (!popup || !bought) return
    const t = setTimeout(() => window.close(), 2500)
    return () => clearTimeout(t)
  }, [popup, bought])
  const size =
    pctOfBalance === null ? Number(typed.replace(/,/g, '')) || 0 : (balance * pctOfBalance) / 100
  const fill = pctOfBalance ?? Math.min(100, balance > 0 ? (size / balance) * 100 : 0)
  // Judged at the live price, so the panel opens and closes as price moves through the zone.
  const { value: now } = useLivePrice(call.assetAddress, call.price)
  const open = canMirror({ ...call, price: now })
  const est = estimate({ ...call, price: now }, size)
  const long = call.direction === 'long'

  // Until the account is read, the panel can't tell a follower from the caller: wait for it,
  // rather than showing the copy form and then swapping it out.
  if (!ready || (authenticated && me === undefined)) {
    return (
      <Shell>
        <div className="h-[260px] animate-pulse bg-surface-2" />
      </Shell>
    )
  }
  // The caller doesn't copy his own call: he backs it with his own order, which makes it a
  // supercall.
  if (me?.profile?.username && me.profile.username === call.caller) {
    return <GoSuper call={call} wallet={me.profile.wallet} open={open} />
  }
  if (ENDED.includes(call.status)) {
    const st = statusLabel[call.status]
    return (
      <Shell>
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">Ended</span>
          <span className="text-[18px] font-medium">{st.label}</span>
          <span className="text-[13px] text-muted">Settled in Hisaab on Arc.</span>
        </div>
      </Shell>
    )
  }
  if (call.status === 'pending') {
    return (
      <Shell>
        <Note
          tag="Not open yet"
          tone="muted"
          text={`@${call.caller} is backing this call with their own order. Copying opens once Flash has it.`}
        />
      </Shell>
    )
  }
  if (!long) {
    return (
      <Shell>
        <Note
          tag="Scored only"
          tone="muted"
          text="Short calls can’t be copied yet: Flash trades spot. This call still counts toward the caller’s SuperFactor."
        />
      </Shell>
    )
  }
  if (rewardPct(call) < MIN_TARGET_DISTANCE) {
    return (
      <Shell>
        <Note
          tag="Scored only"
          tone="muted"
          text="The target is too close to entry to copy after fees. The call still counts toward the caller’s SuperFactor."
        />
      </Shell>
    )
  }
  if (!open && call.type === 'open') {
    return (
      <Shell>
        <Note
          tag="Out of the entry zone"
          tone="warn"
          text={`Copying is open while price is between ${price(call.entry * (1 - call.bandPct))} and ${price(call.entry * (1 + call.bandPct))}; it’s ${price(now)} now. It reopens as soon as price is back inside.`}
        />
      </Shell>
    )
  }
  if (!open) {
    return (
      <Shell>
        <Note
          tag="Copying closed"
          tone="muted"
          text={`Price already reached the entry at ${price(call.entry)}: copies placed before then rest there. The call is tracked to its target, stop or deadline.`}
        />
      </Shell>
    )
  }
  if (bought !== null) {
    const live = mine.find((c) => c.payFeeTx === bought.payFeeTx)
    const st = orderState(live?.status, !!live?.fill)
    return (
      <Shell>
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="grid size-12 place-items-center bg-good-soft text-[22px] text-good">
            {'✓'}
          </span>
          <h3 className="text-[18px] font-medium">Copied</h3>
          <p className="text-[13px] text-muted">
            {usd(bought.size)} of {call.asset}, copying @{call.caller}
          </p>
          <dl className="mt-2 w-full space-y-2.5 text-left text-[13px]">
            <div className="flex justify-between">
              <dt className="text-muted">Order</dt>
              <dd className={TONE[st.tone]}>
                {st.label}
                {live?.fill && ` at ${price(live.fill.price)}`}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Stop</dt>
              <dd className="text-bad">{price(call.stop)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Target</dt>
              <dd className="text-good">{price(call.target)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">If the call is wrong</dt>
              <dd>Fee back + credit</dd>
            </div>
          </dl>
          <div className="mt-3 grid w-full grid-cols-2 gap-2">
            <Link
              href="/me"
              target={popup ? '_blank' : undefined}
              className="flex h-11 items-center justify-center border border-line-strong bg-sidebar text-[13px]"
            >
              View position
            </Link>
            <button
              type="button"
              onClick={() => (popup ? window.close() : setBought(null))}
              className="btn-cta h-11 cursor-pointer text-[13px]"
            >
              {popup ? 'Close' : 'Done'}
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  const go = async () => {
    if (!wallet) return
    setError(undefined)
    try {
      const done = await copy(call.id, Math.round(size * 100) / 100, wallet, setStep)
      setBought({ ...done, size })
    } catch (e) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : String(e)
      // Closing the wallet prompt isn't an error worth showing in red.
      setError(/reject|denied|cancel/i.test(msg) ? 'Cancelled in your wallet' : msg)
    } finally {
      setStep(null)
    }
  }
  const tooSmall = size > 0 && size < 1
  const label = !ready
    ? 'Loading…'
    : !authenticated
      ? 'Sign in to copy'
      : step
        ? COPY_STEP[step]
        : size > balance
          ? 'More than your balance'
          : tooSmall
            ? 'At least $1'
            : `Copy long ${call.asset}`

  return (
    <Shell>
      <div className="flex flex-col gap-[22px]">
        <label className="flex flex-col gap-2.5">
          <span className="flex justify-between text-[12px] text-muted">
            <span>Amount</span>
            <span>
              Avbl <span className="text-ink">{usd(balance).slice(1)}</span> USDC
            </span>
          </span>
          <span className="flex h-12 items-center border border-line-strong bg-sidebar px-3.5 focus-within:border-steel">
            <input
              type="text"
              inputMode="decimal"
              value={
                pctOfBalance === null
                  ? typed
                  : size.toLocaleString('en-US', { maximumFractionDigits: 2 })
              }
              onChange={(e) => {
                setPct(null)
                setTyped(e.target.value)
              }}
              className="min-w-0 flex-1 bg-transparent text-[18px] font-medium outline-none"
            />
            <span className="text-[12px] text-muted">USDC</span>
          </span>
        </label>
        <div className="flex flex-col gap-2.5">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(fill)}
            onChange={(e) => {
              const v = Number(e.target.value)
              setPct(STOPS.find((x) => Math.abs(x - v) <= 2) ?? v)
            }}
            aria-label="Percent of balance"
            aria-valuetext={`${Math.round(fill)}% of balance`}
            className="range range-thin"
            style={{ '--fill': `${fill}%` } as CSSProperties}
          />
          <fieldset aria-label="Quick amounts" className="flex justify-between">
            {STOPS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={pctOfBalance === s}
                onClick={() => setPct(s)}
                className={cx(
                  'cursor-pointer py-1 text-[11px]',
                  pctOfBalance === s ? 'text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {s}%
              </button>
            ))}
          </fieldset>
        </div>
        <div className="grid grid-cols-2 border border-line">
          <span className="flex flex-col gap-1.5 px-3.5 py-3">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              Take profit <Lock />
            </span>
            <span className="text-[15px] text-good">{price(call.target)}</span>
          </span>
          <span className="flex flex-col gap-1.5 border-l border-line px-3.5 py-3">
            <span className="flex items-center gap-1.5 text-[11px] text-muted">
              Stop loss <Lock />
            </span>
            <span className="text-[15px] text-bad">{price(call.stop)}</span>
          </span>
        </div>
        <dl className="flex flex-col gap-3 text-[13px]">
          <div className="flex justify-between">
            <dt className="flex items-center gap-1.5 text-muted">
              Est. at TP
              <Info
                label="If the call is right"
                text="Your target sells. Your call fee is kept, up to half your profit: that’s how the caller gets paid. Estimates are after fees."
              />
            </dt>
            <dd className="text-good">{signedUsd(est.atTarget)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="flex items-center gap-1.5 text-muted">
              Est. at SL
              <Info
                label="If the call is wrong"
                text="Your stop sells. Your call fee comes back, plus credit from the caller’s fund."
              />
            </dt>
            <dd className="text-bad">{signedUsd(est.atStop)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-muted">
              Call fee, refundable
              <Info
                label="About the call fee"
                text="Held in Hisaab on Arc until the call ends. The caller earns from it only if they’re right; if they’re wrong you get it all back. A 0.1% platform fee is taken from your buy and held with it."
              />
            </dt>
            <dd>{usd(est.fee)}</dd>
          </div>
        </dl>
        {call.type === 'future-level' && (
          <p className="text-[12px] text-muted">
            Your buy rests at the entry, {price(call.entry)}, and fills when price gets there.
          </p>
        )}
        {error && <p className="text-[12px] text-bad">{error}</p>}
        <button
          type="button"
          disabled={
            authenticated && (step !== null || size <= 0 || tooSmall || size > balance || !wallet)
          }
          onClick={() => (authenticated ? void go() : login())}
          className="h-[46px] cursor-pointer bg-good text-[14px] font-semibold text-bg hover:brightness-110 disabled:cursor-default disabled:opacity-60 disabled:hover:brightness-100"
        >
          {label}
        </button>
        {mine.length > 0 && (
          <Link href="/me" className="text-center text-[12px] text-muted hover:text-ink">
            You’ve copied this {mine.length === 1 ? 'once' : `${mine.length} times`} ·{' '}
            {orderState(mine[0]?.status, !!mine[0]?.fill).label} · Portfolio
          </Link>
        )}
      </div>
    </Shell>
  )
}

/**
 * The caller's side of the panel: back the call with his own order, from the wallet he published
 * it with. It makes the call a supercall: followers see he's in the trade with them.
 */
function GoSuper({ call, wallet, open }: { call: Call; wallet: string; open: boolean }) {
  const router = useRouter()
  const back = useBack()
  const balance = useUsdc(wallet) ?? 0
  const [typed, setTyped] = useState('100')
  const [step, setStep] = useState<BackStep | null>(null)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)
  const size = Number(typed.replace(/,/g, '')) || 0

  if (call.supercall || done) {
    return (
      <Shell>
        <Note
          tag="Supercall"
          tone="good"
          text="You’re in the trade with your own order. Followers see it on the call and on X."
        />
      </Shell>
    )
  }
  if (!open || ENDED.includes(call.status)) {
    return (
      <Shell>
        <Note
          tag="Your call"
          tone="muted"
          text="Followers copy it from here. Share it so they see it: its link previews as the call card on X."
        />
      </Shell>
    )
  }
  const go = async () => {
    setError(undefined)
    try {
      await back(call.id, Math.round(size * 100) / 100, wallet, setStep)
      setDone(true)
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/reject|denied|cancel/i.test(msg) ? 'Cancelled in your wallet' : msg)
    } finally {
      setStep(null)
    }
  }
  return (
    <Shell>
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-2">
          <span className="self-start bg-surface-2 px-2 py-0.5 text-[12px] text-muted">
            Your call
          </span>
          <p className="text-[13px] leading-relaxed text-silver">
            Go super: back it with your own order, same stop and target, at your size. No fee.
            Followers see you’re in the trade.
          </p>
        </div>
        <label className="flex flex-col gap-2.5">
          <span className="flex justify-between text-[12px] text-muted">
            <span>Your size</span>
            <span>
              Avbl <span className="text-ink">{usd(balance).slice(1)}</span> USDC
            </span>
          </span>
          <span className="flex h-12 items-center border border-line-strong bg-sidebar px-3.5 focus-within:border-steel">
            <input
              type="text"
              inputMode="decimal"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Your size in USDC"
              className="min-w-0 flex-1 bg-transparent text-[18px] font-medium outline-none"
            />
            <span className="text-[12px] text-muted">USDC</span>
          </span>
        </label>
        {error && <p className="text-[12px] break-words text-bad">{error}</p>}
        <button
          type="button"
          disabled={step !== null || size < 1 || size > balance}
          onClick={() => void go()}
          className="btn-cta h-[46px] cursor-pointer text-[14px] disabled:cursor-default disabled:opacity-60"
        >
          {step
            ? BACK_STEP[step]
            : size > balance
              ? 'More than your balance'
              : size < 1
                ? 'At least $1'
                : `Go super with ${usd(size)}`}
        </button>
      </div>
    </Shell>
  )
}
