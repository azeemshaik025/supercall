'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { calls } from '@/lib/data'
import { usd } from '@/lib/format'
import { Notifications } from './notifications'

function crumbs(path: string): [string, string] {
  if (path.startsWith('/c/')) {
    const call = calls.find((c) => c.id === path.split('/')[2])
    return ['Explore', call ? `${call.asset} ${call.long ? 'long' : 'short'} · @${call.caller}` : 'Call']
  }
  if (path.startsWith('/markets/')) return ['Explore', `${path.split('/')[2]?.toUpperCase()}/USDC`]
  if (path.startsWith('/u/')) return ['Callers', `@${path.split('/')[2]}`]
  const map: Record<string, [string, string]> = {
    '/explore': ['Overview', 'Explore'],
    '/callers': ['Overview', 'Callers'],
    '/compose': ['Calls', 'Publish a call'],
    '/me': ['Account', 'Portfolio'],
    '/profile': ['Account', 'Settings'],
  }
  return map[path] ?? ['Overview', 'Supercall']
}

export function TopBar({ balance }: { balance: number }) {
  const path = usePathname()
  const [group, page] = crumbs(path)
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/95 px-6 backdrop-blur">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
        <span>{group}</span>
        <span aria-hidden="true" className="text-faint">/</span>
        <span className="truncate text-ink">{page}</span>
      </nav>
      <div className="relative flex items-center gap-2">
        <span title="Wallet balance on Arc" className="flex h-9 items-center gap-1.5 border border-line-strong bg-surface px-3 text-[13px]">
          {usd(balance)} <span className="text-muted">USDC</span>
        </span>
        <button
          type="button"
          aria-label="Notifications"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="relative grid size-9 cursor-pointer place-items-center border border-line-strong bg-surface"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
            <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" />
            <path d="M10 21h4" />
          </svg>
          <span className="absolute top-[7px] right-2 size-1.5 rounded-full bg-warn" />
        </button>
        {open && <Notifications onClose={() => setOpen(false)} />}
        <Link href="/compose" className="btn-cta flex h-9 items-center px-3.5 text-[13px]">
          Publish a call
        </Link>
      </div>
    </header>
  )
}
