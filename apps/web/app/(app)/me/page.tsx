import { PageTitle } from '@/components/ui'

export default function Portfolio() {
  return (
    <div className="space-y-6">
      <PageTitle title="Portfolio" sub="Calls you copied, open and settled." />
      <p className="surface-card p-10 text-center text-[13px] text-muted">
        Connect your wallet to see your positions.
      </p>
    </div>
  )
}
