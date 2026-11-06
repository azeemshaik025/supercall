import { RequireAuth } from '@/components/auth'
import { CallerGate } from '@/components/caller-gate'
import { Composer } from '@/components/composer'
import { getMarkets } from '@/lib/data'

export default async function ComposePage() {
  const markets = await getMarkets()
  return (
    <RequireAuth what="publish a call">
      <CallerGate>
        <Composer markets={markets} />
      </CallerGate>
    </RequireAuth>
  )
}
