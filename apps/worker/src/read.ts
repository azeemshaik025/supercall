// What a settlement reads: the price path from Arc's pools, Hisaab's copies and logs, and each
// copy's Flash orders. Nothing here sends a transaction.
import { hisaabAbi, type Pool, swapPrice } from '@supercall/chains'
import type { Swap } from '@supercall/core'
import type { FlashClient } from '@supercall/flash'
import { type Hex, type PublicClient, parseAbiItem } from 'viem'

const SWAP = parseAbiItem(
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
)

// Arc mainnet refuses log ranges over 10,000 blocks.
const PAGE = 10_000n
// Arc's public RPC rate-limits bursts.
const BETWEEN_PAGES = 200

export async function* pages(from: bigint, to: bigint) {
  for (let start = from; start <= to; start += PAGE) {
    if (start > from) await new Promise((r) => setTimeout(r, BETWEEN_PAGES))
    yield [start, start + PAGE - 1n < to ? start + PAGE - 1n : to] as const
  }
}

async function paged<T>(
  from: bigint,
  to: bigint,
  read: (from: bigint, to: bigint) => Promise<T[]>,
) {
  const all: T[] = []
  for await (const [start, end] of pages(from, to)) all.push(...(await read(start, end)))
  return all
}

// Each block's last swap. A call is judged on these, so one transaction that swaps through a level
// and back inside a block, for two pool fees, can't end it.
export const blockCloses = (path: (Swap & { block: bigint })[]): Swap[] =>
  path.filter((s, i) => path[i + 1]?.block !== s.block).map(({ block: _, ...swap }) => swap)

export async function swaps(arc: PublicClient, pool: Pool, from: bigint, to: bigint) {
  const logs = await paged(from, to, (fromBlock, toBlock) =>
    arc.getLogs({ address: pool.address, event: SWAP, fromBlock, toBlock, strict: true }),
  )
  const times = new Map<bigint, bigint>()
  const path: (Swap & { block: bigint })[] = []
  for (const log of logs) {
    let time = log.blockTimestamp ?? times.get(log.blockNumber)
    if (time === undefined) {
      time = (await arc.getBlock({ blockNumber: log.blockNumber })).timestamp
      times.set(log.blockNumber, time)
    }
    path.push({
      block: log.blockNumber,
      at: new Date(Number(time) * 1000).toISOString(),
      price: swapPrice(log.args.sqrtPriceX96, pool),
      ref: log.transactionHash,
    })
  }
  return blockCloses(path)
}

// The price at a post in block `from`: the close of the last swap before that block, read back a
// page at a time to `floor`.
export async function priceBefore(
  read: (from: bigint, to: bigint) => Promise<Swap[]>,
  from: bigint,
  floor: bigint,
) {
  for (let end = from - 1n; end >= floor; end -= PAGE) {
    const start = end - PAGE + 1n > floor ? end - PAGE + 1n : floor
    const last = (await read(start, end)).at(-1)
    if (last) return last.price
  }
  throw new Error(`no swap in the pool between blocks ${floor} and ${from - 1n}`)
}

export async function registeredCalls(arc: PublicClient, hisaab: Hex, from: bigint, to: bigint) {
  const logs = await paged(from, to, (fromBlock, toBlock) =>
    arc.getContractEvents({
      address: hisaab,
      abi: hisaabAbi,
      eventName: 'CallRegistered',
      fromBlock,
      toBlock,
      strict: true,
    }),
  )
  return logs.flatMap((l) => (l.eventName === 'CallRegistered' ? [l.args.call] : []))
}

export async function hisaabCopies(arc: PublicClient, hisaab: Hex, call: Hex, from: bigint) {
  const info = await arc.readContract({
    address: hisaab,
    abi: hisaabAbi,
    functionName: 'getCall',
    args: [call],
  })
  const copied = await paged(from, await arc.getBlockNumber(), (fromBlock, toBlock) =>
    arc.getContractEvents({
      address: hisaab,
      abi: hisaabAbi,
      eventName: 'Copied',
      args: { call },
      fromBlock,
      toBlock,
      strict: true,
    }),
  )
  const copies = []
  for (let i = 0; i < Number(info.copyCount); i++) {
    const copy = await arc.readContract({
      address: hisaab,
      abi: hisaabAbi,
      functionName: 'getCopy',
      args: [call, BigInt(i)],
    })
    const event = copied.find((e) => e.eventName === 'Copied' && e.args.index === BigInt(i))
    copies.push({ ...copy, payFeeTx: event?.transactionHash })
  }
  return copies
}

// Each Hisaab copy's order from Postgres's `copies`, matched by the transaction that paid its fee.
export function ordersOnRecord(
  onHisaab: { payFeeTx?: Hex }[],
  rows: { payFeeTx: string; flashOrderId: string | null; refusedAt: Date | null }[],
) {
  const orders: (string | null | undefined)[] = []
  const unrecorded: { index: number; payFeeTx?: Hex }[] = []
  onHisaab.forEach(({ payFeeTx }, index) => {
    const row = rows.find((r) => r.payFeeTx === payFeeTx?.toLowerCase())
    if (row?.flashOrderId) orders.push(row.flashOrderId)
    else if (row?.refusedAt) orders.push(null)
    else {
      orders.push(undefined)
      unrecorded.push({ index, payFeeTx })
    }
  })
  return { orders, unrecorded }
}

export async function settledOnHisaab(arc: PublicClient, hisaab: Hex, call: Hex, from: bigint) {
  const to = await arc.getBlockNumber()
  const read = (eventName: 'CopySettled' | 'BatchSettled' | 'SettlementStarted') =>
    paged(from, to, (fromBlock, toBlock) =>
      arc.getContractEvents({
        address: hisaab,
        abi: hisaabAbi,
        eventName,
        args: { call },
        fromBlock,
        toBlock,
        strict: true,
      }),
    )
  const copies = await read('CopySettled')
  const batches = await read('BatchSettled')
  return {
    copies: copies.flatMap((l) => (l.eventName === 'CopySettled' ? [l.args] : [])),
    batches: batches.flatMap((l) => (l.eventName === 'BatchSettled' ? [l.args] : [])),
    txs: [...new Set(batches.map((l) => l.transactionHash))],
  }
}

// A copy's buy and what sells it: the protective order once its bracket is live, and her "close
// now" sell if she sold early.
export async function ordersOf(
  flash: FlashClient,
  orderId: string,
  funder: string,
  closeOrderId?: string | null,
) {
  const buy = await flash.getOrder(orderId, funder)
  const bracket = buy.order.attachedBracket?.bracketOrderId
  const exits = [bracket, closeOrderId].filter((id): id is string => Boolean(id))
  return { buy, exits: await Promise.all(exits.map((id) => flash.getOrder(id, funder))) }
}
