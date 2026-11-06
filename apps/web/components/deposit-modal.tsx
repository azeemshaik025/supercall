'use client'

import { useEffect, useState } from 'react'
import {
  DEPOSIT_STEP,
  type DepositStep,
  type DepositToken,
  useDeposit,
  useDepositStatus,
  useDepositTokens,
} from '@/lib/deposit'
import { usd } from '@/lib/format'
import { cx } from './ui'

const CHAIN_LABEL: Record<string, string> = { base: 'Base', arbitrum: 'Arbitrum', ethereum: 'Ethereum' }

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Deposit"
        className="flex w-full max-w-[440px] flex-col border border-line-strong bg-surface shadow-pop"
      >
        {children}
      </div>
    </div>
  )
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-[54px] items-center justify-between border-b border-line px-5">
      <h2 className="text-[15px] font-medium">Get ARC USDC</h2>
      <button type="button" onClick={onClose} className="cursor-pointer text-muted hover:text-ink" aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

function TokenRow({
  token,
  selected,
  onClick,
}: {
  token: DepositToken
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors',
        selected ? 'sheen' : 'hover:bg-surface-2',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center bg-surface-2 text-[11px] font-medium text-muted">
        {token.symbol.slice(0, 4)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{token.symbol}</span>
        <span className="text-[11px] text-muted">{CHAIN_LABEL[token.chain] ?? token.chain}</span>
      </span>
      <span className="flex flex-col items-end">
        <span className="text-[13px]">{Number(token.balance).toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
        <span className="text-[11px] text-muted">{usd(Number(token.notional))}</span>
      </span>
    </button>
  )
}

type Phase = 'pick' | 'confirm' | 'signing' | 'bridging' | 'done' | 'failed'

export function DepositModal({ wallet, onClose, onDone }: { wallet: string; onClose: () => void; onDone: () => void }) {
  const { tokens, loading } = useDepositTokens(wallet)
  const deposit = useDeposit()

  const [selected, setSelected] = useState<DepositToken | null>(null)
  const [amount, setAmount] = useState('')
  const [phase, setPhase] = useState<Phase>('pick')
  const [step, setStep] = useState<DepositStep | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [error, setError] = useState<string>()

  const status = useDepositStatus(orderId, wallet)
  useEffect(() => {
    if (status?.status === 'arrived') setPhase('done')
    if (status?.status === 'failed') { setPhase('failed'); setError(status.reason) }
  }, [status])

  const parsedAmount = Number(amount.replace(/,/g, '')) || 0
  const tokenValue = selected ? Number(selected.notional) : 0
  const tokenBalance = selected ? Number(selected.balance) : 0

  const go = async () => {
    if (!selected) return
    setError(undefined)
    setPhase('signing')
    try {
      const id = await deposit(wallet, selected.chain, selected.address, amount, setStep)
      setOrderId(id)
      setStep('polling')
      setPhase('bridging')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(/reject|denied|cancel/i.test(msg) ? 'Cancelled in your wallet' : msg)
      setPhase('confirm')
    } finally {
      setStep(null)
    }
  }

  if (phase === 'done') {
    return (
      <Backdrop onClose={onDone}>
        <Header onClose={onDone} />
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
          <span className="grid size-12 place-items-center bg-good-soft text-[22px] text-good">{'✓'}</span>
          <h3 className="text-[18px] font-medium">Deposit arrived</h3>
          <p className="text-[13px] text-muted">
            {status?.status === 'arrived' && `${status.usdc} USDC`} is now on Arc and ready to use.
          </p>
          <button type="button" onClick={onDone} className="btn-cta mt-2 h-11 w-full cursor-pointer text-[14px]">
            Done
          </button>
        </div>
      </Backdrop>
    )
  }

  if (phase === 'bridging') {
    return (
      <Backdrop onClose={() => {}}>
        <Header onClose={() => {}} />
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
          <span className="size-8 animate-spin border-2 border-line border-t-ink" style={{ borderRadius: '50%' }} />
          <h3 className="text-[15px] font-medium">Bridging to Arc</h3>
          <p className="text-[13px] text-muted">
            {selected?.symbol} on {CHAIN_LABEL[selected?.chain ?? ''] ?? selected?.chain} → USDC on Arc. This takes 30 seconds to a few minutes.
          </p>
        </div>
      </Backdrop>
    )
  }

  if (phase === 'signing' && step) {
    return (
      <Backdrop onClose={() => {}}>
        <Header onClose={() => {}} />
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
          <span className="size-8 animate-spin border-2 border-line border-t-ink" style={{ borderRadius: '50%' }} />
          <p className="text-[13px] text-muted">{DEPOSIT_STEP[step]}</p>
        </div>
      </Backdrop>
    )
  }

  if (phase === 'confirm' && selected) {
    return (
      <Backdrop onClose={onClose}>
        <Header onClose={onClose} />
        <div className="flex flex-col gap-5 px-5 pt-5 pb-5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setPhase('pick'); setSelected(null); setAmount('') }} className="cursor-pointer text-muted hover:text-ink" aria-label="Back">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-[13px] font-medium">{selected.symbol} on {CHAIN_LABEL[selected.chain] ?? selected.chain}</span>
          </div>
          <label className="flex flex-col gap-2.5">
            <span className="flex justify-between text-[12px] text-muted">
              <span>Amount</span>
              <button type="button" onClick={() => setAmount(selected.balance)} className="cursor-pointer text-ink hover:underline">
                Max: {Number(selected.balance).toLocaleString('en-US', { maximumFractionDigits: 4 })}
              </button>
            </span>
            <span className="flex h-12 items-center border border-line-strong bg-sidebar px-3.5">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent text-[18px] font-medium outline-none"
                autoFocus
              />
              <span className="text-[12px] text-muted">{selected.symbol}</span>
            </span>
          </label>
          {parsedAmount > 0 && (
            <dl className="flex flex-col gap-2.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-muted">Value</dt>
                <dd>{usd(parsedAmount * (tokenValue / tokenBalance))}</dd>
              </div>
            </dl>
          )}
          {error && <p className="text-[12px] text-bad">{error}</p>}
          <button
            type="button"
            disabled={parsedAmount <= 0 || parsedAmount > tokenBalance}
            onClick={() => void go()}
            className="h-[46px] cursor-pointer bg-good text-[14px] font-semibold text-bg hover:brightness-110 disabled:cursor-default disabled:opacity-60 disabled:hover:brightness-100"
          >
            {parsedAmount > tokenBalance
              ? 'More than your balance'
              : parsedAmount <= 0
                ? 'Enter an amount'
                : `Deposit ${selected.symbol}`}
          </button>
        </div>
      </Backdrop>
    )
  }

  // Phase: pick
  return (
    <Backdrop onClose={onClose}>
      <Header onClose={onClose} />
      <div className="flex flex-col">
        <p className="px-5 pt-4 pb-2 text-[13px] text-muted">
          Bridge tokens from Base, Arbitrum or Ethereum into ARC USDC.
        </p>
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <span className="size-6 animate-spin border-2 border-line border-t-ink" style={{ borderRadius: '50%' }} />
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <p className="text-[13px] text-muted">No tokens found on Base, Arbitrum or Ethereum.</p>
            <p className="text-[12px] text-faint">Send tokens to your wallet on one of those chains first.</p>
          </div>
        ) : (
          <div className="flex max-h-[360px] flex-col overflow-y-auto">
            {tokens.map((t) => (
              <TokenRow
                key={`${t.chain}-${t.address}`}
                token={t}
                selected={selected?.chain === t.chain && selected.address === t.address}
                onClick={() => {
                  setSelected(t)
                  setAmount('')
                  setPhase('confirm')
                }}
              />
            ))}
          </div>
        )}
      </div>
    </Backdrop>
  )
}

export function DepositButton({ wallet, onDone }: { wallet: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer text-[12px] text-good hover:underline"
      >
        Get ARC USDC
      </button>
      {open && (
        <DepositModal
          wallet={wallet}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); onDone() }}
        />
      )}
    </>
  )
}
