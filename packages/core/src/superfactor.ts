export function callScore(
  entry: number,
  stop: number | null,
  target: number,
  endingPrice: number | null,
  ending: 'right' | 'wrong' | 'expired' | 'closed' | 'unfired' | 'void',
) {
  const stopDist = stop !== null ? Math.abs(entry - stop) : Math.abs(target - entry)
  const targetDist = Math.abs(target - entry)
  const R = targetDist / stopDist

  if (ending === 'unfired') return -0.1
  if (ending === 'void') return -1

  if (ending === 'right') return Math.min(R, 3)
  if (ending === 'wrong') {
    if (R > 3) return -3 / R
    return -1
  }

  if (endingPrice === null) return 0
  const a = Math.min(1, 3 / R)
  const b = Math.min(R, 3)
  const isLong = target > entry
  const stopVal = stop ?? (isLong ? entry - targetDist : entry + targetDist)
  const move = isLong
    ? -a + ((a + b) * (endingPrice - stopVal)) / (target - stopVal)
    : -a + ((a + b) * (stopVal - endingPrice)) / (stopVal - target)
  return Math.max(-a, Math.min(b, move))
}

export function updateSuperFactor(S: number, W: number, score: number) {
  const newS = 0.98 * S + score
  const newW = 0.98 * W + 1
  const sf = 50 + 50 * clamp(newS / (newW + 10), -1, 1)
  return { S: newS, W: newW, superFactor: sf }
}

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x))
}
