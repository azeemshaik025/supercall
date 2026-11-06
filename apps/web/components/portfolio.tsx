'use client'

// The follower's copies, live: each order's state, the fill, the value now, and Cancel or
// Close now on it. Updates on its own after a copy, a close or a cancel, and while orders work.
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { type ApiCall, fetchCall } from '@/lib/api'
import {
  COPY_STEP,
  type CopyStep,
  orderState,
  useCopies,
  useCopyActions,
  type WalletCopy,
} from '@/lib/copy'
import { statusLabel } from '@/lib/data'
import { pct, price, signedUsd, usd } from '@/lib/format'
import { useLivePrice } from '@/lib/live-price'
import { useMe, walletOf } from '@/lib/me'
import { cx, Info, TokenIcon } from './ui'

const TONE = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', muted: 'text-muted' }

/** The calls behind the copies, read once each. */
function useCalls(ids: string[]) {
  const [calls, setCalls] = useState<Record<string, ApiCall>>({})
  const key = [...new Set(ids)].sort().join(',')
  useEffect(() => {
    if (!key) return
    let live = true
    Promise.all(key.split(',').map((id) => fetchCall(id))).then((list) => {
      if (!live) return
      setCalls(Object.fromEntries(list.filter((c): c is ApiCall => !!c).map((c) => [c.id, c])))
    })
    return () => {
      live = false
    }
  }, [key])
  return calls
}

export function Portfolio() {
  const { ready, authenticated, login } = usePrivy()
  const { me } = useMe()
  const wallet = authenticated ? walletOf(me) : undefined
  const { copies, error } = useCopies(wallet)
  const calls = useCalls(copies?.map((c) => c.call) ?? [])

  if (!ready || (authenticated && !wallet))
    return <div className="surface-card h-40 animate-pulse" />
  if (!authenticated)
    return (
      <div className="surface-card flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-[13px] text-muted">Sign in to see the calls you copied.</p>
        <button
          type="button"
          onClick={() => login()}
          className="btn-cta h-10 cursor-pointer px-5 text-[13px]"
        >
          Sign in
        </button>
      </div>
    )
  if (error && !copies)
    return <p className="surface-card p-10 text-center text-[13px] text-bad">{error}</p>
  if (!copies) return <div className="surface-card h-40 animate-pulse" />
  if (copies.length === 0)
    return (
      <div className="surface-card flex flex-col items-center gap-4 p-10 text-center">
        <p className="text-[13px] text-muted">No copies yet. Find a live call to copy.</p>
        <Link href="/explore" className="btn-cta flex h-10 items-center px-5 text-[13px]">
          Explore calls
        </Link>
      </div>
    )

  const open = copies.filter(
    (c) => !c.closed && (c.fill || orderState(c.status, false).tone === 'warn' || !c.status),
  )
  const done = copies.filter((c) => !open.includes(c))
  return (
    <div className="flex flex-col gap-6">
      <Section title="Open" copies={open} calls={calls} wallet={wallet ?? ''} />
      <Section title="History" copies={done} calls={calls} wallet={wallet ?? ''} />
    </div>
  )
}

