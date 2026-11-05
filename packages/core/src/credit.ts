export function creditAsk(
  realLoss: number,
  lossAtStop: number | null,
  callFee: number,
  timingWeight: number,
  hasStop: boolean,
  movedCoinOut: boolean,
) {
  if (!hasStop || movedCoinOut) return 0
  const cappedLoss = lossAtStop !== null ? Math.min(realLoss, lossAtStop) : realLoss
  return Math.max(0, 0.3 * timingWeight * cappedLoss - callFee)
}

export function distributeCredit(asks: number[], fundTotal: number) {
  const totalAsked = asks.reduce((a, b) => a + b, 0)
  const cap = fundTotal / 2
  if (totalAsked <= cap) {
    return { distributed: asks, fundUsed: totalAsked, scaleFactor: 1 }
  }
  const scale = cap / totalAsked
  const distributed = asks.map((a) => a * scale)
  return { distributed, fundUsed: cap, scaleFactor: scale }
}

export function timingWeight(placedAt: number, postTime: number, deadline: number) {
  if (deadline <= postTime) return 1
  const elapsed = (placedAt - postTime) / (deadline - postTime)
  return 1 - 0.5 * Math.min(1, Math.max(0, elapsed))
}
