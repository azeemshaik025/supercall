import { RequireAuth } from '@/components/auth'
import { Composer } from '@/components/composer'

export default function ComposePage() {
  return (
    <RequireAuth what="publish a call">
      <Composer />
    </RequireAuth>
  )
}
