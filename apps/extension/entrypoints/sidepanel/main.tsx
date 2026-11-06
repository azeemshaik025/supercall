// The side panel: sign in with Privy, see the wallet, and copy the call a card's Copy picked.
import { PrivyProvider, useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { CHAIN } from '@supercall/chains'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderSVG } from 'uqr'
import { createPublicClient, erc20Abi, http } from 'viem'
import { browser } from 'wxt/browser'
import { feeOf, fromMicro, toMicro } from '../../lib/fee'
import type { Call } from '../../lib/lookup'
import { type Pending, pendingKey, readPending } from '../../lib/pending'
import { arc, privyAppId, privyConfig } from '../../lib/privy'
import type { Message } from '../background'
import { CallerCard } from './caller'

declare const __API_URL__: string
declare const __WEB_ORIGIN__: string

// The app's chain (CHAIN): where Hisaab holds fees and Flash trades.
const client = createPublicClient({ chain: arc, transport: http() })
/** How often balances are read again while the panel is open. */
const REFRESH_MS = 15_000
const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/** The wallet's USDC on the app's chain, read again on `tick` and every 15 seconds. */
function useUsdc(wallet: string | undefined, tick: number) {
  const [balance, setBalance] = useState<number | null>()
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the reload button asking to read again
  useEffect(() => {
    if (!wallet) return
    let live = true
    const read = () =>
      client
        .readContract({
          address: CHAIN.usdc.address,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet as `0x${string}`],
        })
        .then(
          (b) => live && setBalance(fromMicro(b)),
          (error: unknown) => {
            console.warn('Supercall balance failed', error)
            if (live) setBalance(null)
          },
        )
    setBalance(undefined)
    void read()
    const timer = setInterval(read, REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [wallet, tick])
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

/**
 * The signed-in user's wallet. Their embedded one is made at sign-in, but the sign-in window can
 * close before Privy finishes it: if they have none once Privy's wallets load, make it here.
 */
function useWallet() {
  const { user } = usePrivy()
  const { wallets, ready } = useWallets()
  const { createWallet } = useCreateWallet()
  const asked = useRef(false)
  const wallet = wallets.find((w) => w.walletClientType === 'privy') ?? wallets[0]
  const address = wallet?.address ?? user?.wallet?.address
  useEffect(() => {
    if (!ready || address || asked.current) return
    asked.current = true
    createWallet().catch((error: unknown) => console.warn('Supercall wallet not created', error))
  }, [ready, address, createWallet])
  return { address, creating: ready && !address }
}

const CopyIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <rect x="5" y="5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M11 5V2H2v9h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)
const QrIcon = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h2v2H9zM12 12h2v2h-2zM12 9h2v2M9 12h2v2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
)

/** Copies the address, and says so for a moment. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="sc-icon"
      title={copied ? 'Copied' : 'Copy address'}
      aria-label="Copy address"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
    >
      {copied ? <span className="sc-good">✓</span> : <CopyIcon />}
    </button>
  )
}

/** The address as a QR code, to send USDC to it on Arc. */
function AddFunds({ address }: { address: string }) {
  const svg = renderSVG(address, { border: 2, pixelSize: 6 })
  return (
    <div className="sc-funds">
      <span className="sc-label">Add funds</span>
      <img
        className="sc-qr"
        src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
        alt="QR code of your wallet address"
      />
      <div className="sc-row">
        <span className="sc-mono sc-break">{address}</span>
        <CopyButton text={address} />
      </div>
      <p className="sc-muted">Send USDC on {CHAIN.name} only. Other networks won’t arrive here.</p>
    </div>
  )
}

function Account({ tick }: { tick: number }) {
  const { user, logout } = usePrivy()
  const { address, creating } = useWallet()
  const balance = useUsdc(address, tick)
  const shown = (b: number | null | undefined) =>
    !address ? '–' : b === undefined ? '…' : b === null ? 'Unavailable' : usd(b)
  const [showFunds, setShowFunds] = useState(false)
  const name = user?.twitter?.username ? `@${user.twitter.username}` : (user?.email?.address ?? '')
  return (
    <section className="sc-box">
      <div className="sc-row">
        <span className="sc-label">Signed in</span>
        <button type="button" className="sc-link" onClick={() => logout()}>
          Sign out
        </button>
      </div>
      <strong className="sc-clip" title={name}>
        {name || 'Wallet'}
      </strong>
      <dl className="sc-facts">
        <div>
          <dt>Wallet</dt>
          <dd className="sc-wallet">
            <span className="sc-mono" title={address}>
              {address ? short(address) : creating ? 'Creating…' : 'Loading…'}
            </span>
            {address && (
              <>
                <CopyButton text={address} />
                <button
                  type="button"
                  className={showFunds ? 'sc-icon sc-on' : 'sc-icon'}
                  title="Add funds"
                  aria-label="Add funds"
                  aria-expanded={showFunds}
                  onClick={() => setShowFunds((v) => !v)}
                >
                  <QrIcon />
                </button>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>USDC</dt>
          <dd className="sc-mono">{shown(balance)}</dd>
        </div>
      </dl>
      {address && showFunds && <AddFunds address={address} />}
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
  const [tick, setTick] = useState(0)
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
        <span className="sc-tools">
          <span className="sc-chip">{CHAIN.name}</span>
          <button
            type="button"
            className="sc-icon"
            title="Reload balances"
            aria-label="Reload balances"
            onClick={() => setTick((t) => t + 1)}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v2.8h-2.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              />
            </svg>
          </button>
        </span>
      </header>
      <div className="sc-body">
        {!ready ? (
          <p className="sc-muted">Loading…</p>
        ) : authenticated ? (
          <>
            <Account tick={tick} />
            <CallerCard />
          </>
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
      <div className={authenticated ? 'sc-dither sc-quiet' : 'sc-dither'} aria-hidden="true" />
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
