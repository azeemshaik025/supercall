import { describe, expect, it } from 'vitest'
import { callScore, nextScore, superFactor } from './superfactor.ts'
import type { Levels } from './types.ts'

const long3k: Levels = { entry: 3000, stop: 2850, target: 3400, direction: 'long' }
const long2R: Levels = { entry: 3000, stop: 2850, target: 3300, direction: 'long' }
const long4R: Levels = { entry: 3000, stop: 2850, target: 3600, direction: 'long' }

describe('call score', () => {
  it('right call: +R capped at 3', () => {
    expect(callScore(long3k, 'won')).toBeCloseTo(2.667, 2)
  })

  it('wrong call: -1', () => {
    expect(callScore(long3k, 'lost')).toBe(-1)
  })

  it('unfired: -0.1', () => {
    expect(callScore(long3k, 'unfired')).toBe(-0.1)
  })

  it('void: -1', () => {
    expect(callScore(long3k, 'void')).toBe(-1)
  })

  it('closed at 3200: +1.33', () => {
    expect(callScore(long3k, { price: 3200 })).toBeCloseTo(1.33, 1)
  })

  it('2R target, right: score 2', () => {
    expect(callScore(long2R, 'won')).toBe(2)
  })

  it('target beyond 3R: wrong scores -3/R', () => {
    const R = 600 / 150
    expect(callScore(long4R, 'lost')).toBeCloseTo(-3 / R, 2)
  })
})

describe('SuperFactor from scratch', () => {
  it('new caller: SF starts at 50', () => {
    expect(superFactor({ S: 0, W: 0 })).toBeCloseTo(50, 0)
  })

  it('one right 2R call: SF ~59', () => {
    const s = callScore(long2R, 'won')
    const score = nextScore({ S: 0, W: 0 }, s)
    expect(superFactor(score)).toBeCloseTo(59, 0)
  })

  it('five right 2R calls: SF ~82', () => {
    let score = { S: 0, W: 0 }
    for (let i = 0; i < 5; i++) {
      score = nextScore(score, callScore(long2R, 'won'))
    }
    expect(superFactor(score)).toBeCloseTo(82, 0)
  })

  it('five wrong calls: SF ~34', () => {
    let score = { S: 0, W: 0 }
    for (let i = 0; i < 5; i++) {
      score = nextScore(score, -1)
    }
    expect(superFactor(score)).toBeCloseTo(34, 0)
  })
})

describe('long-run SuperFactor table', () => {
  function longRunSF(avgScore: number) {
    let score = { S: 0, W: 0 }
    for (let i = 0; i < 500; i++) {
      score = nextScore(score, avgScore)
    }
    return superFactor(score)
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
