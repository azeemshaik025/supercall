'use client'

// Publishing a call: pick a coin, set the levels on the chart or by hand, the entry zone,
// expiry, a line of why and an optional boost; review, sign in the wallet, and it's on Arkiv.
import {
  MIN_TARGET_DISTANCE,
  maxBoost,
  rewardPct,
  rewardRisk,
  riskPct,
  shareFor,
} from '@supercall/core'
import Link from 'next/link'
import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, loadCandles } from '@/lib/api'
import { useCallerSetup } from '@/lib/caller'
import { pct, price, usd } from '@/lib/format'
import { useLivePrice } from '@/lib/live-price'
import { CALL_FEE } from '@/lib/money'
import { type CallInput, PUBLISH_STEP, type PublishStep, usePublish } from '@/lib/publish'
import type { Candle, Market } from '@/lib/types'
import { CandleChart, type Level } from './candle-chart'
import { cx, Info, Segmented, TokenIcon } from './ui'

const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const
type Timeframe = (typeof TIMEFRAMES)[number]
const EXPIRIES = [
  { label: '4h', hours: 4 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
] as const
/** The entry zone: ±0.10% to ±2.00%, pulled onto round values when close to them. */
const ZONE_MIN = 0.001
const ZONE_MAX = 0.02
const MAGNETS = [0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02]
const snapZone = (v: number) =>
  MAGNETS.find((m) => Math.abs(m - v) <= 0.0004) ??
  Math.min(ZONE_MAX, Math.max(ZONE_MIN, Math.round(v / 0.0005) * 0.0005))
const BOOST_STEP = 0.05
/** What a follower's loss can be paid back from the caller's fund, at most. */
const CREDIT_SHARE = 0.3

type Direction = 'long' | 'short'
type Levels = Record<Level, number>

/** Round a price to a sensible number of digits for its size. */
const round = (v: number) => +v.toPrecision(v >= 1 ? 6 : 4)
function defaults(p: number, direction: Direction): Levels {
  return direction === 'long'
    ? { target: round(p * 1.066), entry: round(p), stop: round(p * 0.959) }
    : { target: round(p * 0.934), entry: round(p), stop: round(p * 1.041) }
}

/** "36h", "2d 6h", "90m": hours between 1 and 30 days, or null. */
function parseDuration(text: string): number | null {
  const t = text.toLowerCase().replace(/\s+/g, '')
  if (!/^(\d+d)?(\d+h)?(\d+m)?$/.test(t) || t === '') return null
  const part = (u: string) => Number(t.match(new RegExp(`(\\d+)${u}`))?.[1] ?? 0)
  const hours = part('d') * 24 + part('h') + part('m') / 60
  return hours >= 1 && hours <= 720 ? Math.round(hours) : null
}

/** Rough odds the target is hit before the stop, from the distances alone. Not a forecast. */
const targetOdds = (l: Levels) => {
  const r = riskPct(l)
  const w = rewardPct(l)
  return r + w > 0 ? r / (r + w) : 0
}
const RISK = [
  { label: 'Low risk', chip: 'bg-good-soft text-good' },
  { label: 'Medium risk', chip: 'bg-warn-soft text-warn' },
  { label: 'High risk', chip: 'bg-bad-soft text-bad' },
] as const
/** 40%+ odds low, 25–40% medium, under 25% high; one notch worse when the stop sits in noise. */
const riskOf = (odds: number, stopInNoise: boolean) =>
  RISK[Math.min(2, (odds >= 0.4 ? 0 : odds >= 0.25 ? 1 : 2) + (stopInNoise ? 1 : 0))] ?? RISK[2]

/** The coin and timeframe live in the URL, so a reload or a shared link opens on them. */
function useUrlParam(key: string, value: string) {
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get(key) === value) return
    url.searchParams.set(key, value)
    window.history.replaceState(window.history.state, '', url)
  }, [key, value])
}
const fromUrl = (key: string) =>
  typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get(key)

