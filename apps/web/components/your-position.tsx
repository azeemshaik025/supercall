'use client'

// Under a call's chart: your copies of it, one row each, with what you put in, your price, the
// price now, P&L, and the transactions on chain. Nothing shows until you've copied.
import { usePrivy } from '@privy-io/react-auth'
import { CHAIN } from '@supercall/chains'
import type { ApiCall } from '@/lib/api'
import { orderState, useCopies, type WalletCopy } from '@/lib/copy'
import { pct, price, signedUsd, usd } from '@/lib/format'
import { useLivePrice } from '@/lib/live-price'
import { useMe, walletOf } from '@/lib/me'
import { cx, Info } from './ui'

const TONE = { good: 'text-good', warn: 'text-warn', bad: 'text-bad', muted: 'text-muted' }
const isTx = (s: string | null | undefined): s is string => !!s && /^0x[0-9a-f]{64}$/i.test(s)
const explorer = (path: string) => `${CHAIN.explorerUrl}/${path}`

export function YourPosition({ call }: { call: ApiCall }) {
  const { authenticated } = usePrivy()
  const { me } = useMe()
  const wallet = authenticated ? walletOf(me) : undefined
  const { copies } = useCopies(wallet)
  const now = useLivePrice(call.assetAddress, call.price)
  const mine = (copies ?? [])
    .filter((c) => c.call === call.id)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  if (!wallet || mine.length === 0) return null
  return (
    <section className="surface-card">
      <div className="flex h-11 items-center justify-between border-b border-line px-5 text-[13px]">
        <span className="font-medium">Your position</span>
        <span className="text-muted">
          {mine.length} {mine.length === 1 ? 'copy' : 'copies'} · updates live
        </span>
      </div>
      {mine.map((c) => (
        <Row key={c.payFeeTx} copy={c} now={now.value} wallet={wallet} />
      ))}
    </section>
  )
}

function Row({ copy, now, wallet }: { copy: WalletCopy; now: number; wallet: string }) {
  const st = copy.closed
    ? copy.closed.gotUsd > 0
      ? { label: 'Sold', tone: 'muted' as const }
      : { label: 'Selling', tone: 'warn' as const }
    : orderState(copy.status, !!copy.fill)
  const value = copy.closed?.gotUsd ? copy.closed.gotUsd : copy.fill ? copy.fill.coin * now : null
  const pnl = value !== null && copy.fill ? value - copy.fill.spentUsd : null
  const tone = pnl === null ? 'text-muted' : pnl < 0 ? 'text-bad' : 'text-good'
  return (
    <div className="grid grid-cols-2 items-start gap-x-6 gap-y-4 border-b border-line px-5 py-4 last:border-b-0 md:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      <Figure k="You put in" v={usd(copy.sizeUsd)} sub={new Date(copy.at).toLocaleString()} />
      <Figure
        k="Your price"
        v={copy.fill ? price(copy.fill.price) : st.label}
        sub={copy.fill ? st.label : undefined}
        tone={copy.fill ? 'text-ink' : TONE[st.tone]}
      />
      <Figure k={copy.closed ? 'Sold' : 'Price now'} v={copy.closed ? 'Closed' : price(now)} />
      <Figure k={copy.closed ? 'Got back' : 'Worth now'} v={value !== null ? usd(value) : '—'} />
      <Figure
        k="P&L"
        v={pnl === null ? '—' : signedUsd(pnl)}
        sub={
          pnl === null || !copy.fill
            ? undefined
            : `${pnl >= 0 ? '+' : '−'}${pct(Math.abs(pnl / copy.fill.spentUsd), 2)}`
        }
        tone={tone}
        info="Measured from your price on what the buy spent. The platform fee and Flash’s costs came out of your size first; your call fee is held in Hisaab and comes back if the call is wrong."
      />
      <div className="col-span-2 flex flex-col gap-1.5 text-[12px] md:col-span-1">
        <span className="text-muted">On chain</span>
        {isTx(copy.fill?.tx) && (
          <ChainLink href={explorer(`tx/${copy.fill.tx}`)}>Trade by Flash</ChainLink>
        )}
        {isTx(copy.payFeeTx) && (
          <ChainLink href={explorer(`tx/${copy.payFeeTx}`)}>Fee into Hisaab</ChainLink>
        )}
        <ChainLink href={explorer(`address/${wallet}`)}>Your wallet</ChainLink>
      </div>
    </div>
  )
}

function ChainLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="w-fit whitespace-nowrap text-silver underline underline-offset-2 hover:text-ink"
    >
      {children} on {CHAIN.name} ↗
    </a>
  )
}

function Figure({
  k,
  v,
  sub,
  tone = 'text-ink',
  info,
}: {
  k: string
  v: string
  sub?: string
  tone?: string
  info?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1 text-[12px] text-muted">
        {k}
        {info && <Info label={`About ${k}`} text={info} wide />}
      </span>
      <span className={cx('text-[20px] leading-6 font-medium tabular-nums', tone)}>{v}</span>
      {sub && <span className={cx('text-[12px]', k === 'P&L' ? tone : 'text-muted')}>{sub}</span>}
    </div>
  )
}
