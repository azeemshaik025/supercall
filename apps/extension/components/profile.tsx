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

/** Beside the name on a caller's X profile: the mark and their SuperFactor. */
export function ProfileBadge({ caller, web }: { caller: Caller; web: string }) {
  return (
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
  )
}

const outcome = {
  W: ['Target hit', 'good'],
  L: ['Stop hit', 'bad'],
  E: ['Ended', 'muted'],
} as const

/** Under a caller's follow counts: their record on Supercall, in X's own look. */
export function ProfilePanel({ caller, web }: { caller: Caller; web: string }) {
  const settled = caller.lastTen.length > 0
  const stats: [string, string][] = [
    ['Calls', caller.callCount.toLocaleString('en-US')],
    ['Earned', usd(caller.earnedUsd)],
    ['Paid back to followers', usd(caller.returnedToFollowersUsd)],
    ['Followers in profit', settled ? `${caller.followersProfitablePct}%` : '–'],
  ]
  return (
    <section className="sc-panel">
      <header className="sc-panel-head">
        <span className="sc-panel-brand">
          <Mark />
          Supercall
          {caller.verified && <span className="sc-human">Verified human</span>}
        </span>
        <a
          className="sc-panel-link"
          href={`${web}/u/${caller.handle}`}
          target="_blank"
          rel="noreferrer"
        >
          View calls
        </a>
      </header>

      <div className="sc-panel-score">
        <span className="sc-sf">
          <SuperFactor value={caller.superFactor} />
        </span>
        <span className="sc-last" title="Last ten calls, newest first">
          {settled ? (
            caller.lastTen.map((o, i) => (
              <i
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list, newest first
                key={i}
                className={outcome[o][1]}
                title={outcome[o][0]}
              />
            ))
          ) : (
            <span className="sc-new">No settled calls yet</span>
          )}
        </span>
      </div>

      <dl className="sc-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dd>{value}</dd>
            <dt>{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  )
}
