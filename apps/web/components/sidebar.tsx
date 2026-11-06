'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useMe, walletOf } from '@/lib/me'
import { cx, Icon } from './ui'

type Item = { href: string; label: string; icon: string; active: (p: string) => boolean }

/** `mine`: the signed-in user's public page, once they have a username. */
const groupsFor = (mine: string | null): { title?: string; items: Item[] }[] => [
  {
    items: [
      {
        href: '/explore',
        label: 'Explore',
        icon: 'explore',
        active: (p) => p.startsWith('/explore') || p.startsWith('/c/') || p.startsWith('/markets'),
      },
      {
        href: '/callers',
        label: 'Callers',
        icon: 'callers',
        active: (p) => p.startsWith('/callers') || (p.startsWith('/u/') && p !== mine),
      },
    ],
  },
  {
    title: 'Calls',
    items: [
      {
        href: '/compose',
        label: 'Publish a call',
        icon: 'publish',
        active: (p) => p === '/compose',
      },
      { href: '/my-calls', label: 'My calls', icon: 'my-calls', active: (p) => p === '/my-calls' },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/me', label: 'Portfolio', icon: 'portfolio', active: (p) => p === '/me' },
      {
        href: mine ?? '/profile',
        label: 'Profile',
        icon: 'profile',
        active: (p) => p === mine,
      },
      { href: '/profile', label: 'Settings', icon: 'settings', active: (p) => p === '/profile' },
    ],
  },
]

const RAIL = 64
const FULL = 236
/** Chart-first pages open with the sidebar folded so the chart gets the room. */
const chartFirst = (p: string) =>
  p.startsWith('/c/') || p === '/compose' || p.startsWith('/markets')

export function Sidebar() {
  const path = usePathname()
  const { me } = useMe()
  const mine = me?.profile ? `/u/${me.profile.username}` : null
  const groups = groupsFor(mine)
  const who = me?.profile
    ? `@${me.profile.username}`
    : me?.account.x
      ? `@${me.account.x.username}`
      : (me?.account.email ?? '')
  const address = walletOf(me)
  const [pinned, setPinned] = useState<boolean | null>(null)
  const [hover, setHover] = useState(false)
  const isPinned = pinned ?? !chartFirst(path)
  const open = isPinned || hover

  return (
    <div
      className="sticky top-0 hidden h-screen shrink-0 lg:block"
      style={{ width: isPinned ? FULL : RAIL }}
    >
      <aside
        aria-label="Main"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={cx(
          'absolute inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-line bg-sidebar',
          !isPinned && hover && 'shadow-pop',
        )}
        style={{ width: open ? FULL : RAIL }}
      >
        <div className="flex h-16 shrink-0 items-center border-b border-line px-4">
          <Link
            href="/explore"
            aria-label="Supercall: explore calls"
            className="flex shrink-0 items-center gap-1"
          >
            <img src="/brand/mark.svg" alt="" className="size-8" />
            <img
              src="/brand/wordmark.svg"
              alt=""
              className={cx(
                'h-8 w-auto transition-opacity duration-200',
                open ? 'opacity-100' : 'opacity-0',
              )}
            />
          </Link>
          <button
            type="button"
            onClick={() => setPinned(!isPinned)}
            aria-label={isPinned ? 'Collapse sidebar' : 'Keep sidebar open'}
            tabIndex={open ? 0 : -1}
            className={cx(
              'ml-auto grid size-6 shrink-0 cursor-pointer place-items-center border border-silver/10 bg-silver/10 text-silver transition-opacity duration-200 hover:bg-silver/20',
              open ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            <Icon
              name="chevron-left"
              size={18}
              className={cx('transition-transform duration-300', !isPinned && 'rotate-180')}
            />
          </button>
        </div>

        <nav
          className={cx(
            'min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4',
            open ? 'pt-1' : 'pt-4',
          )}
        >
          {groups.map((g) => (
            <div key={g.title ?? 'main'}>
              {g.title && (
                <div
                  className={cx(
                    'flex items-end overflow-hidden px-2.5 text-[12px] whitespace-nowrap text-faint transition-opacity duration-200',
                    open ? 'h-11 pb-2.5 opacity-100' : 'h-0 pb-0 opacity-0',
                  )}
                >
                  {g.title}
                </div>
              )}
              {g.items.map((item) => {
                const on = item.active(path)
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    title={open ? undefined : item.label}
                    aria-current={on ? 'page' : undefined}
                    className={cx(
                      'mb-1 flex h-[38px] items-center gap-[11px] border pl-2.5 text-[14px] whitespace-nowrap',
                      on ? 'sheen text-ink' : 'border-transparent text-muted hover:text-ink',
                    )}
                  >
                    <Icon name={item.icon} />
                    <span
                      className={cx(
                        'transition-opacity duration-200',
                        open ? 'opacity-100' : 'opacity-0',
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {me && (
          <div className="flex shrink-0 items-center gap-2.5 border-t border-line px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center bg-surface-3 text-[13px] text-silver">
              {(who.replace('@', '')[0] ?? '?').toUpperCase()}
            </span>
            <span
              className={cx(
                'flex min-w-0 flex-col transition-opacity duration-200',
                open ? 'opacity-100' : 'opacity-0',
              )}
            >
              <span className="truncate text-[13px] font-medium">{who}</span>
              {address && (
                <span className="font-mono text-[12px] text-muted">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              )}
            </span>
          </div>
        )}
      </aside>
    </div>
  )
}
