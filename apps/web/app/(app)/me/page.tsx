import Link from 'next/link'
import { CloseButton } from '@/components/close-button'
import { cx, PageTitle, TokenIcon } from '@/components/ui'
import { callById, positions, settled, statusLabel } from '@/lib/data'
import { price, signedUsd, usd } from '@/lib/format'

const toneDot = { good: 'bg-good', bad: 'bg-bad', warn: 'bg-warn', faint: 'bg-faint' }

export default function Portfolio() {
  const open = positions.flatMap((p) => {
    const call = callById(p.callId)
    if (!call) return []
    const pnl = (p.sizeUsd * (call.price - p.boughtAt)) / p.boughtAt
    return [{ ...p, call, pnl, value: p.sizeUsd + pnl }]
  })
  const openValue = open.reduce((s, p) => s + p.value, 0)
  const unrealised = open.reduce((s, p) => s + p.pnl, 0)
  const realised = settled.reduce((s, x) => s + x.pnlUsd, 0)
  const right = settled.filter((s) => s.pnlUsd > 0).length

  return (
    <div className="space-y-6">
      <PageTitle title="Portfolio" sub="Calls you copied, open and settled." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className="flex flex-col gap-1.5 border border-line-strong p-5 text-white" style={{ background: 'var(--sc-brand)' }}>
          <span className="text-[12px] text-white/85">Open positions</span>
          <span className="text-[32px] font-medium tracking-[-0.03em]">{usd(openValue)}</span>
          <span className="text-[12px] text-white/90">{signedUsd(unrealised)} unrealised</span>
        </div>
        {[
          { k: 'Realised', v: signedUsd(realised), sub: 'after fees', tone: realised >= 0 ? 'text-good' : 'text-bad' },
          { k: 'Paid back to you', v: '$6.95', sub: 'fee back + credit on wrong calls' },
          { k: 'Calls copied', v: String(positions.length + settled.length), sub: `${right} right · ${settled.length - right} wrong` },
        ].map((s) => (
          <div key={s.k} className="surface-card flex flex-col gap-1.5 p-5">
            <span className="text-[12px] text-muted">{s.k}</span>
            <span className={cx('text-[28px] font-medium tracking-[-0.03em]', s.tone)}>{s.v}</span>
            <span className="text-[12px] text-muted">{s.sub}</span>
          </div>
        ))}
      </div>

      <section className="surface-card">
        <h2 className="p-4 text-[15px] font-medium">Open positions</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead>
              <tr className="border-y border-line text-left text-[12px] text-muted">
                <th className="px-4 py-2.5 font-normal">Call</th>
                <th className="py-2.5 font-normal">Status</th>
                <th className="py-2.5 text-right font-normal">Size</th>
                <th className="py-2.5 text-right font-normal">Bought at</th>
                <th className="py-2.5 text-right font-normal">Now</th>
                <th className="py-2.5 text-right font-normal">P&amp;L</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {open.map((p) => (
                <tr key={p.id} className="border-b border-line">
                  <td className="px-4 py-3">
                    <Link href={`/c/${p.call.id}`} className="flex items-center gap-2.5">
                      <TokenIcon symbol={p.call.asset} size={28} />
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium">{p.call.asset} long</span>
                        <span className="text-[12px] text-muted">@{p.call.caller}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1.5 text-good">
                      <span className="size-1.5 rounded-full bg-good" />
                      Holding
                    </span>
                  </td>
                  <td className="py-3 text-right">{usd(p.sizeUsd)}</td>
                  <td className="py-3 text-right text-silver">{price(p.boughtAt)}</td>
                  <td className="py-3 text-right">{price(p.call.price)}</td>
                  <td className={cx('py-3 text-right font-medium', p.pnl >= 0 ? 'text-good' : 'text-bad')}>{signedUsd(p.pnl)}</td>
                  <td className="px-4 py-3 text-right">
                    <CloseButton />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card">
        <h2 className="p-4 text-[15px] font-medium">History</h2>
        {settled.map((s) => {
          const call = callById(s.callId)
          if (!call) return null
          const st = statusLabel[call.status]
          return (
            <Link
              key={s.id}
              href={`/c/${call.id}`}
              className="grid grid-cols-[minmax(200px,2fr)_1.2fr_0.8fr_1.4fr_0.9fr] items-center gap-3.5 border-t border-line px-4 py-3 text-[13px] hover:bg-surface-2"
            >
              <span className="flex items-center gap-2.5">
                <TokenIcon symbol={call.asset} size={28} />
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{call.asset}</span>
                  <span className="text-[12px] text-muted">@{call.caller}</span>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-silver">
                <span className={cx('size-1.5 rounded-full', toneDot[st.tone])} />
                {st.label}
              </span>
              <span className="text-right">{usd(s.sizeUsd)}</span>
              <span className="text-right text-muted">{s.note}</span>
              <span className={cx('text-right font-medium', s.pnlUsd >= 0 ? 'text-good' : 'text-bad')}>{signedUsd(s.pnlUsd)}</span>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
