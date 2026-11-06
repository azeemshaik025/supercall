import { describe, expect, it } from 'vitest'
import { scoredVolume } from './volume.ts'

describe('scoredVolume', () => {
  it('sums a wallet’s copies before the smooth cap', () => {
    const twoCopies = scoredVolume(
      [
        { follower: '0xAbC', filledUsd: 5_000 },
        { follower: '0xabc', filledUsd: 5_000 },
      ],
      new Map([['0xabc', 10]]),
    )
    const oneCopy = scoredVolume(
      [{ follower: '0xabc', filledUsd: 10_000 }],
      new Map([['0xabc', 10]]),
    )
    expect(twoCopies).toBeCloseTo(oneCopy, 6)
  })

  it('counts a wallet with no history at a quarter', () => {
    const fresh = scoredVolume([{ follower: '0x1', filledUsd: 1_000 }], new Map())
    const trusted = scoredVolume([{ follower: '0x1', filledUsd: 1_000 }], new Map([['0x1', 10]]))
    expect(fresh).toBeCloseTo(trusted / 4, 6)
  })

  it('ignores unfilled copies', () => {
    expect(scoredVolume([{ follower: '0x1', filledUsd: 0 }], new Map())).toBe(0)
  })
})
