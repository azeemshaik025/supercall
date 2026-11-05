import Link from 'next/link'
import { CallCard } from '@/components/call-card'
import { PageTitle } from '@/components/ui'
import { callerByHandle, callsBy, isOpen, me } from '@/lib/data'
import { usd, usdShort } from '@/lib/format'
import { callerCut } from '@/lib/money'

export default function MyCalls() {
  const mine = callsBy(me.handle)
  const caller = callerByHandle(me.handle)
  const open = mine.filter((c) => isOpen(c.status))
  const ended = mine.filter((c) => !isOpen(c.status))
  const stats = [
    {
      k: 'SuperFactor',
      v: String(me.superFactor),
      sub: `${Math.round(callerCut(me.superFactor) * 100)}% cut of kept fees`,
    },
    { k: 'Earned', v: usd(me.earnedUsd), sub: 'from calls that worked' },
    {
      k: 'Copied',
      v: usdShort(mine.reduce((s, c) => s + c.copiedUsd, 0)),
      sub: `${mine.reduce((s, c) => s + c.copiers, 0)} followers`,
    },
    { k: 'Your fund', v: usd(me.fundUsd), sub: 'pays credit when you are wrong' },
  ]
  return (
    <div className="space-y-6">
      <PageTitle
        title="My calls"
        sub="Every call you published, on record for good."
        action={
          <Link href="/compose" className="btn-cta flex h-10 items-center px-4 text-[13px]">
            Publish a call
          </Link>
        }
      />
      <div className="surface-card grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {stats.map((s, i) => (
          <div
            key={s.k}
            className={`flex flex-col gap-1.5 p-[18px] ${i ? 'border-l border-line' : ''}`}
          >
            <span className="text-[12px] text-muted">{s.k}</span>
            <span className="text-[22px] font-medium">{s.v}</span>
            <span className="text-[12px] text-muted">{s.sub}</span>
          </div>
        ))}
      </div>
      {[
        ['Open', open],
        ['Ended', ended],
      ].map(([title, list]) => (
        <section key={title as string} className="space-y-3">
          <h2 className="text-[15px] font-medium">{title as string}</h2>
          {(list as typeof mine).length === 0 ? (
            <p className="surface-card p-8 text-center text-[13px] text-muted">Nothing here yet.</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
              {(list as typeof mine).map((c) => (
                <CallCard key={c.id} call={c} caller={caller} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
