'use client'

// The signed-in account, from the API: profile, linked X and email, wallets, World ID, and the
// wallet's USDC on the app's chain. Nothing here is demo data.
import { usePrivy } from '@privy-io/react-auth'
import { CHAIN, viemChain } from '@supercall/chains'
import { useCallback, useEffect, useState } from 'react'
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

/** The account behind the Privy session; null when signed out, undefined while loading. */
export function useMe() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [me, setMe] = useState<Me | null>()
  const [error, setError] = useState<string>()
  const reload = useCallback(async () => {
    if (!ready) return
    if (!authenticated) return setMe(null)
    try {
      setMe(await api<Me>('/me', { token: await getAccessToken() }))
      setError(undefined)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [ready, authenticated, getAccessToken])
  useEffect(() => {
    void reload()
  }, [reload])
  return { me, error, reload }
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
