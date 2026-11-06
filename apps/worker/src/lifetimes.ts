// Keeps each caller's latest settlement alive: it alone carries their S, W, fund and need forward.
import type { Hex } from 'viem'

const WITHIN_DAYS = 30

type Settlements = {
  settlementsExpiringWithin: (days: number) => Promise<{ key: Hex; caller: Hex }[]>
  latestSettlementBy: (caller: Hex) => Promise<{ key: Hex } | undefined>
  extend: (keys: Hex[]) => Promise<unknown>
}

export async function keepSettlements(arkiv: Settlements): Promise<Hex[]> {
  const expiring = await arkiv.settlementsExpiringWithin(WITHIN_DAYS)
  const callers = [...new Set(expiring.map((s) => s.caller))]
  const latest = await Promise.all(callers.map((c) => arkiv.latestSettlementBy(c)))
  const keys = latest.flatMap((s) => (s && expiring.some((e) => e.key === s.key) ? [s.key] : []))
  if (keys.length) await arkiv.extend(keys)
  return keys
}
