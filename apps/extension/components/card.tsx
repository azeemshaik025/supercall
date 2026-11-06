import mark from '../assets/mark.svg?raw'
import type { Answer } from '../lib/lookup'

export type Shown = Extract<Answer, { kind: 'call' | 'close' | 'not-a-call' }>

/** About four significant digits, as apps/web/lib/format.ts `price` (apps can't import it). */
function num(n: number) {
  const digits =
    n >= 1000
      ? 0
      : n >= 1
        ? 2
        : n <= 0
          ? 4
          : Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(n))))
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
// The API judges it with core's `canMirror`: open, and the price inside the entry band (or still
// short of a wait-for-a-price entry). Older answers without it fall back to the status alone.
/** Past its deadline: over, even while its status still says open until it settles. */
const pastDeadline = (answer: Shown) =>
  answer.kind !== 'not-a-call' && Date.parse(answer.call.expiresAt) <= Date.now()
const copyable = (answer: Shown) =>
  answer.kind === 'call' &&
  !pastDeadline(answer) &&
  (answer.copyable ?? ['pending', 'armed', 'live'].includes(answer.call.status))
// Open, but the price has left the entry band: say why there's no Copy.
const outOfBand = (answer: Shown) =>
  answer.kind === 'call' &&
  answer.copyable === false &&
  !pastDeadline(answer) &&
  ['armed', 'live'].includes(answer.call.status) &&
  Math.abs(answer.call.price - answer.call.entry) > answer.call.entry * answer.call.bandPct

// What each status reads as, and its tone (apps/web/components/call-tile.tsx).
const STATUS: Record<string, [string, 'good' | 'bad' | 'warn' | 'muted']> = {
  pending: ['Waiting for the caller', 'warn'],
  armed: ['Open', 'good'],
  live: ['Live', 'good'],
  won: ['Target hit', 'good'],
  lost: ['Stop hit', 'bad'],
  'expired-profit': ['Ended in profit', 'good'],
  'expired-loss': ['Ended at a loss', 'bad'],
  unfired: ['Never entered', 'muted'],
  void: ['Cancelled', 'muted'],
}

/** "2d 23h left", "40m left", or the date once it's past. */
function left(iso: string) {
  const ms = Date.parse(iso) - Date.now()
  if (ms <= 0) return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h >= 24
    ? `${Math.floor(h / 24)}d ${h % 24}h left`
    : h > 0
      ? `${h}h ${m}m left`
      : `${m}m left`
}
const when = (iso: string, text: string) => <time dateTime={iso}>{text}</time>

/** Supercall's mark (apps/web/public/brand/mark.svg), as an image: no text, so the only "Supercall" word is the badge. */
const markSrc = `data:image/svg+xml;utf8,${encodeURIComponent(mark.trim())}`
export function Mark() {
  return <img className="mark" src={markSrc} alt="" />
}

/**
 * The pill in the tweet's header that says this post is a call on Supercall. Clicking it opens
 * the card under the tweet; X opens the tweet on any click inside it, so the click stops here.
 */
export function Badge({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="sc-badge-pill"
      aria-expanded={open}
      title={open ? 'Hide the Supercall card' : 'Show the Supercall card'}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onToggle()
      }}
    >
      <Mark />
      Supercall
      <svg className="sc-chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  )
}

/** `mine`: the signed-in X account posted it, so the caller gets Go super in place of Copy. */
export function Card({
  answer,
  web,
  onCopy,
  mine = false,
}: {
  answer: Shown
  web: string
  onCopy: (id: string) => void
  mine?: boolean
}) {
  if (answer.kind === 'not-a-call') {
    return (
      <p className="sc-note">
        <Mark />
        <span>Not a call: {answer.detail}</span>
      </p>
    )
  }
  const { call } = answer
  const [label, tone] =
    pastDeadline(answer) && ['pending', 'armed', 'live'].includes(call.status)
      ? (['Ended · settling', 'muted'] as const)
      : (STATUS[call.status] ?? [call.status, 'muted'])
  const goSuper = mine && copyable(answer) && !call.supercall
  return (
    <section className="sc-card">
      <header className="sc-head">
        <Mark />
        <span className="sc-pair">
          {call.asset}
          <span className="sc-quote">/{call.quote}</span>
        </span>
        <span className={`sc-dir ${call.direction}`}>{call.direction}</span>
        {call.supercall && <strong className="sc-badge">Supercall</strong>}
        {answer.superFactor !== undefined && (
          <span className="sc-sf">
            <b>{Math.round(answer.superFactor)}</b>
            <span>
              <i>Super</i>Factor
            </span>
          </span>
        )}
      </header>

      <dl className="sc-levels">
        <div>
          <dt>Entry</dt>
          <dd>{num(call.entry)}</dd>
        </div>
        <div>
          <dt>Stop</dt>
          <dd className="bad">
            {num(call.stop)}
            {call.stopSuggested && <span className="sc-hint"> (suggested, not the caller's)</span>}
          </dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd className="good">{num(call.target)}</dd>
        </div>
      </dl>

      <p className="sc-meta">
        <span className={`sc-status ${tone}`}>
          <i />
          {label}
        </span>
        <span>·</span>
        {when(call.expiresAt, left(call.expiresAt))}
        <span>·</span>
        <span>Follow {call.followBand}</span>
        <span>·</span>
        <span>Oppose {call.opposeBand}</span>
      </p>

      {outOfBand(answer) && (
        <p className="sc-band">
          <strong>Copying paused</strong>
          <span>
            Now <b>{num(call.price)}</b>
          </span>
          <span>
            Opens at{' '}
            <b>
              {num(call.entry * (1 - call.bandPct))} – {num(call.entry * (1 + call.bandPct))}
            </b>
          </span>
        </p>
      )}

      {answer.kind === 'close' && (
        <p className="sc-closed">
          Closed at {num(answer.price)}, {when(answer.at, new Date(answer.at).toLocaleString())}
        </p>
      )}

      <footer className="sc-actions">
        {/* Wallets can't be reached from X's page, so copying happens in a popup on our site. */}
        {copyable(answer) && !mine && (
          <button type="button" className="sc-copy" onClick={() => onCopy(call.id)}>
            Copy
          </button>
        )}
        {/* The same popup: the site shows the call's own wallet Go super there. */}
        {goSuper && (
          <button type="button" className="sc-copy" onClick={() => onCopy(call.id)}>
            Go super
          </button>
        )}
        <a className="sc-open" href={`${web}/c/${call.id}`} target="_blank" rel="noreferrer">
          Open on Supercall
        </a>
      </footer>
      {goSuper && <p className="sc-hint sc-super">Trade it yourself and make it a supercall</p>}
    </section>
  )
}
