'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cx, Icon } from './ui'

type Item = { href: string; label: string; icon: string; match: (p: string) => boolean }

const groups: { title?: string; items: Item[] }[] = [
  {
    items: [
      {
        href: '/explore',
        label: 'Explore',
        icon: 'explore',
        match: (p) => p.startsWith('/explore') || p.startsWith('/c/') || p.startsWith('/markets'),
      },
      {
        href: '/callers',
        label: 'Callers',
        icon: 'callers',
        match: (p) => p.startsWith('/callers') || (p.startsWith('/u/') && p !== '/u/rakesh'),
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
        match: (p) => p.startsWith('/compose'),
      },
      { href: '/me?tab=calling', label: 'My calls', icon: 'my-calls', match: () => false },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/me', label: 'Portfolio', icon: 'portfolio', match: (p) => p.startsWith('/me') },
      { href: '/u/rakesh', label: 'Profile', icon: 'profile', match: (p) => p === '/u/rakesh' },
    ],
  },
]

const bottom: Item[] = [
  {
    href: '/onboarding',
    label: 'Support',
    icon: 'support',
    match: (p) => p.startsWith('/onboarding'),
  },
  { href: '/profile', label: 'Settings', icon: 'settings', match: (p) => p.startsWith('/profile') },
]

function NavLink({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex h-10 items-center gap-3 border px-3 text-sm',
        active ? 'sheen text-ink' : 'border-transparent text-muted hover:text-ink',
      )}
    >
      <Icon name={item.icon} />
      {item.label}
    </Link>
  )
}

export function Sidebar() {
  const path = usePathname()
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-6 border-r border-line bg-sidebar px-3 py-5 max-lg:hidden"
    >
      <Link href="/explore" className="px-2.5 py-1">
        <img src="/brand/logo.svg" alt="Supercall" className="h-[26px] w-auto" />
      </Link>
      {groups.map((g) => (
        <div key={g.title ?? 'main'} className="flex flex-col gap-0.5">
          {g.title && <span className="px-3 pb-1.5 text-[12px] text-muted">{g.title}</span>}
          {g.items.map((i) => (
            <NavLink key={i.label} item={i} active={i.match(path)} />
          ))}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5">
        {bottom.map((i) => (
          <NavLink key={i.label} item={i} active={i.match(path)} />
        ))}
        <div className="mt-2.5 flex items-center gap-2.5 border-t border-line px-2.5 pt-3">
          <span className="grid size-8 place-items-center bg-surface-3 text-[13px] text-silver">
            R
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium">@rakesh</span>
            <span className="font-mono text-[12px] text-muted">0x7a3f…91c2</span>
          </span>
        </div>
      </div>
    </nav>
  )
}
