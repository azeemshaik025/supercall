'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { marketCandles, markets, me, NOW } from '@/lib/data'
import { pct, price, usd } from '@/lib/format'
import { CALL_FEE, CREDIT_SHARE, callerCut } from '@/lib/money'
import type { Asset } from '@/lib/types'
import { CandleChart, type Level } from './candle-chart'
import { cx, Info, Segmented, TokenIcon } from './ui'

const TIMEFRAMES = ['15m', '1h', '4h', '1d'] as const
const EXPIRIES = ['4h', '24h', '3d', '7d'] as const
const TF_MS = { '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 } as const

function defaults(p: number, long: boolean) {
  return long
    ? {
        target: +(p * 1.066).toPrecision(4),
        entry: +p.toPrecision(4),
        stop: +(p * 0.959).toPrecision(4),
      }
    : {
        target: +(p * 0.934).toPrecision(4),
        entry: +p.toPrecision(4),
        stop: +(p * 1.041).toPrecision(4),
      }
}

export function Composer() {
  const [asset, setAsset] = useState<Asset>('ETH')
  const market = markets.find((m) => m.symbol === asset) ?? (markets[0] as (typeof markets)[number])
  const [tf, setTf] = useState<(typeof TIMEFRAMES)[number]>('1h')
  const [long, setLong] = useState(true)
  const [levels, setLevels] = useState(() => defaults(market.price, true))
  const [band, setBand] = useState(0.5)
  const [expiry, setExpiry] = useState<(typeof EXPIRIES)[number]>('3d')
  const [thesis, setThesis] = useState('')
  const [boost, setBoost] = useState(0)
  const [step, setStep] = useState<'edit' | 'review' | 'done'>('edit')

  const reset = (a: Asset, l: boolean) => {
    const m = markets.find((x) => x.symbol === a) ?? (markets[0] as (typeof markets)[number])
    setLevels(defaults(m.price, l))
  }

  const candles = useMemo(() => marketCandles(asset, 60), [asset])
  const lines = useMemo<Level[]>(
    () => [
      { value: levels.target, color: '--sc-good' },
      { value: levels.entry, color: '--sc-entry' },
      { value: levels.stop, color: '--sc-bad' },
    ],
    [levels],
  )

  const reward = Math.abs(levels.target - levels.entry) / levels.entry
  const risk = Math.abs(levels.entry - levels.stop) / levels.entry
  const ordered = long
    ? levels.target > levels.entry && levels.entry > levels.stop
    : levels.target < levels.entry && levels.entry < levels.stop
  const problem = !ordered
    ? long
      ? 'For a long, target must be above entry and stop below it.'
      : 'For a short, target must be below entry and stop above it.'
    : null
  const cut = callerCut(me.superFactor) * (1 - boost / 100)
  const keepPer1k = 1000 * CALL_FEE * cut
  const payPer1k = 1000 * risk * CREDIT_SHARE
  const canBoost = me.superFactor >= 70

  const ladder = (
    long ? (['target', 'entry', 'stop'] as const) : (['stop', 'entry', 'target'] as const)
  ).map((k) => ({
    key: k,
    label: k === 'target' ? 'Target' : k === 'entry' ? 'Entry' : 'Stop',
    dot: k === 'target' ? 'bg-good' : k === 'entry' ? 'bg-entry' : 'bg-bad',
    sub: k === 'entry' ? 'now' : pct((levels[k] - levels.entry) / levels.entry),
    tone: k === 'target' ? 'text-good' : k === 'stop' ? 'text-bad' : 'text-muted',
  }))

  if (step === 'done') {
    return (
      <section className="surface-card mx-auto flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <span className="grid size-12 place-items-center bg-good-soft text-[22px] text-good">
          ✓
        </span>
        <h1 className="text-[24px] font-medium">Call published</h1>
        <p className="text-[13px] text-muted">
          {long ? 'Long' : 'Short'} {asset} is on Arkiv and can’t be edited or deleted. Followers
          can copy it once price is in your entry zone.
        </p>
        <div className="mt-3 grid w-full grid-cols-2 gap-2">
          <Link
            href="/explore"
            className="flex h-11 items-center justify-center border border-line-strong bg-sidebar text-[13px]"
          >
            Browse calls
          </Link>
          <Link
            href="/my-calls"
            className="btn-cta flex h-11 items-center justify-center text-[13px]"
          >
            See my calls
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section aria-label="Chart" className="surface-card flex min-w-0 flex-[999_1_520px] flex-col">
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-line px-5 py-4">
          <label className="flex h-10 items-center gap-2.5 border border-line-strong bg-sidebar pr-2 pl-2">
            <TokenIcon symbol={asset} size={24} />
            <span className="sr-only">Market</span>
            <select
              value={asset}
              onChange={(e) => {
                const a = e.target.value as Asset
                setAsset(a)
                reset(a, long)
              }}
              className="cursor-pointer bg-transparent text-[15px] font-medium outline-none"
            >
              {markets.map((m) => (
                <option key={m.symbol} value={m.symbol} className="bg-surface">
                  {m.symbol}/USDC
                </option>
              ))}
            </select>
          </label>
          <span className="flex flex-col gap-0.5">
            <span className="text-[12px] text-muted">Price</span>
            <span className="text-[15px] font-medium">{price(market.price)}</span>
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[12px] text-muted">24h</span>
            <span
              className={cx(
                'text-[15px] font-medium',
                market.change24h >= 0 ? 'text-good' : 'text-bad',
              )}
            >
              {pct(market.change24h)}
            </span>
          </span>
          <div className="ml-auto">
            <Segmented label="Timeframe" options={TIMEFRAMES} value={tf} onChange={setTf} />
          </div>
        </div>
        <div className="p-5">
          <CandleChart
            candles={candles}
            levels={lines}
            height={460}
            label={`${asset} candles with your levels`}
            hourMs={TF_MS[tf]}
            endAt={NOW.getTime()}
          />
        </div>
      </section>

      <aside aria-label="New call" className="surface-card flex min-w-0 flex-[1_1_340px] flex-col">
        <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
          <h1 className="text-[15px] font-medium">
            {step === 'review' ? 'Review call' : 'New call'}
          </h1>
          <span className="text-[12px] text-muted">
            SuperFactor <span className="text-ink">{me.superFactor}</span>
          </span>
        </div>

        {step === 'review' ? (
          <div className="flex flex-col gap-5 p-5">
            <dl className="flex flex-col gap-3 text-[13px]">
              {[
                ['Call', `${long ? 'Long' : 'Short'} ${asset}/USDC`],
                ['Target', price(levels.target)],
                ['Entry', `${price(levels.entry)} ± ${band}%`],
                ['Stop', price(levels.stop)],
                ['Expires in', expiry],
                ['Boost', boost ? `${boost}% of your cut` : 'None'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-muted">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {thesis && (
              <p className="border-l border-line-strong pl-3 text-[13px] text-silver">“{thesis}”</p>
            )}
            <p className="text-[12px] text-muted">
              Publishing writes this call to Arkiv. It can’t be edited or deleted, and it counts
              toward your SuperFactor.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStep('edit')}
                className="h-11 cursor-pointer border border-line-strong bg-sidebar text-[13px]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep('done')}
                className="btn-cta h-11 cursor-pointer text-[13px]"
              >
                Publish
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-5">
            <fieldset
              aria-label="Direction"
              className="grid grid-cols-2 gap-0.5 border border-line bg-sidebar p-[3px]"
            >
              {[true, false].map((l) => (
                <button
                  key={String(l)}
                  type="button"
                  aria-pressed={long === l}
                  onClick={() => {
                    setLong(l)
                    reset(asset, l)
                  }}
                  className={cx(
                    'h-9 cursor-pointer text-[13px] font-medium',
                    long === l
                      ? l
                        ? 'bg-good-soft text-good'
                        : 'bg-bad-soft text-bad'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {l ? 'Long' : 'Short'}
                </button>
              ))}
            </fieldset>

            <div className="flex flex-col gap-1.5">
              {ladder.map((r) => (
                <label
                  key={r.key}
                  className="flex h-12 items-center gap-3 border border-line-strong bg-sidebar px-3"
                >
                  <span className={cx('size-2 shrink-0', r.dot)} />
                  <span className="w-[52px] text-[12px] text-muted">{r.label}</span>
                  <input
                    type="number"
                    step="any"
                    value={levels[r.key]}
                    onChange={(e) => setLevels((v) => ({ ...v, [r.key]: Number(e.target.value) }))}
                    className="min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none"
                  />
                  <span className={cx('text-[12px]', r.tone)}>{r.sub}</span>
                </label>
              ))}
              {problem ? (
                <p className="text-[12px] text-bad">{problem}</p>
              ) : (
                <span className="text-[12px] text-muted">
                  Reward is {(reward / risk).toFixed(1)}× the risk
                </span>
              )}
            </div>

            <label className="flex flex-col gap-2">
              <span className="flex justify-between text-[12px]">
                <span className="flex items-center gap-1.5 text-muted">
                  Entry zone{' '}
                  <Info
                    label="About the entry zone"
                    text="Followers can copy while price is inside this zone around your entry."
                  />
                </span>
                <span>
                  ±{band}% · {price(levels.entry * (1 - band / 100))} to{' '}
                  {price(levels.entry * (1 + band / 100))}
                </span>
              </span>
              <input
                type="range"
                min={0.1}
                max={2}
                step={0.1}
                value={band}
                onChange={(e) => setBand(Number(e.target.value))}
                className="accent-steel"
              />
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[12px] text-muted">Expires in</span>
              <div className="grid grid-cols-4 gap-1">
                {EXPIRIES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={expiry === e}
                    onClick={() => setExpiry(e)}
                    className={cx(
                      'h-[34px] cursor-pointer text-[12px]',
                      expiry === e
                        ? 'sheen text-ink'
                        : 'border border-line bg-sidebar text-muted hover:text-ink',
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-[12px] text-muted">Why (optional)</span>
              <textarea
                rows={2}
                maxLength={180}
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                placeholder="One line on the setup"
                className="resize-none border border-line-strong bg-sidebar px-3 py-2.5 text-[13px] outline-none"
              />
            </label>

            <label className="flex flex-col gap-2 border-t border-line pt-4">
              <span className="flex justify-between text-[12px]">
                <span className="flex items-center gap-1.5 text-muted">
                  Boost to Explore{' '}
                  <Info
                    label="About boost"
                    text="Give up part of your cut to feature the call on Explore. Followers' protection doesn’t change. SuperFactor 70+ only."
                  />
                </span>
                <span>{canBoost ? `${boost}% of your cut` : 'SuperFactor 70+ only'}</span>
              </span>
              <input
                type="range"
                min={0}
                max={50}
                step={5}
                value={boost}
                disabled={!canBoost}
                onChange={(e) => setBoost(Number(e.target.value))}
                className="accent-steel"
              />
            </label>

            <dl className="flex flex-col border-t border-line text-[13px]">
              <dt className="pt-3.5 pb-1 text-[12px] text-muted">For every $1,000 copied</dt>
              <div className="flex justify-between border-b border-line py-2.5">
                <dt className="text-muted">If you’re right, you keep</dt>
                <dd className="text-good">{usd(keepPer1k)}</dd>
              </div>
              <div className="flex justify-between py-2.5">
                <dt className="text-muted">If you’re wrong, your fund pays</dt>
                <dd className="text-bad">up to {usd(payPer1k)}</dd>
              </div>
            </dl>

            <button
              type="button"
              disabled={Boolean(problem)}
              onClick={() => setStep('review')}
              className="btn-cta h-[46px] cursor-pointer text-[14px]"
            >
              Review call
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}
