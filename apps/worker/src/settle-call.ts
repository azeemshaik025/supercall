// Settles one call on Hisaab from its Flash fills, writes its settlement record to Arkiv and
// anchors it there. Running it again picks up wherever the last run stopped.
import { type Arkiv, type CallRecord, createArkiv, fromMicroUsdc } from '@supercall/arkiv'
import {
  blockAt,
  CHAIN,
  type HisaabChain,
  hasPool,
  type Pool,
  poolOf,
  priceNow,
} from '@supercall/chains'
import { type Resolution, resolve, type Swap } from '@supercall/core'
import { createDb, type Db } from '@supercall/db'
import { createFlashClient, type FlashClient } from '@supercall/flash'
import { encodePacked, type Hex, isAddress, isHex, keccak256, zeroHash } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { copyProfits, settlementInputs } from './inputs.ts'
import { notifyEnding } from './notify.ts'
import {
  hisaabCopies,
  ordersOf,
  ordersOnRecord,
  pages,
  priceBefore,
  settledOnHisaab,
  swaps,
} from './read.ts'
import { settlementRecord } from './record.ts'
import { createSettler } from './settle.ts'
import { otherCallersCopied, scoredVolume } from './volume.ts'
import { cancelCopies } from './watch.ts'

type Orders = Awaited<ReturnType<typeof ordersOf>>

const SETTLE_AFTER = 5 * 60
const LOOK_BACK = 7 * 24 * 60 * 60

// Hisaab.sol `enum Status { Open, Settling, Done }`.
const STATUS_DONE = 2

type Memo = {
  record: CallRecord
  read?: { from: bigint; priceAtPost: number; path: Swap[]; to: bigint }
}

type Close = NonNullable<Awaited<ReturnType<Arkiv['closeOf']>>>

type Voided = NonNullable<Awaited<ReturnType<Db['query']['voids']['findFirst']>>>

export type Round = {
  close: Close | undefined
  voided: Voided | undefined
}

export type Worker = {
  chain: HisaabChain
  settler: ReturnType<typeof createSettler>
  arkiv: Pick<
    Arkiv,
    | 'call'
    | 'closeOf'
    | 'closesOf'
    | 'settlementOf'
    | 'latestSettlementBy'
    | 'writeSettlement'
    | 'settlementsExpiringWithin'
    | 'extend'
  >
  flash: FlashClient
  db: Db
  prices: {
    swaps: (pool: Pool, from: bigint, to: bigint) => Promise<Swap[]>
    now: (pool: Pool) => Promise<number>
  }
  memo: Map<Hex, Memo>
}

