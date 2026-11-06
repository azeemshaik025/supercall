// Record payloads as arkiv/schema.md defines them. Every payload read from the chain is parsed
// here before anything trusts it.
import { type Hex, hashTypedData, keccak256 } from 'viem'
import { z } from 'zod'

const CALL_TYPES = ['future-level', 'open'] as const
const DIRECTIONS = ['long', 'short'] as const
const STATUSES = [
  'pending',
  'armed',
  'live',
  'won',
  'lost',
  'expired-profit',
  'expired-loss',
  'unfired',
  'void',
] as const
const BANDS = ['low', 'medium', 'high', 'superhigh'] as const

const hex = (pattern: RegExp) =>
  z.custom<Hex>((v) => typeof v === 'string' && pattern.test(v), { message: 'Not lowercase hex' })
const entityKey = hex(/^0x[0-9a-f]{64}$/)
const address = hex(/^0x[0-9a-f]{40}$/)
const micro = z.int()
const bps = z.int().min(0).max(10_000)
const seconds = z.int().positive()

const levels = {
  v: z.literal(1),
  caller: entityKey,
  wallet: address,
  asset: z.string(),
  assetAddress: address,
  chain: z.string(),
  type: z.enum(CALL_TYPES),
  direction: z.enum(DIRECTIONS),
  entry: micro,
  bandBps: bps,
  stop: micro.optional(),
  target: micro,
  deadline: seconds,
  shareBps: bps,
  boostBps: bps,
  createdAt: seconds,
}

/** A post on X, as read: where it is, who posted it, its exact text and when. */
const post = z.object({
  url: z.string(),
  id: z.string(),
  authorId: z.string(),
  text: z.string(),
  postedAt: seconds,
})
const reading = z.record(z.string(), z.unknown())

export const callPayload = z.discriminatedUnion('source', [
  z.object({ ...levels, source: z.enum(['x', 'telegram']), post, reading }),
  z.object({
    ...levels,
    source: z.literal('app'),
    thesis: z.string(),
    signature: hex(/^0x[0-9a-f]+$/),
  }),
])
export type CallPayload = z.infer<typeof callPayload>
/** A call as read: its key, and the fingerprint Hisaab anchors it under. */
export type CallRecord = CallPayload & { key: Hex; fingerprint: Hex }

/** The caller's post that ends a call at the judging pool's price at its block. */
export const closePayload = z.object({
  v: z.literal(1),
  call: entityKey,
  caller: entityKey,
  post,
  reading,
  price: micro,
  at: seconds,
  pool: address,
  block: z.int().positive(),
})
export type ClosePayload = z.infer<typeof closePayload>
export type CloseRecord = ClosePayload & { key: Hex }

const status = {
  call: entityKey,
  caller: entityKey,
  asset: z.string(),
  status: z.enum(STATUSES),
  supercall: z.boolean(),
  /** The caller's own Flash order that made the call a supercall, its size and when Flash placed it. */
  backing: z.object({ order: z.string(), size: micro, at: seconds }).optional(),
  entryFilledAt: seconds.optional(),
  superFactor: z.int().min(0).max(100),
  boostBps: bps,
}

export const statusPayload = z.object({
  ...status,
  v: z.literal(2),
  followBand: z.enum(BANDS),
  opposeBand: z.enum(BANDS),
})
export type StatusPayload = z.output<typeof statusPayload>
export type StatusRecord = StatusPayload & { key: Hex }

const ENDINGS = ['won', 'lost', 'expired-profit', 'expired-loss', 'unfired', 'void'] as const
const txHash = hex(/^0x[0-9a-f]{64}$/)
const millionths = z.int()
const count = z.int().min(0)
const beforeAfter = <T extends z.ZodType>(t: T) => z.object({ before: t, after: t })

export const settlementPayload = z.object({
  v: z.literal(1),
  call: entityKey,
  caller: entityKey,
  entry: micro,
  stop: micro.optional(),
  target: micro,
  direction: z.enum(DIRECTIONS),
  ending: z.object({
    kind: z.enum(ENDINGS),
    price: micro.optional(),
    at: seconds.optional(),
    pool: address.optional(),
    txHash: txHash.optional(),
  }),
  fills: z.object({ filled: count, bought: micro, sold: micro, definitiveFee: micro }),
  keptTotal: micro,
  cutBps: bps,
  toCaller: micro,
  toFund: micro,
  toCreditOnly: micro,
  toTreasury: micro,
  creditTotal: micro,
  budget: micro,
  fund: beforeAfter(z.object({ earned: micro, creditOnly: micro, limit: micro })),
  need: beforeAfter(z.object({ total: micro, count: millionths })),
  s: millionths,
  S: beforeAfter(millionths),
  W: beforeAfter(millionths),
  copies: count,
  followersNet: micro,
  followersProfitable: count,
  previous: entityKey.nullable(),
  hisaabTxs: z.array(txHash),
})
export type SettlementPayload = z.infer<typeof settlementPayload>
export type SettlementRecord = SettlementPayload & { key: Hex }

const account = z.object({ id: z.string(), username: z.string() }).nullable()

