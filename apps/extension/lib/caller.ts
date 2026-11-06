import { type callerResponse, callersResponse } from '@supercall/api-schema'
import type { z } from 'zod'

export type Caller = z.infer<typeof callerResponse>

// A caller's numbers move as their calls settle, but not by the second.
const ttl = 60_000

/** The Supercall caller behind an X account, or null if they aren't one. Cached a minute. */
export function createCallerLookup({
  api,
  fetch,
  now = Date.now,
}: {
  api: string
  fetch: (url: string) => Promise<Response>
  now?: () => number
}) {
  const cache = new Map<string, { caller: Caller | null; at: number }>()
  return async function callerOf(x: string): Promise<Caller | null> {
    const key = x.toLowerCase()
    const hit = cache.get(key)
    if (hit && now() - hit.at < ttl) return hit.caller
    const res = await fetch(`${api}/callers?x=${encodeURIComponent(key)}`)
    if (!res.ok) throw new Error(`Caller lookup failed: ${res.status}`)
    const caller = callersResponse.parse(await res.json()).callers[0] ?? null
    cache.set(key, { caller, at: now() })
    return caller
  }
}
