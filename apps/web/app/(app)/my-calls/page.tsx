import Link from 'next/link'
import { PageTitle } from '@/components/ui'

export default function MyCalls() {
  return (
    <div className="space-y-6">
      <PageTitle
        title="My calls"
        sub="Every call you published, on record for good."
        action={
          <Link href="/compose" className="btn-cta flex h-10 items-center px-4 text-[13px]">
            Publish a call
          </Link>
        }
      />
      <p className="surface-card p-10 text-center text-[13px] text-muted">
        Connect your wallet to see your calls.
      </p>
    </div>
  )
}
