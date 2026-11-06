// The void watch: while a supercall is open for copying, whether the caller's backing is still
// there, from Flash's record of his orders and his balance on Arc.
import { type CallRecord, fromBps, fromMicroUsdc } from '@supercall/arkiv'
import { CHAIN, poolOf } from '@supercall/chains'
import { type CallType, canMirror } from '@supercall/core'
import { voids, whileHolding } from '@supercall/db'
import type { Order as FlashOrder } from '@supercall/flash'
import { erc20Abi, type Hex, parseUnits } from 'viem'
import type { Worker } from './settle-call.ts'

type Order = { id: string } & Pick<FlashOrder, 'closeReason' | 'qty'> & {
    filled: Pick<NonNullable<FlashOrder['filled']>, 'targetAmount' | 'contraAmount'> | null
  }

const PULLED = ['REASON_USER_REQUESTED', 'REASON_INSUFFICIENT_FUNDER_BALANCE']

export type Void = { reason: string; evidence: Record<string, string> }

export function voidOf(s: {
  type: CallType
  backing: Order
  bracket?: Order
  held: bigint
  decimals: number
  block: bigint
}): Void | 'ended' | undefined {
  const wait = s.type === 'future-level'
  const watched = wait ? s.backing : s.bracket
  if (watched?.closeReason) {
    if (!PULLED.includes(watched.closeReason)) return 'ended'
    return {
      reason: wait ? watched.closeReason : 'bracket',
      evidence: { order: watched.id, closeReason: watched.closeReason },
    }
  }
  const units = (amount: string | null | undefined) => parseUnits(amount ?? '0', s.decimals)
  const needed = wait
    ? units(s.backing.qty) - units(s.backing.filled?.contraAmount)
    : units(s.backing.filled?.targetAmount) - units(s.bracket?.filled?.targetAmount)
  if (s.held >= needed) return undefined
  return {
    reason: wait ? 'balance' : 'coin',
    evidence: {
      order: s.backing.id,
      held: `${s.held}`,
      needed: `${needed}`,
      block: `${s.block}`,
    },
  }
}

const BETWEEN_CANCELS = 200
const WATCH_LOCK = 9924

export async function cancelCopies(w: Pick<Worker, 'db' | 'flash'>, record: CallRecord) {
  const rows = await w.db.query.copies.findMany({
    where: (c, { and, eq, isNotNull }) =>
      and(eq(c.call, record.key.toLowerCase()), isNotNull(c.flashOrderId)),
  })
  let cancelled = 0
  const failed: string[] = []
  for (const { flashOrderId: order, cancelSignature: signature } of rows) {
    if (!order || !signature) continue
    await w.flash.cancelOrder(order, signature).then(
      () => cancelled++,
      () => failed.push(order),
    )
    await new Promise((r) => setTimeout(r, BETWEEN_CANCELS))
  }
  const unsigned =
    record.type === 'future-level'
      ? rows.flatMap((r) => (r.flashOrderId && !r.cancelSignature ? [r.flashOrderId] : []))
      : []
  return { cancelled, failed, unsigned }
}

// ponytail: polls Flash for each open supercall every tick, about 40 of them before it crowds
// settlement's reads under Flash's 5/s. The Orders WebSocket replaces it once D8 is answered.
export function createWatch(
  w: Pick<Worker, 'db' | 'flash' | 'settler' | 'prices' | 'arkiv'>,
  log = (e: Record<string, unknown>) => console.log(JSON.stringify(e)),
) {
  const seen = new Map<Hex, { open: boolean; ended?: boolean; bought?: FlashOrder }>()
  const records = new Map<Hex, CallRecord>()

  async function look(record: CallRecord, backingId: string, block: bigint) {
    const wait = record.type === 'future-level'
    const coin = wait
      ? CHAIN.usdc
      : { address: record.assetAddress, decimals: poolOf(record.assetAddress).coinDecimals }
    const held = await w.settler.reader.readContract({
      address: coin.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [record.wallet],
      blockNumber: block,
    })
    const memo = seen.get(record.key)
    const backing = memo?.bought ?? (await w.flash.getOrder(backingId, record.wallet)).order
    const bracketId = wait ? undefined : (backing.attachedBracket?.bracketOrderId ?? undefined)
    if (bracketId && memo) memo.bought = backing
    const bracket = bracketId && (await w.flash.getOrder(bracketId, record.wallet)).order
    return voidOf({
      type: record.type,
      backing: { ...backing, id: backingId },
      bracket: bracket && bracketId ? { ...bracket, id: bracketId } : undefined,
      held,
      decimals: coin.decimals,
      block,
    })
  }

  async function tick() {
    const open = await w.db.query.backings.findMany({
      where: (b, { gt }) => gt(b.deadline, new Date()),
    })
    if (!open.length) return
    const keys = open.map((b) => b.call)
    const [voided, closed] = await Promise.all([
      w.db.query.voids.findMany({ where: (v, { inArray }) => inArray(v.call, keys) }),
      w.db.query.posts.findMany({
        where: (p, { and, eq, inArray }) => and(eq(p.verdict, 'close'), inArray(p.call, keys)),
      }),
    ])
    const done = new Set([...voided, ...closed].map((r) => r.call))
    const block = await w.settler.reader.getBlockNumber({ cacheTime: 0 })
    for (const backing of open) {
      const key = backing.call as Hex
      const memo = seen.get(key)
      if (done.has(key) || memo?.ended) continue
      try {
        const record = records.get(key) ?? (await w.arkiv.call(key))
        if (!record) throw new Error(`no call record ${key} on Arkiv`)
        records.set(key, record)
        const open = canMirror({
          type: record.type,
          status: 'armed',
          direction: record.direction,
          entry: fromMicroUsdc(record.entry),
          target: fromMicroUsdc(record.target),
          bandPct: fromBps(record.bandBps),
          price: await w.prices.now(poolOf(record.assetAddress)),
        })
        if (!open && !memo?.open) continue
        seen.set(key, { ...memo, open })
        const found = await look(record, backing.order, block)
        if (found === 'ended') seen.set(key, { open: false, ended: true })
        if (!found || found === 'ended') continue
        const [row] = await w.db
          .insert(voids)
          .values({ call: key, at: new Date(), ...found })
          .onConflictDoNothing()
          .returning({ call: voids.call })
        if (row)
          log({
            event: 'void',
            call: key,
            reason: found.reason,
            ...(await cancelCopies(w, record)),
          })
      } catch (e) {
        const error = (e as Error).message?.split('\n')[0] ?? String(e)
        log({ event: 'watch read failed; next tick', call: key, error })
      }
    }
  }

  return {
    tick: () => whileHolding(w.db, WATCH_LOCK, tick),
  }
}
