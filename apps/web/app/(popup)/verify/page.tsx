'use client'

// The extension's "Become a caller": username, World ID and the caller record, in a small window
// on this site, where the session and wallet already are. Closes itself once the record is on Arkiv.
import { useEffect } from 'react'
import { BecomeCaller } from '@/components/become-caller'
import { Card } from '@/components/ui'
import { useCallerSetup } from '@/lib/caller'

export default function VerifyPopup() {
  const { step } = useCallerSetup()
  useEffect(() => {
    if (step !== 'done') return
    // A moment to see it worked; the extension's panel picks the change up on its own.
    const timer = setTimeout(() => window.close(), 1500)
    return () => clearTimeout(timer)
  }, [step])
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
