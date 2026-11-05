import { moveVsEntry, progress } from '@/lib/money'
import type { Call } from '@/lib/types'
import { cx } from './ui'

/** Stop on the left, target on the right, entry tick, live dot for the price now. */
export function StatusBar({ call, thin = false }: { call: Call; thin?: boolean }) {
  const e = progress(call, call.entry) * 100
  const n = progress(call, call.price) * 100
  const winning = moveVsEntry(call) >= 0
  return (
    <div
      role="img"
      aria-label={`Price is ${Math.round(n)}% of the way from stop to target`}
      className={cx('relative bg-surface-2', thin ? 'h-1' : 'h-1.5')}
    >
      <div
        className={cx('absolute inset-y-0', winning ? 'hatch-up' : 'hatch-down')}
        style={{ left: `${Math.min(e, n)}%`, width: `${Math.abs(n - e)}%` }}
      />
      <div className="absolute -inset-y-1 w-0.5 bg-silver" style={{ left: `${e}%` }} />
      <div
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 bg-ink shadow-[0_0_12px_2px_var(--sc-glow)]"
        style={{ left: `${n}%` }}
      />
    </div>
  )
}
