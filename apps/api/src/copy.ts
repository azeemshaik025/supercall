// A follower copies a call (spec, "Copying"): the same bracket at their own size, from their own
// wallet. The API quotes it on Flash with a fee message beside it, the browser signs both, and
// the API pays the fees into Hisaab, then submits the order and records the copy in Postgres,
// never on Arkiv (spec, "Crowd signals"). The order and the fees are the follower's signatures,
// so no session is needed. The caller backs his own call the same way, from the call's wallet,
// which makes it a supercall.
import {
  backingQuoteRequest,
  backingRequest,
  cancelCopyRequest,
  cancelPermissionRequest,
  closeCopyRequest,
  copyQuoteRequest,
  copyRequest,
  recordCopyRequest,
} from '@supercall/api-schema'
import { type Arkiv, type CallRecord, fromMicroUsdc, toMicroUsdc } from '@supercall/arkiv'
import { CHAIN } from '@supercall/chains'
import { canMirror } from '@supercall/core'
import {
  cancelMessage,
  type FlashClient,
  FlashError,
  type Order as FlashOrder,
  type QuoteRequest,
} from '@supercall/flash'
import type { Identify } from '@supercall/identity'

import { type Context, Hono, type MiddlewareHandler } from 'hono'
import { type Hex, isAddress, isAddressEqual, verifyMessage } from 'viem'
import { type AuthEnv, identityOf, requireAuth } from './auth'
import { isEntityKey, type PriceOf, type Snapshot, toCall } from './calls'
import type { Crowd } from './crowd'
import { type FeePaid, feesOf, type Hisaab, refusal, StillLanding, WriterBusy } from './hisaab'

/** Micro-USDC rounded down to the cent, as Flash's `qty` carries it. */
const cents = (micro: bigint) => (micro / 10_000n) * 10_000n

/**
 * What her buy swaps, in micro-USDC: her size less our platform fee, which Hisaab holds with her
 * call fee, rounded down to the cent.
 */
const swapOf = (size: bigint) => cents(size - feesOf(size).platform)

/**
 * An order for this call that swaps `qty` micro-USDC: a follower's, or the caller's own backing.
 * Built the same way at quote and at submit, so what's submitted is always the call's own levels,
 * whatever the browser sends back.
 */
function orderFor(call: CallRecord, funder: string, qty: bigint): QuoteRequest {
  const levels = toCall(call, undefined, '', undefined)
  const wait = call.type === 'future-level'
  return {
    targetChain: CHAIN.flashChain as QuoteRequest['targetChain'],
    contraChain: CHAIN.flashChain as QuoteRequest['contraChain'],
    targetAsset: call.assetAddress,
    contraAsset: CHAIN.usdc.address,
    side: 'buy',
    qty: fromMicroUsdc(Number(qty)).toFixed(2),
    // Wait for a price: a limit resting at the entry until the deadline. Enter now: at market.
    orderType: wait ? 'limit' : 'market',
    ...(wait
      ? {
          // Flash takes only a pair rate on a limit entry with a bracket; against USDC it's the
          // entry price.
          limitCrossPrice: String(levels.entry),
          expireTime: new Date(call.deadline * 1000).toISOString(),
        }
      : {}),
    funderAddress: funder,
    // Otherwise Flash approves its own contract and the call fee permit has nothing to reuse.
    evmUsePermit2: true,
    // Our platform fee is paid into Hisaab, so Flash takes none: no flashIntegratorFeeBps, which
    // Flash refuses as 0 ("must be a positive decimal").
    attachedBracket: {
      takeProfit: { notionalPrice: String(levels.target) },
      stopLoss: { notionalPrice: String(levels.stop) },
    },
  } as QuoteRequest
}

/**
 * What makes Flash's order not this call's, or undefined when it is. The browser signs the order
 * Flash executes, so this, not the request body, decides what goes on record. `qty` is what it
 * must swap; the caller's own backing may be any size.
 */
