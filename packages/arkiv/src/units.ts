// Records store integers in fixed units; core works in dollars and fractions. Why each unit:
// arkiv/schema.md, "Units". These are the only conversions between the two.

const MICRO = 1_000_000
const BPS = 10_000

export const toMicroUsdc = (usd: number) => Math.round(usd * MICRO)
export const fromMicroUsdc = (micro: number) => micro / MICRO

// The epsilon absorbs float noise (0.0058 * 1e4 = 57.99…) so rounding down never loses a point.
export const toBps = (fraction: number) => Math.floor(fraction * BPS + 1e-9)
export const fromBps = (bps: number) => bps / BPS

/** Scores (s, S and W), rounded down; the epsilon absorbs float noise as `toBps` does. */
export const toMillionths = (score: number) => Math.floor(score * MICRO + 1e-6)
export const fromMillionths = (millionths: number) => millionths / MICRO
