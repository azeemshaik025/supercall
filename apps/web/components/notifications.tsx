'use client'

import Link from 'next/link'
import { notifications } from '@/lib/data'

export function Notifications({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="surface-card absolute top-11 right-0 z-30 w-80 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[14px] font-medium">Notifications</span>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-[12px] text-muted hover:text-ink"
        >
          Close
        </button>
      </div>
      <ul>
        {notifications.map((n) => (
          <li key={n.id} className="border-b border-line last:border-0">
            <Link
              href={n.href}
              onClick={onClose}
              className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2"
            >
              <span className="text-[13px]">{n.title}</span>
              <span className="text-[12px] text-muted">{n.when}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
