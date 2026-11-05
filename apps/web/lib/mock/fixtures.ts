import type { Call, Caller, Copier, Market, Me, Notice, Position, Settled } from '../types'

/** The demo clock. Every relative time on dummy data is measured from here. */
export const NOW = new Date('2026-11-06T08:00:00Z')

export const calls: Call[] = [
  { id: 'c1', asset: 'ETH', long: true, caller: '0xmeera', entry: 3000, stop: 2850, target: 3400, price: 3190.4, band: 0.005, status: 'live', createdAt: '2026-11-05T14:00:00Z', expiresAt: '2026-11-07T22:00:00Z', copiedUsd: 186_000, copiers: 214, opposedUsd: 52_000, supercall: true, boosted: true, thesis: 'ETH reclaimed 3k on volume. Range high flipped to support, targeting the 3.4k gap.', arkivKey: '0x4be1…a07f', filledAt: '2026-11-05T14:07:00Z', fillPrice: 3004.2 },
  { id: 'c2', asset: 'AERO', long: true, caller: 'ravi', entry: 1.24, stop: 1.18, target: 1.46, price: 1.284, band: 0.006, status: 'live', createdAt: '2026-11-05T19:00:00Z', expiresAt: '2026-11-08T11:00:00Z', copiedUsd: 92_000, copiers: 118, opposedUsd: 14_000, supercall: true, boosted: true, thesis: 'Gauge votes flipped bullish. Holding the weekly level.', arkivKey: '0x91aa…3c20', filledAt: '2026-11-05T19:12:00Z', fillPrice: 1.241 },
  { id: 'c3', asset: 'cbBTC', long: false, caller: 'deltaneutral', entry: 67_650, stop: 69_200, target: 61_500, price: 66_840, band: 0.004, status: 'live', createdAt: '2026-11-05T21:00:00Z', expiresAt: '2026-11-07T03:00:00Z', copiedUsd: 240_000, copiers: 96, opposedUsd: 61_000, supercall: false, boosted: true, thesis: 'Lower high under 69k. Funding hot, looking for a flush to 61.5k.', arkivKey: '0x7d02…e11b', filledAt: '2026-11-05T21:03:00Z', fillPrice: 67_640 },
  { id: 'c4', asset: 'VIRTUAL', long: true, caller: 'kiran', entry: 1.85, stop: 1.74, target: 2.2, price: 1.912, band: 0.006, status: 'posted', createdAt: '2026-11-06T06:30:00Z', expiresAt: '2026-11-09T06:30:00Z', copiedUsd: 0, copiers: 0, opposedUsd: 0, supercall: false, boosted: false, thesis: 'Waiting for a retest of 1.85 before entering.', arkivKey: '0x2c4f…90d1' },
  { id: 'c5', asset: 'DEGEN', long: true, caller: 'tanvi', entry: 0.0071, stop: 0.0066, target: 0.0081, price: 0.0081, band: 0.01, status: 'won', createdAt: '2026-11-02T10:00:00Z', expiresAt: '2026-11-05T10:00:00Z', copiedUsd: 54_000, copiers: 77, opposedUsd: 9_000, supercall: true, boosted: false, thesis: 'Breakout from the 3 week base.', arkivKey: '0x55e3…08aa', filledAt: '2026-11-02T10:04:00Z', fillPrice: 0.0071, result: 0.141 },
  { id: 'c6', asset: 'ETH', long: true, caller: 'shortstack', entry: 3240, stop: 3150, target: 3500, price: 3190.4, band: 0.005, status: 'lost', createdAt: '2026-11-03T08:00:00Z', expiresAt: '2026-11-05T08:00:00Z', copiedUsd: 31_000, copiers: 40, opposedUsd: 22_000, supercall: false, boosted: false, thesis: 'Momentum continuation above 3.2k.', arkivKey: '0xa0b7…4f19', filledAt: '2026-11-03T08:02:00Z', fillPrice: 3240, result: -0.028 },
  { id: 'c7', asset: 'AERO', long: true, caller: '0xmeera', entry: 1.29, stop: 1.21, target: 1.52, price: 1.284, band: 0.006, status: 'live', createdAt: '2026-11-06T02:00:00Z', expiresAt: '2026-11-09T02:00:00Z', copiedUsd: 12_000, copiers: 19, opposedUsd: 2_000, supercall: false, boosted: false, thesis: 'Second leg once 1.29 holds.', arkivKey: '0x3e91…bb02', filledAt: '2026-11-06T02:06:00Z', fillPrice: 1.291 },
  { id: 'c8', asset: 'DEGEN', long: true, caller: 'degen.dev', entry: 0.0075, stop: 0.0071, target: 0.011, price: 0.0081, band: 0.01, status: 'void', createdAt: '2026-11-04T12:00:00Z', expiresAt: '2026-11-06T12:00:00Z', copiedUsd: 0, copiers: 0, opposedUsd: 0, supercall: true, boosted: false, thesis: 'Cancelled by the caller.', arkivKey: '0x0f6c…d7e3' },
  { id: 'c9', asset: 'ETH', long: true, caller: '0xmeera', entry: 2700, stop: 2620, target: 3050, price: 3190.4, band: 0.005, status: 'unfired', createdAt: '2026-10-28T12:00:00Z', expiresAt: '2026-10-31T12:00:00Z', copiedUsd: 0, copiers: 0, opposedUsd: 0, supercall: false, boosted: false, thesis: 'Bid at the range low.', arkivKey: '0x8a12…6c44' },
  { id: 'c10', asset: 'VIRTUAL', long: true, caller: 'kiran', entry: 1.62, stop: 1.52, target: 2.1, price: 1.912, band: 0.006, status: 'expired-profit', createdAt: '2026-10-30T09:00:00Z', expiresAt: '2026-11-02T09:00:00Z', copiedUsd: 22_000, copiers: 31, opposedUsd: 4_000, supercall: false, boosted: false, thesis: 'Base breakout.', arkivKey: '0xc3d8…12fe', filledAt: '2026-10-30T09:01:00Z', fillPrice: 1.62, result: 0.048 },
  { id: 'c11', asset: 'cbBTC', long: true, caller: 'ravi', entry: 64_000, stop: 62_500, target: 70_000, price: 66_840, band: 0.004, status: 'live', createdAt: '2026-11-04T16:00:00Z', expiresAt: '2026-11-08T16:00:00Z', copiedUsd: 41_000, copiers: 52, opposedUsd: 8_000, supercall: false, boosted: false, thesis: 'Reclaim of the 64k shelf.', arkivKey: '0x6b70…a9c1', filledAt: '2026-11-04T16:05:00Z', fillPrice: 64_020 },
]

