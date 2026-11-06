import { CallCard } from '@/components/call-card'
import { CallsTable } from '@/components/calls-table'
import { MarketsRow } from '@/components/markets-row'
import { PageTitle } from '@/components/ui'
import { callerByHandle, getCalls, getCallers, getMarkets, isOpen } from '@/lib/data'

export default async function Explore() {
  const [calls, callers, markets] = await Promise.all([getCalls(), getCallers(), getMarkets()])
  const boosted = calls.filter((c) => c.boost && isOpen(c.status))
  return (
    <div className="space-y-8">
      <PageTitle title="Explore" sub="Calls from verified humans, paid only when right." />
      <section aria-label="Boosted calls" className="space-y-3">
        <div className="flex items-center gap-2 text-[15px] font-medium">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="text-silver"
          >
            <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
          </svg>
          Boosted top-rated calls
          <span className="text-[13px] font-normal text-muted">SuperFactor 70+</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {boosted.map((c) => (
            <CallCard key={c.id} call={c} caller={callerByHandle(callers, c.caller)} />
          ))}
        </div>
      </section>
      <CallsTable calls={calls} callers={callers} />
      <MarketsRow markets={markets} />
    </div>
  )
}
