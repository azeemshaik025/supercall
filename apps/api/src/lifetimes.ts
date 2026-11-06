// Keeps caller records alive. They're owned by our writer key, which only the API holds, so the
// worker can't extend them as it does settlements (arkiv/schema.md, "Lifetimes").
import type { Hex } from 'viem'

/** A record this close to expiring is extended to Rabdi's longest life again. */
const WITHIN_DAYS = 30
const DAY_MS = 86_400_000

type Callers = {
  callersExpiringWithin: (days: number) => Promise<{ key: Hex }[]>
  extend: (keys: Hex[]) => Promise<unknown>
}

/** The keys it extended. */
export async function keepCallers(arkiv: Callers): Promise<Hex[]> {
  const keys = (await arkiv.callersExpiringWithin(WITHIN_DAYS)).map((c) => c.key)
  if (keys.length) await arkiv.extend(keys)
  return keys
}

/** `keepCallers` now and once a day. A run that fails is tried again the next day. */
export function keepCallersDaily(arkiv: Callers) {
  const run = () =>
    keepCallers(arkiv)
      .then((keys) => keys.length && console.log('Arkiv: extended caller records', keys))
      .catch((e: Error) => console.error('Arkiv: caller records not extended', e.message))
  void run()
  setInterval(run, DAY_MS)
}
