import { notFound } from 'next/navigation'
import { CopyPanel } from '@/components/copy-panel'
import { StatusBar } from '@/components/status-bar'
import { cx, SideTag, TokenIcon, VerifiedBadge } from '@/components/ui'
import { callById, callerByHandle, calls, me } from '@/lib/data'
import { pct, price } from '@/lib/format'
import { moveVsEntry } from '@/lib/money'

export function generateStaticParams() {
  return calls.map((c) => ({ id: c.id }))
}

export default async function CopyPopup({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const call = callById(id)
  if (!call) notFound()
  const caller = callerByHandle(call.caller)
  const move = moveVsEntry(call)
  return (
    <>
      <header className="flex items-center justify-between px-0.5 py-1">
        <img src="/brand/logo.svg" alt="Supercall" className="h-[22px] w-auto" />
        <span className="font-mono text-[12px] text-muted">{me.address}</span>
      </header>
      <section className="surface-card flex flex-col gap-[18px] p-[18px]">
        <div className="flex items-center gap-3">
          <TokenIcon symbol={call.asset} size={36} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-center gap-2 text-[16px] font-medium">
              {call.asset}
              <span className="text-muted">/USDC</span>
              <SideTag long={call.long} />
            </span>
            <span className="flex items-center gap-1 text-[12px] text-muted">
              @{call.caller} {caller?.verified && <VerifiedBadge />} · SF{' '}
              {caller?.superFactor ?? 50}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1">
            <span className="text-[16px] font-medium">{price(call.price)}</span>
            <span className={cx('text-[12px]', move >= 0 ? 'text-good' : 'text-bad')}>
              {pct(move, 2)} vs entry
            </span>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <StatusBar call={call} />
          <div className="flex justify-between text-[12px] text-muted">
            <span>
              Stop <span className="text-bad">{price(call.stop)}</span>
            </span>
            <span>Entry {price(call.entry)}</span>
            <span>
              Target <span className="text-good">{price(call.target)}</span>
            </span>
          </div>
        </div>
      </section>
      <CopyPanel call={call} popup />
    </>
  )
}
