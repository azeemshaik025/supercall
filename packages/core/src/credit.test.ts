import { describe, expect, it } from 'vitest'
import { creditAsk, distributeCredit, timingWeight } from './credit.ts'
import { loss } from './fees.ts'

describe('credit on wrong call: entry 3000, stop 2850', () => {
  const priyaLoss = loss(1000, 3000, 2850)
  const aliLoss = loss(2000, 3000, 2850)
  const lossAtStop1000 = loss(1000, 3000, 2850)
  const lossAtStop2000 = loss(2000, 3000, 2850)

  it('Priya $1,000 asks for $9.85', () => {
    expect(creditAsk(priyaLoss, lossAtStop1000, 6, 1, true, false)).toBeCloseTo(9.85, 1)
  })

  it('Ali $2,000 asks for $19.71', () => {
    expect(creditAsk(aliLoss, lossAtStop2000, 12, 1, true, false)).toBeCloseTo(19.71, 1)
  })

  it('Sam closed early at -$20: asks $0', () => {
    expect(creditAsk(20, lossAtStop1000, 6, 1, true, false)).toBeCloseTo(0, 2)
  })

  it('Zoe moved coin out: asks $0', () => {
    expect(creditAsk(50, lossAtStop1000, 6, 1, true, true)).toBe(0)
  })

  it('no stop: asks $0', () => {
    expect(creditAsk(50, null, 6, 1, false, false)).toBe(0)
  })
})

describe('distribute credit', () => {
  it('total under half the fund: everyone gets their ask', () => {
    const asks = [9.85, 19.71]
    const { distributed, fundUsed } = distributeCredit(asks, 100)
    expect(distributed[0]).toBeCloseTo(9.85, 2)
    expect(distributed[1]).toBeCloseTo(19.71, 2)
    expect(fundUsed).toBeCloseTo(29.56, 2)
  })

  it('total over half the fund: scaled down equally', () => {
    const asks = [9.85, 19.71]
    const { distributed, fundUsed } = distributeCredit(asks, 40)
    expect(fundUsed).toBeCloseTo(20, 2)
    expect(distributed[0]).toBeCloseTo(6.67, 1)
    expect(distributed[1]).toBeCloseTo(13.33, 1)
  })
})

describe('other endings credit', () => {
  it('caller closes at 2925: credit $2.38', () => {
    const l = loss(1000, 3000, 2925)
    const lAtStop = loss(1000, 3000, 2850)
    expect(creditAsk(l, lAtStop, 6, 1, true, false)).toBeCloseTo(2.38, 1)
  })

  it('ran out of time at 2980: credit $0', () => {
    const l = loss(1000, 3000, 2980)
    const lAtStop = loss(1000, 3000, 2850)
    expect(creditAsk(l, lAtStop, 6, 1, true, false)).toBeCloseTo(0, 1)
  })

  it('ran out of time at 2900: credit $4.87', () => {
    const l = loss(1000, 3000, 2900)
    const lAtStop = loss(1000, 3000, 2850)
    expect(creditAsk(l, lAtStop, 6, 1, true, false)).toBeCloseTo(4.87, 1)
  })
})

describe('timing weight', () => {
  it('at post time: weight 1', () => {
    expect(timingWeight(0, 0, 86400)).toBeCloseTo(1, 4)
  })

  it('at deadline: weight 0.5', () => {
    expect(timingWeight(86400, 0, 86400)).toBeCloseTo(0.5, 4)
  })

  it('halfway: weight 0.75', () => {
    expect(timingWeight(43200, 0, 86400)).toBeCloseTo(0.75, 4)
  })

  it('Ali 1h left on 24h call: weight ~0.52', () => {
    const tw = timingWeight(23 * 3600, 0, 24 * 3600)
    expect(tw).toBeCloseTo(0.52, 1)
  })

  it('Ali credit with weight 0.52: $4.51', () => {
    const tw = timingWeight(23 * 3600, 0, 24 * 3600)
    const aliLoss = loss(2000, 3000, 2850)
    const lAtStop = loss(2000, 3000, 2850)
    expect(creditAsk(aliLoss, lAtStop, 12, tw, true, false)).toBeCloseTo(4.51, 0)
  })
})
