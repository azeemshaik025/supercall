// The side panel: your Supercall account, wallet and caller status, and the copy sheet for the
// call a card's Copy picked. It uses the Supercall site's sign-in (lib/session.ts): there is no
// second login. Anything your wallet signs opens a small Supercall window, where the session is.
import { CHAIN, viemChain } from '@supercall/chains'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderSVG } from 'uqr'
import { createPublicClient, erc20Abi, http } from 'viem'
import { browser } from 'wxt/browser'
import { api } from '../../lib/api'
import { feeOf, fromMicro, toMicro } from '../../lib/fee'
import type { Call } from '../../lib/lookup'
import { type Pending, pendingKey, readPending } from '../../lib/pending'
import { expiresAt, SESSION_KEY } from '../../lib/session'
import type { Message } from '../background'

declare const __API_URL__: string
declare const __WEB_ORIGIN__: string
declare const __BUILD__: string

// The app's chain (CHAIN): where Hisaab holds fees and Flash trades.
const client = createPublicClient({ chain: viemChain(), transport: http() })
/** How often balances and the account are read again while the panel is open. */
const REFRESH_MS = 15_000
const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
/** Opens a page of the Supercall site in a wallet-sized window. */
const openSite = (path: string) =>
  browser.runtime.sendMessage({ type: 'open', path } satisfies Message)

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

/** The site's sign-in, as its script last handed it over; undefined until read. */
function useSession() {
  const [token, setToken] = useState<string | null>()
  useEffect(() => {
    const read = () =>
      browser.storage.session
        .get([SESSION_KEY])
        .then((s) => setToken((s[SESSION_KEY] as string | null | undefined) ?? null))
    void read()
    const changed = (changes: Record<string, { newValue?: unknown }>) => {
      if (SESSION_KEY in changes)
        setToken((changes[SESSION_KEY]?.newValue as string | null) ?? null)
    }
    browser.storage.session.onChanged.addListener(changed)
    // A token that runs out while the site is closed counts as signed out.
    const timer = setInterval(read, 30_000)
    return () => {
      browser.storage.session.onChanged.removeListener(changed)
      clearInterval(timer)
    }
  }, [])
  const live = token && expiresAt(token) > Date.now() / 1000 ? token : null
  return { token: live, ready: token !== undefined, expired: Boolean(token) && !live }
}

type Me = {
  profile: { username: string; wallet: string; worldVerified: boolean } | null
  account: { wallets: string[]; email: string | null; x: { username: string } | null }
  worldVerified: boolean
}
type MyCaller = { key: string | null; caller: { handle: string; superFactor: number } | null }

