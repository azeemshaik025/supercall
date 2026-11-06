// The settlement loop: every ROUND minutes, settle every ended call from Hisaab's registrations.
import { CHAIN } from '@supercall/chains'
import { whileHolding } from '@supercall/db'
import { formatUnits } from 'viem'
import { keepSettlements } from './lifetimes.ts'
import { registeredCalls } from './read.ts'
import { type Round, settleCall, type Worker } from './settle-call.ts'

const SETTLER_LOCK = 9923

export function createLoop(
  w: Worker,
  log = (e: Record<string, unknown>) => console.log(JSON.stringify(e)),
) {
  let lastExtend = 0

  async function round() {
    log({ event: 'round:lock-acquired' })
    const arc = w.settler.reader
    const from = BigInt(w.chain.hisaabBlock ?? 0)
    log({ event: 'round:rpc', step: 'getBlockNumber' })
    const to = await arc.getBlockNumber()
    log({ event: 'round:rpc', step: 'registeredCalls', from: Number(from), to: Number(to), pages: Math.ceil(Number(to - from) / 10000) })
    const calls = await registeredCalls(arc, w.chain.hisaab, from, to, log)
    if (!calls.length) return log({ event: 'round', calls: 0 })

    log({ event: 'round:rpc', step: 'closesOf', calls: calls.length })
    const closeList = await w.arkiv.closesOf(calls)
    const closes = new Map(closeList.map((c) => [c.call, c]))
    const voided = await w.db.query.voids.findMany({
      where: (v, { inArray }) =>
        inArray(
          v.call,
          calls.map((c) => c.toLowerCase()),
        ),
    })

    const results = []
    for (const call of calls) {
      const close = closes.get(call)
      const v = voided.find((r) => r.call === call.toLowerCase())
      const r: Round = { close, voided: v }
      try {
        results.push(await settleCall(w, call, r))
      } catch (e) {
        const error = (e as Error).message?.split('\n')[0] ?? String(e)
        results.push({ call, error })
      }
    }
    log({ event: 'round', calls: calls.length, results })

    // Gas check.
    const balance = await arc.getBalance({ address: w.settler.address })
    const gas = Number(formatUnits(balance, CHAIN.native.decimals))
    if (gas < 0.2) log({ event: 'low gas', balance: gas, address: w.settler.address })

    // Extend settlements once a day.
    const now = Date.now()
    if (now - lastExtend > 24 * 60 * 60 * 1000) {
      try {
        const extended = await keepSettlements(w.arkiv)
        if (extended.length) log({ event: 'extended', keys: extended })
        lastExtend = now
      } catch (e) {
        const error = (e as Error).message?.split('\n')[0] ?? String(e)
        log({ event: 'extend failed; next round', error })
      }
    }
  }

  return {
    round: () => whileHolding(w.db, SETTLER_LOCK, round),
  }
}
