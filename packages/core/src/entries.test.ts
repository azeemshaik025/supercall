import { describe, expect, it } from 'vitest'
import { canMirror, isCopyable, isInEntryBand, suggestedStop } from './entries.ts'

describe('entries', () => {
  it('1% target is copyable', () => {
    expect(isCopyable(3000, 3030)).toBe(true)
  })

  it('0.5% target is not copyable', () => {
    expect(isCopyable(3000, 3015)).toBe(false)
  })

  it('price within ±0.5% band is in band', () => {
    expect(isInEntryBand(3010, 3000)).toBe(true)
  })

  it('price outside ±0.5% band is out', () => {
    expect(isInEntryBand(3020, 3000)).toBe(false)
  })

  it('suggested stop: as far past entry as target, at most 10%', () => {
    expect(suggestedStop({ direction: 'long', entry: 3000, target: 3400 })).toBe(2700)
  })

  it('suggested stop capped at 10% for large targets', () => {
    expect(suggestedStop({ direction: 'long', entry: 3000, target: 4000 })).toBe(2700)
  })

  it('closes copying once the deadline has passed, whatever the status says', () => {
    const call = {
      type: 'open' as const,
      status: 'live' as const,
      direction: 'long' as const,
      entry: 100,
      target: 105,
      bandPct: 0.005,
      price: 100,
    }
    const now = Date.parse('2026-11-07T00:00:00Z')
    expect(canMirror({ ...call, expiresAt: '2026-11-07T03:00:00Z' }, now)).toBe(true)
    expect(canMirror({ ...call, expiresAt: '2026-11-06T23:00:00Z' }, now)).toBe(false)
  })
})
