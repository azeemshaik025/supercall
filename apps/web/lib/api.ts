import type {
  callerResponse,
  callersResponse,
  callResponse,
  callsResponse,
} from '@supercall/api-schema'
import type { z } from 'zod'

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// --- Client-side: authenticated requests (Privy token) ---

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function api<T>(
  path: string,
  { token, method = 'GET', body }: { token?: string | null; method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { code?: string; detail?: string }
  if (!res.ok) {
    throw new ApiError(json.code ?? `http_${res.status}`, json.detail ?? res.statusText, res.status)
  }
  return json as T
}

// --- Server-side: typed data fetching (ISR-cached, no auth) ---

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

/** A candle as the API sends it: unix seconds and full field names. */
type WireCandle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** The API's candles in the chart's shape: milliseconds, short names. */
export const toCandles = (wire: WireCandle[] = []): ApiCandle[] =>
  wire.map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }))

export async function fetchCandles(address: string, tf = '1h'): Promise<ApiCandle[]> {
  const data = await get<{ candles: WireCandle[] }>(`/markets/${address}/candles?tf=${tf}`).catch(
    () => ({ candles: [] }),
  )
  return toCandles(data.candles)
}

/** Candles from the browser, fresh each time (no server cache): the composer and market chart. */
export async function loadCandles(address: string, tf: string): Promise<ApiCandle[]> {
  const res = await fetch(`${API}/markets/${address}/candles?tf=${tf}`)
  if (!res.ok) return []
  return toCandles(((await res.json()) as { candles?: WireCandle[] }).candles)
}
