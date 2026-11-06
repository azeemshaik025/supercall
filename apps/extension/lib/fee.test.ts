import { describe, expect, it } from 'vitest'
import { feeOf, fromMicro, toMicro } from './fee'

describe('the copy fee', () => {
  it('is 0.7% of a $1,000 copy: $6 call and $1 platform', () => {
    expect(feeOf(toMicro(1000))).toEqual({
      call: 6_000_000n,
      platform: 1_000_000n,
      total: 7_000_000n,
    })
  })

  it('rounds each part down on its own, as Hisaab does', () => {
    // 0.6% of 333 micro is 1.998, 0.1% is 0.333: 1 and 0.
    expect(feeOf(333n)).toEqual({ call: 1n, platform: 0n, total: 1n })
  })

  it('reads back as dollars', () => {
    expect(fromMicro(feeOf(toMicro(250)).total)).toBe(1.75)
  })
})
