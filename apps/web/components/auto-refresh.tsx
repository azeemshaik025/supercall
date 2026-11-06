'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Reads the page's server parts again every `every` ms while the tab is in view, and at once on
 * coming back to it, so new calls show without a reload. Client state (filters, scroll) stays.
 */
export function AutoRefresh({ every = 15_000 }: { every?: number }) {
  const router = useRouter()
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh()
    }
    const t = setInterval(tick, every)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [router, every])
  return null
}
