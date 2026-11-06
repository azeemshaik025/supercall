// The copy fee, as Hisaab takes it (`_fees`): 0.6% for the call and 0.1% for the platform, each
// rounded down on its own, in micro-USDC. The follower sees and signs one 0.7% fee.
export const FEE_BPS = { call: 60n, platform: 10n } as const

/** One copy's fee for a size in micro-USDC, and its two parts. */
export function feeOf(size: bigint) {
  const call = (size * FEE_BPS.call) / 10_000n
  const platform = (size * FEE_BPS.platform) / 10_000n
  return { call, platform, total: call + platform }
}

/** Dollars as micro-USDC, rounded down to the micro. */
export const toMicro = (usd: number) => BigInt(Math.floor(usd * 1_000_000))

/** Micro-USDC as dollars for display, two decimals at most. */
export const fromMicro = (micro: bigint) => Number(micro) / 1_000_000
