import { RequireAuth } from '@/components/auth'
import { Composer } from '@/components/composer'
import { getMarkets } from '@/lib/data'

export default async function ComposePage() {
  const markets = await getMarkets()
  return (
    <RequireAuth what="publish a call">
      <Composer markets={markets} />
    </RequireAuth>
  )
}
