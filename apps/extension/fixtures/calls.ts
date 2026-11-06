import type { Call } from '../lib/lookup'

const key = (n: number) => `0x${n.toString(16).padStart(64, '0')}`

// Raj's synthetic post: "Long ETH 3,000, SL 2,850, TP 3,400, 3 days". He traded it, so it's a supercall.
export const rajsCall = {
  id: key(1),
  caller: 'synthetic_raj',
  asset: 'WETH',
  quote: 'USDC',
  chain: 'arc',
  type: 'open',
  direction: 'long',
  entry: 3000,
  bandPct: 0.005,
  stop: 2850,
  target: 3400,
  price: 3010.25,
  status: 'live',
  thesis: 'Long ETH 3,000, SL 2,850, TP 3,400, 3 days. Synthetic example post.',
  createdAt: '2026-10-26T10:00:00.000Z',
  expiresAt: '2026-10-29T10:00:00.000Z',
  arkivKey: key(1),
  followBand: 'medium',
  opposeBand: 'low',
  shareApplied: 0.2474,
  stopSuggested: false,
  supercall: true,
} satisfies Call

// "ETH to 3,400 in 24h" names no stop, so 2,880 is the AI's suggestion. Raj didn't trade it.
export const suggestedStopCall = {
  ...rajsCall,
  id: key(2),
  arkivKey: key(2),
  thesis: 'ETH to 3,400 in 24h. Synthetic example post.',
  stop: 2880,
  expiresAt: '2026-10-27T10:00:00.000Z',
  stopSuggested: true,
  supercall: false,
} satisfies Call
