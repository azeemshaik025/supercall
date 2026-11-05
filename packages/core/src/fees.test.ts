import { describe, expect, it } from 'vitest'
import { fees, keptFee, loss, netProfit } from './fees.ts'

describe('fees', () => {
  it('computes fees on $1,000', () => {
    const f = fees(1000)
    expect(f.platformFee).toBeCloseTo(1, 2)
    expect(f.callFee).toBeCloseTo(6, 2)
  })

  it('computes fees on $2,000', () => {
    const f = fees(2000)
    expect(f.platformFee).toBeCloseTo(2, 2)
    expect(f.callFee).toBeCloseTo(12, 2)
  })
})

describe('right call: entry 3000, target 3400', () => {
  it('Priya $1,000 net profit $129.94', () => {
    const profit = netProfit(1000, 3000, 3400)
    expect(profit).toBeCloseTo(129.94, 1)
  })

  it('Ali $2,000 net profit $259.87', () => {
    const profit = netProfit(2000, 3000, 3400)
    expect(profit).toBeCloseTo(259.87, 1)
  })

  it('Priya kept fee $6 (capped by call fee)', () => {
    const profit = netProfit(1000, 3000, 3400)
    expect(keptFee(6, profit, true)).toBeCloseTo(6, 2)
  })

  it('Ali kept fee $12', () => {
    const profit = netProfit(2000, 3000, 3400)
    expect(keptFee(12, profit, true)).toBeCloseTo(12, 2)
  })

  it('Priya ends +$123.94', () => {
    const profit = netProfit(1000, 3000, 3400)
    const kept = keptFee(6, profit, true)
    expect(profit - kept).toBeCloseTo(123.94, 1)
  })
})

describe('1% target: entry 3000, target 3030, Priya $1,000', () => {
  it('net profit $6.97', () => {
    const profit = netProfit(1000, 3000, 3030)
    expect(profit).toBeCloseTo(6.97, 1)
  })

  it('kept fee $3.49 (half profit)', () => {
    const profit = netProfit(1000, 3000, 3030)
    expect(keptFee(6, profit, true)).toBeCloseTo(3.49, 1)
  })

  it('she ends +$3.49', () => {
    const profit = netProfit(1000, 3000, 3030)
    const kept = keptFee(6, profit, true)
    expect(profit - kept).toBeCloseTo(3.49, 1)
  })
})

describe('wrong call: entry 3000, stop 2850', () => {
  it('Priya $1,000 loss $52.85', () => {
    expect(loss(1000, 3000, 2850)).toBeCloseTo(52.85, 1)
  })

  it('Ali $2,000 loss $105.69', () => {
    expect(loss(2000, 3000, 2850)).toBeCloseTo(105.69, 1)
  })

  it('wrong call returns zero kept fee', () => {
    expect(keptFee(6, -52.85, false)).toBe(0)
  })
})

describe('other endings below entry, Priya $1,000', () => {
  it('caller closes at 2925: loss $27.92', () => {
    expect(loss(1000, 3000, 2925)).toBeCloseTo(27.92, 1)
  })

  it('ran out of time at 2980: loss $9.64', () => {
    expect(loss(1000, 3000, 2980)).toBeCloseTo(9.64, 1)
  })

  it('ran out of time at 2900: loss $36.23', () => {
    expect(loss(1000, 3000, 2900)).toBeCloseTo(36.23, 1)
  })
})
