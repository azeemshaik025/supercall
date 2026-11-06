import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CallChart } from '@/components/call-chart'
import { CallDetails } from '@/components/call-details'
import { CallerCard } from '@/components/caller-card'
import { CopyPanel } from '@/components/copy-panel'
import { cx, SideTag, TokenIcon, VerifiedBadge } from '@/components/ui'
import { getCall, getCaller, getCandles, statusLabel } from '@/lib/data'
import { ago, pct, price, timeLeft } from '@/lib/format'
import { moveVsEntry } from '@/lib/money'

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const call = await getCall(id)
  if (!call) notFound()
  const [caller, candles] = await Promise.all([
    getCaller(call.caller),
    getCandles(call.assetAddress ?? ''),
  ])
  const now = new Date()
  const move = moveVsEntry(call)
  const open = ['pending', 'armed', 'live'].includes(call.status)
  const strip = [
    { k: 'Price', v: price(call.price), live: true },
    { k: 'Entry', v: price(call.entry) },
    { k: 'Target', v: price(call.target), tone: 'text-good' },
    { k: 'Stop', v: price(call.stop), tone: 'text-bad' },
    {
      k: open ? 'Ends in' : 'Status',
      v: open ? timeLeft(call.expiresAt, now) : statusLabel[call.status].label,
    },
  ]
  return (
    <div className="flex flex-col gap-5">
      <section className="surface-card flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-[18px]">
        <div className="flex items-center gap-3">
          <TokenIcon symbol={call.asset} size={40} />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[18px] font-medium">
                {call.asset}
                <span className="text-muted">/USDC</span>
              </span>
              <SideTag long={call.direction === 'long'} />
              {call.supercall && (
                <span className="btn-cta px-1.5 py-px text-[12px]">
                  <i className="font-semibold">Super</i>call
                </span>
              )}
            </div>
            <span className="flex items-center gap-1.5 text-[13px] text-muted">
              <Link href={`/u/${call.caller}`} className="text-ink">
                @{call.caller}
              </Link>
              {caller?.verified && <VerifiedBadge size={13} />} · SF {caller?.superFactor ?? 50} ·{' '}
              {ago(call.createdAt, now)}
            </span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-y-4">
          {strip.map((s, i) => (
            <span
              key={s.k}
              className={cx(
                'flex flex-col gap-1.5',
                i === 0
                  ? 'pr-8'
                  : i === strip.length - 1
                    ? 'border-l border-line pl-8'
                    : 'border-l border-line px-8',
              )}
            >
              <span className="flex items-center gap-1.5 text-[12px] text-muted">
                {s.k}
                {s.live && open && <span className="size-1.5 rounded-full bg-good" />}
              </span>
              <span className={cx('text-[17px] font-medium', s.tone)}>{s.v}</span>
            </span>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <section
            aria-label="Price since the call"
            className="surface-card flex flex-col gap-4 p-5"
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-fade text-[40px] leading-none font-medium tracking-[-0.04em]">
                {price(call.price)}
              </span>
              <span className="text-[13px] text-muted">
                <span className={cx('font-medium', move >= 0 ? 'text-good' : 'text-bad')}>
                  {pct(move, 2)}
                </span>{' '}
                since entry
              </span>
            </div>
            <CallChart call={call} candles={candles} />
          </section>
          <CallDetails call={call} />
        </div>
        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          <CopyPanel call={call} />
          {caller && <CallerCard caller={caller} />}
        </aside>
      </div>
    </div>
  )
}
