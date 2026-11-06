'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cx } from './ui'

type Step = 'welcome' | 'connect' | 'verify' | 'done'
const ORDER: Step[] = ['connect', 'verify', 'done']
const WALLETS = [
  ['MetaMask', 'metamask'],
  ['Rabby', 'rabby'],
  ['Coinbase Wallet', 'coinbase'],
  ['WalletConnect', 'walletconnect'],
] as const

export function Onboarding() {
  const [step, setStep] = useState<Step>('welcome')
  const [verified, setVerified] = useState(false)
  const at = ORDER.indexOf(step)
  return (
    <div
      className="flex min-h-screen flex-col items-center gap-10 px-4 py-8"
      style={{
        background:
          'radial-gradient(60% 50% at 50% 0%, var(--sc-spotlight) 0%, transparent 70%), var(--sc-bg)',
      }}
    >
      <Link href="/explore">
        <img src="/brand/logo.svg" alt="Supercall" className="h-7 w-auto" />
      </Link>
      <div className="flex w-full max-w-[440px] flex-col gap-5">
        {at >= 0 && (
          <div className="flex gap-1.5">
            {ORDER.map((s, i) => (
              <span key={s} className={cx('h-[3px] flex-1', i <= at ? 'bg-steel' : 'bg-line')} />
            ))}
          </div>
        )}
        {step === 'welcome' && (
          <section className="surface-card flex flex-col items-center gap-3.5 px-7 py-9 text-center">
            <img src="/brand/mark.svg" alt="" className="size-14" />
            <h1 className="text-fade text-[36px] leading-[1.08] font-medium tracking-[-0.035em]">
              Welcome to Supercall
            </h1>
            <p className="max-w-80 text-[14px] leading-relaxed text-muted">
              Copy anyone's calls, or make your own. Callers only get paid when they're right.
            </p>
            <button
              type="button"
              onClick={() => setStep('connect')}
              className="btn-cta mt-3.5 h-[46px] w-full cursor-pointer text-[14px]"
            >
              Get started
            </button>
          </section>
        )}
        {step === 'connect' && (
          <section className="surface-card flex flex-col gap-4 p-7">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[26px] font-medium tracking-[-0.02em]">Connect</h1>
              <p className="text-[13px] text-muted">
                Use the wallet you have, or sign in with email and we'll make one.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {WALLETS.map(([name, file]) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => setStep('verify')}
                  className="flex h-[52px] cursor-pointer items-center gap-3 border border-line-strong bg-sidebar px-3.5 text-left text-[14px] hover:bg-surface-2"
                >
                  <img src={`/wallets/${file}.svg`} alt="" className="size-[26px]" />
                  {name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2.5 text-[12px] text-muted">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
            <button
              type="button"
              onClick={() => setStep('verify')}
              className="h-[46px] cursor-pointer border border-line-strong bg-gradient-to-b from-surface-3 to-surface-2 text-[14px]"
            >
              Continue with email
            </button>
            <span className="text-center text-[12px] text-muted">Secured by Privy</span>
          </section>
        )}
        {step === 'verify' && (
          <section className="surface-card flex flex-col gap-[18px] p-7">
            <img src="/brand/verified.svg" alt="" className="size-11" />
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[26px] font-medium tracking-[-0.02em]">Prove you're one human</h1>
              <p className="text-[13px] leading-relaxed text-muted">
                Only needed to publish calls. World ID proves you're a unique person without telling
                us who you are. No name, no passport, no country.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setVerified(true)
                setStep('done')
              }}
              className="btn-cta h-[46px] cursor-pointer text-[14px]"
            >
              Verify with World ID
            </button>
            <button
              type="button"
              onClick={() => {
                setVerified(false)
                setStep('done')
              }}
              className="h-9 cursor-pointer text-[13px] whitespace-nowrap text-muted hover:text-ink"
            >
              Skip, I only want to copy calls
            </button>
          </section>
        )}
        {step === 'done' && (
          <section className="surface-card flex flex-col items-center gap-3 px-7 py-8 text-center">
            <span className="grid size-12 place-items-center bg-good-soft text-[22px] text-good">
              {'✓'}
            </span>
            <h1 className="text-[26px] font-medium tracking-[-0.02em]">You're set</h1>
            <p className="text-[13px] leading-relaxed text-muted">
              {verified
                ? 'You can publish calls and copy anyone’s.'
                : 'You can copy anyone’s calls. Verify with World ID when you want to publish.'}
            </p>
            <div className="mt-2.5 flex w-full flex-col gap-2">
              {verified && (
                <Link
                  href="/compose"
                  className="btn-cta flex h-[46px] items-center justify-center text-[14px]"
                >
                  Publish a call
                </Link>
              )}
              <Link
                href="/explore"
                className={cx(
                  'flex h-[46px] items-center justify-center text-[14px]',
                  verified ? 'border border-line-strong bg-sidebar' : 'btn-cta',
                )}
              >
                Browse live calls
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
