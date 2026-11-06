'use client'

import { useEffect, useRef, useState } from 'react'
import { callLink, postOnX } from '@/lib/share'
import type { Call } from '@/lib/types'

/** Share on the call page: post it on X (its preview is the call card), or copy its link. */
export function ShareCall({ call }: { call: Call }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 cursor-pointer items-center gap-1.5 border border-line-strong px-2.5 text-[12px] hover:bg-surface-2"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 12v8h16v-8M12 3v13M7 8l5-5 5 5" />
        </svg>
        Share
      </button>
      {open && (
        <div className="absolute top-full left-0 z-40 mt-1.5 w-44 border border-line-strong bg-surface py-1 text-[13px] shadow-pop">
          <a
            href={postOnX({ ...call, direction: call.direction === 'long' ? 'long' : 'short' })}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-2"
          >
            <span className="w-3.5 text-center font-semibold">𝕏</span> Post on X
          </a>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard?.writeText(callLink(call.id)).then(() => {
                setCopied(true)
                setTimeout(() => {
                  setCopied(false)
                  setOpen(false)
                }, 900)
              })
            }
            className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-surface-2"
          >
            <span className="w-3.5 text-center">⧉</span> {copied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      )}
    </div>
  )
}
