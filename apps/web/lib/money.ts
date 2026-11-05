import type { Call } from './types'

/**
 * Placeholder money rules for dummy data. They move to @supercall/core when its money math
 * lands; screens call these functions so the swap is one import.
 */
export const CALL_FEE = 0.006
export const PLATFORM_FEE = 0.001
/** Share of a follower's loss the caller's fund pays back as credit. */
export const CREDIT_SHARE = 0.25

export function estimate(call: Call, sizeUsd: number) {
  const buyAt = call.price
  const toTarget = Math.abs(call.target - buyAt) / buyAt
  const toStop = Math.abs(buyAt - call.stop) / buyAt
  const fee = sizeUsd * CALL_FEE
  const lossAtStop = sizeUsd * toStop
  const credit = lossAtStop * CREDIT_SHARE
  return {
    fee,
    maxLoss: lossAtStop,
    atTarget: sizeUsd * toTarget - fee - sizeUsd * PLATFORM_FEE,
    atStop: -(lossAtStop - credit),
    credit,
  }
}

/** Progress from stop (0) to target (1), for the status bar. */
export function progress(call: Call, value: number): number {
  const p = (value - call.stop) / (call.target - call.stop)
  return Math.max(0, Math.min(1, p))
}

export function moveVsEntry(call: Call): number {
  const m = (call.price - call.entry) / call.entry
  return call.long ? m : -m
}

export function inBand(call: Call): boolean {
  return Math.abs(call.price - call.entry) / call.entry <= call.band
}

export function rewardToRisk(call: Call): number {
  return Math.abs(call.target - call.entry) / Math.abs(call.entry - call.stop)
}

/** Caller's cut of kept fees: 70% × (SF ÷ 100)^1.5, at least 10%. */
export function callerCut(superFactor: number): number {
  return Math.max(0.1, 0.7 * (superFactor / 100) ** 1.5)
}
