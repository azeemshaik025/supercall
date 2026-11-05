import { describe, expect, it } from 'vitest'
import { callScore, updateSuperFactor } from './superfactor.ts'

describe('call score', () => {
  it('right call: +R capped at 3', () => {
    expect(callScore(3000, 2850, 3400, null, 'right')).toBeCloseTo(2.667, 2)
  })

  it('wrong call: -1', () => {
    expect(callScore(3000, 2850, 3400, null, 'wrong')).toBe(-1)
  })

  it('unfired: -0.1', () => {
    expect(callScore(3000, 2850, 3400, null, 'unfired')).toBe(-0.1)
  })

  it('void: -1', () => {
    expect(callScore(3000, 2850, 3400, null, 'void')).toBe(-1)
  })

  it('closed at 3200: +1.33', () => {
    expect(callScore(3000, 2850, 3400, 3200, 'closed')).toBeCloseTo(1.33, 1)
  })

  it('2R target, right: score 2', () => {
    expect(callScore(3000, 2850, 3300, null, 'right')).toBe(2)
  })

  it('target beyond 3R: wrong scores -3/R', () => {
    const R = 600 / 150
    expect(callScore(3000, 2850, 3600, null, 'wrong')).toBeCloseTo(-3 / R, 2)
  })
})

describe('SuperFactor from scratch', () => {
  it('new caller: SF starts at 50', () => {
    const { superFactor } = updateSuperFactor(0, 0, 0)
    expect(superFactor).toBeCloseTo(50, 0)
  })

  it('one right 2R call: SF ~59', () => {
    const score = callScore(3000, 2850, 3300, null, 'right')
    const { superFactor } = updateSuperFactor(0, 0, score)
    expect(superFactor).toBeCloseTo(59, 0)
  })

  it('five right 2R calls: SF ~82', () => {
    let S = 0
    let W = 0
    for (let i = 0; i < 5; i++) {
      const score = callScore(3000, 2850, 3300, null, 'right')
      const r = updateSuperFactor(S, W, score)
      S = r.S
      W = r.W
    }
    const sf = 50 + 50 * Math.max(-1, Math.min(1, S / (W + 10)))
    expect(sf).toBeCloseTo(82, 0)
  })

  it('five wrong calls: SF ~34', () => {
    let S = 0
    let W = 0
    for (let i = 0; i < 5; i++) {
      const r = updateSuperFactor(S, W, -1)
      S = r.S
      W = r.W
    }
    const sf = 50 + 50 * Math.max(-1, Math.min(1, S / (W + 10)))
    expect(sf).toBeCloseTo(34, 0)
  })
})

describe('long-run SuperFactor table', () => {
  function longRunSF(avgScore: number) {
    let S = 0
    let W = 0
    for (let i = 0; i < 500; i++) {
      const r = updateSuperFactor(S, W, avgScore)
      S = r.S
      W = r.W
    }
    return 50 + 50 * Math.max(-1, Math.min(1, S / (W + 10)))
  }

  it('no skill (avg 0): SF 50', () => {
    expect(longRunSF(0)).toBeCloseTo(50, 0)
  })

  it('1R wins 60% (avg +0.2): SF 58', () => {
    expect(longRunSF(0.2)).toBeCloseTo(58, 0)
  })

  it('2R wins 50% (avg +0.5): SF 71', () => {
    expect(longRunSF(0.5)).toBeCloseTo(71, 0)
  })

  it('2R wins 60% (avg +0.8): SF 83', () => {
    expect(longRunSF(0.8)).toBeCloseTo(83, 0)
  })

  it('always stopped out (avg -1): SF 8', () => {
    expect(longRunSF(-1)).toBeCloseTo(8, 0)
  })
})
