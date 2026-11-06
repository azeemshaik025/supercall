export const PLATFORM_FEE_RATE = 0.001
export const CALL_FEE_RATE = 0.006
export const DEFINITIVE_FEE_RATE = 0.001

export function fees(size: number) {
  const platformFee = size * PLATFORM_FEE_RATE
  const callFee = size * CALL_FEE_RATE
  return { platformFee, callFee }
}

export function netProfit(size: number, entry: number, exitPrice: number) {
  const platformFee = size * PLATFORM_FEE_RATE
  const buyAmount = size - platformFee
  const defBuyFee = buyAmount * DEFINITIVE_FEE_RATE
  const effectiveBuy = buyAmount - defBuyFee
  const exitValue = effectiveBuy * (exitPrice / entry)
  const defSellFee = exitValue * DEFINITIVE_FEE_RATE
  const proceeds = exitValue - defSellFee
  return proceeds - size
}

export function keptFee(callFee: number, profit: number, callWorked: boolean) {
  if (!callWorked || profit <= 0) return 0
  return Math.min(callFee, profit / 2)
}

export function loss(size: number, entry: number, exitPrice: number) {
  return -netProfit(size, entry, exitPrice)
}

const MAX_DEPOSIT_COST = 0.1

export function depositMinimum(inUsd: number, outUsd: number): number | undefined {
  const cost = inUsd - outUsd
  if (cost <= inUsd * MAX_DEPOSIT_COST) return undefined
  return Math.ceil((cost / (MAX_DEPOSIT_COST - 0.01)) * 100) / 100
}
