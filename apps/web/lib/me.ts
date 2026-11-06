'use client'

// The signed-in account, from the API: profile, linked X and email, wallets, World ID, and the
// wallet's USDC on the app's chain. Nothing here is demo data.
import { usePrivy } from '@privy-io/react-auth'
import { CHAIN, viemChain } from '@supercall/chains'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createPublicClient, erc20Abi, http } from 'viem'
import { api } from './api'

export type Me = {
  profile: {
    username: string
    displayName: string | null
    wallet: string
    worldVerified: boolean
  } | null
  account: {
    wallets: string[]
    email: string | null
    x: { username: string; name: string | null; avatarUrl: string | null } | null
  }
  worldVerified: boolean
}

// One account state for the whole page: the top bar, sidebar, settings and caller steps all read
// it, and any of them asking to read it again updates every one of them.
type State = { me: Me | null | undefined; error?: string; version: number }
let state: State = { me: undefined, version: 0 }
const listeners = new Set<() => void>()
const set = (next: Partial<State>) => {
  state = { ...state, ...next, version: state.version + 1 }
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
// Every Supercall tab and window hears when the account changes in any of them: a profile save,
// World ID, the caller record. Without it, a step done in one window would show as undone in
// another until a reload.
const channel =
  typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('supercall-account')

/** Says the account changed, here and in every other Supercall tab and window. */
export function announceAccountChange() {
  channel?.postMessage('changed')
  set({})
}

// Several reads can be in flight (sign-in, then an X link finishing): only the newest may land,
// or a slow answer from before the link would overwrite the fresh one.
let seq = 0
async function read(token: Promise<string | null>) {
  const mine = ++seq
  try {
    const me = await api<Me>('/me', { token: await token })
    if (mine === seq) set({ me, error: undefined })
  } catch (e) {
    if (mine === seq) set({ error: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * The account behind the Privy session; null when signed out, undefined while loading. Read
 * again whenever Privy's account changes (X or email linked, a wallet made, sign-in or out), on
 * coming back to the tab, and on `reload()`, so nothing needs a page reload.
 */
export function useMe() {
  const { ready, authenticated, user, getAccessToken } = usePrivy()
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
  const reload = useCallback(async () => {
    if (!ready) return
    if (!authenticated) return set({ me: null, error: undefined })
    await read(getAccessToken())
  }, [ready, authenticated, getAccessToken])

  // What Privy knows about the account: when it changes, the API's answer changes too.
  const linked = [
    authenticated,
    user?.id,
    user?.twitter?.subject,
    user?.email?.address,
    user?.wallet?.address,
    user?.linkedAccounts.length,
  ].join('|')
  // biome-ignore lint/correctness/useExhaustiveDependencies: `linked` is the signal to read again
  useEffect(() => {
    void reload()
  }, [linked, reload])

  useEffect(() => {
    const back = () => {
      if (document.visibilityState === 'visible') void reload()
    }
    // Another window changed the account: read it again, and let this page's steps follow.
    const heard = () => {
      set({})
      void reload()
    }
    document.addEventListener('visibilitychange', back)
    channel?.addEventListener('message', heard)
    return () => {
      document.removeEventListener('visibilitychange', back)
      channel?.removeEventListener('message', heard)
    }
  }, [reload])

  return { me: snapshot.me, error: snapshot.error, version: snapshot.version, reload }
}

/** The address the account publishes and copies from: the profile's, else its first wallet. */
export const walletOf = (me: Me | null | undefined) => me?.profile?.wallet ?? me?.account.wallets[0]

const client = createPublicClient({ chain: viemChain(), transport: http() })

/** A wallet's USDC on the app's chain, read again every 15 seconds; null if it can't be read. */
export function useUsdc(wallet: string | undefined) {
  const [balance, setBalance] = useState<number | null>()
  useEffect(() => {
    if (!wallet) return setBalance(undefined)
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
          (b) => live && setBalance(Number(b) / 10 ** CHAIN.usdc.decimals),
          () => live && setBalance(null),
        )
    void read()
    const timer = setInterval(read, 15_000)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [wallet])
  return balance
}
