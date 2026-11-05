import Link from 'next/link'
import { CloseButton } from '@/components/close-button'
import { cx, PageTitle, TokenIcon } from '@/components/ui'
import { callById, callsBy, me, positions, settled, statusLabel } from '@/lib/data'
import { price, signedUsd, usd } from '@/lib/format'

const toneDot = { good: 'bg-good', bad: 'bg-bad', warn: 'bg-warn', faint: 'bg-faint' }

export default async function Portfolio({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const calling = tab === 'calling'
  const open = positions.flatMap((p) => {
    const call = callById(p.callId)
    if (!call) return []
    const pnl = (p.sizeUsd * (call.price - p.boughtAt)) / p.boughtAt
    return [{ ...p, call, pnl, value: p.sizeUsd + pnl }]
  })
  const openValue = open.reduce((s, p) => s + p.value, 0)
  const unrealised = open.reduce((s, p) => s + p.pnl, 0)
  const realised = settled.reduce((s, x) => s + x.pnlUsd, 0)
  const mine = callsBy(me.handle)

  return (
    <div className="space-y-6">
      <PageTitle
        title="Portfolio"
        action={
          <div
            role="tablist"
            aria-label="View"
            className="flex gap-0.5 border border-line bg-surface p-[3px]"
          >
            {[
              ['Following', '/me'],
              ['Calling', '/me?tab=calling'],
            ].map(([label, href]) => {
              const on = (label === 'Calling') === calling
              return (
                <Link
                  key={label}
                  href={href as string}
                  role="tab"
                  aria-selected={on}
                  className={cx(
                    'flex h-8 items-center px-3.5 text-[13px]',
                    on ? 'sheen text-ink' : 'border border-transparent text-muted hover:text-ink',
                  )}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        }
      />

      {!calling ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <div
              className="flex flex-col gap-1.5 border border-line-strong p-5 text-white"
              style={{ background: 'var(--sc-brand)' }}
            >
              <span className="text-[12px] text-white/85">Open positions</span>
              <span className="text-[32px] font-medium tracking-[-0.03em]">{usd(openValue)}</span>
              <span className="text-[12px] text-white/90">{signedUsd(unrealised)} unrealised</span>
            </div>
            {[
              {
                k: 'Realised',
                v: signedUsd(realised),
                sub: 'after fees',
                tone: realised >= 0 ? 'text-good' : 'text-bad',
              },
              { k: 'Paid back to you', v: '$6.95', sub: 'fee back + credit on wrong calls' },
              {
                k: 'Calls copied',
                v: String(positions.length + settled.length),
                sub: `${settled.filter((s) => s.pnlUsd > 0).length} right · ${settled.filter((s) => s.pnlUsd < 0).length} wrong`,
              },
            ].map((s) => (
              <div key={s.k} className="surface-card flex flex-col gap-1.5 p-5">
                <span className="text-[12px] text-muted">{s.k}</span>
                <span className={cx('text-[28px] font-medium tracking-[-0.03em]', s.tone)}>
                  {s.v}
                </span>
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
                    <th className="px-4 py-2.5" />
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
                      <td
                        className={cx(
                          'py-3 text-right font-medium',
                          p.pnl >= 0 ? 'text-good' : 'text-bad',
                        )}
                      >
                        {signedUsd(p.pnl)}
                      </td>
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
                  <span
                    className={cx(
                      'text-right font-medium',
                      s.pnlUsd >= 0 ? 'text-good' : 'text-bad',
                    )}
                  >
                    {signedUsd(s.pnlUsd)}
                  </span>
                </Link>
              )
            })}
          </section>
        </>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            {[
              { k: 'SuperFactor', v: String(me.superFactor) },
              { k: 'Earned', v: usd(me.earnedUsd) },
              { k: 'Your fund', v: usd(me.fundUsd), sub: 'pays credit when you are wrong' },
            ].map((s) => (
              <div key={s.k} className="surface-card flex flex-col gap-1.5 p-5">
                <span className="text-[12px] text-muted">{s.k}</span>
                <span className="text-[28px] font-medium">{s.v}</span>
                {s.sub && <span className="text-[12px] text-muted">{s.sub}</span>}
              </div>
            ))}
          </div>
          <section className="surface-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <h2 className="text-[15px] font-medium">Your calls</h2>
              <Link
                href="/compose"
                className="btn-cta flex h-[34px] items-center px-3.5 text-[13px]"
              >
                Publish a call
              </Link>
            </div>
            {mine.length === 0 ? (
              <p className="px-4 py-10 text-center text-[13px] text-muted">
                No calls yet. Publish one and it shows up here.
              </p>
            ) : (
              mine.map((c) => (
                <Link
                  key={c.id}
                  href={`/c/${c.id}`}
                  className="flex items-center gap-3 border-b border-line px-4 py-3 text-[13px]"
                >
                  <TokenIcon symbol={c.asset} size={28} />
                  <span className="font-medium">
                    {c.asset} {c.long ? 'long' : 'short'}
                  </span>
                  <span className="ml-auto text-muted">{statusLabel[c.status].label}</span>
                </Link>
              ))
            )}
          </section>
        </>
      )}
    </div>
  )
}
