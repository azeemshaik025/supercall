import { describe, expect, it } from 'vitest'
import { deadlineOf, readNumber } from './numbers'

// Raj posts on Monday 26 October 2026 at 14:00:00 UTC.
const posted = Date.UTC(2026, 9, 26, 14) / 1000
const hours = (h: number) => posted + h * 3600
const midnight = (day: number) => Date.UTC(2026, 9, day) / 1000

describe('Reading a number from the words it was written in', () => {
  it('reads prices with commas, decimals, a dollar sign and k', () => {
    expect(readNumber('3,000')).toEqual({ value: 3000, unit: 'usd' })
    expect(readNumber('$3,000.50')).toEqual({ value: 3000.5, unit: 'usd' })
    expect(readNumber('3.4k')).toEqual({ value: 3400, unit: 'usd' })
    expect(readNumber('110K')).toEqual({ value: 110_000, unit: 'usd' })
    expect(readNumber('TP 3,400')).toEqual({ value: 3400, unit: 'usd' })
  })

  it('reads percentages with their sign', () => {
    expect(readNumber('+10%')).toEqual({ value: 10, unit: 'percent' })
    expect(readNumber('-5%')).toEqual({ value: -5, unit: 'percent' })
    expect(readNumber('SL −5%')).toEqual({ value: -5, unit: 'percent' })
  })

  it('reads nothing from words with no number, or with two', () => {
    expect(readNumber('soon')).toBeUndefined()
    expect(readNumber('3,400 or 3,600')).toBeUndefined()
    expect(readNumber('TP1 3,200')).toEqual({ value: 3200, unit: 'usd' })
  })
})

describe('A deadline from its words (spec, "What a call needs")', () => {
  it("reads the spec's words as fixed lengths from the post", () => {
    expect(deadlineOf('today', posted)).toBe(hours(24))
    expect(deadlineOf('EOD', posted)).toBe(hours(24))
    expect(deadlineOf('this week', posted)).toBe(hours(7 * 24))
    expect(deadlineOf('this month', posted)).toBe(hours(30 * 24))
  })

  it('reads an explicit length as exactly that', () => {
    expect(deadlineOf('in 24h', posted)).toBe(hours(24))
    expect(deadlineOf('3 days', posted)).toBe(hours(72))
    expect(deadlineOf('within 2 weeks', posted)).toBe(hours(14 * 24))
    expect(deadlineOf('48 hrs', posted)).toBe(hours(48))
    expect(deadlineOf('in 2 months', posted)).toBe(hours(60 * 24))
  })

  it('ends a named day at midnight UTC', () => {
    expect(deadlineOf('tomorrow', posted)).toBe(midnight(28))
    expect(deadlineOf('by Friday', posted)).toBe(midnight(31))
    expect(deadlineOf('Monday', posted)).toBe(midnight(27))
    expect(deadlineOf('by 31 Oct', posted)).toBe(midnight(32))
    expect(deadlineOf('Oct 30th', posted)).toBe(midnight(31))
    expect(deadlineOf('by Oct 20', posted)).toBe(midnight(21))
  })

  it('knows no deadline in other time words', () => {
    expect(deadlineOf('soon', posted)).toBeUndefined()
    expect(deadlineOf('Q4', posted)).toBeUndefined()
    expect(deadlineOf('next Friday', posted)).toBeUndefined()
    expect(deadlineOf('sunny', posted)).toBeUndefined()
  })
})
