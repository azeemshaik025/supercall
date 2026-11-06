import { describe, expect, it } from 'vitest'
import {
  callScore,
  callVolume,
  callWeight,
  nextScore,
  superFactor,
  walletTrust,
  walletVolume,
} from './superfactor.ts'
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

  it('one right 2R call: SF ~53', () => {
    const s = callScore(long2R, 'won')
    const score = nextScore({ S: 0, W: 0 }, s)
    expect(superFactor(score)).toBeCloseTo(53.2, 1)
  })

  it('five right 2R calls: SF ~63', () => {
    let score = { S: 0, W: 0 }
    for (let i = 0; i < 5; i++) {
      score = nextScore(score, callScore(long2R, 'won'))
    }
    expect(superFactor(score)).toBeCloseTo(63.5, 1)
  })

  it('five wrong calls: SF ~43', () => {
    let score = { S: 0, W: 0 }
    for (let i = 0; i < 5; i++) {
      score = nextScore(score, -1)
    }
    expect(superFactor(score)).toBeCloseTo(43.1, 1)
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

  it('1R wins 60% (avg +0.2): SF 56', () => {
    expect(longRunSF(0.2)).toBeCloseTo(56.2, 1)
  })

  it('2R wins 50% (avg +0.5): SF 65', () => {
    expect(longRunSF(0.5)).toBeCloseTo(65.1, 1)
  })

  it('2R wins 60% (avg +0.8): SF 73', () => {
    expect(longRunSF(0.8)).toBeCloseTo(73.1, 1)
  })

  it('always stopped out (avg -1): SF 22', () => {
    expect(longRunSF(-1)).toBeCloseTo(22.3, 1)
  })
})

describe('copied volume', () => {
  it('a wallet counts 25% at first and fully after 10 other callers', () => {
    expect(walletTrust(0)).toBe(0.25)
    expect(walletTrust(4)).toBeCloseTo(0.55, 5)
    expect(walletTrust(10)).toBe(1)
    expect(walletTrust(25)).toBe(1)
    expect(walletTrust(-3)).toBe(0.25)
  })

  it('small copies count almost in full, big ones level off near $10k with no cliff', () => {
    expect(walletVolume(0)).toBe(0)
    expect(walletVolume(1_000)).toBeCloseTo(951.6, 1)
    expect(walletVolume(10_000)).toBeCloseTo(6_321.2, 1)
    expect(walletVolume(150_000)).toBeCloseTo(10_000, 0)
    expect(walletVolume(9_900)).toBeLessThan(walletVolume(10_100))
  })

  it('an honest crowd keeps its weight: one $150k whale and fifty $1k followers', () => {
    const crowd = [
      { filledUsd: 150_000, trust: 1 },
      ...Array.from({ length: 50 }, () => ({ filledUsd: 1_000, trust: 1 })),
    ]
    expect(callVolume(crowd)).toBeCloseTo(57_581, 0)
  })

  it('sock puppets count a quarter: $100k split over 100 fresh wallets', () => {
    const puppets = Array.from({ length: 100 }, () => ({ filledUsd: 1_000, trust: walletTrust(0) }))
    expect(callVolume(puppets)).toBeCloseTo(23_791, 0)
  })

  it('a call weighs at least 1, √(volume / $10k) above that, and double when lost', () => {
    expect(callWeight(0, 2)).toBe(1)
    expect(callWeight(40_000, 2)).toBe(2)
    expect(callWeight(40_000, -1)).toBe(4)
    expect(callWeight(200_000, -1)).toBeCloseTo(2 * Math.sqrt(20), 5)
  })
})

describe('ten good calls on rising volume, then a $200k loss', () => {
  function run(weighted: boolean) {
    let score = { S: 0, W: 0 }
    const after: number[] = []
    const calls = [
      ...Array.from({ length: 10 }, (_, i) => ({ s: 2, volume: (i + 1) * 10_000 })),
      { s: -1, volume: 200_000 },
    ]
    for (const c of calls) {
      score = nextScore(score, c.s, weighted ? callWeight(c.volume, c.s) : 1)
      after.push(superFactor(score))
    }
    return after
  }

  it('with volume, the loss drops SuperFactor by about 9 points', () => {
    const sf = run(true)
    expect(sf[9]).toBeCloseTo(83.8, 1)
    expect(sf[10]).toBeCloseTo(74.6, 1)
  })

  it('counting calls alone, the same loss barely moves it', () => {
    const sf = run(false)
    expect((sf[9] ?? 0) - (sf[10] ?? 0)).toBeLessThan(2)
  })

  it('never reaches 0 or 100', () => {
    let up = { S: 0, W: 0 }
    let down = { S: 0, W: 0 }
    for (let i = 0; i < 200; i++) {
      up = nextScore(up, 3, callWeight(1_000_000, 3))
      down = nextScore(down, -1, callWeight(1_000_000, -1))
    }
    expect(superFactor(up)).toBeLessThan(100)
    expect(superFactor(down)).toBeGreaterThan(0)
  })
})