function Section({
  title,
  copies,
  calls,
  wallet,
}: {
  title: string
  copies: WalletCopy[]
  calls: Record<string, ApiCall>
  wallet: string
}) {
  if (copies.length === 0) return null
  return (
    <section className="surface-card flex flex-col">
      <h2 className="border-b border-line px-5 py-3.5 text-[14px] font-medium">
        {title} <span className="text-muted">{copies.length}</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[12px] text-muted">
              <th className="px-5 py-2.5 font-normal">Call</th>
              <th className="px-3 py-2.5 font-normal">Size</th>
              <th className="px-3 py-2.5 font-normal">Order</th>
              <th className="px-3 py-2.5 font-normal">Bought at</th>
              <th className="px-3 py-2.5 font-normal">Now</th>
              <th className="px-3 py-2.5 font-normal">
                <span className="flex items-center gap-1.5">
                  P/L
                  <Info
                    label="How P/L is measured"
                    below
                    text="Measured from your buy price on what the buy spent. The platform fee and Flash’s costs came out of your size first; your call fee is held separately and comes back if the call is wrong."
                  />
                </span>
              </th>
              <th className="px-3 py-2.5 font-normal">Call</th>
              <th className="px-5 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {copies.map((c) => (
              <Row key={c.payFeeTx} copy={c} call={calls[c.call]} wallet={wallet} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Row({ copy, call, wallet }: { copy: WalletCopy; call?: ApiCall; wallet: string }) {
  const { cancel, close } = useCopyActions()
  const [step, setStep] = useState<CopyStep | 'cancel' | null>(null)
  const [error, setError] = useState<string>()
  const now = useLivePrice(
    copy.fill && !copy.closed ? call?.assetAddress : undefined,
    call?.price ?? 0,
  )
  const st = copy.closed
    ? copy.closed.gotUsd > 0
      ? { label: 'Sold', tone: 'muted' as const }
      : { label: 'Selling', tone: 'warn' as const }
    : orderState(copy.status, !!copy.fill)
  const value = copy.closed?.gotUsd
    ? copy.closed.gotUsd
    : copy.fill
      ? copy.fill.coin * now.value
      : null
  const pnl = value !== null && copy.fill ? value - copy.fill.spentUsd : null

  const run = async (work: () => Promise<void>) => {
    setError(undefined)
    try {
      await work()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/reject|denied|cancel/i.test(msg) ? 'Cancelled in your wallet' : msg)
    } finally {
      setStep(null)
    }
  }

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-5 py-3">
        <Link href={`/c/${copy.call}`} className="flex items-center gap-2.5">
          <TokenIcon symbol={call?.asset ?? ''} size={22} />
          <span className="flex flex-col">
            <span className="font-medium">{call ? `${call.asset}/USDC` : '…'}</span>
            <span className="text-[11px] text-muted">{call ? `@${call.caller}` : ''}</span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-3 tabular-nums">
        {usd(copy.sizeUsd)}
        <span className="block text-[11px] text-faint">fee {usd(copy.callFeeUsd)}, refundable</span>
      </td>
      <td className={cx('px-3 py-3', TONE[st.tone])}>{st.label}</td>
      <td className="px-3 py-3 tabular-nums">{copy.fill ? price(copy.fill.price) : '—'}</td>
      <td
        className={cx(
          'px-3 py-3 tabular-nums transition-colors duration-700',
          now.dir > 0 ? 'text-good' : now.dir < 0 ? 'text-bad' : '',
        )}
      >
        {copy.fill && !copy.closed ? price(now.value) : '—'}
      </td>
      <td
        className={cx(
          'px-3 py-3 tabular-nums',
          pnl === null ? '' : pnl >= 0 ? 'text-good' : 'text-bad',
        )}
      >
        {pnl === null || !copy.fill ? (
          '—'
        ) : (
          <>
            {signedUsd(pnl)}
            <span className="block text-[11px]">{pct(pnl / copy.fill.spentUsd, 2)}</span>
          </>
        )}
      </td>
      <td className="px-3 py-3 text-muted">{call ? statusLabel[call.status].label : '—'}</td>
      <td className="px-5 py-3 text-right">
        {copy.cancel && !copy.fill && (
          <button
            type="button"
            disabled={step !== null}
            onClick={() =>
              run(async () => {
                setStep('cancel')
                await cancel(wallet, copy)
              })
            }
            className="h-8 cursor-pointer border border-line-strong px-3 text-[12px] hover:bg-surface-2 disabled:opacity-60"
          >
            {step === 'cancel' ? 'Sign the cancel…' : 'Cancel buy'}
          </button>
        )}
        {copy.fill && !copy.closed && (
          <button
            type="button"
            disabled={step !== null}
            onClick={() => run(() => close(wallet, copy, setStep))}
            className="h-8 cursor-pointer border border-line-strong px-3 text-[12px] hover:bg-surface-2 disabled:opacity-60"
          >
            {step && step !== 'cancel' ? COPY_STEP[step] : 'Close now'}
          </button>
        )}
        {error && <p className="mt-1 max-w-[220px] text-[11px] text-bad">{error}</p>}
      </td>
    </tr>
  )
}
