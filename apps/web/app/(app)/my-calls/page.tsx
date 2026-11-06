'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CallCard } from '@/components/call-card'
import { PageTitle } from '@/components/ui'
import { API, type ApiCall } from '@/lib/api'
import { useMe } from '@/lib/me'

export default function MyCalls() {
  const { me } = useMe()
  const handle = me?.profile?.username
  const [calls, setCalls] = useState<ApiCall[] | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (!handle) return
    let live = true
    fetch(`${API}/callers/${handle}/calls`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((d: { calls: ApiCall[] }) => live && setCalls(d.calls))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
    }
  }, [handle])

  const signedOut = me === null
  const loading = me === undefined || (handle && calls === null && !error)

  return (
    <div className="space-y-6">
      <PageTitle
        title="My calls"
        sub="Every call you published, on record for good."
        action={
          <Link href="/compose" className="btn-cta flex h-10 items-center px-4 text-[13px]">
            Publish a call
          </Link>
        }
      />
      {loading ? (
        <div className="surface-card h-40 animate-pulse" />
      ) : signedOut ? (
        <p className="surface-card p-10 text-center text-[13px] text-muted">
          Sign in to see your calls.
        </p>
      ) : !handle ? (
        <div className="surface-card flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-[13px] text-muted">
            Create a profile and become a caller to publish calls.
          </p>
          <Link href="/profile" className="btn-cta flex h-10 items-center px-5 text-[13px]">
            Set up profile
          </Link>
        </div>
      ) : error ? (
        <p className="surface-card p-10 text-center text-[13px] text-bad">{error}</p>
      ) : calls?.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-4 p-10 text-center">
          <p className="text-[13px] text-muted">No calls yet. Publish your first one.</p>
          <Link href="/compose" className="btn-cta flex h-10 items-center px-5 text-[13px]">
            Publish a call
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {calls?.map((c) => <CallCard key={c.id} call={c} />)}
        </div>
      )}
    </div>
  )
}
