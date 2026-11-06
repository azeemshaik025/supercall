import { z } from 'zod'

const band = z.enum(['low', 'medium', 'high', 'superhigh'])

export const callResponse = z.object({
  id: z.string(),
  caller: z.string(),
  asset: z.string(),
  assetAddress: z.string().optional(),
  quote: z.string(),
  chain: z.string(),
  type: z.enum(['future-level', 'open']),
  direction: z.enum(['long', 'short']),
  entry: z.number(),
  bandPct: z.number(),
  stop: z.number(),
  target: z.number(),
  price: z.number(),
  status: z.enum([
    'pending',
    'armed',
    'live',
    'won',
    'lost',
    'expired-profit',
    'expired-loss',
    'unfired',
    'void',
  ]),
  thesis: z.string(),
  createdAt: z.string(),
  entryFilledAt: z.string().optional(),
  expiresAt: z.string(),
  arkivKey: z.string(),
  callerTradedDuringCall: z.boolean().optional(),
  stopSuggested: z.boolean().optional(),
  supercall: z.boolean().optional(),
  followBand: band,
  opposeBand: band,
  shareApplied: z.number(),
  boost: z.number().optional(),
})

export const callerResponse = z.object({
  handle: z.string(),
  displayName: z.string(),
  xHandle: z.string(),
  verified: z.boolean(),
  superFactor: z.number(),
  lastTen: z.array(z.enum(['W', 'L', 'E'])),
  callCount: z.number(),
  poolUsd: z.number(),
  earnedUsd: z.number(),
  returnedToFollowersUsd: z.number(),
  followersNetUsd: z.number(),
  followersProfitablePct: z.number(),
  joinedAt: z.string(),
})

export const callsResponse = z.object({ calls: z.array(callResponse), next: z.string().nullable() })

export const callersResponse = z.object({ callers: z.array(callerResponse) })

export const publishResponse = z.object({ id: z.string(), registerTx: z.string().nullable() })

const hex = (pattern: RegExp, message: string) =>
  z.custom<`0x${string}`>((v) => typeof v === 'string' && pattern.test(v), { message })
const txHash = hex(/^0x[0-9a-fA-F]{64}$/, 'Not a transaction hash')
const address = hex(/^0x[0-9a-fA-F]{40}$/, 'Not an address')

export const copyQuoteRequest = z.object({
  funder: address,
  sizeUsd: z.number().min(1).max(1_000_000),
})

export const feeMessage = z.object({
  typedData: z.string(),
  nonce: z.string(),
  deadline: z.number(),
  callFeeUsd: z.number(),
  platformFeeUsd: z.number(),
})

export const copyQuoteResponse = z.looseObject({ quoteId: z.string(), fee: feeMessage })

export const copyRequest = copyQuoteRequest.extend({
  quoteId: z.string().optional(),
  userSignature: z.string().min(1),
  evmOrderTypedData: z.string().min(1),
  evmPermitTypedData: z.string().optional(),
  evmPermitSignature: z.string().optional(),
  attachedBracket: z.object({
    userSignature: z.string().min(1),
    salt: z.string().optional(),
    deadline: z.string().min(1),
    signedMaxFromAmount: z.string().min(1),
    evmPermitTypedData: z.string().optional(),
    evmPermitSignature: z.string().optional(),
  }),
  fee: z.union([
    z.object({
      nonce: z.string().regex(/^\d+$/),
      deadline: z.number().int(),
      signature: hex(/^0x[0-9a-fA-F]+$/, 'Not a signature'),
    }),
    z.object({ payFeeTx: txHash }),
  ]),
})

export const backingQuoteRequest = z.object({ sizeUsd: z.number().positive().max(1_000_000) })

export const backingQuoteResponse = z.looseObject({ quoteId: z.string() })

export const copyResponse = z.object({
  orderId: z.string(),
  payFeeTx: z.string(),
  retry: z.string().optional(),
  cancel: z.object({ orderId: z.string(), message: z.string() }).optional(),
})

export const cancelPermissionRequest = z.object({
  signature: hex(/^0x[0-9a-fA-F]+$/, 'Not a signature'),
})

export const backingRequest = copyRequest
  .omit({ funder: true, fee: true })
  .extend({ sizeUsd: backingQuoteRequest.shape.sizeUsd })

export const backingResponse = z.object({ orderId: z.string(), retry: z.string().optional() })

export const closeCopyRequest = z.object({
  quoteId: z.string().optional(),
  userSignature: z.string().min(1),
  evmOrderTypedData: z.string().min(1),
  evmPermitTypedData: z.string().optional(),
  evmPermitSignature: z.string().optional(),
  cancelSignature: hex(/^0x[0-9a-fA-F]+$/, 'Not a signature').optional(),
})

