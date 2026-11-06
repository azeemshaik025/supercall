// The copied volume a settled call is weighed by in SuperFactor: each follower's filled buys on
// this call, and how many other callers that follower has copied before (from our copies table),
// which decides how much the follower's volume counts.
import type { Arkiv } from '@supercall/arkiv'
import { callVolume, walletTrust } from '@supercall/core'
import type { Db } from '@supercall/db'
import type { Hex } from 'viem'

export type FilledCopy = { follower: string; filledUsd: number }

/** Per wallet: distinct callers other than `caller` whose calls it has copied, besides `call`. */
export async function otherCallersCopied(
  db: Db,
  arkiv: Pick<Arkiv, 'call'>,
  wallets: string[],
  call: Hex,
  caller: Hex,
): Promise<Map<string, number>> {
  const lower = [...new Set(wallets.map((w) => w.toLowerCase()))]
  const counts = new Map(lower.map((w) => [w, 0]))
  if (!lower.length) return counts
  // Followers may be stored checksummed or lower-case: ask for both spellings.
  const spellings = [...new Set([...wallets, ...lower])]
  const rows = await db.query.copies.findMany({
    columns: { follower: true, call: true },
    where: (c, { and, inArray, ne }) =>
      and(inArray(c.follower, spellings), ne(c.call, call.toLowerCase())),
  })
  const callerOf = new Map<string, string | undefined>()
  for (const key of new Set(rows.map((r) => r.call.toLowerCase()))) {
    const record = await arkiv.call(key as Hex)
    callerOf.set(key, record?.caller.toLowerCase())
  }
  const seen = new Map<string, Set<string>>()
  for (const r of rows) {
    const other = callerOf.get(r.call.toLowerCase())
    if (!other || other === caller.toLowerCase()) continue
    const wallet = r.follower.toLowerCase()
    const set = seen.get(wallet) ?? new Set<string>()
    set.add(other)
    seen.set(wallet, set)
  }
  for (const [wallet, set] of seen) counts.set(wallet, set.size)
  return counts
}

/** The call's volume for SuperFactor: filled buys summed per wallet, then capped and trusted. */
export function scoredVolume(copies: FilledCopy[], otherCallers: Map<string, number>): number {
  const perWallet = new Map<string, number>()
  for (const c of copies) {
    const wallet = c.follower.toLowerCase()
    perWallet.set(wallet, (perWallet.get(wallet) ?? 0) + Math.max(0, c.filledUsd))
  }
  return callVolume(
    [...perWallet].map(([wallet, filledUsd]) => ({
      filledUsd,
      trust: walletTrust(otherCallers.get(wallet) ?? 0),
    })),
  )
}
