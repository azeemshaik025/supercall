'use client'

// Publishing a call: the API prepares it from the levels, the caller's wallet signs it, and the
// API checks the signature and writes it to Arkiv (and registers it in Hisaab when it can).
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useCallback } from 'react'
import { api } from './api'

/** What the API takes for a call (apps/api, `levelsBody`). */
export type CallInput = {
  assetAddress: string
  direction: 'long' | 'short'
  entry: number
  stop: number
  target: number
  /** The entry zone, as a fraction: 0.005 is ±0.5%. */
  bandPct: number
  hours: number
  thesis: string
  /** Points of the caller's cut given up to be featured: 0.05 is 5 points. */
  boost: number
}

export type PublishStep = 'prepare' | 'sign' | 'write'

export const PUBLISH_STEP: Record<PublishStep, string> = {
  prepare: 'Preparing your call…',
  sign: 'Sign the call in your wallet…',
  write: 'Recording it on Arkiv…',
}

/** Publishes with the profile's wallet; resolves to the new call's id. */
export function usePublish() {
  const { getAccessToken } = usePrivy()
  const { wallets } = useWallets()
  return useCallback(
    async (input: CallInput, wallet: string, onStep: (s: PublishStep) => void) => {
      onStep('prepare')
      const prepared = await api<{
        fields: { createdAt: number }
        typedData: Record<string, unknown>
      }>('/calls/prepare', { method: 'POST', token: await getAccessToken(), body: input })
      const signer = wallets.find((w) => w.address.toLowerCase() === wallet.toLowerCase())
      if (!signer) throw new Error('Connect the wallet your profile publishes from')
      onStep('sign')
      const provider = await signer.getEthereumProvider()
      const signature = (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [wallet, JSON.stringify(prepared.typedData)],
      })) as string
      onStep('write')
      const { id } = await api<{ id: string }>('/calls', {
        method: 'POST',
        token: await getAccessToken(),
        body: { input, createdAt: prepared.fields.createdAt, signature },
      })
      return id
    },
    [getAccessToken, wallets],
  )
}