/** The account behind the session, and its caller record once it has one. */
function useAccount(token: string | null, tick: number) {
  const [me, setMe] = useState<Me | null>()
  const [caller, setCaller] = useState<MyCaller | null>()
  const [error, setError] = useState<string>()
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick is the reload button asking to read again
  useEffect(() => {
    if (!token) return setMe(null)
    let live = true
    const read = async () => {
      try {
        const m = await api<Me>('/me', { token })
        const c = m.profile?.worldVerified
          ? await api<MyCaller>('/me/caller', { token }).catch(() => null)
          : null
        if (!live) return
        setMe(m)
        setCaller(c)
        setError(undefined)
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void read()
    const timer = setInterval(read, REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [token, tick])
  return { me, caller, error }
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

function Account({ me, tick }: { me: Me; tick: number }) {
  const address = me.profile?.wallet ?? me.account.wallets[0]
  const balance = useUsdc(address, tick)
  const [showFunds, setShowFunds] = useState(false)
  const name = me.account.x ? `@${me.account.x.username}` : (me.account.email ?? 'Signed in')
  return (
    <section className="sc-box">
      <div className="sc-row">
        <span className="sc-label">Signed in on Supercall</span>
        <button type="button" className="sc-link" onClick={() => openSite('/profile')}>
          Manage
        </button>
      </div>
      <strong className="sc-clip" title={name}>
        {name}
      </strong>
      <dl className="sc-facts">
        <div>
          <dt>Wallet</dt>
          <dd className="sc-wallet">
            <span className="sc-mono" title={address}>
              {address ? short(address) : 'Finishing on Supercall…'}
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
          <dd className="sc-mono">
            {!address
              ? '–'
              : balance === undefined
                ? '…'
                : balance === null
                  ? 'Unavailable'
                  : usd(balance)}
          </dd>
        </div>
      </dl>
      {address && showFunds && <AddFunds address={address} />}
    </section>
  )
}

/** Whether posts on X count as calls yet: a caller record, or the way to one. */
function Caller({ me, caller }: { me: Me; caller: MyCaller | null | undefined }) {
  if (caller?.key && caller.caller)
    return (
      <section className="sc-box">
        <div className="sc-row">
          <span className="sc-label">Caller</span>
          <span className="sc-good sc-small">Verified human</span>
        </div>
        <div className="sc-row">
          <strong className="sc-clip">@{caller.caller.handle}</strong>
          <span className="sc-mono">SF {Math.round(caller.caller.superFactor)}</span>
        </div>
        <p className="sc-muted sc-small">Post a call on X and it shows up under your post.</p>
      </section>
    )
  // Signed in with X, the username comes from the X handle on the way: World ID is next.
  const next =
    !me.profile && !me.account.x
      ? 'Pick a username'
      : !me.profile?.worldVerified
        ? 'Verify with World ID'
        : 'Sign your caller record'
  return (
    <section className="sc-box">
      <div className="sc-row">
        <span className="sc-label">Become a caller</span>
      </div>
      <p className="sc-muted sc-small">
        Copying is open to everyone. To make calls from X, verify once with World ID. Next:{' '}
        {next.toLowerCase()}.
      </p>
      <button type="button" className="sc-button" onClick={() => openSite('/verify')}>
        {next}
      </button>
    </section>
  )
}

type MyCopy = {
  call: string
  payFeeTx: string
  sizeUsd: number
  status: string | null
  closed: { gotUsd: number } | null
  fill: { coin: number; price: number } | null
}
const WORKING = ['ORDER_STATUS_PENDING', 'ORDER_STATUS_ACCEPTED', 'ORDER_STATUS_PARTIALLY_FILLED']
/** A copy's order in words, with the panel's tone class. */
function copyState(c: MyCopy) {
  if (c.closed) return { label: c.closed.gotUsd > 0 ? 'Sold' : 'Selling', tone: 'sc-muted' }
  if (c.fill) return { label: `Filled at ${c.fill.price.toLocaleString()}`, tone: 'sc-good' }
  if (c.status === null || WORKING.includes(c.status))
    return { label: 'Waiting to fill', tone: 'sc-warn' }
  if (c.status === 'ORDER_STATUS_CANCELLED') return { label: 'Cancelled', tone: 'sc-muted' }
  return { label: 'Not filled', tone: 'sc-bad' }
}

/**
 * Your copies of one call, read every 5 seconds while the panel shows it: a copy signed in the
 * Supercall window shows up here, and its order moves from waiting to filled, without a reload.
 */
function useMyCopies(token: string | null, wallet: string | undefined, callId: string) {
  const [copies, setCopies] = useState<MyCopy[]>([])
  useEffect(() => {
    if (!token || !wallet) return setCopies([])
    let live = true
    const read = () =>
      api<{ copies: MyCopy[] }>(`/wallets/${wallet}/copies`, { token })
        .then((r) => live && setCopies(r.copies.filter((c) => c.call === callId)))
        .catch(() => {})
    void read()
    const timer = setInterval(read, 5000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [token, wallet, callId])
  return copies
}

function Copy({
  id,
  call,
  token,
  wallet,
}: {
  id: string
  call: Call | null | undefined
  token: string | null
  wallet: string | undefined
}) {
  const [size, setSize] = useState('100')
  const mine = useMyCopies(token, wallet, id)
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
      <button
        type="button"
        className="sc-button"
        onClick={() =>
          browser.runtime.sendMessage({
            type: 'open',
            // The size typed here carries over, so the copy window opens at it.
            path: `/m/${encodeURIComponent(id)}${dollars > 0 ? `?size=${encodeURIComponent(String(dollars))}` : ''}`,
          } satisfies Message)
        }
      >
        Copy on Supercall
      </button>
      <p className="sc-muted sc-small">
        Opens a Supercall window to sign the fee and the order with your wallet.
      </p>
      {mine.length > 0 && (
        <div className="sc-copies">
          <span className="sc-label">Your copies</span>
          {mine.map((c) => {
            const st = copyState(c)
            return (
              <div key={c.payFeeTx} className="sc-row">
                <span className="sc-mono">{usd(c.sizeUsd)}</span>
                <span className={st.tone}>{st.label}</span>
              </div>
            )
          })}
          <button type="button" className="sc-link" onClick={() => openSite('/me')}>
            Open Portfolio
          </button>
        </div>
      )}
    </section>
  )
}

function Panel() {
  const session = useSession()
  const [tick, setTick] = useState(0)
  const { me, caller, error } = useAccount(session.token, tick)
  const pending = usePending()
  const call = useCall(pending)
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
            title="Reload"
            aria-label="Reload"
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
        {!session.ready || (session.token && me === undefined && !error) ? (
          <p className="sc-muted">Loading…</p>
        ) : session.token && me ? (
          <>
            <Account me={me} tick={tick} />
            <Caller me={me} caller={caller} />
          </>
        ) : (
          <>
            <div className="sc-hero">
              <h1>
                Super easy to copy.
                <br />
                <span>Super hard to fake.</span>
              </h1>
              <p className="sc-muted">
                {session.expired
                  ? 'Your Supercall session ended. Open Supercall to pick it up again.'
                  : 'Uses your Supercall sign-in. Sign in once, on the site or here.'}
              </p>
            </div>
            <button type="button" className="sc-button" onClick={() => openSite('/connect')}>
              {session.expired ? 'Open Supercall' : 'Sign in'}
            </button>
            <p className="sc-methods">X · Email · Wallet</p>
          </>
        )}
        {error && <p className="sc-bad sc-small">Couldn’t read your account: {error}</p>}
        {pending ? (
          <Copy
            id={pending.id}
            call={call}
            token={session.token}
            wallet={me?.profile?.wallet ?? me?.account.wallets[0]}
          />
        ) : (
          <p className="sc-hint">Tap Copy under a call on X to copy it here.</p>
        )}
      </div>
      <p className="sc-build" title="The build running now">
        Build {__BUILD__}
      </p>
      <div className={me ? 'sc-dither sc-quiet' : 'sc-dither'} aria-hidden="true" />
    </main>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<Panel />)
