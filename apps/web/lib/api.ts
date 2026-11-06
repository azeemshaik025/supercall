import type { z } from 'zod'
import type { callResponse, callerResponse, callsResponse, callersResponse } from '@supercall/api-schema'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export type ApiCall = z.infer<typeof callResponse>
export type ApiCaller = z.infer<typeof callerResponse>

export type ApiMarket = {
  symbol: string
  name: string
  address: string
  decimals: number
  chain: string
  price: number
  impact1k: number | null
  change24h: number | null
  liquidityUsd: number | null
  volume24hUsd: number | null
  imageUrl: string | null
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { next: { revalidate: 30 } })
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`)
  return res.json()
}

export async function fetchCalls(opts?: { status?: string; limit?: number }): Promise<ApiCall[]> {
  const params = new URLSearchParams()
  if (opts?.status) params.set('status', opts.status)
  if (opts?.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  const data = await get<z.infer<typeof callsResponse>>(`/calls${qs ? `?${qs}` : ''}`)
  return data.calls
}

export async function fetchCall(id: string): Promise<ApiCall | undefined> {
  return get<ApiCall>(`/calls/${id}`).catch(() => undefined)
}

export async function fetchCallers(): Promise<ApiCaller[]> {
  const data = await get<z.infer<typeof callersResponse>>('/callers')
  return data.callers
}

export async function fetchCaller(handle: string): Promise<ApiCaller | undefined> {
  return get<ApiCaller>(`/callers/${handle}`).catch(() => undefined)
}

export async function fetchCallerCalls(handle: string): Promise<ApiCall[]> {
  const data = await get<z.infer<typeof callsResponse>>(`/callers/${handle}/calls`)
  return data.calls
}

export async function fetchMarkets(): Promise<ApiMarket[]> {
  const data = await get<{ markets: ApiMarket[] }>('/markets').catch(() => ({ markets: [] }))
  return data.markets
}

export type ApiCandle = { t: number; o: number; h: number; l: number; c: number; v: number }

export async function fetchCandles(address: string, tf = '1h'): Promise<ApiCandle[]> {
  const data = await get<{ candles: ApiCandle[] }>(`/markets/${address}/candles?tf=${tf}`).catch(
    () => ({ candles: [] }),
  )
  return data.candles
}
