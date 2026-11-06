import {
  CALL_FEE_RATE,
  PLATFORM_FEE_RATE,
  fees as coreFees,
  netProfit,
  rewardRisk,
} from '@supercall/core'
import type { Call } from './types'

export { CALL_FEE_RATE as CALL_FEE, PLATFORM_FEE_RATE as PLATFORM_FEE, callerCut } from '@supercall/core'

export function estimate(call: Call, sizeUsd: number) {
  const { callFee: fee } = coreFees(sizeUsd)
  const atTarget = netProfit(sizeUsd, call.entry, call.target)
  const atStop = netProfit(sizeUsd, call.entry, call.stop)
  return { fee, maxLoss: -atStop, atTarget, atStop, credit: Math.max(0, -atStop * 0.3) }
}

export function progress(call: Call, value: number): number {
  const p = (value - call.stop) / (call.target - call.stop)
  return Math.max(0, Math.min(1, p))
}

export function moveVsEntry(call: Call): number {
  const m = (call.price - call.entry) / call.entry
  return call.direction === 'long' ? m : -m
}

export function inBand(call: Call): boolean {
  return Math.abs(call.price - call.entry) / call.entry <= call.bandPct
}

export function rewardToRisk(call: Call): number {
  return rewardRisk({ entry: call.entry, target: call.target, stop: call.stop })
}
