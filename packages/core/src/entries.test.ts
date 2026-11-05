import { describe, expect, it } from 'vitest'
import { isCopyable, isInEntryBand, suggestedStop } from './entries.ts'

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
    expect(suggestedStop(3000, 3400)).toBe(2700)
  })

  it('suggested stop capped at 10% for large targets', () => {
    expect(suggestedStop(3000, 4000)).toBe(2700)
  })
})
