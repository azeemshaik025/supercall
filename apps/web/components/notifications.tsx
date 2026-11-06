'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { api } from '@/lib/api'
import { useMe, walletOf } from '@/lib/me'
import type { Notice } from '@/lib/types'
import { cx } from './ui'

const WHAT_LABEL: Record<string, string> = {
  target: 'Target hit',
  stop: 'Stop hit',
  deadline: 'Expired',
  caller: 'Caller closed',
  unfired: 'Never entered',
  void: 'Cancelled',
}

const WHAT_TONE: Record<string, string> = {
  target: 'text-good',
  stop: 'text-bad',
  deadline: 'text-muted',
  caller: 'text-muted',
  unfired: 'text-faint',
  void: 'text-faint',
}

function ago(dateStr: string) {
  const s = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function Notifications({ onClose }: { onClose: () => void }) {
  const { authenticated, getAccessToken } = usePrivy()
  const { me } = useMe()
  const wallet = authenticated ? walletOf(me) : undefined
  const [notes, setNotes] = useState<Notice[] | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!wallet) return
    let live = true
    const load = async () => {
      try {
        const token = await getAccessToken()
        const data = await api<{ notifications: Notice[] }>(`/wallets/${wallet}/notifications`, {
          token,
        })
        if (live) setNotes(data.notifications)
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void load()
    return () => {
      live = false
    }
  }, [wallet, getAccessToken])

  const unread = notes?.filter((n) => !n.readAt) ?? []

  const markRead = async () => {
    if (!wallet || unread.length === 0) return
    try {
      const token = await getAccessToken()
      await api(`/wallets/${wallet}/notifications/read`, {
        method: 'POST',
        token,
        body: { ids: unread.map((n) => n.id) },
      })
      setNotes((prev) =>
        prev?.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) ?? null,
      )
    } catch {}
  }

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="surface-card absolute top-11 right-0 z-30 w-80 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-[14px] font-medium">
          Notifications{unread.length > 0 && <span className="ml-1 text-muted">{unread.length}</span>}
        </span>
        <span className="flex items-center gap-3">
          {unread.length > 0 && (
            <button
              type="button"
              onClick={() => void markRead()}
              className="cursor-pointer text-[12px] text-muted hover:text-ink"
            >
              Mark read
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-[12px] text-muted hover:text-ink"
          >
            Close
          </button>
        </span>
      </div>
      {!wallet ? (
        <p className="px-4 py-8 text-center text-[13px] text-muted">Sign in to see notifications.</p>
      ) : error ? (
        <p className="px-4 py-8 text-center text-[13px] text-bad">{error}</p>
      ) : notes === null ? (
        <div className="h-20 animate-pulse" />
      ) : notes.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-muted">No notifications yet.</p>
      ) : (
        <ul className="max-h-80 overflow-y-auto">
          {notes.map((n) => (
            <li key={n.id} className={cx('border-b border-line last:border-0', !n.readAt && 'bg-surface-2')}>
              <Link
                href={`/c/${n.call}`}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-3"
              >
                <span className="flex flex-1 flex-col gap-0.5">
                  <span className={cx('text-[13px] font-medium', WHAT_TONE[n.what] ?? '')}>
                    {WHAT_LABEL[n.what] ?? n.what}
                  </span>
                  <span className="text-[12px] text-muted">
                    {n.price !== null ? `at $${n.price.toFixed(2)}` : 'No fill'}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-faint">{ago(n.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
