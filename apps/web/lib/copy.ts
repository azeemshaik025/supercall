'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
// Copying a call from the follower's own wallet. The API quotes the buy on Flash with the call's
// stop and target attached, plus the refundable call fee for Hisaab. The wallet approves what
// Flash asks for (first time only), signs the buy, the stop and target, and the fee, and the API
// pays the fee into Hisaab and places the order. Closing and cancelling are signed the same way.
import { CHAIN, viemChain } from '@supercall/chains'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createPublicClient, encodeFunctionData, erc20Abi, type Hex, http, maxUint256 } from 'viem'
import { API, ApiError, api } from './api'

type Tx = { to: string; data: string; value?: string }
type EvmSigning = {
  approveTx: Tx | null
  permitTypedData: string | null
  orderTypedData: string | null
}
type Quote = {
  quoteId: string
  evm: EvmSigning | null
  to: { amount: string; notional: string }
  attachedBracket?: {
    evm: EvmSigning | null
    salt: string | null
    deadline: string
    signedMaxFromAmount: string
  } | null
}
type CopyQuote = Quote & {
  fee: {
    typedData: string
    nonce: string
    deadline: number
    callFeeUsd: number
    platformFeeUsd: number
  }
}

export type CopyStep = 'quote' | 'approve' | 'sign' | 'fee' | 'submit'
export const COPY_STEP: Record<CopyStep, string> = {
  quote: 'Getting a price from Flash…',
  approve: 'Allow Flash to trade your USDC (one-time)…',
  sign: 'Confirm your buy order with stop-loss and take-profit…',
  fee: 'Authorize the call fee (refunded if the call is wrong)…',
  submit: 'Placing your order on Flash…',
}
export const BACK_STEP: Record<CopyStep | 'confirm', string> = {
  ...COPY_STEP,
  approve: 'Allow Flash to trade your USDC (one-time)…',
  sign: 'Confirm your backing order with stop-loss and take-profit…',
  confirm: 'Waiting for Flash to confirm…',
}

const client = createPublicClient({ chain: viemChain(), transport: http() })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function permit2ApproveTx(funder: string): Promise<Tx | null> {
  const allowance = await client.readContract({
    address: CHAIN.usdc.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [funder as Hex, CHAIN.permit2],
  })
  if (allowance > 0n) return null
  return {
    to: CHAIN.usdc.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [CHAIN.permit2, maxUint256],
    }),
  }
}

