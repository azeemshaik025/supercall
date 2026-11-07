'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { isOpen } from '@/lib/data'
import { moneyTone, sf, signedMoney, usdShort } from '@/lib/format'
import type { Call, Caller } from '@/lib/types'
import { LastTen } from './caller-card'
import { cx, Segmented, VerifiedBadge } from './ui'

const SORTS = ['SuperFactor', 'Followers made', 'Most calls', 'Newest'] as const
type Sort = (typeof SORTS)[number]

const by: Record<Sort, (a: Caller, b: Caller) => number> = {
  SuperFactor: (a, b) => b.superFactor - a.superFactor,
  'Followers made': (a, b) => b.followersNetUsd - a.followersNetUsd,
  'Most calls': (a, b) => b.callCount - a.callCount,
  Newest: (a, b) => b.joinedAt.localeCompare(a.joinedAt),
}

const cols = 'grid-cols-[32px_minmax(200px,2fr)_1.2fr_1.2fr_0.6fr_1fr_0.8fr_0.9fr_92px]'

export function CallersTable({ callers, calls }: { callers: Caller[]; calls: Call[] }) {
  const [sort, setSort] = useState<Sort>('SuperFactor')
  const [q, setQ] = useState('')
  const [following, setFollowing] = useState<Set<string>>(() => new Set())
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase()
    return [...callers]
      .filter((c) => !n || c.handle.includes(n) || c.displayName.toLowerCase().includes(n))
      .sort(by[sort])
  }, [callers, sort, q])

  return (
    <section aria-label="Callers table" className="surface-card">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
        <label className="flex h-9 max-w-80 flex-[1_1_220px] items-center gap-2 border border-line-strong bg-sidebar px-3 focus-within:border-steel">
          <span className="sr-only">Search callers</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search callers"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
        </label>
        <div className="ml-auto">
          <Segmented label="Sort" options={SORTS} value={sort} onChange={setSort} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <div
            className={cx(
              'grid gap-3.5 border-y border-line px-4 py-2.5 text-[12px] text-muted',
              cols,
            )}
          >
            <span>#</span>
            <span>Caller</span>
            <span>SuperFactor</span>
            <span>Last 10 calls</span>
            <span>Open</span>
            <span>Followers made</span>
            <span>In profit</span>
            <span>Fund</span>
            <span />
          </div>
          {rows.map((c, i) => {
            const on = following.has(c.handle)
            const open = calls.filter((x) => x.caller === c.handle && isOpen(x.status)).length
            return (
              <div
                key={c.handle}
                className={cx(
                  'grid items-center gap-3.5 border-b border-line px-4 py-3 text-[13px]',
                  cols,
                )}
              >
                <span className="text-muted">{i + 1}</span>
                <Link href={`/u/${c.handle}`} className="flex min-w-0 items-center gap-3">
                  <span className="grid size-[34px] shrink-0 place-items-center bg-surface-3 text-[13px] text-silver">
                    {c.displayName[0]}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 font-medium">
                      {c.displayName} {c.verified && <VerifiedBadge />}
                    </span>
                    <span className="text-[12px] text-muted">@{c.handle}</span>
                  </span>
                </Link>
                <span className="flex items-center gap-2.5">
                  <span className="w-12 font-medium tabular-nums">{sf(c.superFactor)}</span>
                  <span className="h-1.5 flex-1 bg-surface-3">
                    <span
                      className="block h-full bg-gradient-to-r from-steel/25 to-steel"
                      style={{ width: `${c.superFactor}%` }}
                    />
                  </span>
                </span>
                <LastTen outcomes={c.lastTen} size={11} />
                <span>{open || '—'}</span>
                <span className={cx('font-medium', moneyTone(c.followersNetUsd))}>
                  {signedMoney(c.followersNetUsd)}
                </span>
                <span>{c.followersProfitablePct}%</span>
                <span>{usdShort(c.poolUsd)}</span>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setFollowing((s) => {
                      const n = new Set(s)
                      on ? n.delete(c.handle) : n.add(c.handle)
                      return n
                    })
                  }
                  className={cx(
                    'h-8 cursor-pointer text-[12px]',
                    on ? 'border border-line-strong text-muted' : 'btn-cta',
                  )}
                >
                  {on ? 'Following' : 'Follow'}
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <div className="px-4 py-3 text-[13px] text-muted">
        {rows.length} of {callers.length} callers
      </div>
    </section>
  )
}
