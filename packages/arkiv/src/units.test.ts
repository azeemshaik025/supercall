import { describe, expect, it } from 'vitest'
import { fromBps, fromMicroUsdc, toBps, toMicroUsdc } from './units.ts'

describe('record units', () => {
  it('stores prices and amounts as micro-USDC', () => {
    expect(toMicroUsdc(3000.5)).toBe(3000500000)
    expect(toMicroUsdc(6)).toBe(6000000)
    // 9.85 * 1e6 is 9849999.999999998 in floating point
    expect(toMicroUsdc(9.85)).toBe(9850000)
    expect(fromMicroUsdc(3000500000)).toBe(3000.5)
  })

  it('stores ratios as basis points, rounded down', () => {
    expect(toBps(0.005)).toBe(50)
    // The cut at SuperFactor 50
    expect(toBps(0.2474873734152916)).toBe(2474)
    // 0.0058 * 1e4 is 57.99999999999999 in floating point
    expect(toBps(0.0058)).toBe(58)
    expect(fromBps(2474)).toBe(0.2474)
  })
})
