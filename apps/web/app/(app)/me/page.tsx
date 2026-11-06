import { Portfolio } from '@/components/portfolio'
import { PageTitle } from '@/components/ui'

export default function PortfolioPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="Portfolio" sub="Calls you copied, open and settled." />
      <Portfolio />
    </div>
  )
}
