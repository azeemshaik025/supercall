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

const UNITS: Record<string, number> = {
  min: 60,
  h: HOUR,
  d: DAY,
  w: 7 * DAY,
  month: 30 * DAY,
}
/** A length's unit, however it's written: "m", "mins", "hr", "hrs", "days", "wks", "mo". */
const UNIT = '(m|mins?|minutes?|h|hrs?|hours?|d|days?|w|wks?|weeks?|mos?|months?)'
const LENGTH = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*-?\\s*${UNIT}$`)
/** A unit alone, as in "next hour" or "an hour": one of it. */
const ONE = new RegExp(`^${UNIT}$`)
const unitOf = (u: string) =>
  u.startsWith('mo') ? 'month' : u === 'm' || u.startsWith('min') ? 'min' : (u[0] ?? '')

// Numbers people write in words: "three hours", "an hour", "half a day".
const WORD_NUMBERS: Record<string, string> = {
  a: '1',
  an: '1',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  fifteen: '15',
  twenty: '20',
  thirty: '30',
  'twenty four': '24',
  'twenty-four': '24',
  'forty eight': '48',
  'forty-eight': '48',
}
// Words around a length that don't change it: "the next 3 hours or so", "a 2h window", "1h max".
const LEAD =
  /^(by|in|within|until|till|for|over|during|before|around|about|roughly|~|the|next|coming|following|upcoming|a|an)\s+/
const TRAIL = /\s+(or so|or less|max|tops|at most|window|timeframe|time frame|from now|ahead|out)$/

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
 * A stretch of time in seconds, written any of the usual ways: "3h", "3 hours", "next 3 hours",
 * "over the next hour", "three hours", "half an hour", "90 mins", "a 2h window", "24hrs or so".
 * Undefined for anything that isn't a length ("next Friday" is a day, not a length).
 */
function lengthOf(text: string): number | undefined {
  let w = text
  for (let i = 0; i < 4 && LEAD.test(w); i++) w = w.replace(LEAD, '')
  for (let i = 0; i < 2 && TRAIL.test(w); i++) w = w.replace(TRAIL, '')
  for (const [word, digits] of Object.entries(WORD_NUMBERS).sort(
    (a, b) => b[0].length - a[0].length,
  ))
    if (w.startsWith(`${word} `)) w = `${digits} ${w.slice(word.length + 1)}`
  const half = /^half (?:an? )?(.+)$/.exec(w)
  if (half?.[1]) {
    const unit = ONE.exec(half[1])?.[1]
    return unit ? (UNITS[unitOf(unit)] ?? 0) / 2 : undefined
  }
  const length = LENGTH.exec(w)
  if (length?.[2]) return Number(length[1]) * (UNITS[unitOf(length[2])] ?? 0) || undefined
  const one = ONE.exec(w)?.[1]
  return one ? UNITS[unitOf(one)] : undefined
}

/**
 * When a call made at `posted` (unix seconds) ends, from its deadline words, or undefined when the
 * words aren't in the table. A named day ends at midnight UTC; a date is in the post's year.
 */
export function deadlineOf(words: string, posted: number): number | undefined {
  const w = words
    .toLowerCase()
    .replace(/[.!,;:)]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(by|in|within|until|till)\s+/, '')
  const fixed = FIXED[w]
  if (fixed) return posted + fixed

  const length = lengthOf(w)
  if (length !== undefined) return posted + length

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
