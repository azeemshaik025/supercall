'use client'

import Link from 'next/link'
import { type CSSProperties, useState } from 'react'
import { statusLabel } from '@/lib/data'
import { price, signedUsd, usd } from '@/lib/format'
import { estimate, inBand } from '@/lib/money'
import type { Call } from '@/lib/types'
import { cx, Info } from './ui'

const STOPS = [0, 25, 50, 75, 100] as const
const MIN_TARGET = 0.02

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

export function CopyPanel({
  call,
  balance = 0,
  popup = false,
}: {
  call: Call
  balance?: number
  popup?: boolean
}) {
  const [pctOfBalance, setPct] = useState<number | null>(null)
  const [typed, setTyped] = useState('1,000')
  const [bought, setBought] = useState<number | null>(null)
  const size =
    pctOfBalance === null
      ? Number(typed.replace(/,/g, '')) || 0
      : (balance * pctOfBalance) / 100
  const fill = pctOfBalance ?? Math.min(100, balance > 0 ? (size / balance) * 100 : 0)
  const est = estimate(call, size)
  const long = call.direction === 'long'

  if (call.status === 'pending' || call.status === 'armed') {
    return (
      <Shell>
        <Note
          tag="Not open yet"
          tone="muted"
          text={`Copying opens when price reaches the entry at ${price(call.entry)} and the caller is in.`}
          action={
            <button
              type="button"
              className="h-11 cursor-pointer border border-line-strong bg-surface-2 text-[14px]"
            >
              Notify me when it opens
            </button>
          }
        />
      </Shell>
    )
  }
  if (call.status !== 'live') {
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
  if (!long) {
    return (
      <Shell>
        <Note
          tag="Scored only"
          tone="muted"
          text="Short calls can’t be copied yet. This call still counts toward the caller’s SuperFactor."
        />
      </Shell>
    )
  }
  if (Math.abs(call.target - call.entry) / call.entry < MIN_TARGET) {
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
  if (!inBand(call)) {
    return (
      <Shell>
        <Note
          tag="Out of the entry band"
          tone="warn"
          text={`Copying is open while price is between ${price(call.entry * (1 - call.bandPct))} and ${price(call.entry * (1 + call.bandPct))}. Right now you’d buy worse than the caller.`}
          action={
            <button
              type="button"
              className="h-11 cursor-pointer border border-line-strong bg-surface-2 text-[14px]"
            >
              Notify me when it's back
            </button>
          }
        />
      </Shell>
    )
  }
  if (bought !== null) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-2.5 text-center">
          <span className="grid size-12 place-items-center bg-good-soft text-[22px] text-good">
            {'✓'}
          </span>
          <h3 className="text-[18px] font-medium">Bought</h3>
          <p className="text-[13px] text-muted">
            {usd(bought)} of {call.asset}, copying @{call.caller}
          </p>
          <dl className="mt-2 w-full space-y-2.5 text-left text-[13px]">
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
          <span className="flex h-12 items-center border border-line-strong bg-sidebar px-3.5">
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
            <dt className="text-muted">Est. at TP</dt>
            <dd className="text-good">{signedUsd(est.atTarget)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Est. at SL</dt>
            <dd className="text-bad">{signedUsd(est.atStop)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-1.5 text-muted">
              Call fee, refundable
              <Info
                label="About the call fee"
                text="Held on Arc. Paid to the caller only if the call works; refunded in full if it’s wrong."
              />
            </dt>
            <dd>{usd(est.fee)}</dd>
          </div>
        </dl>
        <button
          type="button"
          disabled={size <= 0 || size > balance}
          onClick={() => setBought(size)}
          className="h-[46px] cursor-pointer bg-good text-[14px] font-semibold text-bg hover:brightness-110"
        >
          {size > balance ? 'More than your balance' : `Copy long ${call.asset}`}
        </button>
      </div>
    </Shell>
  )
}
