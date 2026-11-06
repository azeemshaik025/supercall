// The words a post's numbers and deadline were written in, read by code (spec, "The AI's rules"):
// the AI says what it read, and these say whether the words mean that.

export type Read = { value: number; unit: 'usd' | 'percent' }

// A number standing on its own: "TP1" and "10x" hold no price, and "3,0000" isn't one.
const NUMBER =
  /(?<![\p{L}\d.,])([+\-−–]\s?)?\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?([kK])?(\s?%)?(?![\p{L}\d]|,\d)/gu

/** The one number in `words`, or undefined if there's none or more than one. */
export function readNumber(words: string): Read | undefined {
  const found = [...words.matchAll(NUMBER)]
  const [match] = found
  if (found.length !== 1 || !match) return undefined
  const [, sign, whole = '', fraction = '', thousands, percent] = match
  const size = Number(whole.replaceAll(',', '') + fraction) * (thousands ? 1000 : 1)
  return {
    value: sign && sign.trim() !== '+' ? -size : size,
    unit: percent ? 'percent' : 'usd',
  }
}

const HOUR = 3600
const DAY = 24 * HOUR

// The spec's table, "What a call needs": today is 24 hours, this week 7 days, this month 30.
const FIXED: Record<string, number> = {
  today: DAY,
  eod: DAY,
  'end of day': DAY,
  'end of the day': DAY,
  'this week': 7 * DAY,
  eow: 7 * DAY,
  'end of week': 7 * DAY,
  'end of the week': 7 * DAY,
  'this month': 30 * DAY,
  eom: 30 * DAY,
  'end of month': 30 * DAY,
  'end of the month': 30 * DAY,
}

const UNITS: Record<string, number> = { h: HOUR, d: DAY, w: 7 * DAY, month: 30 * DAY }
const LENGTH = /^(\d+(?:\.\d+)?)\s*(h|hrs?|hours?|d|days?|w|wks?|weeks?|months?)$/

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
/** "fri", "thurs" and "friday" name Friday; "sunny" names nothing. */
const named = (names: string[], word = '') =>
  word.length >= 3 ? names.findIndex((n) => n.startsWith(word)) : -1
const DATE = /^(?:(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)|([a-z]+) (\d{1,2})(?:st|nd|rd|th)?)$/

/**
 * When a call made at `posted` (unix seconds) ends, from its deadline words, or undefined when the
 * words aren't in the table. A named day ends at midnight UTC; a date is in the post's year.
 */
export function deadlineOf(words: string, posted: number): number | undefined {
  const w = words
    .toLowerCase()
    .replace(/[.!,]+$/, '')
    .replace(/^(by|in|within|until)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const fixed = FIXED[w]
  if (fixed) return posted + fixed

  const length = LENGTH.exec(w)
  if (length) {
    const unit = length[2]?.startsWith('month') ? 'month' : (length[2]?.[0] ?? '')
    return posted + Number(length[1]) * (UNITS[unit] ?? 0)
  }

  const day = new Date(posted * 1000)
  const startOfDay = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) / 1000
  if (w === 'tomorrow') return startOfDay + 2 * DAY

  // A weekday is the next one on or after the post's day: "Friday" said on a Friday is today.
  const weekday = named(WEEKDAYS, w)
  if (weekday >= 0) {
    return startOfDay + (((weekday - day.getUTCDay() + 7) % 7) + 1) * DAY
  }

  const date = DATE.exec(w)
  if (date) {
    const month = named(MONTHS, date[2] ?? date[3])
    const dayOfMonth = Number(date[1] ?? date[4])
    // ponytail: a date reads in the post's year, so "by Jan 5" said in December has passed.
    if (month >= 0) return Date.UTC(day.getUTCFullYear(), month, dayOfMonth + 1) / 1000
  }
  return undefined
}
