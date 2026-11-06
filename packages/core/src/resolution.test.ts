import { describe, expect, it } from 'vitest'
import { resolve } from './resolution.ts'
import type { Swap } from './types.ts'

const call = { entry: 3000, stop: 2850, target: 3400, direction: 'long' } as const
const raj = {
  ...call,
  type: 'open' as const,
  priceAtPost: 3000,
  createdAt: '2026-11-01T00:00:00.000Z',
  expiresAt: '2026-11-04T00:00:00.000Z',
}
const hour = (h: number) => new Date(Date.parse(raj.createdAt) + h * 3_600_000).toISOString()
const path = (...prices: number[]): Swap[] =>
  prices.map((price, i) => ({ at: hour(i + 1), price, ref: `swap${i + 1}` }))
const after = hour(100)

describe('Resolution', () => {
  it('ends right at the first swap at or past the target', () => {
    expect(resolve(raj, path(3010, 3200, 3400, 2850), after)).toEqual({
      ending: 'won',
      at: hour(3),
      price: 3400,
      ref: 'swap3',
    })
  })

  it('ends wrong at the first swap at or past the stop', () => {
    expect(resolve(raj, path(2950, 2850, 3400), after)).toMatchObject({
      ending: 'lost',
      price: 2850,
      ref: 'swap2',
    })
  })

  it.each([
    [3200, 'expired-profit'],
    [2900, 'expired-loss'],
  ])('ends at the deadline at its last price, %d: %s', (price, ending) => {
    expect(resolve(raj, path(3100, price), after)).toEqual({
      ending,
      at: raj.expiresAt,
      price,
      ref: 'swap2',
    })
  })

  it('is still open before the deadline while neither level is touched', () => {
    expect(resolve(raj, path(3100, 2900), hour(2))).toBeUndefined()
  })

  it("ends at the caller's close, and swaps after it don't count", () => {
    const close = { at: hour(2.5), price: 2925, ref: 'https://x.com/raj/status/1' }
    expect(resolve(raj, path(2950, 2940, 2850), after, close)).toEqual({
      ending: 'expired-loss',
      ...close,
    })
  })

  describe('waiting for a price', () => {
    const waiting = { ...raj, type: 'future-level' as const, priceAtPost: 3100 }

    it('counts a level only after the entry is reached', () => {
      expect(resolve(waiting, path(3100, 3400, 2990, 3400), after)).toMatchObject({
        ending: 'won',
        ref: 'swap4',
      })
    })

    it('never entered when the entry is never reached', () => {
      expect(resolve(waiting, path(3100, 3200), after)).toEqual({ ending: 'unfired' })
    })

    it('enters at once when one trade jumps past the entry', () => {
      const jump = { ...waiting, priceAtPost: 3050 }
      expect(resolve(jump, path(2990, 2850), after)).toMatchObject({
        ending: 'lost',
        price: 2850,
        ref: 'swap2',
      })
    })

    const breakout = { ...waiting, entry: 3100, priceAtPost: 3010 }

    it('enters a breakout only once price comes up to the entry', () => {
      expect(resolve(breakout, path(3010, 2850, 3100, 3400), after)).toMatchObject({
        ending: 'won',
        ref: 'swap4',
      })
    })

    it('never entered when a breakout never breaks', () => {
      expect(resolve(breakout, path(3010, 3050), after)).toEqual({ ending: 'unfired' })
    })

    it('reads a breakdown the other way up', () => {
      const breakdown = {
        ...waiting,
        direction: 'short' as const,
        entry: 2900,
        stop: 3150,
        target: 2700,
        priceAtPost: 2990,
      }
      expect(resolve(breakdown, path(2990, 3150, 2900, 2700), after)).toMatchObject({
        ending: 'won',
        ref: 'swap4',
      })
    })
  })

  it("never ends wrong without the caller's own stop", () => {
    const noStop = { ...raj, stop: undefined }
    expect(resolve(noStop, path(2500), after)).toMatchObject({
      ending: 'expired-loss',
      price: 2500,
    })
  })

  it('reads a short call the other way up', () => {
    const short = { ...raj, direction: 'short' as const, stop: 3150, target: 2700 }
    expect(resolve(short, path(2950, 3100, 2700), after)).toMatchObject({
      ending: 'won',
      ref: 'swap3',
    })
  })
})
