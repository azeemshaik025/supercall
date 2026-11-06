import Link from 'next/link'
import { pct, price, timeLeft, usdShort } from '@/lib/format'
import { moveVsEntry } from '@/lib/money'
import type { Call, Caller } from '@/lib/types'
import { StatusBar } from './status-bar'
import { cx, SideTag, TokenIcon, VerifiedBadge } from './ui'

export function CallCard({ call, caller }: { call: Call; caller?: Caller }) {
  const move = moveVsEntry(call)
  const now = new Date()
  return (
    <Link href={`/c/${call.id}`} className="surface-card flex flex-col hover:border-line-strong">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3.5">
        <TokenIcon symbol={call.asset} size={24} />
        <span className="text-[14px] font-medium">
          {call.asset}
          <span className="font-normal text-muted">/USDC</span>
        </span>
        <SideTag long={call.direction === 'long'} />
        <span className="ml-auto text-[12px] whitespace-nowrap text-muted">
          {timeLeft(call.expiresAt, now)} left
        </span>
      </div>
      <div className="flex items-end justify-between gap-3 px-4 pt-4 pb-3.5">
        <span className="flex flex-col gap-1">
          <span className="text-[12px] text-muted">Now</span>
          <span className="text-[26px] leading-none font-medium tracking-[-0.03em]">
            {price(call.price)}
          </span>
        </span>
        <span className={cx('text-[13px] font-medium', move >= 0 ? 'text-good' : 'text-bad')}>
          {pct(move, 2)} <span className="text-[12px] font-normal text-muted">vs entry</span>
        </span>
      </div>
      <div className="px-4 pb-4">
        <StatusBar call={call} />
      </div>
      <div className="grid grid-cols-3 border-y border-line">
        <span className="flex flex-col gap-1 px-4 py-3">
          <span className="text-[11px] text-muted">Stop</span>
          <span className="text-[14px] text-bad">{price(call.stop)}</span>
        </span>
        <span className="flex flex-col gap-1 border-l border-line px-4 py-3">
          <span className="text-[11px] text-muted">Entry</span>
          <span className="text-[14px]">{price(call.entry)}</span>
        </span>
        <span className="flex flex-col items-end gap-1 border-l border-line px-4 py-3">
          <span className="text-[11px] text-muted">Target</span>
          <span className="text-[14px] text-good">{price(call.target)}</span>
        </span>
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 text-[13px]">
        <span className="text-silver">@{call.caller}</span>
        {caller?.verified && <VerifiedBadge />}
        <span className="ml-auto text-muted">
          SF <span className="text-ink">{caller?.superFactor ?? 50}</span>
        </span>
      </div>
    </Link>
  )
}