export function Composer({ markets }: { markets: Market[] }) {
  // Coins are told apart by address: symbols can repeat.
  const [address, setAddress] = useState(() => {
    const wanted = fromUrl('asset')?.toLowerCase()
    return (
      markets.find((m) => m.address.toLowerCase() === wanted)?.address ?? markets[0]?.address ?? ''
    )
  })
  const market = markets.find((m) => m.address === address) ?? markets[0]
  const asset = market?.symbol ?? ''
  const base = market?.price ?? 1
  const [tf, setTf] = useState<Timeframe>(() => {
    const t = fromUrl('tf')
    return (TIMEFRAMES as readonly string[]).includes(t ?? '') ? (t as Timeframe) : '1h'
  })
  useUrlParam('asset', address)
  useUrlParam('tf', tf)

  const [direction, setDirection] = useState<Direction>('long')
  const [levels, setLevels] = useState<Levels>(() => defaults(base, 'long'))
  const [band, setBand] = useState(0.005)
  const [hours, setHours] = useState(72)
  const [custom, setCustom] = useState(false)
  const [thesis, setThesis] = useState('')
  const [boost, setBoost] = useState(0)
  const [pick, setPick] = useState<Level | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [candles, setCandles] = useState<Candle[]>([])

  const setup = useCallerSetup()
  const sf = setup.caller?.caller?.superFactor ?? 50
  const wallet = setup.me?.profile?.wallet

  useEffect(() => {
    if (!address) return
    let stale = false
    loadCandles(address, tf)
      .then((c) => !stale && setCandles(c))
      .catch(() => !stale && setCandles([]))
    return () => {
      stale = true
    }
  }, [address, tf])

  // Escape stops picking a level on the chart.
  useEffect(() => {
    if (!pick) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPick(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pick])

  const pickCoin = (a: string) => {
    const m = markets.find((x) => x.address === a)
    setAddress(a)
    setLevels(defaults(m?.price ?? 1, direction))
    setPick(null)
  }
  const flip = (d: Direction) => {
    if (d === direction) return
    setDirection(d)
    setLevels(defaults(levels.entry, d))
  }
  const onLevel = (key: Level, value: number) => setLevels((l) => ({ ...l, [key]: round(value) }))

  const long = direction === 'long'
  const stopOk = long ? levels.stop < levels.entry : levels.stop > levels.entry
  const targetOk = long ? levels.target > levels.entry : levels.target < levels.entry
  const valid = levels.entry > 0 && stopOk && targetOk
  const problem = !stopOk
    ? `Stop must be ${long ? 'below' : 'above'} entry for a ${direction}`
    : !targetOk
      ? `Target must be ${long ? 'above' : 'below'} entry for a ${direction}`
      : null
  const tooClose = valid && rewardPct(levels) < MIN_TARGET_DISTANCE

  // The coin's normal swing: the average high–low of the bars on screen, as a share of price.
  const noise = useMemo(() => {
    const recent = candles.slice(-48)
    return recent.length ? recent.reduce((t, c) => t + (c.h - c.l) / c.c, 0) / recent.length : 0
  }, [candles])
  const odds = valid ? targetOdds(levels) : 0
  const stopInNoise = valid && noise > 0 && riskPct(levels) < noise * 1.5
  const risk = riskOf(odds, stopInNoise)

  const maxBoostPts = Math.floor(maxBoost(sf) / BOOST_STEP) * BOOST_STEP
  const cut = Math.max(0.1, shareFor(sf) - Math.min(boost, maxBoost(sf)))
  const keepPer1k = 1000 * CALL_FEE * cut
  const payPer1k = 1000 * (valid ? riskPct(levels) : 0) * CREDIT_SHARE

  const input: CallInput = {
    assetAddress: market?.address ?? '',
    direction,
    entry: levels.entry,
    stop: levels.stop,
    target: levels.target,
    bandPct: band,
    hours,
    thesis: thesis.trim(),
    boost,
  }

  const ladder = long
    ? (['target', 'entry', 'stop'] as const)
    : (['stop', 'entry', 'target'] as const)

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Chart" className="surface-card flex min-w-0 flex-[999_1_520px] flex-col">
        <Strip markets={markets} market={market} onPick={pickCoin}>
          <div className="ml-auto">
            <Segmented label="Timeframe" options={TIMEFRAMES} value={tf} onChange={setTf} />
          </div>
        </Strip>
        <div className="relative py-4 pr-4 pl-1">
          <CandleChart
            candles={candles}
            levels={levels}
            band={band}
            onLevel={onLevel}
            pick={pick}
            onPicked={() => setPick(null)}
            tools
            height="max(480px, calc(100dvh - 245px))"
            precision={base < 1 ? 4 : 2}
            label={`${asset} candles with your levels; drag a line to move it`}
          />
          {pick && (
            <p className="pointer-events-none absolute top-7 left-1/2 -translate-x-1/2 border border-line-strong bg-surface px-3 py-1.5 text-[12px] text-ink">
              Click the chart to place your {pick} · Esc to cancel
            </p>
          )}
        </div>
      </section>

      <aside aria-label="New call" className="surface-card flex min-w-0 flex-[1_1_340px] flex-col">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
          <h1 className="text-[15px] font-medium">{reviewing ? 'Review call' : 'New call'}</h1>
          <span className="text-[12px] text-muted">
            SuperFactor <span className="text-ink">{Math.round(sf)}</span>
          </span>
        </div>

        {reviewing ? (
          <Review
            input={input}
            asset={asset}
            cut={cut}
            wallet={wallet}
            onBack={() => setReviewing(false)}
          />
        ) : (
          <div className="flex flex-col gap-5 p-5">
            <fieldset
              aria-label="Direction"
              className="grid grid-cols-2 gap-0.5 border border-line bg-sidebar p-[3px]"
            >
              {(['long', 'short'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={direction === d}
                  onClick={() => flip(d)}
                  className={cx(
                    'h-9 cursor-pointer text-[13px] font-medium capitalize',
                    direction === d
                      ? d === 'long'
                        ? 'bg-good-soft text-good'
                        : 'bg-bad-soft text-bad'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {d}
                </button>
              ))}
            </fieldset>

            {/* A price ladder, highest on top: target, entry, stop for a long; reversed for a short. */}
            <div className="flex flex-col gap-1.5">
              {ladder.map((key) => (
                <LevelInput
                  key={key}
                  level={key}
                  value={levels[key]}
                  entry={levels.entry}
                  bad={key === 'stop' ? !stopOk : key === 'target' ? !targetOk : false}
                  picking={pick === key}
                  onChange={(v) => setLevels((l) => ({ ...l, [key]: v }))}
                  onPick={() => setPick((p) => (p === key ? null : key))}
                />
              ))}
              {problem ? (
                <p className="text-[12px] text-bad">{problem}</p>
              ) : tooClose ? (
                <p className="text-[12px] text-warn">
                  Target is under {pct(MIN_TARGET_DISTANCE)} from entry: the call is scored, but
                  nobody can copy it.
                </p>
              ) : (
                <span className="text-[12px] text-muted">
                  Reward is {rewardRisk(levels).toFixed(1)}× the risk
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="flex items-baseline justify-between text-[12px]">
                <span className="flex items-center gap-1.5 text-muted">
                  Entry zone{' '}
                  <Info
                    label="About the entry zone"
                    text="Followers can copy while price is inside this zone around your entry."
                  />
                </span>
                <span className="text-[13px] tabular-nums">±{(band * 100).toFixed(2)}%</span>
              </span>
              <input
                type="range"
                min={ZONE_MIN}
                max={ZONE_MAX}
                step={0.0001}
                value={band}
                onChange={(e) => setBand(snapZone(Number(e.target.value)))}
                aria-label="Entry zone"
                className="range"
                style={
                  {
                    '--fill': `${((band - ZONE_MIN) / (ZONE_MAX - ZONE_MIN)) * 100}%`,
                  } as CSSProperties
                }
              />
              <span className="flex justify-between text-[11px] text-faint tabular-nums">
                <span>{price(levels.entry * (1 - band))}</span>
                <span>copying open between</span>
                <span>{price(levels.entry * (1 + band))}</span>
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[12px] text-muted">Expires in</span>
              <div className="grid grid-cols-5 gap-1">
                {EXPIRIES.map((e) => (
                  <Opt
                    key={e.label}
                    on={!custom && hours === e.hours}
                    onClick={() => {
                      setCustom(false)
                      setHours(e.hours)
                    }}
                  >
                    {e.label}
                  </Opt>
                ))}
                <Opt on={custom} onClick={() => setCustom(true)}>
                  Custom
                </Opt>
              </div>
              {custom && <CustomExpiry hours={hours} onHours={setHours} />}
            </div>

            <label className="flex flex-col gap-2">
              <span className="flex justify-between text-[12px] text-muted">
                Why (optional)
                <span className="text-faint tabular-nums">{thesis.length}/180</span>
              </span>
              <textarea
                rows={2}
                maxLength={180}
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                placeholder="One line on the setup"
                className="resize-none border border-line-strong bg-sidebar px-3 py-2.5 text-[13px] outline-none focus:border-steel"
              />
            </label>

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <span className="flex justify-between text-[12px]">
                <span className="flex items-center gap-1.5 text-muted">
                  Boost to Explore{' '}
                  <Info
                    label="About boost"
                    text="Give up points of your cut to be featured on Explore. On a right call they go to your followers as credit."
                  />
                </span>
                <span className="tabular-nums">
                  {maxBoostPts <= 0
                    ? 'Unlocks at SuperFactor 70'
                    : boost > 0
                      ? `${Math.round(boost * 100)} pts of your cut`
                      : 'Off'}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(maxBoostPts, BOOST_STEP)}
                step={BOOST_STEP}
                value={boost}
                disabled={maxBoostPts <= 0}
                onChange={(e) =>
                  setBoost(Math.round(Number(e.target.value) / BOOST_STEP) * BOOST_STEP)
                }
                aria-label="Boost"
                className="range disabled:opacity-40"
                style={
                  {
                    '--fill': `${maxBoostPts > 0 ? (boost / maxBoostPts) * 100 : 0}%`,
                  } as CSSProperties
                }
              />
            </div>

            <dl className="flex flex-col border-t border-line text-[13px]">
              <div className="flex justify-between border-b border-line py-2.5">
                <dt
                  className="text-muted"
                  title="What the target pays for every $1 risked to the stop"
                >
                  Payoff
                </dt>
                <dd className="tabular-nums">
                  {valid ? `${rewardRisk(levels).toFixed(1)}×` : '—'}
                </dd>
              </div>
              <div className="flex items-center justify-between border-b border-line py-2.5">
                <dt
                  className="text-muted"
                  title="Rough odds the target is hit before the stop, from the distances alone. A stop inside normal swings counts as riskier. Not a forecast."
                >
                  Odds
                </dt>
                <dd className="flex items-center gap-2 tabular-nums">
                  {valid ? (
                    <>
                      <span>~{Math.round(odds * 100)}% target first</span>
                      <span
                        className={cx('px-1.5 py-0.5 text-[11px] font-medium', risk.chip)}
                        title={stopInNoise ? 'Stop is inside normal price swings' : undefined}
                      >
                        {risk.label}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div className="flex justify-between border-b border-line py-2.5">
                <dt className="text-muted">Your cut</dt>
                <dd className="tabular-nums">{pct(cut)} of kept fees</dd>
              </div>
              <dt className="pt-3.5 pb-1 text-[12px] text-muted">For every $1,000 copied</dt>
              <div className="flex justify-between border-b border-line py-2.5">
                <dt className="text-muted">If you're right, you keep</dt>
                <dd className="text-good tabular-nums">{usd(keepPer1k)}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-muted">If you're wrong, your fund pays</dt>
                <dd className="text-bad tabular-nums">up to {usd(payPer1k)}</dd>
              </div>
            </dl>

            <button
              type="button"
              disabled={!valid || !market}
              onClick={() => setReviewing(true)}
              className="btn-cta h-[46px] cursor-pointer text-[14px] disabled:opacity-50"
            >
              Review call
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

/** The coin picker, live price and 24h change above the chart. */
function Strip({
  markets,
  market,
  onPick,
  children,
}: {
  markets: Market[]
  market: Market | undefined
  onPick: (address: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const live = useLivePrice(market?.address, market?.price ?? 0)
  const change = market?.change24h ?? null
  const query = q.trim().toLowerCase()
  const shown = query
    ? markets.filter(
        (m) =>
          m.symbol.toLowerCase().includes(query) ||
          m.name.toLowerCase().includes(query) ||
          m.address.toLowerCase() === query,
      )
    : markets

  // Escape or a click outside closes it; the search clears each time.
  useEffect(() => {
    if (!open) return setQ('')
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-line px-5 py-4">
      <div ref={box} className="relative">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 cursor-pointer items-center gap-2.5 border border-line-strong bg-sidebar pr-3 pl-2 hover:bg-surface-2"
        >
          <TokenIcon symbol={market?.symbol ?? ''} src={market?.imageUrl} size={24} />
          <span className="text-[15px] font-medium">{market?.symbol ?? '—'}/USDC</span>
          <span aria-hidden="true" className="text-[11px] text-muted">
            ▾
          </span>
        </button>
        {open && (
          <div className="absolute top-full left-0 z-40 mt-1.5 flex max-h-[min(440px,60vh)] w-80 flex-col border border-line-strong bg-surface shadow-pop">
            <div className="border-b border-line p-2">
              <input
                // biome-ignore lint/a11y/noAutofocus: the list opened to be searched
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${markets.length} coins`}
                aria-label="Search coins"
                className="h-8 w-full border border-line bg-sidebar px-2.5 text-[13px] outline-none placeholder:text-faint focus:border-steel"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {shown.length === 0 && (
                <p className="px-3 py-3 text-[13px] text-muted">No coin matches “{q}”.</p>
              )}
              {shown.map((m) => (
                <button
                  key={m.address}
                  type="button"
                  onClick={() => {
                    onPick(m.address)
                    setOpen(false)
                  }}
                  className={cx(
                    'flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-surface-2',
                    m.address === market?.address && 'bg-surface-2',
                  )}
                >
                  <TokenIcon symbol={m.symbol} src={m.imageUrl} size={22} />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate">{m.symbol}/USDC</span>
                    {m.name !== m.symbol && (
                      <span className="block truncate text-[11px] text-faint">{m.name}</span>
                    )}
                  </span>
                  <span className="text-muted tabular-nums">{price(m.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <span className="flex flex-col gap-0.5">
        <span className="text-[12px] text-muted">Price</span>
        <span
          className={cx(
            'text-[15px] font-medium tabular-nums transition-colors duration-700',
            live.dir > 0 ? 'text-good' : live.dir < 0 ? 'text-bad' : 'text-ink',
          )}
        >
          {price(live.value)}
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[12px] text-muted">24h</span>
        {change === null ? (
          <span className="text-[15px] text-faint">—</span>
        ) : (
          <span className={cx('text-[15px] font-medium', change >= 0 ? 'text-good' : 'text-bad')}>
            {change >= 0 ? '+' : ''}
            {pct(change)}
          </span>
        )}
      </span>
      {children}
    </div>
  )
}

const LEVEL = {
  target: { label: 'Target', dot: 'bg-good', tone: 'text-good' },
  entry: { label: 'Entry', dot: 'bg-entry', tone: 'text-muted' },
  stop: { label: 'Stop', dot: 'bg-bad', tone: 'text-bad' },
} as const

/** One level: typed in, or picked by clicking the chart. */
function LevelInput({
  level,
  value,
  entry,
  bad,
  picking,
  onChange,
  onPick,
}: {
  level: Level
  value: number
  entry: number
  bad: boolean
  picking: boolean
  onChange: (v: number) => void
  onPick: () => void
}) {
  const s = LEVEL[level]
  const sub = level === 'entry' ? 'now' : pct((value - entry) / entry)
  return (
    <div
      className={cx(
        'flex h-12 items-center gap-3 border bg-sidebar pr-1 pl-3',
        bad ? 'border-bad/60' : picking ? 'border-steel' : 'border-line-strong',
      )}
    >
      <span className={cx('size-2 shrink-0', s.dot)} />
      <span className="w-[52px] text-[12px] text-muted">{s.label}</span>
      <input
        type="number"
        step="any"
        value={value}
        aria-label={s.label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-w-0 flex-1 bg-transparent text-[16px] font-medium tabular-nums outline-none"
      />
      <span className={cx('text-[12px] tabular-nums', s.tone)}>{sub}</span>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={picking}
        title={`Place ${s.label.toLowerCase()} on the chart`}
        className={cx(
          'h-9 cursor-pointer px-2.5 text-[11px] font-medium',
          picking ? 'bg-surface-3 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink',
        )}
      >
        Pick
      </button>
    </div>
  )
}

function Opt({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'h-[34px] cursor-pointer text-[12px] tabular-nums',
        on ? 'sheen text-ink' : 'border border-line bg-sidebar text-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function CustomExpiry({ hours, onHours }: { hours: number; onHours: (h: number) => void }) {
  const [text, setText] = useState(() => {
    const d = Math.floor(hours / 24)
    const h = Math.round(hours % 24)
    return `${d ? `${d}d ` : ''}${h ? `${h}h` : ''}`.trim()
  })
  const bad = text !== '' && parseDuration(text) === null
  return (
    <label className="flex flex-col gap-1">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const h = parseDuration(e.target.value)
          if (h !== null) onHours(h)
        }}
        placeholder="e.g. 36h, 2d 6h, 90m"
        aria-label="Custom expiry"
        className={cx(
          'h-9 border bg-sidebar px-3 text-[13px] tabular-nums outline-none placeholder:text-faint',
          bad ? 'border-bad/60' : 'border-line-strong focus:border-steel',
        )}
      />
      <span className={cx('text-[11px]', bad ? 'text-bad' : 'text-faint')}>
        {bad ? 'Use d, h or m, between 1 hour and 30 days' : 'Days, hours, minutes: d, h, m'}
      </span>
    </label>
  )
}

/** The call as followers will see it, then sign and publish. */
function Review({
  input,
  asset,
  cut,
  wallet,
  onBack,
}: {
  input: CallInput
  asset: string
  cut: number
  wallet: string | undefined
  onBack: () => void
}) {
  const publish = usePublish()
  const [step, setStep] = useState<PublishStep | null>(null)
  const [error, setError] = useState<string>()
  const [id, setId] = useState<string>()
  const expiry = input.hours % 24 === 0 ? `${input.hours / 24}d` : `${input.hours}h`

  const go = async () => {
    if (!wallet) return setError('Your profile has no wallet yet')
    setError(undefined)
    try {
      setId(await publish(input, wallet, setStep))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setStep(null)
    }
  }

  if (id) {
    const link = `${window.location.origin}/c/${id}`
    const text = `${input.direction === 'long' ? 'Long' : 'Short'} ${asset}: entry ${price(input.entry)}, stop ${price(input.stop)}, target ${price(input.target)}. Copy it on Supercall.`
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <span className="grid size-12 place-items-center bg-good-soft text-[22px] text-good">
          ✓
        </span>
        <h2 className="text-[20px] font-medium">Your call is live</h2>
        <p className="text-[13px] text-muted">
          It’s on Arkiv: nobody can edit or delete it. Share it so people can copy it.
        </p>
        <div className="mt-2 grid w-full grid-cols-2 gap-2">
          <a
            href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center justify-center border border-line-strong bg-sidebar text-[13px] hover:bg-surface-2"
          >
            Post on X
          </a>
          <Link
            href={`/c/${id}`}
            className="btn-cta flex h-11 items-center justify-center text-[13px]"
          >
            Open the call
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <dl className="flex flex-col gap-3 text-[13px]">
        {[
          ['Call', `${input.direction === 'long' ? 'Long' : 'Short'} ${asset}/USDC`],
          ['Target', price(input.target)],
          ['Entry', `${price(input.entry)} ± ${(input.bandPct * 100).toFixed(2)}%`],
          ['Stop', price(input.stop)],
          ['Expires in', expiry],
          ['Your cut', `${pct(cut)} of kept fees`],
          ['Boost', input.boost ? `${Math.round(input.boost * 100)} pts of your cut` : 'Off'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-muted">{k}</dt>
            <dd className="tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {input.thesis && (
        <p className="border-l border-line-strong pl-3 text-[13px] text-silver">“{input.thesis}”</p>
      )}
      <p className="text-[12px] text-muted">
        Publishing signs the call with your wallet and writes it to Arkiv. It can’t be edited or
        deleted, and it counts toward your SuperFactor.
      </p>
      {error && <p className="text-[12px] text-bad">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={step !== null}
          className="h-11 cursor-pointer border border-line-strong bg-sidebar text-[13px] disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => void go()}
          disabled={step !== null}
          className="btn-cta h-11 cursor-pointer text-[13px] disabled:opacity-70"
        >
          {step ? PUBLISH_STEP[step] : error ? 'Try again' : 'Publish'}
        </button>
      </div>
    </div>
  )
}
