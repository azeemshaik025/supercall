import { RequireAuth } from '@/components/auth'
import { CallerGate } from '@/components/caller-gate'
import { Composer } from '@/components/composer'

export default function ComposePage() {
  return (
    <RequireAuth what="publish a call">
      <CallerGate>
        <Composer />
      </CallerGate>
    </RequireAuth>
  )
}
