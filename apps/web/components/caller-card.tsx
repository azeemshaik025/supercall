import Link from 'next/link'
import { usdShort } from '@/lib/format'
import type { Caller } from '@/lib/types'
import { VerifiedBadge } from './ui'

export function LastTen({
  outcomes,
  size = 16,
  onBrand = false,
}: {
  outcomes: Caller['lastTen']
  size?: number
  onBrand?: boolean
}) {
  const wins = outcomes.filter((o) => o === 'W').length
  return (
    <span
      role="img"
      aria-label={`Last ${outcomes.length} calls: ${wins} right, newest on the right`}
      className="flex gap-[3px]"
    >
      {outcomes
        .map((o, i) => ({ o, slot: `call-${outcomes.length - i}` }))
        .map(({ o, slot }) => (
          <span
            key={slot}
            style={{ width: size, height: size }}
            className={
              onBrand
                ? o === 'W'
                  ? 'bg-white/90'
                  : 'bg-white/20'
                : o === 'W'
                  ? 'bg-good'
                  : 'bg-bad/55'
            }
          />
        ))}
    </span>
  )
}

export function CallerCard({ caller }: { caller: Caller }) {
  return (
    <section
      aria-label="Caller"
      className="flex flex-col gap-3.5 border border-line-strong p-5 text-white"
      style={{ background: 'var(--sc-brand)' }}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-[34px] place-items-center bg-white/15 font-medium">
          {caller.name[0]}
        </span>
        <span className="flex flex-col">
          <span className="flex items-center gap-1.5 text-[14px] font-medium">
            {caller.name} {caller.verified && <VerifiedBadge size={13} />}
          </span>
          <span className="text-[12px] text-white/80">@{caller.handle}</span>
        </span>
      </div>
      <span className="flex items-baseline gap-2">
        <span className="text-[52px] leading-none font-medium tracking-[-0.04em]">
          {caller.superFactor}
        </span>
        <span className="text-[13px] text-white/85">SuperFactor</span>
      </span>
      <LastTen outcomes={caller.lastTen} onBrand />
      <span className="text-[13px] text-white/90">
        Followers made {caller.followersNetUsd >= 0 ? '+' : ''}
        {usdShort(caller.followersNetUsd)} · fund {usdShort(caller.fundUsd)}
      </span>
      <Link
        href={`/u/${caller.handle}`}
        className="flex h-[34px] items-center self-start bg-ink px-3 text-[13px] font-medium text-bg"
      >
        See full record
      </Link>
    </section>
  )
}
