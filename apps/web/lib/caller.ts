'use client'

// Becoming a caller: a username, a World ID proof bound to the wallet, then one signature that
// writes the caller record to Arkiv. The API checks each step; this only walks the user through.
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api'
import { announceAccountChange, useMe } from './me'

type Me = {
  profile: { username: string; wallet: string; worldVerified: boolean } | null
  account: { wallets: string[] }
  worldVerified: boolean
}
type MyCaller = {
  key: string | null
  caller: { handle: string; superFactor: number } | null
  draft: { fields: { joinedAt: number }; typedData: Record<string, unknown> } | null
}

export type CallerStep =
  | 'loading'
  | 'error'
  | 'signed-out'
  | 'username'
  | 'world'
  | 'record'
  | 'done'

/** An X handle as a username, if it fits the API's rule (3–20 of a–z, 0–9 and _). */
export const usernameFromX = (handle: string | null | undefined) => {
  const name = handle?.toLowerCase()
  return name && /^[a-z0-9_]{3,20}$/.test(name) ? name : undefined
}

/** Where the signed-in user is on the way to publishing, and the actions for each step. */
/** The Privy user last seen as a caller in this tab session: they skip straight to publishing. */
const KNOWN = 'supercall:caller'
const knownCaller = () => {
  try {
    return sessionStorage.getItem(KNOWN)
  } catch {
    return null
  }
}
const rememberCaller = (userId: string | null) => {
  try {
    if (userId) sessionStorage.setItem(KNOWN, userId)
    else sessionStorage.removeItem(KNOWN)
  } catch {}
}

export function useCallerSetup() {
  const { ready, authenticated, user, getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  // The page's shared account: when it's read again (an X link, a save), these steps follow.
  const shared = useMe()
  const [me, setMe] = useState<Me>()
  const [caller, setCaller] = useState<MyCaller>()
  const [step, setStep] = useState<CallerStep>('loading')
  // Seen as a caller earlier in this session: show publishing at once, then check quietly.
  useEffect(() => {
    if (ready && user?.id && knownCaller() === user.id)
      setStep((s) => (s === 'loading' ? 'done' : s))
  }, [ready, user?.id])
  const [error, setError] = useState<string>()

  const load = useCallback(async () => {
    if (!ready) return
    if (!authenticated) return setStep('signed-out')
    setError(undefined)
    try {
      const token = await getAccessToken()
      let m = await api<Me>('/me', { token })
      // Signed in with X: the X handle is the username, unless someone already has it.
      const fromX = usernameFromX(user?.twitter?.username)
      if (!m.profile && fromX) {
        try {
          await api('/me', { method: 'PUT', token, body: { username: fromX } })
          m = await api<Me>('/me', { token })
          void shared.reload()
        } catch (e) {
          if (!(e instanceof ApiError)) throw e
        }
      }
      setMe(m)
      if (!m.profile) return setStep('username')
      if (!m.profile.worldVerified) return setStep('world')
      const c = await api<MyCaller>('/me/caller', { token })
      setCaller(c)
      setStep(c.key ? 'done' : 'record')
      rememberCaller(c.key ? (user?.id ?? null) : null)
    } catch (e) {
      // Shown with a retry, never left on "checking": usually the API is down or the session ended.
      const reason = e instanceof Error ? e.message : String(e)
      setError(
        reason === 'Failed to fetch'
          ? 'Can’t reach the API. Try again in a moment.'
          : `Couldn’t check your account: ${reason}`,
      )
      setStep('error')
    }
  }, [ready, authenticated, user?.id, user?.twitter?.username, getAccessToken, shared.reload])

  // biome-ignore lint/correctness/useExhaustiveDependencies: shared.version is the signal to read again
  useEffect(() => {
    void load()
    // Read again whenever the shared account changes, here or in another window.
  }, [load, shared.version])

  // While a step is still to do, check every 10 seconds: it may be done in another window.
  useEffect(() => {
    if (step === 'done' || step === 'signed-out') return
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 10_000)
    return () => clearInterval(timer)
  }, [step, load])

  /** Saves the username the caller record is published under, on the account's first wallet. */
  const saveUsername = async (username: string) => {
    setError(undefined)
    try {
      await api('/me', {
        method: 'PUT',
        token: await getAccessToken(),
        body: { username: username.toLowerCase() },
      })
      announceAccountChange()
      await shared.reload()
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    }
  }

  /** Signs the caller record with the profile's wallet and has the API write it to Arkiv. */
  const signRecord = async () => {
    setError(undefined)
    const draft = caller?.draft
    const address = me?.profile?.wallet
    const wallet = wallets.find((w) => w.address.toLowerCase() === address)
    if (!draft || !address) return
    if (!wallet) return setError('Connect the wallet your profile publishes from.')
    try {
      const provider = await wallet.getEthereumProvider()
      const signature = (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, JSON.stringify(draft.typedData)],
      })) as string
      await api('/me/caller', {
        method: 'POST',
        token: await getAccessToken(),
        body: { joinedAt: draft.fields.joinedAt, signature },
      })
      announceAccountChange()
      await shared.reload()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** After a step done elsewhere (World ID): every window reads the account again. */
  const reload = async () => {
    announceAccountChange()
    await shared.reload()
    await load()
  }

  return { step, me, caller, error, setError, reload, saveUsername, signRecord }
}
