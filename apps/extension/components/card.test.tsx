import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rajsCall, suggestedStopCall } from '../fixtures/calls'
import type { Call } from '../lib/lookup'
import { Card, type Shown } from './card'

const postId = '1850000000000000001'
const callOf = (call: Call): Shown => ({ kind: 'call', postId, call })

// Only text and links are checked, so the tests survive the card's redesign.
function draw(answer: Shown, mine = false) {
  const container = document.createElement('div')
  document.body.replaceChildren(container)
  const copied: string[] = []
  flushSync(() =>
    createRoot(container).render(
      <Card
        answer={answer}
        web="http://localhost:3000"
        onCopy={(id) => copied.push(id)}
        mine={mine}
      />,
    ),
  )
  const all = () => [...container.querySelectorAll<HTMLElement>('*')]
  const find = (text: string) => all().find((el) => el.textContent === text)
  return {
    container,
    text: container.textContent ?? '',
    has: (t: string) => !!find(t),
    find,
    copied,
  }
}

describe('Card', () => {
  // The fixtures' calls are open on Oct 26, 2026: judge them then, not on today's date.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-26T12:00:00Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  it("shows Raj's call: coin, direction, levels, deadline, status and both bands", () => {
    const { container, text } = draw(callOf(rajsCall))
    for (const shown of ['WETH', 'long', '3,000', '2,850', '3,400', 'Live', 'medium', 'low'])
      expect(text).toContain(shown)
    expect(container.querySelector('time')?.dateTime).toBe('2026-10-29T10:00:00.000Z')
    expect(text).not.toContain('suggested')
  })

  it("labels a suggested stop as not the caller's", () => {
    expect(draw(callOf(suggestedStopCall)).text).toContain("2,880 (suggested, not the caller's)")
  })

  it('shows the supercall badge only on a supercall', () => {
    expect(draw(callOf(rajsCall)).has('Supercall')).toBe(true)
    expect(draw(callOf(suggestedStopCall)).has('Supercall')).toBe(false)
  })

  it('reads a missing stopSuggested and supercall as false', () => {
    const { text, has } = draw(
      callOf({ ...rajsCall, stopSuggested: undefined, supercall: undefined }),
    )
    expect(has('Supercall')).toBe(false)
    expect(text).not.toContain('suggested')
  })

  it('shows when and at what price Raj closed his call', () => {
    const { container, text } = draw({
      kind: 'close',
      postId,
      call: { ...rajsCall, status: 'expired-profit' },
      at: '2026-10-27T15:00:00.000Z',
      price: 3250,
    })
    expect(text).toContain('Closed at 3,250')
    expect(text).toContain('Ended in profit')
    const times = [...container.querySelectorAll('time')].map((t) => t.dateTime)
    expect(times).toContain('2026-10-27T15:00:00.000Z')
  })

  it('says why a post is not a call, with nothing to copy', () => {
    const { text, has } = draw({
      kind: 'not-a-call',
      postId,
      reason: 'no-deadline',
      detail: 'The post names no deadline.',
    })
    expect(text).toBe('Not a call: The post names no deadline.')
    expect(has('Copy')).toBe(false)
  })

  it("Open on Supercall opens the call's page in a new tab", () => {
    const open = draw(callOf(rajsCall)).find('Open on Supercall')
    expect(open?.getAttribute('href')).toBe(`http://localhost:3000/c/${rajsCall.id}`)
    expect(open?.getAttribute('target')).toBe('_blank')
  })

  it('offers no Copy when the price has left the entry band, and says where it opens', () => {
    const { has, text } = draw({
      kind: 'call',
      postId,
      call: { ...rajsCall, price: 3060 },
      copyable: false,
    })
    expect(has('Copy')).toBe(false)
    expect(text).toContain('Copying paused')
    expect(text).toContain('2,985 – 3,015')
  })

  it("Copy hands the call's id over for the copy popup", () => {
    const { find, copied } = draw(callOf(rajsCall))
    find('Copy')?.click()
    expect(copied).toEqual([rajsCall.id])
  })

  it('offers Raj Go super on his own open call, in place of Copy', () => {
    const { has, find, copied } = draw(callOf({ ...rajsCall, supercall: false }), true)
    expect(has('Copy')).toBe(false)
    expect(has('Trade it yourself and make it a supercall')).toBe(true)
    find('Go super')?.click()
    expect(copied).toEqual([rajsCall.id])
  })

  it('offers Raj neither once his call is a supercall', () => {
    const { has } = draw(callOf({ ...rajsCall, supercall: true }), true)
    expect(has('Go super')).toBe(false)
    expect(has('Copy')).toBe(false)
  })

  it('offers Copy only while the call is open, and Open on Supercall always', () => {
    const closed = draw({
      kind: 'close',
      postId,
      call: rajsCall,
      at: '2026-10-27T15:00:00.000Z',
      price: 3250,
    })
    const won = draw(callOf({ ...rajsCall, status: 'won' }))
    for (const ended of [closed, won]) {
      expect(ended.has('Copy')).toBe(false)
      expect(ended.has('Open on Supercall')).toBe(true)
    }
  })
})
