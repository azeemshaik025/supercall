// The side panel: sign in with Privy, see the wallet, and copy the call a card's Copy picked.
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth'
import { CHAIN } from '@supercall/chains'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createPublicClient, erc20Abi, http } from 'viem'
import { browser } from 'wxt/browser'
import { feeOf, fromMicro, toMicro } from '../../lib/fee'
import type { Call } from '../../lib/lookup'
import { type Pending, pendingKey, readPending } from '../../lib/pending'
import { arc, privyAppId, privyConfig } from '../../lib/privy'
import type { Message } from '../background'

declare const __API_URL__: string
declare const __WEB_ORIGIN__: string

const client = createPublicClient({ chain: arc, transport: http() })
const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** The wallet's USDC on Arc, or undefined until it's read. */
function useUsdc(wallet: string | undefined) {
  const [balance, setBalance] = useState<number>()
  useEffect(() => {
    if (!wallet) return
    client
      .readContract({
        address: CHAIN.usdc.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [wallet as `0x${string}`],
      })
      .then(
        (b) => setBalance(fromMicro(b)),
        () => setBalance(undefined),
      )
  }, [wallet])
  return balance
}

/** The call Copy picked, kept current as new ones arrive. */
function usePending() {
  const [pending, setPending] = useState<Pending>()
  useEffect(() => {
    void readPending(browser.storage.session).then(setPending)
    const changed = (changes: Record<string, { newValue?: unknown }>) => {
      if (pendingKey in changes) setPending(changes[pendingKey]?.newValue as Pending | undefined)
    }
    browser.storage.session.onChanged.addListener(changed)
    return () => browser.storage.session.onChanged.removeListener(changed)
  }, [])
  return pending
}

/** The call as the card showed it, or from the API when the card didn't pass it. */
function useCall(pending: Pending | undefined) {
  const [call, setCall] = useState<Call | null>()
  useEffect(() => {
    if (!pending) return setCall(undefined)
    if (pending.call) return setCall(pending.call)
    fetch(`${__API_URL__}/calls/${encodeURIComponent(pending.id)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Call>) : null))
      .then(setCall, () => setCall(null))
  }, [pending])
  return call
}

function Account() {
  const { user, logout } = usePrivy()
  const { wallets } = useWallets()
  const wallet = wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0]
  const balance = useUsdc(wallet?.address)
  const name = user?.twitter?.username ? `@${user.twitter.username}` : (user?.email?.address ?? '')
  return (
    <section className="sc-box">
      <div className="sc-row">
        <span className="sc-label">Signed in</span>
        <button type="button" className="sc-link" onClick={() => logout()}>
          Sign out
        </button>
      </div>
      <div className="sc-row">
        <strong>{name || 'Wallet'}</strong>
        <span className="sc-mono sc-muted">{wallet ? short(wallet.address) : 'No wallet yet'}</span>
      </div>
      <div className="sc-row">
        <span className="sc-muted">USDC on Arc</span>
        <span className="sc-mono">{balance === undefined ? '…' : usd(balance)}</span>
      </div>
    </section>
  )
}

function Copy({ id, call }: { id: string; call: Call | null | undefined }) {
  const [size, setSize] = useState('100')
  const dollars = Number(size)
  const fee = Number.isFinite(dollars) && dollars > 0 ? feeOf(toMicro(dollars)) : undefined
  if (call === undefined) return <section className="sc-box sc-muted">Loading the call…</section>
  if (call === null)
    return (
      <section className="sc-box">
        <p className="sc-muted">This call isn’t on record.</p>
        <a className="sc-link" href={`${__WEB_ORIGIN__}/c/${id}`} target="_blank" rel="noreferrer">
          Open on Supercall
        </a>
      </section>
    )
  return (
    <section className="sc-box">
      <div className="sc-row">
        <strong>
          {call.asset}
          <span className="sc-muted">/USDC</span>{' '}
          <span className={call.direction === 'long' ? 'sc-good' : 'sc-bad'}>
            {call.direction === 'long' ? 'Long' : 'Short'}
          </span>
        </strong>
        <span className="sc-muted">@{call.caller}</span>
      </div>
      <div className="sc-levels">
        <div>
          <span className="sc-label">Entry</span>
          <span>{call.entry.toLocaleString()}</span>
        </div>
        <div>
          <span className="sc-label">Stop</span>
          <span className="sc-bad">{call.stop.toLocaleString()}</span>
        </div>
        <div>
          <span className="sc-label">Target</span>
          <span className="sc-good">{call.target.toLocaleString()}</span>
        </div>
      </div>
      <label className="sc-label" htmlFor="size">
        Size in USDC
      </label>
      <input
        id="size"
        className="sc-input"
        inputMode="decimal"
        value={size}
        onChange={(e) => setSize(e.target.value)}
      />
      <div className="sc-row">
        <span className="sc-muted">Copy fee, 0.7%, held in Hisaab</span>
        <span className="sc-mono">{fee ? usd(fromMicro(fee.total)) : '–'}</span>
      </div>
      <button type="button" className="sc-button" disabled>
        Pay fee and copy
      </button>
      <p className="sc-muted">
        Paying turns on once the API takes copies. Until then, the fee shown is exactly what Hisaab
        would take.
      </p>
    </section>
  )
}

function Panel() {
  const { ready, authenticated } = usePrivy()
  const pending = usePending()
  const call = useCall(pending)
  useEffect(() => {
    // The sign-in window says when it's done; Privy's session is shared, so a reload picks it up.
    const heard = (message: Message) => {
      if (message.type === 'signed-in') location.reload()
    }
    browser.runtime.onMessage.addListener(heard)
    return () => browser.runtime.onMessage.removeListener(heard)
  }, [])
  return (
    <main className="sc-shell">
      <header className="sc-head">
        <span className="sc-brand">
          <img src="/icon-light/32.png" alt="" />
          Supercall
        </span>
        <span className="sc-chip">Arc testnet</span>
      </header>
      <div className="sc-body">
        {!ready ? (
          <p className="sc-muted">Loading…</p>
        ) : authenticated ? (
          <Account />
        ) : (
          <>
            <div className="sc-hero">
              <h1>
                Super easy to copy.
                <br />
                <span>Super hard to fake.</span>
              </h1>
              <p className="sc-muted">Same account and wallet as the Supercall site.</p>
            </div>
            <button
              type="button"
              className="sc-button"
              onClick={() => browser.runtime.sendMessage({ type: 'sign-in' } satisfies Message)}
            >
              Sign in
            </button>
            <p className="sc-methods">X · Email · Wallet</p>
          </>
        )}
        {pending ? (
          <Copy id={pending.id} call={call} />
        ) : (
          <p className="sc-hint">Tap Copy under a call on X to copy it here.</p>
        )}
      </div>
      <div className="sc-dither" aria-hidden="true" />
    </main>
  )
}

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <Panel />
    </PrivyProvider>,
  )
