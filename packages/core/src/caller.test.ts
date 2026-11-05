import { describe, expect, it } from 'vitest'
import { callerCut, updateFund } from './caller.ts'

describe('caller cut from SuperFactor', () => {
  const cases: [number, number][] = [
    [30, 0.115],
    [50, 0.247],
    [70, 0.41],
    [80, 0.501],
    [90, 0.598],
    [100, 0.7],
  ]

  for (const [sf, expected] of cases) {
    it(`SF ${sf} → ${(expected * 100).toFixed(1)}%`, () => {
      expect(callerCut(sf)).toBeCloseTo(expected, 2)
    })
  }

  it('floor at 10%', () => {
    expect(callerCut(0)).toBe(0.1)
    expect(callerCut(10)).toBe(0.1)
  })
})

describe('fund: two right calls, $10k copied each, SF 80, fund $150, limit $197.08', () => {
  const cut = callerCut(80)
  const keptPerCall = 60

  it('call 1: caller gets $30.05, fund → $179.95', () => {
    const r = updateFund(150, 197.08, keptPerCall, 0, cut, false)
    expect(r.callerGets).toBeCloseTo(30.05, 1)
    expect(r.fundAfter).toBeCloseTo(179.95, 1)
  })

  it('call 2: fund overflows, caller gets $42.86, fund stays at limit', () => {
    const r = updateFund(179.95, 197.08, keptPerCall, 0, cut, false)
    expect(r.callerGets).toBeCloseTo(42.86, 1)
    expect(r.fundAfter).toBeCloseTo(197.08, 0)
  })
})
