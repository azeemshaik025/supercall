export const MIN_TARGET_DISTANCE = 0.01
export const ENTRY_BAND = 0.005
export const MAX_SUGGESTED_STOP = 0.1

export function isCopyable(entry: number, target: number) {
  return Math.abs(target - entry) / entry >= MIN_TARGET_DISTANCE
}

export function isInEntryBand(currentPrice: number, entry: number) {
  return Math.abs(currentPrice - entry) / entry <= ENTRY_BAND
}

export function suggestedStop(entry: number, target: number) {
  const dist = Math.abs(target - entry)
  const stopDist = Math.min(dist, entry * MAX_SUGGESTED_STOP)
  return target > entry ? entry - stopDist : entry + stopDist
}
