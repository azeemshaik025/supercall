'use client'

import { useState } from 'react'
import { cx } from './ui'

export function FollowButton({ initial = false }: { initial?: boolean }) {
  const [on, setOn] = useState(initial)
  return (
    <button type="button" aria-pressed={on} onClick={() => setOn(!on)} className={cx('h-[38px] cursor-pointer px-4 text-[13px]', on ? 'border border-line-strong text-muted' : 'btn-cta')}>
      {on ? 'Following' : 'Follow'}
    </button>
  )
}
