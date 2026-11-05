import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CallCard } from '@/components/call-card'
import { LastTen } from '@/components/caller-card'
import { FollowButton } from '@/components/follow-button'
import { VerifiedBadge } from '@/components/ui'
import { callerByHandle, callers, callsBy, me } from '@/lib/data'
import { shortDate, usdShort } from '@/lib/format'
import { callerCut } from '@/lib/money'

export function generateStaticParams() {
  return callers.map((c) => ({ handle: c.handle }))
}

const events = [
  ['New caller', 'starts at 50'],
  ['Target hit', '+R, at most +3'],
  ['Stop hit', '−1'],
  ['Deadline or caller’s close', 'the move, in stop distances'],
  ['Never entered', '−0.25'],
  ['Cancelled supercall', '−1'],
]

export default async function CallerPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const caller = callerByHandle(handle)
  if (!caller) notFound()
  const list = callsBy(handle)
  const wins = caller.lastTen.filter((o) => o === 'W').length
  const mine = handle === me.handle
  const stats = [
    { k: 'Calls', v: String(caller.callCount) },
    { k: 'Last 10', v: `${wins}/${caller.lastTen.length}` },
    { k: 'Earned', v: usdShort(caller.earnedUsd) },
    { k: 'Followers made', v: `${caller.followersNetUsd >= 0 ? '+' : ''}${usdShort(caller.followersNetUsd)}`, sub: `${caller.followersProfitablePct}% in profit`, tone: caller.followersNetUsd >= 0 ? 'text-good' : 'text-bad' },
    { k: 'Fund', v: usdShort(caller.fundUsd), sub: 'credit if a call goes wrong' },
  ]
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-stretch gap-4">
        <section className="surface-card flex min-w-0 flex-[999_1_460px] flex-col gap-[18px] p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-16 shrink-0 place-items-center bg-surface-3 text-[24px] text-silver">{caller.name[0]}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <h1 className="flex items-center gap-2 text-[32px] leading-tight font-medium tracking-[-0.03em]">
                {caller.name} {caller.verified && <VerifiedBadge size={20} />}
              </h1>
              <span className="text-[13px] text-muted">
                @{caller.handle} · <a href={`https://x.com/${caller.xHandle}`} className="hover:text-ink">x.com/{caller.xHandle}</a>
              </span>
              <span className="text-[12px] text-muted">Calling since {shortDate(caller.joinedAt)}</span>
            </div>
            {mine ? (
              <Link href="/profile" className="flex h-[38px] items-center border border-line-strong px-4 text-[13px]">Edit profile</Link>
            ) : (
              <FollowButton initial={handle === '0xmeera'} />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12px] text-muted">Last 10 calls · newest on the right</span>
            <LastTen outcomes={caller.lastTen} size={22} />
          </div>
        </section>
        <section className="flex flex-[1_1_280px] flex-col justify-between gap-4 border border-line-strong p-6 text-white" style={{ background: 'var(--sc-brand)' }}>
          <span className="text-[13px] text-white/85"><i className="font-semibold">Super</i>Factor</span>
          <span className="text-[72px] leading-[0.9] font-medium tracking-[-0.05em]">{caller.superFactor}</span>
          <span className="text-[14px] text-white/90">Takes a {Math.round(callerCut(caller.superFactor) * 100)}% cut of kept fees.</span>
        </section>
      </div>

      <div className="surface-card grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {stats.map((s, i) => (
          <div key={s.k} className={`flex flex-col gap-1.5 p-[18px] ${i ? 'border-l border-line' : ''}`}>
            <span className="text-[12px] text-muted">{s.k}</span>
            <span className={`text-[22px] font-medium ${s.tone ?? ''}`}>{s.v}</span>
            {s.sub && <span className="text-[12px] text-muted">{s.sub}</span>}
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-medium">Calls</h2>
          <span className="text-[12px] text-muted">Deleted posts still count</span>
        </div>
        {list.length === 0 ? (
          <p className="surface-card p-10 text-center text-muted">No calls yet.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
            {list.map((c) => <CallCard key={c.id} call={c} caller={caller} />)}
          </div>
        )}
      </section>

      <section className="surface-card flex flex-wrap gap-6 p-5">
        <div className="flex min-w-80 flex-1 flex-col gap-2.5">
          <h2 className="text-[15px] font-medium">How SuperFactor works</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            A public formula over this caller's records on Arkiv, so anyone can recompute it. SuperFactor = 50 + 50 × S ÷ (W + 10), kept between 0 and 100. S sums call scores, W counts calls, and older calls count a little less. It sets the caller's cut of kept fees.
          </p>
        </div>
        <dl className="flex min-w-72 flex-1 flex-col">
          {events.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-line py-2.5 text-[13px]"><dt className="text-silver">{k}</dt><dd className="font-medium">{v}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  )
}