export function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (see .env.example)`)
  return v
}

export function workerFromEnv(): Worker {
  if (!CHAIN.hisaab) throw new Error('Hisaab has no address on Arc yet (packages/chains)')
  const settlerKey = required('SETTLER_PRIVATE_KEY')
  const writer = required('ARKIV_WRITER_ADDRESS')
  if (!isHex(settlerKey) || settlerKey.length !== 66)
    throw new Error('SETTLER_PRIVATE_KEY is not a key')
  if (!isAddress(writer)) throw new Error('ARKIV_WRITER_ADDRESS is not an address')
  const chain = { ...CHAIN, hisaab: CHAIN.hisaab, rpcUrl: process.env.ARC_RPC_URL || CHAIN.rpcUrl }
  const settler = createSettler(chain, settlerKey)
  return {
    chain,
    settler,
    arkiv: createArkiv({
      writer,
      settler: privateKeyToAccount(settlerKey).address,
      privateKey: settlerKey,
      apiKey: process.env.ARKIV_API_KEY,
      project: 'supercall',
      rpcUrl: process.env.ARKIV_RPC_URL,
    }),
    flash: createFlashClient({ apiKey: required('FLASH_API_KEY') }),
    db: createDb(required('DATABASE_URL')),
    prices: {
      swaps: (pool, from, to) => swaps(settler.reader, pool, from, to),
      now: (pool) => priceNow(settler.reader, pool),
    },
    memo: new Map(),
  }
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString()

async function pathOf(w: Worker, memo: Memo, entry: number, pool: Pool) {
  const arc = w.settler.reader
  const { record } = memo
  let m = memo.read
  if (!m) {
    const from = await blockAt(arc, record.createdAt)
    const priceAtPost =
      record.type === 'open'
        ? entry
        : await priceBefore(
            (start, end) => w.prices.swaps(pool, start, end),
            from,
            await blockAt(arc, record.createdAt - LOOK_BACK),
          )
    m = { from, priceAtPost, path: [], to: from - 1n }
    memo.read = m
  }
  for await (const [start, end] of pages(m.to + 1n, await arc.getBlockNumber())) {
    m.path.push(...(await w.prices.swaps(pool, start, end)))
    m.to = end
  }
  return m
}

async function shown(w: Worker, caller: Hex, key: Hex) {
  for (let tries = 0; tries < 30; tries++) {
    if ((await w.arkiv.latestSettlementBy(caller))?.key === key) return
    await new Promise((r) => setTimeout(r, 2_000))
  }
  throw new Error(`settlement ${key} isn't in Arkiv's queries after a minute`)
}

function inputHash(call: Hex, index: number, keptFee: bigint, creditAsk: bigint): Hex {
  return keccak256(
    encodePacked(
      ['bytes32', 'uint256', 'uint256', 'uint256'],
      [call, BigInt(index), keptFee, creditAsk],
    ),
  )
}

export async function settleCall(w: Worker, call: Hex, round?: Round) {
  const { settler, arkiv, flash, db } = w
  const arc = settler.reader
  const now = Math.floor(Date.now() / 1000)
  const hisaab = await settler.onHisaab(call)
  if (hisaab.expired && hisaab.cursor === hisaab.copyCount) {
    return { call, done: 'refunded as expired' as const }
  }
  // Done on Hisaab isn't done: the Arkiv write after the last batch can still have failed.
  // ponytail: one Arkiv query per settled call each round; remember recorded calls once there are many.
  if (hisaab.status === STATUS_DONE && (await arkiv.settlementOf(call))) {
    return { call, done: 'settled already' as const }
  }
  let memo = w.memo.get(call)
  if (!memo) {
    const record = await arkiv.call(call)
    if (!record && now >= Number(hisaab.deadline))
      return { call, skipped: 'no call record on Arkiv' }
    if (!record) throw new Error(`no call record ${call} on Arkiv`)
    memo = { record }
    w.memo.set(call, memo)
  }
  const { record } = memo
  if (!hasPool(record.assetAddress))
    return { call, skipped: `no pool to judge ${record.assetAddress} on` }

  const terms = {
    entry: fromMicroUsdc(record.entry),
    stop: record.stop === undefined ? undefined : fromMicroUsdc(record.stop),
    target: fromMicroUsdc(record.target),
    direction: record.direction,
    type: record.type,
    createdAt: iso(record.createdAt),
    expiresAt: iso(record.deadline),
  }
  const pool = poolOf(record.assetAddress)
  const { from, priceAtPost, path } = await pathOf(w, memo, terms.entry, pool)
  const close = round ? round.close : await arkiv.closeOf(call)
  const resolved = resolve(
    { ...terms, priceAtPost },
    path,
    iso(now),
    close && { at: iso(close.at), price: fromMicroUsdc(close.price), ref: `block ${close.block}` },
  )
  const voided = round
    ? round.voided
    : await db.query.voids.findFirst({ where: (v, { eq }) => eq(v.call, call.toLowerCase()) })
  const ending: Resolution | undefined =
    voided && !(resolved && 'at' in resolved && Date.parse(resolved.at) <= voided.at.getTime())
      ? { ending: 'void', at: voided.at.toISOString() }
      : resolved
  if (!ending) return { call, open: 'neither level touched before now', swaps: path.length }
  await notifyEnding(db, call, ending, close)
  if (ending.ending !== 'unfired' && now < Date.parse(ending.at) / 1000 + SETTLE_AFTER) {
    return {
      call,
      ending,
      wait: `settle after ${iso(Date.parse(ending.at) / 1000 + SETTLE_AFTER)}`,
    }
  }

  const cancels = ending.ending === 'void' ? await cancelCopies(w, record) : undefined

  const recorded = await db.query.copies.findMany({
    where: (c, { eq }) => eq(c.call, call.toLowerCase()),
  })
  const onHisaab = await hisaabCopies(arc, w.chain.hisaab, call, from)
  const { orders: orderIds, unrecorded } = ordersOnRecord(onHisaab, recorded)
  const refund = ending.ending === 'unfired' || ending.ending === 'void'
  if (unrecorded.length && !refund) return { call, ending, unrecorded }
  const copies: { size: bigint; orders?: Orders }[] = []
  for (const [i, c] of onHisaab.entries()) {
    const orderId = orderIds[i]
    copies.push({
      size: c.size,
      orders: orderId
        ? await ordersOf(
            flash,
            orderId,
            c.follower,
            recorded.find((r) => r.flashOrderId === orderId)?.closeOrderId,
          )
        : undefined,
    })
  }
  const orders = copies.map((c) => ({
    size: c.size,
    buy: c.orders?.buy.order,
    exits: c.orders?.exits.map((e) => e.order) ?? [],
  }))
  const poolPrice = await w.prices.now(pool)
  const inputs = settlementInputs(terms, ending, orders, poolPrice)
  const inputHashes: Hex[] =
    inputs.kind === 'right'
      ? inputs.kept.map((k, i) => inputHash(call, i, k, 0n))
      : inputs.kind === 'wrong'
        ? inputs.asks.map((a, i) => inputHash(call, i, 0n, a))
        : Array.from({ length: inputs.count }, () => zeroHash)
  const batches = await settler.settle(call, inputs, inputHashes)

  const recordIt = async () => {
    const settled = await settledOnHisaab(arc, w.chain.hisaab, call, from)
    const profits = copyProfits(terms, ending, orders, poolPrice)
    const fund = await settler.fund(hisaab.caller)
    const previous = await arkiv.latestSettlementBy(record.caller)
    const usd = (amounts: (string | null | undefined)[]) =>
      amounts.reduce((t, a) => t + Number(a ?? 0), 0)
    const buys = copies.flatMap((c) => c.orders?.buy.fills ?? [])
    const sells = copies.flatMap((c) => c.orders?.exits.flatMap((e) => e.fills) ?? [])
    const filledCopies = onHisaab.map((c, i) => ({
      follower: c.follower,
      filledUsd: usd((copies[i]?.orders?.buy.fills ?? []).map((f) => f.notional)),
    }))
    const otherCallers = await otherCallersCopied(
      db,
      arkiv,
      filledCopies.map((c) => c.follower),
      call,
      record.caller,
    )
    const volume = scoredVolume(filledCopies, otherCallers)
    // From what Hisaab was sent, not this run's inputs: a retry recomputes them later.
    const settledCopies = settled.copies.map((s, i) => ({
      keptFee: settled.posted[i]?.keptFee ?? 0n,
      newCredit: s.newCredit,
      platformFee: onHisaab[i]?.platformFee ?? 0n,
      filled: settled.posted[i]?.filled ?? false,
      profit: profits[i],
    }))
    const written = await arkiv.writeSettlement(
      settlementRecord({
        call: record,
        ending,
        pool: pool.address,
        copies: settledCopies,
        callFeeCredits: onHisaab.map((c) => c.callFeeCredit),
        hisaabTxs: settled.txs,
        fund,
        previous,
        fills: {
          filled: orders.filter((o) => Number(o.buy?.filled?.targetAmount) > 0).length,
          bought: usd(buys.map((f) => f.notional)),
          sold: usd(sells.map((f) => f.notional)),
          definitiveFee: usd([...buys, ...sells].map((f) => f.tradeFeeNotional)),
        },
        volume,
      }),
    )
    await shown(w, record.caller, written.key)
    return written
  }
  const settlement = (await arkiv.settlementOf(call)) ?? (await recordIt())
  return { call, ending, batches, record: settlement.key, cancels }
}
