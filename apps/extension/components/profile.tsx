import type { Caller } from '../lib/caller'
import { Mark } from './card'

/** $1,240 · $12.50 · $0.40 · $0: whole dollars from $100, and for none. */
function usd(n: number) {
  const digits = n === 0 || Math.abs(n) >= 100 ? 0 : 2
  const s = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return `${n < 0 ? '−' : ''}$${s}`
}

function SuperFactor({ value }: { value: number }) {
  return (
    <>
      <b>{Math.round(value)}</b>
      <span className="sc-sf-name">
        <i>Super</i>Factor
      </span>
    </>
  )
}

/** A seal with a check: verified a unique human with World ID. */
function Human() {
  return (
    <span
      className="sc-phuman"
      title="Verified human with World ID: one person, one caller account"
    >
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3 3.2.1z"
        />
        <path
          d="M7.8 12.2l2.8 2.8 5.6-5.8"
          fill="none"
          stroke="var(--night)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Verified human
    </span>
  )
}

/** Beside the name on a caller's X profile: the mark, their SuperFactor, and whether they're a verified human. */
export function ProfileBadge({ caller, web }: { caller: Caller; web: string }) {
  return (
    <span className="sc-prow">
      <a
        className="sc-pbadge"
        href={`${web}/u/${caller.handle}`}
        target="_blank"
        rel="noreferrer"
        title={`${caller.displayName} on Supercall`}
      >
        <Mark />
        <SuperFactor value={caller.superFactor} />
      </a>
      {caller.verified && <Human />}
    </span>
  )
}

const outcome = {
  W: ['Target hit', 'good'],
  L: ['Stop hit', 'bad'],
  E: ['Ended', 'muted'],
} as const

/**
 * Under a caller's follow counts, in the same look: their record on Supercall as one wrapping
 * row of counts, the last ten calls, and a link to all of them.
 */
export function ProfilePanel({ caller, web }: { caller: Caller; web: string }) {
  const settled = caller.lastTen.length > 0
  const stats: [string, string][] = [
    [caller.callCount.toLocaleString('en-US'), caller.callCount === 1 ? 'Call' : 'Calls'],
    [usd(caller.earnedUsd), 'Earned'],
    [usd(caller.returnedToFollowersUsd), 'Paid back'],
    ...(settled
      ? [[`${caller.followersProfitablePct}%`, 'Followers in profit'] as [string, string]]
      : []),
  ]
  return (
    <section className="sc-panel" aria-label="Supercall record">
      <a
        className="sc-panel-brand"
        href={`${web}/u/${caller.handle}`}
        target="_blank"
        rel="noreferrer"
        title="View calls on Supercall"
      >
        <Mark />
      </a>
      {stats.map(([value, label]) => (
        <span key={label} className="sc-pstat">
          <b>{value}</b> {label}
        </span>
      ))}
      {settled ? (
        <span className="sc-last" title="Last ten calls, newest first">
          {caller.lastTen.map((o, i) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, newest first
              key={i}
              className={outcome[o][1]}
              title={outcome[o][0]}
            />
          ))}
        </span>
      ) : (
        <span className="sc-pstat sc-new">No settled calls yet</span>
      )}
      <a
        className="sc-panel-link"
        href={`${web}/u/${caller.handle}`}
        target="_blank"
        rel="noreferrer"
      >
        View calls
      </a>
    </section>
  )
}
