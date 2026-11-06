import { describe, expect, it } from 'vitest'
import { fundLimit } from './caller.ts'
import { keptFee } from './fees.ts'
import {
  mirrorFee,
  needIfStopped,
  nextNeed,
  pnlAt,
  settleWorked,
  settleWrong,
  shareFor,
} from './settlement.ts'
import type { Levels, WrongCopy } from './types.ts'

const call: Levels = { entry: 3000, stop: 2850, target: 3400, direction: 'long' }
const priya = { size: 1000, entryFill: 3000, fee: 6, paidWithCredit: false, weight: 1 }
const ali = { ...priya, size: 2000, fee: 12, paidWithCredit: true }
const ten = Array.from({ length: 10 }, () => priya)
const atTarget = pnlAt(1000, 3000, 3400)
const tenRight = ten.map(() => ({ fee: 6, paidWithCredit: false, profit: atTarget }))
const fund100 = { earned: 100, creditOnly: 0 }
const limit = fundLimit(
  nextNeed({ total: 0, count: 0 }, needIfStopped(call, ten)).total,
  nextNeed({ total: 0, count: 0 }, needIfStopped(call, ten)).count,
)

describe('Fees', () => {
  it('charges 0.7% to copy: 0.1% platform, 0.6% into the call pool', () => {
    expect(mirrorFee(1000)).toEqual({
      platform: expect.closeTo(1, 6),
      pot: expect.closeTo(6, 6),
      total: expect.closeTo(7, 6),
    })
  })
})

describe('right call', () => {
  it('keeps the call fee when it is under half the profit', () => {
    expect(atTarget).toBeCloseTo(129.94, 2)
    expect(keptFee(6, atTarget, true)).toBe(6)
  })

  it('keeps nothing from a follower who made no profit', () => {
    expect(keptFee(6, -5, true)).toBe(0)
  })

  it('sets the fund limit at twice the credit a wrong call would need', () => {
    expect(needIfStopped(call, ten)).toBeCloseTo(98.54, 2)
    expect(limit).toBeCloseTo(197.08, 2)
    expect(needIfStopped({ entry: 3000, target: 3400, direction: 'long' }, ten)).toBe(0)
  })

  it('fills the fund to its limit, then pays the overflow to the caller', () => {
    const caller = { superFactor: 80, boost: 0, limit }
    const one = settleWorked(tenRight, { ...caller, fund: { earned: 150, creditOnly: 0 } }, 'won')
    expect([one.cut, one.toFund, one.overflow, one.toCaller, one.fund.earned]).toEqual(
      [30.05, 29.95, 0, 30.05, 179.95].map((n) => expect.closeTo(n, 2)),
    )
    const two = settleWorked(tenRight, { ...caller, fund: one.fund }, 'won')
    expect([two.cut, two.toFund, two.overflow, two.toCaller, two.fund.earned]).toEqual(
      [30.05, 17.14, 12.81, 42.86, 197.08].map((n) => expect.closeTo(n, 2)),
    )
  })

  it('halves the cut and pays no boost when the call only ended above entry', () => {
    const s = settleWorked(
      tenRight,
      { superFactor: 80, boost: 0.1, limit, fund: { earned: 150, creditOnly: 0 } },
      'above-entry',
    )
    expect(s.cut).toBeCloseTo(15.03, 2)
    expect(s.boost).toBe(0)
    expect(s.toFund).toBeCloseTo(44.97, 2)
  })

  it('keeps half the profit on a 1% target', () => {
    const p = pnlAt(1000, 3000, 3030)
    expect(p).toBeCloseTo(6.97, 2)
  })
})

describe('wrong call', () => {
  const sam: WrongCopy = { ...priya, exit: { soldLoss: 20 } }
  const zoe: WrongCopy = { ...priya, exit: 'moved-out' }

  it('returns every fee and pays credit on the loss at the stop', () => {
    const s = settleWrong(call, 2850, [priya, ali, sam, zoe], fund100)
    expect(s.copies.map((c) => c.loss)).toEqual([
      expect.closeTo(52.85, 2),
      expect.closeTo(105.69, 2),
      20,
      undefined,
    ])
    expect(s.copies.map((c) => c.feeBack)).toEqual([6, 12, 6, 6])
    expect(s.copies.map((c) => c.platformBack)).toEqual(
      [1, 2, 1, 1].map((n) => expect.closeTo(n, 6)),
    )
    expect(s.copies.map((c) => c.credit)).toEqual(
      [9.85, 19.71, 0, 0].map((n) => expect.closeTo(n, 2)),
    )
    expect(s.asked).toBeCloseTo(29.56, 2)
    expect(s.fund.earned).toBeCloseTo(70.44, 2)
  })

  it('scales everyone down to half the fund', () => {
    const s = settleWrong(call, 2850, [priya, ali, sam, zoe], { earned: 40, creditOnly: 0 })
    expect(s.copies.map((c) => c.credit)).toEqual(
      [6.67, 13.33, 0, 0].map((n) => expect.closeTo(n, 2)),
    )
    expect(s.fund.earned).toBeCloseTo(20, 6)
  })

  it('draws the credit-only part first', () => {
    const s = settleWrong(call, 2850, [priya, ali], { earned: 100, creditOnly: 10 })
    expect(s.fund.creditOnly).toBe(0)
    expect(s.fund.earned).toBeCloseTo(80.44, 2)
  })

  it('counts a loss past the stop only up to the stop', () => {
    const s = settleWrong(call, 2850, [{ ...priya, exit: { soldLoss: 60 } }], fund100)
    expect(s.copies[0]?.loss).toBeCloseTo(52.85, 2)
  })

  it('pays no credit on a call without a stop', () => {
    const s = settleWrong({ entry: 3000, target: 3400, direction: 'long' }, 2900, [priya], fund100)
    expect(s.copies[0]?.credit).toBe(0)
    expect(s.copies[0]?.feeBack).toBe(6)
    expect(s.copies[0]?.platformBack).toBeCloseTo(1, 6)
  })

  it.each([
    [2925, 27.92, 2.38],
    [2980, 9.64, 0],
    [2900, 36.23, 4.87],
  ])('measures an ending at %d without a sale at that price', (price, loss, credit) => {
    const s = settleWrong(call, price, [priya], fund100)
    expect(s.copies[0]?.loss).toBeCloseTo(loss, 2)
    expect(s.copies[0]?.credit).toBeCloseTo(credit, 2)
  })
})

describe("the caller's cut", () => {
  it.each([
    [30, '11.5'],
    [50, '24.7'],
    [70, '41.0'],
    [80, '50.1'],
    [90, '59.8'],
    [100, '70.0'],
  ])('SuperFactor %d keeps %s%%', (sf, pct) => {
    expect((shareFor(sf) * 100).toFixed(1)).toBe(pct)
  })

  it('never falls below 10%', () => {
    expect(shareFor(20)).toBe(0.1)
  })
})
