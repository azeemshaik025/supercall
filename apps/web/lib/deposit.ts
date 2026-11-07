'use client'

import type {
  depositQuoteResponse,
  depositStatus,
  depositTokensResponse,
} from '@supercall/api-schema'
import { useWallets } from '@privy-io/react-auth'
import { useCallback, useEffect, useState } from 'react'
import type { z } from 'zod'
import { api, API } from './api'

export type DepositToken = z.infer<typeof depositTokensResponse>['tokens'][number]
type QuoteResponse = z.infer<typeof depositQuoteResponse> & {
  evm: {
    approveTx: { to: string; data: string; value?: string } | null
    permitTypedData: string | null
    orderTypedData: string | null
  } | null
}
export type DepositQuote = QuoteResponse & {
  from: { amount: string; notional: string }
  to: { amount: string; notional: string }
}
export type DepositOrderStatus = z.infer<typeof depositStatus>

export type DepositStep = 'tokens' | 'quoting' | 'approve' | 'sign' | 'submit' | 'polling'
export const DEPOSIT_STEP: Record<DepositStep, string> = {
  tokens: 'Loading tokens…',
  quoting: 'Getting a price from Flash…',
  approve: 'Approve token spending (one-time)…',
  sign: 'Confirm the deposit…',
  submit: 'Placing the bridge order…',
  polling: 'Bridging to Arc…',
}

const SOURCE_CHAIN_IDS: Record<string, number> = {
  base: 8453,
  arbitrum: 42161,
  ethereum: 1,
}

export function useDepositTokens(wallet: string | undefined) {
  const [tokens, setTokens] = useState<DepositToken[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!wallet) return setTokens([])
    let live = true
    setLoading(true)
    api<z.infer<typeof depositTokensResponse>>(`/wallets/${wallet}/deposit-tokens`)
      .then((r) => {
        if (live)
          setTokens(r.tokens.filter((t) => Number(t.notional) > 0.01).sort((a, b) => Number(b.notional) - Number(a.notional)))
      })
      .catch(() => {})
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [wallet])

  return { tokens, loading }
}

export function useDeposit() {
  const { wallets } = useWallets()

  return useCallback(
    async (
      wallet: string,
      chain: string,
      token: string,
      amount: string,
      onStep: (s: DepositStep) => void,
    ): Promise<string> => {
      const w = wallets.find((x) => x.address.toLowerCase() === wallet.toLowerCase())
      if (!w) throw new Error('Connect the wallet you deposit from')

      const chainId = SOURCE_CHAIN_IDS[chain]
      if (chainId) await w.switchChain(chainId)
      const provider = await w.getEthereumProvider()

      onStep('quoting')
      const quote = await api<DepositQuote>('/deposits/quote', {
        method: 'POST',
        body: { wallet, chain, token, amount },
      })

      const evm = quote.evm
      if (!evm?.orderTypedData) throw new Error('Flash sent nothing to sign')

      if (evm.approveTx) {
        onStep('approve')
        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{ from: wallet, to: evm.approveTx.to, data: evm.approveTx.data, value: evm.approveTx.value ?? '0x0' }],
        })
        // Wait for approval to land before signing the order
        await waitForTx(provider, hash as string)
      }

      onStep('sign')
      const userSignature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [wallet, evm.orderTypedData],
      }) as string

      const permit = evm.permitTypedData
        ? await provider.request({ method: 'eth_signTypedData_v4', params: [wallet, evm.permitTypedData] }) as string
        : undefined

      onStep('submit')
      const { orderId } = await api<{ orderId: string }>('/deposits', {
        method: 'POST',
        body: {
          wallet,
          chain,
          token,
          amount,
          quoteId: quote.quoteId,
          bridgeQuoteId: quote.bridgeQuoteId,
          userSignature,
          evmOrderTypedData: evm.orderTypedData,
          ...(permit ? { evmPermitTypedData: evm.permitTypedData, evmPermitSignature: permit } : {}),
        },
      })

      return orderId
    },
    [wallets],
  )
}

export function useDepositStatus(orderId: string | null, wallet: string | undefined) {
  const [status, setStatus] = useState<DepositOrderStatus | null>(null)

  useEffect(() => {
    if (!orderId || !wallet) return setStatus(null)
    let live = true
    const poll = async () => {
      try {
        const s = await api<DepositOrderStatus>(`/deposits/${orderId}?wallet=${wallet}`)
        if (live) setStatus(s)
        if (s.status !== 'pending') return true
      } catch { /* keep polling */ }
      return false
    }
    void poll()
    const timer = setInterval(async () => {
      if (await poll()) clearInterval(timer)
    }, 3000)
    return () => { live = false; clearInterval(timer) }
  }, [orderId, wallet])

  return status
}

async function waitForTx(provider: { request: (args: { method: string; params: unknown[] }) => Promise<unknown> }, hash: string) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] }).catch(() => null)
    if (receipt) return
  }
}