export const callerPayload = z.object({
  v: z.literal(1),
  handle: z.string(),
  displayName: z.string(),
  wallet: address,
  wallets: z.array(address).min(1),
  x: account,
  telegram: account,
  world: z.object({ nullifier: entityKey, action: z.string(), verifiedAt: seconds }),
  joinedAt: seconds,
  signature: hex(/^0x[0-9a-f]+$/),
})
export type CallerPayload = z.infer<typeof callerPayload>
export type CallerRecord = CallerPayload & { key: Hex }

// The fingerprint domain in arkiv/schema.md. Changing it breaks every signature already made.
const domain = { name: 'Supercall', version: '1', chainId: 5042 } as const

/** What the caller signs: their record, flat. An unlinked account signs as empty strings. */
export const callerTypedData = (c: Omit<CallerPayload, 'signature'>) => ({
  domain,
  primaryType: 'Caller' as const,
  types: {
    Caller: [
      { name: 'handle', type: 'string' },
      { name: 'displayName', type: 'string' },
      { name: 'wallet', type: 'address' },
      { name: 'wallets', type: 'address[]' },
      { name: 'xId', type: 'string' },
      { name: 'xUsername', type: 'string' },
      { name: 'telegramId', type: 'string' },
      { name: 'telegramUsername', type: 'string' },
      { name: 'nullifier', type: 'bytes32' },
      { name: 'action', type: 'string' },
      { name: 'verifiedAt', type: 'uint64' },
      { name: 'joinedAt', type: 'uint64' },
    ],
  } as const,
  message: {
    handle: c.handle,
    displayName: c.displayName,
    wallet: c.wallet,
    wallets: c.wallets,
    xId: c.x?.id ?? '',
    xUsername: c.x?.username ?? '',
    telegramId: c.telegram?.id ?? '',
    telegramUsername: c.telegram?.username ?? '',
    nullifier: c.world.nullifier,
    action: c.world.action,
    verifiedAt: BigInt(c.world.verifiedAt),
    joinedAt: BigInt(c.joinedAt),
  },
})

export type AppCallPayload = Extract<CallPayload, { source: 'app' }>

/** What a caller signs to publish in the app: the levels and terms, flat. No stop signs as 0. */
export const callTypedData = (c: Omit<AppCallPayload, 'signature'>) => ({
  domain,
  primaryType: 'Call' as const,
  types: {
    Call: [
      { name: 'caller', type: 'bytes32' },
      { name: 'wallet', type: 'address' },
      { name: 'asset', type: 'string' },
      { name: 'assetAddress', type: 'address' },
      { name: 'chain', type: 'string' },
      { name: 'type', type: 'string' },
      { name: 'direction', type: 'string' },
      { name: 'entry', type: 'uint256' },
      { name: 'bandBps', type: 'uint32' },
      { name: 'stop', type: 'uint256' },
      { name: 'target', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'shareBps', type: 'uint32' },
      { name: 'boostBps', type: 'uint32' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'thesis', type: 'string' },
    ],
  } as const,
  message: {
    caller: c.caller,
    wallet: c.wallet,
    asset: c.asset,
    assetAddress: c.assetAddress,
    chain: c.chain,
    type: c.type,
    direction: c.direction,
    entry: BigInt(c.entry),
    bandBps: c.bandBps,
    stop: BigInt(c.stop ?? 0),
    target: BigInt(c.target),
    deadline: BigInt(c.deadline),
    shareBps: c.shareBps,
    boostBps: c.boostBps,
    createdAt: BigInt(c.createdAt),
    thesis: c.thesis,
  },
})

/** A call record's fingerprint: what Hisaab stores beside its key (arkiv/schema.md, "Fingerprint"). */
export const callFingerprint = (c: Omit<AppCallPayload, 'signature'>) =>
  hashTypedData(callTypedData(c))

/**
 * A posted call's fingerprint: its exact payload bytes, hashed under the fingerprint domain. Nobody
 * signs a posted call, so, like a settlement, its fields aren't typed one by one.
 */
export const postedCallFingerprint = (payload: Uint8Array) =>
  hashTypedData({
    domain,
    primaryType: 'PostedCall',
    types: { PostedCall: [{ name: 'payload', type: 'bytes32' }] },
    message: { payload: keccak256(payload) },
  })

/** Any call's fingerprint, from its payload and the bytes it's stored as. */
export function fingerprintOf(call: CallPayload, payload: Uint8Array) {
  if (call.source !== 'app') return postedCallFingerprint(payload)
  const { signature: _, ...fields } = call
  return callFingerprint(fields)
}

/**
 * A settlement record's fingerprint: its exact payload bytes, hashed under the fingerprint domain.
 * Nobody signs a settlement, so its fields aren't typed one by one as a call's are.
 */
export const settlementFingerprint = (call: Hex, payload: Uint8Array) =>
  hashTypedData({
    domain,
    primaryType: 'Settlement',
    types: {
      Settlement: [
        { name: 'call', type: 'bytes32' },
        { name: 'payload', type: 'bytes32' },
      ],
    },
    message: { call, payload: keccak256(payload) },
  })
