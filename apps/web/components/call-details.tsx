'use client'

import { useState } from 'react'
import { copiers, NOW, statusLabel } from '@/lib/data'
import { shortDate, signedUsd, usd, usdShort } from '@/lib/format'
import type { Call } from '@/lib/types'
import { cx } from './ui'

const TABS = ['Copies', 'About this call'] as const

export function CallDetails({ call }: { call: Call }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Copies')
  const total = call.copiedUsd + call.opposedUsd
  const ended = !['posted', 'armed', 'live'].includes(call.status)
  const steps = [
    { done: true, title: 'Published on Arkiv', sub: call.arkivKey, mono: true },
    {
      done: Boolean(call.filledAt),
      title: 'Entry filled',
      sub: call.filledAt
        ? `${call.fillPrice} · ${shortDate(call.filledAt)}`
        : 'Waiting for the entry price',
    },
    {
      done: ended,
      title: ended ? statusLabel[call.status].label : 'Target, stop or deadline',
      sub: `Ends ${shortDate(call.expiresAt)}`,
    },
    { done: ended, title: 'Settled in Hisaab', sub: 'Fees paid out or refunded on Arc' },
  ]
  return (
    <section className="surface-card px-5 pb-5">
      <div role="tablist" aria-label="Call details" className="flex gap-6 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              '-mb-px h-[46px] cursor-pointer border-b text-[13px]',
              tab === t ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Copies' ? (
        <div className="flex flex-col gap-5 pt-5">
          {total > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span>
                  Follow <span className="text-muted">{usdShort(call.copiedUsd)}</span>
                </span>
                <span>
                  Oppose <span className="text-muted">{usdShort(call.opposedUsd)}</span>
                </span>
              </div>
              <div className="flex h-2.5 gap-[3px]">
                <div className="hatch-up" style={{ flex: call.copiedUsd }} />
                <div className="hatch-down" style={{ flex: call.opposedUsd }} />
              </div>
            </div>
          )}
          {call.copiers === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">No copies yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] text-muted">
                    <th className="py-2 font-normal">Follower</th>
                    <th className="py-2 text-right font-normal">Size</th>
                    <th className="py-2 text-right font-normal">P&amp;L</th>
                    <th className="py-2 text-right font-normal">Copied</th>
                  </tr>
                </thead>
                <tbody>
                  {copiers.map((c) => (
                    <tr key={c.who} className="border-t border-line">
                      <td className="py-3">{c.who}</td>
                      <td className="py-3 text-right">{usd(c.sizeUsd)}</td>
                      <td
                        className={cx(
                          'py-3 text-right font-medium',
                          c.pnlUsd >= 0 ? 'text-good' : 'text-bad',
                        )}
                      >
                        {signedUsd(c.pnlUsd)}
                      </td>
                      <td className="py-3 text-right text-muted">{c.ago}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-8 pt-5">
          <figure className="flex min-w-60 flex-1 flex-col gap-2">
            <figcaption className="text-[12px] text-muted">Thesis</figcaption>
            <blockquote className="text-[15px] leading-relaxed text-silver">
              “{call.thesis}”
            </blockquote>
          </figure>
          <ol className="flex min-w-60 flex-1 flex-col">
            {steps.map((s) => (
              <li key={s.title} className="flex gap-3 py-2.5">
                <span
                  className={cx(
                    'grid size-[18px] shrink-0 place-items-center text-[11px]',
                    s.done ? 'bg-ink text-bg' : 'border border-line-strong',
                  )}
                >
                  {s.done ? '✓' : ''}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className={cx('text-[13px]', s.done ? 'font-medium' : 'text-silver')}>
                    {s.title}
                  </span>
                  <span className={cx('text-[12px] text-muted', s.mono && 'font-mono text-steel')}>
                    {s.sub}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="sr-only">Times are measured from {NOW.toISOString()}.</p>
    </section>
  )
}