const lt = (s: string) => s.split('').map((c) => (c === '1' ? 'W' : 'L')) as Caller['lastTen']

export const callers: Caller[] = [
  { handle: '0xmeera', name: 'Meera', xHandle: '0xmeera', verified: true, superFactor: 78, lastTen: lt('1101110111'), callCount: 52, earnedUsd: 18_400, followersNetUsd: 42_100, followersProfitablePct: 71, fundUsd: 9_600, joinedAt: '2026-08-02T00:00:00Z' },
  { handle: 'ravi', name: 'Ravi', xHandle: 'ravi_calls', verified: true, superFactor: 74, lastTen: lt('1110110110'), callCount: 33, earnedUsd: 11_900, followersNetUsd: 28_400, followersProfitablePct: 66, fundUsd: 6_200, joinedAt: '2026-08-19T00:00:00Z' },
  { handle: 'deltaneutral', name: 'Delta Neutral', xHandle: 'deltaneutral', verified: true, superFactor: 71, lastTen: lt('0111011101'), callCount: 41, earnedUsd: 21_300, followersNetUsd: 51_900, followersProfitablePct: 64, fundUsd: 22_000, joinedAt: '2026-07-28T00:00:00Z' },
  { handle: 'tanvi', name: 'Tanvi', xHandle: 'tanvi', verified: true, superFactor: 66, lastTen: lt('1011100111'), callCount: 27, earnedUsd: 4_800, followersNetUsd: 11_200, followersProfitablePct: 61, fundUsd: 3_400, joinedAt: '2026-09-04T00:00:00Z' },
  { handle: 'kiran', name: 'Kiran', xHandle: 'kiran_k', verified: true, superFactor: 62, lastTen: lt('1100110101'), callCount: 24, earnedUsd: 2_900, followersNetUsd: 6_800, followersProfitablePct: 57, fundUsd: 2_100, joinedAt: '2026-09-11T00:00:00Z' },
  { handle: 'arjun.eth', name: 'Arjun', xHandle: 'arjun_eth', verified: true, superFactor: 55, lastTen: lt('0101101100'), callCount: 15, earnedUsd: 900, followersNetUsd: 1_900, followersProfitablePct: 52, fundUsd: 1_500, joinedAt: '2026-09-30T00:00:00Z' },
  { handle: 'shortstack', name: 'Short Stack', xHandle: 'shortstack', verified: true, superFactor: 48, lastTen: lt('0100110010'), callCount: 19, earnedUsd: 600, followersNetUsd: -3_400, followersProfitablePct: 41, fundUsd: 4_800, joinedAt: '2026-08-25T00:00:00Z' },
  { handle: 'degen.dev', name: 'Degen Dev', xHandle: 'degendev', verified: true, superFactor: 39, lastTen: lt('0010010100'), callCount: 12, earnedUsd: 120, followersNetUsd: -8_100, followersProfitablePct: 33, fundUsd: 900, joinedAt: '2026-10-08T00:00:00Z' },
  { handle: 'rakesh', name: 'Rakesh', xHandle: 'rakesh_p', verified: true, superFactor: 61, lastTen: lt('1011011101'), callCount: 14, earnedUsd: 214.2, followersNetUsd: 1_240, followersProfitablePct: 58, fundUsd: 1_000, joinedAt: '2026-10-21T00:00:00Z' },
]

