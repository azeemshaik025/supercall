export function callerCut(superFactor: number) {
  return Math.max(0.1, 0.7 * (superFactor / 100) ** 1.5)
}

export function fundLimit(total: number, count: number) {
  if (count === 0) return 0
  return 2 * (total / count)
}

export function updateFund(
  fund: number,
  limit: number,
  keptCash: number,
  keptCredit: number,
  cut: number,
  halfCut: boolean,
) {
  const callerTake = keptCash * (halfCut ? cut / 2 : cut)
  const toEarned = keptCash - callerTake
  const newEarned = fund + toEarned
  const overflow = Math.max(0, newEarned - limit)
  return {
    callerGets: callerTake + overflow,
    fundAfter: newEarned - overflow,
    creditFundAfter: keptCredit,
  }
}
