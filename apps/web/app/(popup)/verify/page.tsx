'use client'

// The extension's "Become a caller": username, World ID and the caller record, in a small window
// on this site, where the session and wallet already are.
import { BecomeCaller } from '@/components/become-caller'
import { Card } from '@/components/ui'

export default function VerifyPopup() {
  return (
    <Card className="mt-6 flex flex-col gap-5 p-7">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[20px] font-medium tracking-[-0.02em]">Become a caller</h1>
        <p className="text-[13px] leading-relaxed text-muted">
          Verify once with World ID, and your posts on X can be read as calls.
        </p>
      </div>
      <BecomeCaller onDone={() => window.close()} />
    </Card>
  )
}
