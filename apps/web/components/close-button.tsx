'use client'

import { useState } from 'react'

export function CloseButton() {
  const [closed, setClosed] = useState(false)
  return (
    <button type="button" disabled={closed} onClick={() => setClosed(true)} className="h-8 cursor-pointer border border-line-strong bg-sidebar px-3 text-[12px]">
      {closed ? 'Selling…' : 'Close now'}
    </button>
  )
}