/** Everything after a copy, a close or a cancel listens here: this tab, the popup, other tabs. */
const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('supercall-copies')
const listeners = new Set<() => void>()
let version = 0
const bump = () => {
  version++
  for (const l of listeners) l()
}
channel?.addEventListener('message', bump)
export function announceCopies() {
  bump()
  channel?.postMessage('changed')
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

const WORKING = ['ORDER_STATUS_PENDING', 'ORDER_STATUS_ACCEPTED', 'ORDER_STATUS_PARTIALLY_FILLED']
const ENDED = ['ORDER_STATUS_CANCELLED', 'ORDER_STATUS_REJECTED', 'ORDER_STATUS_TERMINATED']

/** A copy's order status, in words. */
export function orderState(status: string | null | undefined, filled: boolean) {
  if (filled) return { label: 'Filled', tone: 'good' as const }
  switch (status) {
    case 'ORDER_STATUS_PENDING':
    case 'ORDER_STATUS_ACCEPTED':
      return { label: 'Waiting to fill', tone: 'warn' as const }
    case 'ORDER_STATUS_PARTIALLY_FILLED':
      return { label: 'Filling', tone: 'warn' as const }
    case 'ORDER_STATUS_CANCELLED':
      return { label: 'Cancelled', tone: 'muted' as const }
    case 'ORDER_STATUS_REJECTED':
    case 'ORDER_STATUS_TERMINATED':
      return { label: 'Not filled', tone: 'bad' as const }
    default:
      return { label: 'Placing', tone: 'muted' as const }
  }
}

/** The wallet behind `address`, on Arc, with a few helpers for prompts. */
function useSigner() {
  const { wallets } = useWallets()
  return useCallback(
    async (address: string) => {
      const w = wallets.find((x) => x.address.toLowerCase() === address.toLowerCase())
      if (!w) throw new Error('Connect the wallet you copy from')
      await w.switchChain(CHAIN.id).catch(() => {})
      const provider = await w.getEthereumProvider()
      return {
        typed: (json: string) =>
          provider.request({
            method: 'eth_signTypedData_v4',
            params: [address, json],
          }) as Promise<string>,
        message: (text: string) =>
          provider.request({ method: 'personal_sign', params: [text, address] }) as Promise<Hex>,
        /** Sends a transaction and waits until Arc has it: approvals must land before the order. */
        send: async (tx: Tx) => {
          const hash = (await provider.request({
            method: 'eth_sendTransaction',
            params: [{ from: address, to: tx.to, data: tx.data, value: tx.value ?? '0x0' }],
          })) as Hex
          await client.waitForTransactionReceipt({ hash })
          return hash
        },
      }
    },
    [wallets],
  )
}

type Signer = Awaited<ReturnType<ReturnType<typeof useSigner>>>

/** Approvals first, then every signature a quote asks for. */
async function signQuote(s: Signer, q: Quote, onStep: (st: CopyStep) => void, extraApprovals: Tx[] = []) {
  const order = q.evm
  if (!order?.orderTypedData) throw new Error('Flash sent nothing to sign')
  const exits = q.attachedBracket?.evm ?? null
  const approvals = [order.approveTx, exits?.approveTx, ...extraApprovals].filter((t): t is Tx => !!t)
  if (approvals.length) onStep('approve')
  for (const tx of approvals) await s.send(tx)
  onStep('sign')
  const permit = order.permitTypedData ? await s.typed(order.permitTypedData) : undefined
  const signed = {
    quoteId: q.quoteId,
    userSignature: await s.typed(order.orderTypedData),
    evmOrderTypedData: order.orderTypedData,
    ...(permit ? { evmPermitTypedData: order.permitTypedData, evmPermitSignature: permit } : {}),
  }
  const bracket = q.attachedBracket
  if (!bracket) return { ...signed, attachedBracket: undefined }
  if (!exits?.orderTypedData) throw new Error('Flash sent no stop and target to sign')
  const exitSig = await s.typed(exits.orderTypedData)
  const exitPermit = exits.permitTypedData ? await s.typed(exits.permitTypedData) : undefined
  return {
    ...signed,
    attachedBracket: {
      userSignature: exitSig,
      deadline: bracket.deadline,
      signedMaxFromAmount: bracket.signedMaxFromAmount,
      ...(bracket.salt ? { salt: bracket.salt } : {}),
      ...(exitPermit
        ? { evmPermitTypedData: exits.permitTypedData, evmPermitSignature: exitPermit }
        : {}),
    },
  }
}

/** A POST that keeps the error body, for the fee transaction a retry needs. */
async function post<T>(path: string, body: unknown, token?: string | null) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as T & { code?: string; detail?: string }
  return { ok: res.ok, status: res.status, json }
}

export type Copied = { orderId: string; payFeeTx: string }

/** Copies `callId` for `sizeUsd` USDC from `wallet`; resolves once Flash has the order. */
export function useCopy() {
  const signer = useSigner()
  return useCallback(
    async (callId: string, sizeUsd: number, wallet: string, onStep: (s: CopyStep) => void) => {
      const s = await signer(wallet)
      onStep('quote')
      const quote = await api<CopyQuote>(`/calls/${callId}/copy/quote`, {
        method: 'POST',
        body: { funder: wallet, sizeUsd },
      })
      const p2Tx = await permit2ApproveTx(wallet)
      const signed = await signQuote(s, quote, onStep, p2Tx ? [p2Tx] : [])
      onStep('fee')
      const feeSig = await s.typed(quote.fee.typedData)
      onStep('submit')
      const body = { funder: wallet, sizeUsd, ...signed }
      let fee: Record<string, unknown> = {
        nonce: quote.fee.nonce,
        deadline: quote.fee.deadline,
        signature: feeSig,
      }
      // A fee that hasn't landed yet: wait, then place the order on that fee.
      for (let i = 0; i < 6; i++) {
        const r = await post<
          Copied & { payFeeTx?: string; cancel?: { orderId: string; message: string } }
        >(`/calls/${callId}/copy`, { ...body, fee })
        if (r.ok) {
          // A supercall's resting buy: her signed cancel is kept in case the caller's backing goes.
          if (r.json.cancel) {
            const signature = await s.message(r.json.cancel.message).catch(() => undefined)
            if (signature)
              await post(`/calls/${callId}/copies/${r.json.cancel.orderId}/cancel-permission`, {
                signature,
              }).catch(() => {})
          }
          announceCopies()
          return { orderId: r.json.orderId, payFeeTx: r.json.payFeeTx }
        }
        if (r.json.code === 'fee_pending' && r.json.payFeeTx) {
          fee = { payFeeTx: r.json.payFeeTx }
          await sleep(2500)
          continue
        }
        throw new ApiError(
          r.json.code ?? `http_${r.status}`,
          r.json.detail ?? 'Copy failed',
          r.status,
        )
      }
      throw new Error('Your fee is still landing on Arc. Check Portfolio in a minute.')
    },
    [signer],
  )
}