function mismatch(order: FlashOrder, call: CallRecord, funder: string, qty?: bigint) {
  const same = (a: string | null | undefined, b: string) => a?.toLowerCase() === b.toLowerCase()
  // Prices compare in record units, so "3400" and "3400.000000" agree.
  const at = (price: string | null | undefined, micro: number | undefined) =>
    price != null && micro !== undefined && toMicroUsdc(Number(price)) === micro
  const wait = call.type === 'future-level'
  if (!same(order.funderAddress, funder)) return 'funder'
  if (qty !== undefined && !at(order.qty, Number(qty))) return 'size'
  if (order.side !== 'buy') return 'side'
  if (!same(order.targetAsset.address, call.assetAddress)) return 'coin'
  if (!same(order.contraAsset.address, CHAIN.usdc.address)) return 'payment coin'
  if (order.orderType !== (wait ? 'limit' : 'market')) return 'order type'
  if (wait && !at(order.limitCrossPrice, call.entry)) return 'entry'
  if (!at(order.attachedBracket?.takeProfit?.notionalPrice, call.target)) return 'target'
  if (!at(order.attachedBracket?.stopLoss?.notionalPrice, call.stop)) return 'stop'
  return undefined
}

/** Flash's record of an order it just accepted, retried briefly in case it isn't readable yet. */
async function placedOrder(flash: FlashClient, orderId: string, funder: string) {
  for (let i = 0; i < 3; i++) {
    try {
      return (await flash.getOrder(orderId, funder)).order
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  return undefined
}

/** Whether a market order Flash placed has filled, read again for a few seconds until it has. */
async function filled(flash: FlashClient, orderId: string, funder: string, order: FlashOrder) {
  const bought = (o: FlashOrder) => Number(o.filled?.targetAmount ?? 0) > 0
  for (let i = 0; i < 3 && !bought(order); i++) {
    await new Promise((r) => setTimeout(r, 1000))
    order = await flash.getOrder(orderId, funder).then(
      (o) => o.order,
      () => order,
    )
  }
  return bought(order)
}

/** A buy Flash won't fill any more. */
const ended = ['ORDER_STATUS_CANCELLED', 'ORDER_STATUS_REJECTED', 'ORDER_STATUS_TERMINATED']

const flashProblem = (e: unknown) =>
  e instanceof FlashError ? { code: e.code, detail: e.message } : undefined

export function copyRoutes(deps: {
  arkiv: Pick<Arkiv, 'call' | 'statusOf' | 'setBands' | 'updateStatus'>
  flash: FlashClient
  priceOf: PriceOf
  /** A wallet's USDC on Arc, in micro-USDC. */
  usdcOf: (wallet: Hex) => Promise<bigint>
  snapshot: Snapshot
  crowd: Crowd
  /** Absent until Hisaab is deployed and the writer key is set; nobody can copy until then. */
  hisaab?: Hisaab
  /** Keeps work running after the response. */
  later?: (work: Promise<unknown>) => void
}) {
  const { arkiv, flash, priceOf, usdcOf, snapshot, crowd, hisaab } = deps
  const later =
    deps.later ??
    ((p: Promise<unknown>) => {
      p.catch(console.error)
    })
  const app = new Hono()
  const closed = (c: Context) =>
    c.json({ code: 'fees_closed', detail: 'Copying opens when Hisaab takes fees' }, 503)

  /**
   * Puts an order Flash placed on record as a copy of this call, with the fee that paid for it,
   * once. The order is read from Flash and checked against the call and the fee, so repeating
   * this is always safe. `pending` means Flash couldn't show the order yet, or Postgres failed:
   * the order stands, and recording it can be retried with `POST /calls/:id/copies/:orderId`.
   */
  async function recordCopy(call: CallRecord, orderId: string, paid: FeePaid) {
    const placed = await placedOrder(flash, orderId, paid.follower)
    if (!placed) return { pending: true as const }
    const wrong = mismatch(placed, call, paid.follower, swapOf(paid.size))
    if (wrong) {
      const detail = `Flash placed this order with a different ${wrong}, so it isn't a copy of this call`
      return { wrong: detail }
    }
    const added = await crowd
      .addCopy({
        payFeeTx: paid.tx,
        call: call.key,
        follower: placed.funderAddress.toLowerCase(),
        // The size Hisaab holds, which settlement reads; Flash swaps it less our platform fee.
        size: Number(paid.size),
        flashOrderId: orderId,
      })
      .catch((e) => console.error('copy not recorded yet', orderId, e))
    if (!added) return { pending: true as const }
    // One fee pays for one copy.
    if (added === 'used') return { used: true as const }
    // Postgres holds the copy, so a band that doesn't land now is set by the call's next copy.
    // An Arkiv write takes seconds, and she needn't wait for it.
    later(
      arkiv
        .setBands(call.key, () => crowd.bands(call.key))
        .then(() => snapshot.stale())
        .catch((e) => console.error('bands not set', call.key, e)),
    )
    return { recorded: true as const }
  }

  /**
   * The answer to a copy Flash placed: recorded, refused, or still to record. `cancel` asks her to
   * sign the cancel of her buy.
   */
  const recorded = (
    c: Context,
    callKey: string,
    orderId: string,
    payFeeTx: Hex,
    r: Awaited<ReturnType<typeof recordCopy>>,
    cancel?: { orderId: string; message: string },
  ) => {
    if ('used' in r)
      return c.json({ code: 'fee_not_this_copy', detail: 'That fee paid for another copy' }, 409)
    if ('wrong' in r)
      return c.json({ code: 'not_this_call', detail: r.wrong, orderId, payFeeTx }, 409)
    if ('pending' in r) {
      const retry = `/calls/${callKey}/copies/${orderId}`
      return c.json({ orderId, payFeeTx, retry, cancel }, 202)
    }
    return c.json({ orderId, payFeeTx, cancel }, 201)
  }

  // Calls registered in Hisaab stay registered: one read of the chain per call, not per copy.
  const registered = new Set<string>()

  // Calls are written read-only, so a call read once never changes. Reading one from Arkiv takes
  // about a second, and every quote and copy needs it.
  const calls = new Map<string, CallRecord>()
  async function callRecord(key: Hex) {
    const known = calls.get(key)
    if (known) return known
    const call = await arkiv.call(key)
    if (call) calls.set(key, call)
    return call
  }

  /**
   * The call if it can be copied right now, or why not. `alongside` starts with the call in hand,
   * while its status and price are checked, and its promise comes back as `alongside`. `funder`,
   * when it's a copy, can't be a wallet on the caller's record: he trades his call by backing it.
   */
  async function copyable<T>(
    id: string,
    alongside?: (call: CallRecord) => Promise<T>,
    funder?: string,
  ) {
    const key = id.toLowerCase()
    const call = isEntityKey(key) ? await callRecord(key) : undefined
    if (!call) return { problem: [404, 'not_found', 'No such call'] as const }
    const own = [409, 'own_call', 'This is your own call: Go super to trade it'] as const
    // The call's wallet is refused before Flash quotes; his other wallets once the snapshot is read.
    if (funder?.toLowerCase() === call.wallet.toLowerCase()) return { problem: own }
    const started = alongside?.(call)
    // Awaited only when the call is copyable; a refusal otherwise stays unhandled.
    started?.catch(() => {})
    const [status, price, voided, caller] = await Promise.all([
      arkiv.statusOf(call.key),
      priceOf(call.assetAddress),
      crowd.voided(call.key),
      // From the snapshot, not a query of its own: Arkiv bills each. If Arkiv can't be read, only
      // the call's own wallet is refused.
      funder
        ? snapshot
            .read()
            .then((s) => s.callerOf(call.caller))
            .catch(() => undefined)
        : undefined,
    ])
    if (caller?.wallets.some((w) => w.toLowerCase() === funder?.toLowerCase()))
      return { problem: own }
    if (voided)
      return { problem: [409, 'void', 'The caller’s backing is gone: this call is void'] as const }
    if (price === undefined)
      return { problem: [503, 'no_price', 'No live price for this coin'] as const }
    const view = toCall(call, status, '', price)
    // Flash is spot: a short is only "sell what you hold" (spec, "Kinds of calls").
    if (call.direction !== 'long')
      return { problem: [409, 'short', 'Short calls aren’t copyable yet'] as const }
    if (call.stop === undefined)
      return { problem: [409, 'no_stop', 'This call has no stop to attach'] as const }
    if (!canMirror(view))
      return { problem: [409, 'closed', 'Copying is closed: price left the entry zone'] as const }
    return { call, status, view, alongside: started as Promise<T> }
  }

  app.post('/:id/copy/quote', async (c) => {
    const body = copyQuoteRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success)
      return c.json({ code: 'bad_request', detail: 'Expected { funder, sizeUsd }' }, 400)
    if (!hisaab) return closed(c)
    const { funder, sizeUsd } = body.data
    // Flash quotes while the call's status and price are checked: a second or two saved.
    const found = await copyable(
      c.req.param('id'),
      (call) => flash.quote(orderFor(call, funder, swapOf(BigInt(toMicroUsdc(sizeUsd))))),
      funder,
    )
    if (found.problem) {
      const [status, code, detail] = found.problem
      return c.json({ code, detail }, status)
    }
    try {
      const quote = await found.alongside
      const size = BigInt(toMicroUsdc(sizeUsd))
      const { fee, platform } = feesOf(size)
      return c.json({
        ...quote,
        fee: {
          ...hisaab.feeMessage(found.call.key, size),
          callFeeUsd: fromMicroUsdc(Number(fee)),
          platformFeeUsd: fromMicroUsdc(Number(platform)),
        },
      })
    } catch (e) {
      const p = flashProblem(e)
      if (p) return c.json(p, 502)
      throw e
    }
  })

  app.post('/:id/copy', async (c) => {
    const body = copyRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success)
      return c.json({ code: 'bad_request', detail: 'Expected the signed quote and fee' }, 400)
    if (!hisaab) return closed(c)
    const { funder, sizeUsd, attachedBracket, fee, ...signatures } = body.data
    const found = await copyable(c.req.param('id'), undefined, funder)
    if (found.problem) {
      const [status, code, detail] = found.problem
      return c.json({ code, detail }, status)
    }
    const { call, status } = found
    const size = BigInt(toMicroUsdc(sizeUsd))

    // The fees first: an order whose fee never landed would be a free copy.
    let paid: FeePaid
    if ('payFeeTx' in fee) {
      // Flash refused her order after her fee landed: that fee pays for this order instead.
      const earlier = await hisaab.feePaid(fee.payFeeTx)
      const fits =
        earlier?.call.toLowerCase() === call.key &&
        isAddressEqual(earlier.follower, funder) &&
        earlier.size === size &&
        // ponytail: two retries within seconds, or a retry after a 5xx Flash had already placed, can
        // both place an order on one fee; only one is recorded. Lock on the fee if anyone does it
        // on purpose; Flash's orders by funder find the other.
        !(await crowd.paidFor(earlier.tx))
      if (!earlier || !fits)
        return c.json(
          {
            code: 'fee_not_this_copy',
            detail: 'That fee didn’t pay for this copy, or paid another',
          },
          409,
        )
      paid = earlier
    } else {
      // Publish couldn't register it (Hisaab was down, or not deployed yet): register it now.
      if (!registered.has(call.key) && !(await hisaab.isRegistered(call.key))) {
        await hisaab
          .registerCall(call)
          .catch((e) => console.error('call not registered yet', call.key, e))
      }
      try {
        paid = await hisaab.payFee({
          call: call.key,
          follower: funder,
          size,
          nonce: BigInt(fee.nonce),
          deadline: BigInt(fee.deadline),
          signature: fee.signature,
        })
        registered.add(call.key)
      } catch (e) {
        if (e instanceof WriterBusy)
          return c.json({ code: 'busy', detail: 'Too many copies at once; try again' }, 503)
        if (e instanceof StillLanding) {
          const detail = 'Your fee hasn’t landed yet; retry with payFeeTx once it has'
          return c.json({ code: 'fee_pending', detail, payFeeTx: e.hash }, 503)
        }
        const reason = refusal(e)
        if (!reason) throw e
        return c.json({ code: 'fee_refused', detail: `Hisaab refused the fee: ${reason}` }, 409)
      }
    }
    // Her fee is on record before Flash is asked, so settlement can tell an order Flash refused
    // from one nobody recorded. Without the row, settlement stops rather than guess.
    await crowd
      .addFee({
        payFeeTx: paid.tx,
        call: call.key,
        follower: paid.follower.toLowerCase(),
        size: Number(paid.size),
      })
      .catch((e) => console.error('fee not on record', paid.tx, e))
    const order = orderFor(call, funder, swapOf(size))

    let orderId: string
    try {
      ;({ orderId } = await flash.submitOrder({
        ...order,
        ...signatures,
        funderAddress: funder,
        attachedBracket: { ...order.attachedBracket, ...attachedBracket },
      } as Parameters<FlashClient['submitOrder']>[0]))
    } catch (e) {
      const p = flashProblem(e)
      if (!p) throw e
      // Only a 4xx is a refusal: a 5xx, a gateway timeout above all, may come after Flash placed it.
      if (e instanceof FlashError && e.status < 500) {
        await crowd
          .refused(paid.tx)
          .catch((err) => console.error('refusal not on record', paid.tx, err))
      }
      return c.json({ ...p, payFeeTx: paid.tx }, 502)
    }

    // The order is placed. Its record is how settlement finds her fills, so it holds what Flash
    // placed, checked against the call's levels.
    const r = await recordCopy(call, orderId, paid)
    // Only a resting buy can be cancelled: an enter-now buy fills at market at once.
    const cancel =
      status?.supercall && call.type === 'future-level'
        ? { orderId, message: cancelMessage(orderId) }
        : undefined
    return recorded(c, call.key, orderId, paid.tx, r, cancel)
  })

  /** The call if its caller can back it now: open for copying, and not backed yet. */
  async function backable<T>(id: string, alongside?: (call: CallRecord) => Promise<T>) {
    const found = await copyable(id, alongside)
    if (found.problem) return found
    if (found.status?.backing)
      return { problem: [409, 'already_backed', 'This call is backed already'] as const }
    return found
  }

  /** Why `wallet`'s USDC doesn't cover `qty` micro-USDC, or undefined when it does. */
  async function unfunded(wallet: Hex, qty: bigint) {
    const held = await usdcOf(wallet)
    if (held >= qty) return undefined
    const usd = (micro: bigint) => `$${fromMicroUsdc(Number(micro)).toFixed(2)}`
    return `Your wallet holds ${usd(held)}; this order needs ${usd(qty)}`
  }

  /**
   * Makes the call a supercall on the caller's order Flash placed, once it's his, on the call's
   * levels, and funded: resting with his USDC covering it on a wait-for-a-price call, filled on an
   * enter-now call. Repeating it is safe.
   */
  async function back(call: CallRecord, statusKey: Hex, orderId: string) {
    const placed = await placedOrder(flash, orderId, call.wallet)
    if (!placed) return { pending: true as const }
    const wrong = mismatch(placed, call, call.wallet)
    if (wrong) {
      return {
        wrong: `Flash placed this order with a different ${wrong}, so it doesn't back this call`,
      }
    }
    // What Flash placed, not what the browser claimed, is what his USDC must cover.
    const qty = BigInt(toMicroUsdc(Number(placed.qty)))
    if (call.type === 'future-level') {
      const short = await unfunded(call.wallet, qty)
      if (short) return { short }
    } else if (!(await filled(flash, orderId, call.wallet, placed))) {
      return { pending: true as const }
    }
    const backing = {
      order: orderId,
      size: Number(qty),
      at: Math.floor(Date.parse(placed.placedAt) / 1000),
    }
    // ponytail: two backings sent at once both pass `backable`, and only one is on record, so the
    // void watch never sees the other order. Check inside Arkiv's write queue if a caller does it
    // on purpose.
    const written = await arkiv
      .updateStatus(statusKey, { supercall: true, backing })
      .then(() => true)
      .catch((e) => console.error('backing not on record yet', call.key, orderId, e))
    if (!written) return { pending: true as const }
    snapshot.stale()
    // The worker's next round copies it from Arkiv if this write is lost.
    await crowd
      .backed({
        call: call.key,
        order: orderId,
        size: backing.size,
        at: new Date(backing.at * 1000),
        deadline: new Date(call.deadline * 1000),
      })
      .catch((e) => console.error('backing not in Postgres yet', call.key, orderId, e))
    return { backed: true as const }
  }

  /** The answer to a backing Flash placed: a supercall, refused, or still to record. */
  const backed = (
    c: Context,
    callKey: string,
    orderId: string,
    r: Awaited<ReturnType<typeof back>>,
  ) => {
    if ('wrong' in r) return c.json({ code: 'not_this_call', detail: r.wrong, orderId }, 409)
    if ('short' in r) return c.json({ code: 'not_funded', detail: r.short, orderId }, 409)
    if ('pending' in r)
      return c.json({ orderId, retry: `/calls/${callKey}/backing/${orderId}` }, 202)
    return c.json({ orderId }, 201)
  }

  // The caller backs his own call (spec, "Calls and supercalls"): his order is the same bracket at
  // his own size, from the call's wallet, with no Hisaab fees.
  app.post('/:id/backing/quote', async (c) => {
    const body = backingQuoteRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ code: 'bad_request', detail: 'Expected { sizeUsd }' }, 400)
    const qty = cents(BigInt(toMicroUsdc(body.data.sizeUsd)))
    const found = await backable(c.req.param('id'), (call) =>
      flash.quote(orderFor(call, call.wallet, qty)),
    )
    if (found.problem) {
      const [status, code, detail] = found.problem
      return c.json({ code, detail }, status)
    }
    try {
      return c.json(await found.alongside)
    } catch (e) {
      const p = flashProblem(e)
      if (p) return c.json(p, 502)
      throw e
    }
  })

  app.post('/:id/backing', async (c) => {
    const body = backingRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success)
      return c.json({ code: 'bad_request', detail: 'Expected the signed quote' }, 400)
    const found = await backable(c.req.param('id'))
    if (found.problem) {
      const [status, code, detail] = found.problem
      return c.json({ code, detail }, status)
    }
    const { call, status } = found
    // A copyable call has a status; this only narrows it.
    if (!status) return c.json({ code: 'closed', detail: 'This call isn’t open for copying' }, 409)
    const { sizeUsd, attachedBracket, ...signatures } = body.data
    const qty = cents(BigInt(toMicroUsdc(sizeUsd)))
    // Checked before Flash is asked, so a short wallet never leaves an order resting.
    if (call.type === 'future-level') {
      const short = await unfunded(call.wallet, qty)
      if (short) return c.json({ code: 'not_funded', detail: short }, 409)
    }
    const order = orderFor(call, call.wallet, qty)
    let orderId: string
    try {
      ;({ orderId } = await flash.submitOrder({
        ...order,
        ...signatures,
        attachedBracket: { ...order.attachedBracket, ...attachedBracket },
      } as Parameters<FlashClient['submitOrder']>[0]))
    } catch (e) {
      const p = flashProblem(e)
      if (p) return c.json(p, 502)
      throw e
    }
    return backed(c, call.key, orderId, await back(call, status.key, orderId))
  })

  /** Makes the call a supercall on a backing Flash already placed, if it is one. Safe to repeat. */
  app.post('/:id/backing/:orderId', async (c) => {
    const found = await copyable(c.req.param('id'))
    if (found.problem) {
      const [status, code, detail] = found.problem
      return c.json({ code, detail }, status)
    }
    const { call, status } = found
    if (!status) return c.json({ code: 'closed', detail: 'This call isn’t open for copying' }, 409)
    const orderId = c.req.param('orderId')
    if (status.backing?.order === orderId) return c.json({ orderId }, 201)
    if (status.backing)
      return c.json({ code: 'already_backed', detail: 'This call is backed already' }, 409)
    return backed(c, call.key, orderId, await back(call, status.key, orderId))
  })

  /**
   * Records an order Flash already placed as a copy of this call, with the fee transaction that
   * paid for it, if it is one. Safe to repeat.
   */
  app.post('/:id/copies/:orderId', async (c) => {
    const body = recordCopyRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ code: 'bad_request', detail: 'Expected { payFeeTx }' }, 400)
    if (!hisaab) return closed(c)
    const id = c.req.param('id').toLowerCase()
    const call = isEntityKey(id) ? await arkiv.call(id) : undefined
    if (!call) return c.json({ code: 'not_found', detail: 'No such call' }, 404)
    const paid = await hisaab.feePaid(body.data.payFeeTx)
    if (paid?.call.toLowerCase() !== call.key)
      return c.json(
        { code: 'fee_not_this_copy', detail: 'That fee wasn’t paid for this call' },
        409,
      )
    const orderId = c.req.param('orderId')
    return recorded(c, call.key, orderId, paid.tx, await recordCopy(call, orderId, paid))
  })

  /**
   * Her signed cancel of her buy (spec, "Copying", signature 7), kept for the worker to submit if
   * the caller's backing goes. Safe to repeat.
   */
  app.post('/:id/copies/:orderId/cancel-permission', async (c) => {
    const body = cancelPermissionRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ code: 'bad_request', detail: 'Expected { signature }' }, 400)
    const orderId = c.req.param('orderId')
    const copy = await crowd.copyByOrder(orderId)
    if (copy?.call !== c.req.param('id').toLowerCase() || !isAddress(copy.follower))
      return c.json({ code: 'not_found', detail: 'No copy with that order on this call' }, 404)
    const { signature } = body.data
    const message = cancelMessage(orderId)
    if (!(await verifyMessage({ address: copy.follower, message, signature }).catch(() => false)))
      return c.json({ code: 'bad_signature', detail: 'Not signed by the wallet that copied' }, 400)
    await crowd.allowCancel(copy.payFeeTx, signature)
    // The watch submits the cancels on record once, after it records the void; one stored after
    // that is submitted here.
    if (await crowd.voided(copy.call)) {
      try {
        await flash.cancelOrder(orderId, signature)
      } catch (e) {
        const p = flashProblem(e)
        if (p) return c.json(p, 502)
        throw e
      }
    }
    return c.body(null, 204)
  })

  return app
}

