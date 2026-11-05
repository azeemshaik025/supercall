import { CallersTable } from '@/components/callers-table'
import { PageTitle } from '@/components/ui'
import { callers } from '@/lib/data'
import { usdShort } from '@/lib/format'

export default function Callers() {
  const made = callers.reduce((s, c) => s + c.followersNetUsd, 0)
  const stats = [
    { k: 'Callers', v: String(callers.length), sub: 'one verified human each' },
    { k: 'Followers made', v: `+${usdShort(made)}`, sub: 'after fees and credit', tone: 'text-good' },
    { k: 'In their funds', v: usdShort(callers.reduce((s, c) => s + c.fundUsd, 0)), sub: 'credit for wrong calls' },
  ]
  return (
    <div className="space-y-6">
      <PageTitle title="Callers" sub="One verified human each. Full records on Arkiv." />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {stats.map((s) => (
          <div key={s.k} className="surface-card flex flex-col gap-1.5 p-[18px]">
            <span className="text-[12px] text-muted">{s.k}</span>
            <span className={`text-[28px] font-medium tracking-[-0.03em] ${s.tone ?? ''}`}>{s.v}</span>
            <span className="text-[12px] text-muted">{s.sub}</span>
          </div>
        ))}
      </div>
      <CallersTable callers={callers} />
    </div>
  )
}
