'use client'

// Anyone can browse and copy. Publishing is for callers: a username, World ID, and a caller
// record on Arkiv. Until all three are done, the page shows the next step instead.
import type { ReactNode } from 'react'
import { useCallerSetup } from '@/lib/caller'
import { BecomeCaller } from './become-caller'
import { Card } from './ui'

export function CallerGate({ children }: { children: ReactNode }) {
  const { step } = useCallerSetup()
  if (step === 'done') return <>{children}</>
  return (
    <Card className="mx-auto mt-16 flex max-w-md flex-col gap-5 p-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-medium tracking-[-0.02em]">Verify to publish calls</h1>
        <p className="text-[13px] leading-relaxed text-muted">
          Copying is open to everyone. Publishing needs one check: World ID proves you’re a unique
          person, without telling us who you are, so a bad run can’t be escaped with a new account.
        </p>
      </div>
      <BecomeCaller />
    </Card>
  )
}
