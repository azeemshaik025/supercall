'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ENDED, OPEN, statusLabel } from '@/lib/data'
import { ago, pct, price } from '@/lib/format'
import { moveVsEntry } from '@/lib/money'
import type { Call, Caller } from '@/lib/types'
import { cx, Segmented, SideTag, TokenIcon } from './ui'

const FILTERS = ['All', 'Live', 'Upcoming', 'Settled'] as const
type Filter = (typeof FILTERS)[number]

const toneDot = { good: 'bg-good', bad: 'bg-bad', warn: 'bg-warn', faint: 'bg-faint' }

function matches(f: Filter, c: Call) {
  if (f === 'Live') return c.status === 'live'
  if (f === 'Upcoming') return c.status === 'pending' || c.status === 'armed'
  if (f === 'Settled') return ENDED.includes(c.status)
  return true
}

export function CallsTable({ calls, callers }: { calls: Call[]; callers: Caller[] }) {
  const [filter, setFilter] = useState<Filter>('All')
  const [q, setQ] = useState('')
  const now = new Date()
  const callerMap = useMemo(
    () => new Map(callers.map((c) => [c.handle, c])),
    [callers],
  )
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return calls
      .filter((c) => matches(filter, c))
      .filter(
        (c) =>
          !needle ||
          c.asset.toLowerCase().includes(needle) ||
          c.caller.toLowerCase().includes(needle),
      )
      .sort(
        (a, b) =>
          Number(OPEN.includes(b.status)) - Number(OPEN.includes(a.status)) ||
          b.createdAt.localeCompare(a.createdAt),
      )
  }, [calls, filter, q])

  return (
    <section aria-label="All calls" className="surface-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
        <label className="flex h-9 max-w-80 flex-[1_1_220px] items-center gap-2 border border-line-strong bg-sidebar px-3">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            className="text-muted"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="sr-only">Search calls</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search asset or caller"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        <div className="ml-auto">
          <Segmented label="Status" options={FILTERS} value={filter} onChange={setFilter} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[780px]">
          <div className="grid grid-cols-[minmax(220px,2fr)_1fr_1.3fr_1fr_1fr] gap-4 border-y border-line px-4 py-2.5 text-[12px] text-muted">
            <span>Call</span>
            <span>Price</span>
            <span>Stop &rarr; target</span>
            <span>Status</span>
            <span>Posted</span>
          </div>
          {rows.length === 0 && (
            <p className="px-4 py-10 text-center text-[13px] text-muted">No calls match.</p>
          )}
          {rows.map((c) => {
            const move = moveVsEntry(c)
            const st = statusLabel[c.status]
            return (
              <Link
                key={c.id}
                href={`/c/${c.id}`}
                className="grid grid-cols-[minmax(220px,2fr)_1fr_1.3fr_1fr_1fr] items-center gap-4 border-b border-line px-4 py-3.5 hover:bg-surface-2"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <TokenIcon symbol={c.asset} size={32} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 text-[14px] font-medium">
                      {c.asset} <SideTag long={c.direction === 'long'} />
                    </span>
                    <span className="text-[12px] text-muted">
                      @{c.caller} · SF {callerMap.get(c.caller)?.superFactor ?? 50}
                    </span>
                  </span>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-[14px]">{price(c.price)}</span>
                  <span className={cx('text-[12px]', move >= 0 ? 'text-good' : 'text-bad')}>
                    {pct(move, 2)}
                  </span>
                </span>
                <span className="text-[13px] text-silver">
                  {price(c.stop)} to {price(c.target)}
                </span>
                <span className="flex flex-col gap-1">
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-silver">
                    <span className={cx('size-1.5 rounded-full', toneDot[st.tone])} />
                    {st.label}
                  </span>
                </span>
                <span className="text-[11px] text-muted">{ago(c.createdAt, now)}</span>
              </Link>
            )
          })}
        </div>
      </div>
      <div className="px-4 py-3 text-[13px] text-muted">
        {rows.length} of {calls.length} calls
      </div>
    </section>
  )
}
