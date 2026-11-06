'use client'

// Anyone can browse and copy. Publishing is for callers: a username, World ID, and a caller
// record on Arkiv. Until all three are done, the page shows the next step instead.
import type { ReactNode } from 'react'
import { useCallerSetup } from '@/lib/caller'
import { BecomeCallerSteps } from './become-caller'
import { Card } from './ui'

/** The composer's outline while the caller status is read: no card that's about to vanish. */
function Waiting() {
  return (
    <div aria-busy="true" className="flex flex-wrap items-start gap-5">
      <div className="surface-card h-[560px] min-w-0 flex-[999_1_520px] animate-pulse" />
      <div className="surface-card h-[560px] min-w-0 flex-[1_1_340px] animate-pulse" />
    </div>
  )
}

export function CallerGate({ children }: { children: ReactNode }) {
  const setup = useCallerSetup()
  const { step } = setup
  if (step === 'done') return <>{children}</>
  if (step === 'loading') return <Waiting />
  return (
    <Card className="mx-auto mt-16 flex max-w-md flex-col gap-5 p-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-medium tracking-[-0.02em]">Verify to publish calls</h1>
        <p className="text-[13px] leading-relaxed text-muted">
          Copying is open to everyone. Publishing needs one check: World ID proves you’re a unique
          person, without telling us who you are, so a bad run can’t be escaped with a new account.
        </p>
      </div>
      <BecomeCallerSteps setup={setup} />
    </Card>
  )
}