export type WalletCopy = {
  call: string
  payFeeTx: string
  orderId: string | null
  sizeUsd: number
  callFeeUsd: number
  platformFeeUsd: number
  at: string
  status: string | null
  cancel: { message: string } | null
  closed: { orderId: string; status: string | null; gotUsd: number; at: string | null } | null
  fill: { coin: number; spentUsd: number; price: number; at: string | null } | null
}

/**
 * A wallet's copies with how each order stands. Read again when anything announces a change,
 * and every 5 seconds while an order is still working.
 */
export function useCopies(wallet: string | undefined) {
  const { getAccessToken, authenticated } = usePrivy()
  const v = useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  )
  const [copies, setCopies] = useState<WalletCopy[] | null>(null)
  const [error, setError] = useState<string>()

  const working = copies?.some(
    (c) =>
      (!c.fill && (c.status === null || WORKING.includes(c.status))) ||
      (c.closed !== null && c.closed.gotUsd === 0 && !ENDED.includes(c.closed.status ?? '')),
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: `v` re-reads after an announced change
  useEffect(() => {
    if (!wallet || !authenticated) return setCopies(null)
    let live = true
    const read = async () => {
      try {
        const r = await api<{ copies: WalletCopy[] }>(`/wallets/${wallet}/copies`, {
          token: await getAccessToken(),
        })
        if (live) {
          setCopies(r.copies.sort((a, b) => b.at.localeCompare(a.at)))
          setError(undefined)
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e))
      }
    }
    void read()
    const timer = working ? setInterval(read, 5000) : undefined
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [wallet, authenticated, getAccessToken, v, working])

  return { copies, error }
}

/** Cancel a buy that hasn't filled, and Close now (sell at market) one that has. */
export function useCopyActions() {
  const signer = useSigner()
  const { getAccessToken } = usePrivy()
  const cancel = useCallback(
    async (wallet: string, copy: WalletCopy) => {
      if (!copy.cancel) throw new Error('This buy can’t be cancelled')
      const s = await signer(wallet)
      const signature = await s.message(copy.cancel.message)
      await api(`/wallets/${wallet}/copies/${copy.payFeeTx}/cancel`, {
        method: 'POST',
        token: await getAccessToken(),
        body: { signature },
      })
      announceCopies()
    },
    [signer, getAccessToken],
  )
  const close = useCallback(
    async (wallet: string, copy: WalletCopy, onStep: (s: CopyStep) => void) => {
      const s = await signer(wallet)
      onStep('quote')
      const base = `/wallets/${wallet}/copies/${copy.payFeeTx}/close`
      const quote = await api<Quote & { cancel: { orderId: string; message: string } | null }>(
        `${base}/quote`,
        { method: 'POST', token: await getAccessToken() },
      )
      const { attachedBracket: _none, ...signed } = await signQuote(s, quote, onStep)
      // Her stop and target are cancelled once the sell is placed.
      const cancelSignature = quote.cancel ? await s.message(quote.cancel.message) : undefined
      onStep('submit')
      await api(base, {
        method: 'POST',
        token: await getAccessToken(),
        body: { ...signed, ...(cancelSignature ? { cancelSignature } : {}) },
      })
      announceCopies()
    },
    [signer, getAccessToken],
  )
  return { cancel, close }
}

export type BackStep = CopyStep | 'confirm'

/**
 * The caller backs his own call: the same bracket at his own size, from the wallet the call was
 * published with, and no Hisaab fee. Once Flash has his order on record the call is a supercall.
 */
export function useBack() {
  const signer = useSigner()
  return useCallback(
    async (callId: string, sizeUsd: number, wallet: string, onStep: (s: BackStep) => void) => {
      const s = await signer(wallet)
      onStep('quote')
      const quote = await api<Quote>(`/calls/${callId}/backing/quote`, {
        method: 'POST',
        body: { sizeUsd },
      })
      const signed = await signQuote(s, quote, onStep)
      onStep('submit')
      const r = await post<{ orderId: string; retry?: string }>(`/calls/${callId}/backing`, {
        sizeUsd,
        ...signed,
      })
      if (!r.ok)
        throw new ApiError(
          r.json.code ?? `http_${r.status}`,
          r.json.detail ?? 'Backing failed',
          r.status,
        )
      // Flash may take a few seconds to show the order (an enter-now buy, to fill): ask again.
      if (r.status === 202 && r.json.retry) {
        onStep('confirm')
        for (let i = 0; i < 8; i++) {
          await sleep(2500)
          const again = await post<{ orderId: string }>(r.json.retry, {})
          if (again.status === 201) break
          if (!again.ok && again.status !== 202)
            throw new ApiError(
              again.json.code ?? `http_${again.status}`,
              again.json.detail ?? 'Backing failed',
              again.status,
            )
        }
      }
      announceCopies()
      return r.json.orderId
    },
    [signer],
  )
}