export const recordCopyRequest = z.object({ payFeeTx: txHash })

export const depositChain = z.enum(['base', 'arbitrum', 'ethereum'])

export const depositTokensResponse = z.object({
  tokens: z.array(
    z.looseObject({
      chain: depositChain,
      address: z.string(),
      symbol: z.string(),
      tokenDecimals: z.number(),
      balance: z.string(),
      notional: z.string(),
      isNative: z.boolean(),
    }),
  ),
})

export const depositQuoteRequest = z.object({
  wallet: address,
  chain: depositChain,
  token: address,
  amount: z
    .string()
    .max(40)
    .regex(/^\d+(\.\d+)?$/, 'Not a decimal amount')
    .refine((a) => Number(a) > 0, 'Not more than 0'),
})

export const depositQuoteResponse = z.looseObject({
  quoteId: z.string(),
  bridgeQuoteId: z.string(),
  costUsd: z.number(),
})

export const depositRequest = depositQuoteRequest.extend({
  quoteId: z.string().min(1),
  bridgeQuoteId: z.string().min(1),
  userSignature: z.string().min(1),
  evmOrderTypedData: z.string().min(1),
  evmPermitTypedData: z.string().optional(),
  evmPermitSignature: z.string().optional(),
})

export const depositResponse = z.object({ orderId: z.string() })

export const depositStatus = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending'), orderId: z.string() }),
  z.object({ status: z.literal('arrived'), orderId: z.string(), usdc: z.string() }),
  z.object({ status: z.literal('failed'), orderId: z.string(), reason: z.string() }),
])

export const opposeResponse = z.object({ opposeBand: band })

export const notACallReason = z.enum([
  'no-coin',
  'no-direction',
  'no-target',
  'no-deadline',
  'breakout',
  'leverage',
  'coin-vs-coin',
  'news',
  'holds-a-level',
  'joke',
  'sarcasm',
  'hypothetical',
  'someone-elses-call',
  'past-trade',
  'two-coins',
  'two-readings',
  'not-a-close',
  'misread-number',
  'misread-direction',
  'misread-deadline',
  'other',
  'no-number',
  'too-late',
  'edited-post',
  'words-not-in-post',
  'number-mismatch',
  'unknown-deadline',
  'deadline-passed',
  'levels-out-of-order',
  'no-price',
  'no-open-call',
  'two-open-calls',
  'no-such-call',
])
export type NotACallReason = z.infer<typeof notACallReason>

export const postLookupRequest = z.object({
  posts: z
    .array(z.object({ id: z.string().regex(/^\d{1,20}$/), author: z.string().regex(/^\w{1,15}$/) }))
    .min(1)
    .max(50),
})

export const postAnswer = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('call'),
    postId: z.string(),
    call: callResponse,
    superFactor: z.number().optional(),
    copyable: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('close'),
    postId: z.string(),
    call: callResponse,
    superFactor: z.number().optional(),
    at: z.string(),
    price: z.number(),
  }),
  z.object({
    kind: z.literal('not-a-call'),
    postId: z.string(),
    reason: notACallReason,
    detail: z.string(),
  }),
  z.object({ kind: z.literal('not-a-caller'), postId: z.string() }),
  z.object({ kind: z.literal('not-read-yet'), postId: z.string() }),
])
export type PostAnswer = z.infer<typeof postAnswer>

export const postLookupResponse = z.object({ answers: z.array(postAnswer) })

export const rateLimitedResponse = z.object({
  code: z.literal('rate_limited'),
  detail: z.string(),
  retryAfter: z.number().int().positive(),
})
export type RateLimitedResponse = z.infer<typeof rateLimitedResponse>

export const copyCancel = z.object({ message: z.string() }).nullable()

export const cancelCopyRequest = z.object({
  signature: hex(/^0x[0-9a-fA-F]+$/, 'Not a signature'),
})

export const notificationResponse = z.object({
  id: z.number(),
  call: z.string(),
  kind: z.literal('ending'),
  what: z.enum(['target', 'stop', 'deadline', 'caller', 'unfired', 'void']),
  price: z.number().nullable(),
  at: z.string(),
  readAt: z.string().nullable(),
})
export const notificationsResponse = z.object({ notifications: z.array(notificationResponse) })
export type NotificationsResponse = z.infer<typeof notificationsResponse>

export const readNotificationsRequest = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(100),
})
export const readNotificationsResponse = z.object({ read: z.array(z.number()) })
export type ReadNotificationsResponse = z.infer<typeof readNotificationsResponse>