export const markets: Market[] = [
  { symbol: 'ETH', name: 'Ethereum', price: 3190.4, change24h: 0.021, impact1k: 0.0004, liquidityUsd: 4_200_000 },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', price: 66_840, change24h: -0.008, impact1k: 0.0006, liquidityUsd: 3_100_000 },
  { symbol: 'AERO', name: 'Aerodrome', price: 1.284, change24h: 0.034, impact1k: 0.0021, liquidityUsd: 860_000 },
  { symbol: 'VIRTUAL', name: 'Virtuals Protocol', price: 1.912, change24h: 0.004, impact1k: 0.0034, liquidityUsd: 540_000 },
  { symbol: 'DEGEN', name: 'Degen', price: 0.0081, change24h: 0.056, impact1k: 0.0072, liquidityUsd: 210_000 },
]

export const copiers: Copier[] = [
  { who: '@ananya', sizeUsd: 2_000, pnlUsd: 127.2, ago: '2h ago' },
  { who: '0x91c…e04', sizeUsd: 5_000, pnlUsd: 318, ago: '1h ago' },
  { who: '@vik_trades', sizeUsd: 500, pnlUsd: 31.8, ago: '2h ago' },
  { who: '@sid', sizeUsd: 1_000, pnlUsd: 63.6, ago: '48m ago' },
  { who: '@moonmaya', sizeUsd: 250, pnlUsd: 15.9, ago: '12m ago' },
]

export const positions: Position[] = [
  { id: 'p1', callId: 'c1', sizeUsd: 1_000, boughtAt: 3004.2 },
  { id: 'p2', callId: 'c2', sizeUsd: 1_500, boughtAt: 1.245 },
  { id: 'p3', callId: 'c11', sizeUsd: 920, boughtAt: 64_100 },
]

export const settled: Settled[] = [
  { id: 's1', callId: 'c5', sizeUsd: 500, note: 'Target hit, sold at 0.0081', pnlUsd: 70.4 },
  { id: 's2', callId: 'c6', sizeUsd: 1_000, note: 'Fee back + $6.95 credit', pnlUsd: -20.85 },
  { id: 's3', callId: 'c10', sizeUsd: 750, note: 'Sold at the deadline', pnlUsd: 22.1 },
]

export const notifications: Notice[] = [
  { id: 'n1', title: 'DEGEN long by @tanvi hit target. +$70.40', when: '3d ago', href: '/c/c5' },
  { id: 'n2', title: '@0xmeera published ETH long', when: '18h ago', href: '/c/c1' },
  { id: 'n3', title: 'ETH long by @shortstack hit stop. Fee back + credit', when: '1d ago', href: '/c/c6' },
]

export const me: Me = {
  handle: 'rakesh',
  address: '0x7a3f…91c2',
  balance: 2_480,
  verified: true,
  xHandle: 'rakesh_p',
  superFactor: 61,
  earnedUsd: 214.2,
  fundUsd: 1_000,
}
