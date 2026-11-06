import {
  fetchCall,
  fetchCallerCalls,
  fetchCallers,
  fetchCaller,
  fetchCalls,
  fetchCandles,
  fetchMarkets,
  type ApiCall,
  type ApiCaller,
  type ApiMarket,
} from './api'
import type { CallStatus } from './types'

export const OPEN: CallStatus[] = ['pending', 'armed', 'live']
export const ENDED: CallStatus[] = ['won', 'lost', 'expired-profit', 'expired-loss', 'unfired', 'void']
export const isOpen = (s: CallStatus) => OPEN.includes(s)

export const statusLabel: Record<
  CallStatus,
  { label: string; tone: 'good' | 'bad' | 'warn' | 'faint' }
> = {
  pending: { label: 'Pending', tone: 'warn' },
  armed: { label: 'Open', tone: 'good' },
  live: { label: 'Live', tone: 'good' },
  won: { label: 'Target hit', tone: 'good' },
  lost: { label: 'Stop hit', tone: 'bad' },
  'expired-profit': { label: 'Ended above entry', tone: 'good' },
  'expired-loss': { label: 'Ended below entry', tone: 'bad' },
  unfired: { label: 'Never entered', tone: 'faint' },
  void: { label: 'Cancelled', tone: 'faint' },
}

export async function getCalls() {
  return fetchCalls()
}

export async function getCall(id: string) {
  return fetchCall(id)
}

export async function getCallers() {
  return fetchCallers()
}

export async function getCaller(handle: string) {
  return fetchCaller(handle)
}

export async function getCallerCalls(handle: string) {
  return fetchCallerCalls(handle)
}

export async function getMarkets() {
  return fetchMarkets()
}

export async function getCandles(address: string, tf = '1h') {
  return fetchCandles(address, tf)
}

export function callerByHandle(callers: ApiCaller[], h: string) {
  return callers.find((c) => c.handle === h)
}

export function callById(calls: ApiCall[], id: string) {
  return calls.find((c) => c.id === id)
}

export function callsBy(calls: ApiCall[], handle: string) {
  return calls.filter((c) => c.caller === handle)
}

export function marketBySymbol(markets: ApiMarket[], s: string) {
  return markets.find((m) => m.symbol.toLowerCase() === s.toLowerCase())
}

export function openCallsOn(calls: ApiCall[], asset: string) {
  return calls.filter((c) => c.asset === asset && isOpen(c.status))
}
