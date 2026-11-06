export { callerCut, fundLimit, updateFund } from './caller.ts'
export { creditAsk, distributeCredit, timingWeight } from './credit.ts'
export {
  canMirror,
  ENTRY_BAND,
  inBand,
  isCopyable,
  isInEntryBand,
  MAX_SUGGESTED_STOP,
  MIN_TARGET_DISTANCE,
  rewardPct,
  rewardRisk,
  riskPct,
  suggestedStop,
  targetOdds,
} from './entries.ts'
export {
  CALL_FEE_RATE,
  DEFINITIVE_FEE_RATE,
  depositMinimum,
  fees,
  keptFee,
  loss,
  netProfit,
  PLATFORM_FEE_RATE,
} from './fees.ts'
export { resolve } from './resolution.ts'
export {
  maxBoost,
  mirrorFee,
  needIfStopped,
  nextNeed,
  pnlAt,
  settleWorked,
  settleWrong,
  shareFor,
} from './settlement.ts'
export {
  callScore,
  callVolume,
  callWeight,
  nextScore,
  SF,
  superFactor,
  VOLUME,
  walletTrust,
  walletVolume,
} from './superfactor.ts'
export type {
  Band,
  Call,
  Caller,
  CallStatus,
  CallType,
  Copy,
  Direction,
  Ending,
  Fund,
  Levels,
  NeedHistory,
  Outcome,
  Resolution,
  Score,
  Swap,
  WorkedCopy,
  WrongCopy,
} from './types.ts'

export const FEE = {
  platform: 0.001,
  call: 0.006,
  definitive: 0.001,
} as const