/**
 * `GET /wallets/:wallet/copies`: one wallet's own copies, with how each order filled, and Close
 * now on them. Followers are private, so each route answers only the signed-in account, about one
 * of its own wallets; any other wallet is not found.
 */
export function walletCopyRoutes(deps: { flash: FlashClient; crowd: Crowd; identify: Identify }) {
  const { flash, crowd } = deps
  const app = new Hono<AuthEnv>()
  // On each route, not app.use: this router is mounted at '/', where '*' would cover every route.
  const auth = requireAuth(deps.identify)
  const own: MiddlewareHandler<AuthEnv> = async (c, next) => {
    const wallet = c.req.param('wallet')?.toLowerCase()
    if (!wallet || !identityOf(c).wallets.includes(wallet)) {
      return c.json({ code: 'not_found', detail: 'Not one of your wallets' }, 404)
    }
    await next()
  }
  app.get('/wallets/:wallet/copies', auth, own, async (c) => {
    const wallet = c.req.param('wallet')
    if (!isAddress(wallet)) return c.json({ code: 'bad_request', detail: 'Not an address' }, 400)
    const rows = await crowd.copiesBy(wallet)
    const copies = await Promise.all(
      rows.map(async (r) => {
        const { fee, platform } = feesOf(BigInt(r.size))
        const order = r.flashOrderId
          ? await flash
              .getOrder(r.flashOrderId, wallet)
              .then((o) => o.order)
              .catch(() => undefined)
          : undefined
        const coin = Number(order?.filled?.targetAmount ?? 0)
        const spent = Number(order?.filled?.contraAmount ?? 0)
        const cancel =
          r.flashOrderId && order && coin === 0 && !ended.includes(order.status)
            ? { message: cancelMessage(r.flashOrderId) }
            : null
        const close = r.closeOrderId
          ? await flash
              .getOrder(r.closeOrderId, wallet)
              .then((o) => o.order)
              .catch(() => undefined)
          : undefined
        return {
          call: r.call,
          payFeeTx: r.payFeeTx,
          orderId: r.flashOrderId,
          closed: r.closeOrderId
            ? {
                orderId: r.closeOrderId,
                status: close?.status ?? null,
                gotUsd: Number(close?.filled?.contraAmount ?? 0),
                // When the sell filled, for the chart's Sold line.
                at: close?.closedAt ?? close?.placedAt ?? null,
              }
            : null,
          sizeUsd: fromMicroUsdc(r.size),
          callFeeUsd: fromMicroUsdc(Number(fee)),
          platformFeeUsd: fromMicroUsdc(Number(platform)),
          at: r.createdAt.toISOString(),
          status: order?.status ?? null,
          cancel,
          fill:
            coin > 0
              ? {
                  coin,
                  spentUsd: spent,
                  price: spent / coin,
                  // When the buy filled: the copy's record can be written later than that.
                  at: order?.closedAt ?? order?.placedAt ?? null,
                }
              : null,
        }
      }),
    )
    return c.json({ copies })
  })

  /** Her copy, if it's hers, bought, and not sold yet: its coin, and the stop and target to cancel. */
  async function closable(wallet: string, payFeeTx: string) {
    const row = await crowd.copy(payFeeTx)
    if (!row?.flashOrderId || row.follower !== wallet.toLowerCase())
      return { problem: [404, 'not_found', 'No such copy from this wallet'] as const }
    if (row.closeOrderId) return { problem: [409, 'closed', 'You sold this copy already'] as const }
    const buy = (await flash.getOrder(row.flashOrderId, wallet)).order
    const coin = buy.filled?.targetAmount
    if (!coin || Number(coin) <= 0)
      return { problem: [409, 'not_filled', 'Your buy hasn’t filled yet'] as const }
    const bracket = buy.attachedBracket?.bracketOrderId
    if (bracket) {
      const exits = (await flash.getOrder(bracket, wallet)).order
      if (Number(exits.filled?.targetAmount ?? 0) > 0)
        return { problem: [409, 'sold', 'Your stop or target sold it already'] as const }
    }
    const order: QuoteRequest = {
      targetChain: CHAIN.flashChain as QuoteRequest['targetChain'],
      contraChain: CHAIN.flashChain as QuoteRequest['contraChain'],
      targetAsset: buy.targetAsset.address,
      contraAsset: CHAIN.usdc.address,
      side: 'sell',
      qty: coin,
      orderType: 'market',
      funderAddress: wallet,
      evmUsePermit2: true,
    } as QuoteRequest
    return { row, order, bracket }
  }

  // Close now (spec, "Copying"): any time after her buy fills, she sells at market. Her stop and
  // target are cancelled after the sell is placed, so she's never left holding without them.
  app.post('/wallets/:wallet/copies/:payFeeTx/close/quote', auth, own, async (c) => {
    const wallet = c.req.param('wallet')
    if (!isAddress(wallet)) return c.json({ code: 'bad_request', detail: 'Not an address' }, 400)
    try {
      const found = await closable(wallet, c.req.param('payFeeTx'))
      if (found.problem) {
        const [status, code, detail] = found.problem
        return c.json({ code, detail }, status)
      }
      const quote = await flash.quote(found.order)
      const cancel = found.bracket
        ? { orderId: found.bracket, message: cancelMessage(found.bracket) }
        : null
      return c.json({ ...quote, cancel })
    } catch (e) {
      const p = flashProblem(e)
      if (p) return c.json(p, 502)
      throw e
    }
  })

  // Cancel (spec, "What Priya can do"): before any of her buy fills, she cancels it with her
  // signature. Her fees come back when the call settles, as a copy that never filled. Her stop and
  // target never activate, so there's nothing else to cancel.
  app.post('/wallets/:wallet/copies/:payFeeTx/cancel', auth, own, async (c) => {
    const wallet = c.req.param('wallet')
    if (!isAddress(wallet)) return c.json({ code: 'bad_request', detail: 'Not an address' }, 400)
    const body = cancelCopyRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ code: 'bad_request', detail: 'Expected { signature }' }, 400)
    const row = await crowd.copy(c.req.param('payFeeTx'))
    if (!row?.flashOrderId || row.follower !== wallet.toLowerCase())
      return c.json({ code: 'not_found', detail: 'No such copy from this wallet' }, 404)
    const { signature } = body.data
    const message = cancelMessage(row.flashOrderId)
    if (!(await verifyMessage({ address: wallet, message, signature }).catch(() => false)))
      return c.json({ code: 'bad_signature', detail: 'Not signed by this wallet' }, 400)
    try {
      const buy = (await flash.getOrder(row.flashOrderId, wallet)).order
      if (Number(buy.filled?.targetAmount ?? 0) > 0)
        return c.json({ code: 'filled', detail: 'Your buy has filled: Close now sells it' }, 409)
      await flash.cancelOrder(row.flashOrderId, signature)
    } catch (e) {
      const p = flashProblem(e)
      if (p) return c.json(p, 502)
      throw e
    }
    return c.body(null, 204)
  })

  app.post('/wallets/:wallet/copies/:payFeeTx/close', auth, own, async (c) => {
    const wallet = c.req.param('wallet')
    if (!isAddress(wallet)) return c.json({ code: 'bad_request', detail: 'Not an address' }, 400)
    const body = closeCopyRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success)
      return c.json({ code: 'bad_request', detail: 'Expected the signed sell' }, 400)
    const { cancelSignature, ...signatures } = body.data
    try {
      const found = await closable(wallet, c.req.param('payFeeTx'))
      if (found.problem) {
        const [status, code, detail] = found.problem
        return c.json({ code, detail }, status)
      }
      const { orderId } = await flash.submitOrder({
        ...found.order,
        ...signatures,
      } as Parameters<FlashClient['submitOrder']>[0])
      await crowd
        .closed(found.row.payFeeTx, orderId)
        .catch((e) => console.error('close not on record', found.row.payFeeTx, orderId, e))
      if (found.bracket && cancelSignature) {
        await flash
          .cancelOrder(found.bracket, cancelSignature)
          .catch((e) => console.error('stop and target not cancelled', found.bracket, e))
      }
      return c.json({ orderId }, 201)
    } catch (e) {
      const p = flashProblem(e)
      if (p) return c.json(p, 502)
      throw e
    }
  })
  return app
}
