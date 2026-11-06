'use client'

import { useState } from 'react'
import { statusLabel } from '@/lib/data'
import { shortDate } from '@/lib/format'
import type { Call } from '@/lib/types'
import { cx } from './ui'

const TABS = ['About this call'] as const

export function CallDetails({ call }: { call: Call }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('About this call')
  const ended = !['pending', 'armed', 'live'].includes(call.status)
  const steps = [
    { done: true, title: 'Published on Arkiv', sub: call.arkivKey, mono: true },
    {
      done: Boolean(call.entryFilledAt),
      title: 'Entry filled',
      sub: call.entryFilledAt ? shortDate(call.entryFilledAt) : 'Waiting for the entry price',
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
      <div className="flex flex-wrap gap-8 pt-5">
        <figure className="flex min-w-60 flex-1 flex-col gap-2">
          <figcaption className="text-[12px] text-muted">Thesis</figcaption>
          <blockquote className="text-[15px] leading-relaxed text-silver">
            &ldquo;{call.thesis}&rdquo;
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
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={cx('text-[13px]', s.done ? 'font-medium' : 'text-silver')}>
                  {s.title}
                </span>
                <span
                  title={s.mono ? s.sub : undefined}
                  className={cx(
                    'text-[12px] text-muted',
                    s.mono && 'font-mono break-all text-steel',
                  )}
                >
                  {s.sub}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
