// The crowd behind a call (spec, "Crowd signals"): its copies and Oppose votes. They name
// followers, so they live in Postgres, never on Arkiv.
import type { Band } from '@supercall/core'
import { backings, copies, type Db, opposeVotes, voids } from '@supercall/db'
import { and, arrayContains, count, desc, eq, inArray, isNotNull, isNull, sum } from 'drizzle-orm'

/** A fee that landed in Hisaab: who paid it, for which call, on what size. */
export type Fee = Pick<typeof copies.$inferInsert, 'payFeeTx' | 'call' | 'follower' | 'size'>

/** Where medium, high and superhigh start. Ours alone: screens get only the band. */
const CUT_OFFS = {
  /** Dollars copied, in micro-USDC: $1,000, $10,000, $50,000. */
  follow: [1_000_000_000, 10_000_000_000, 50_000_000_000],
  /** Oppose votes. */
  oppose: [5, 20, 50],
} as const

/** What an account's wallets must have copied in total, across all calls, to vote: $100. */
const VOTER_MINIMUM = 100_000_000

const bandOf = (n: number, [medium, high, superhigh]: readonly [number, number, number]): Band =>
  n >= superhigh ? 'superhigh' : n >= high ? 'high' : n >= medium ? 'medium' : 'low'

/** A copy counts once its order is on record (spec, "Crowd signals"). */
const ordered = isNotNull(copies.flashOrderId)

export function crowdOf(db: Db) {
  return {
    /** Puts a fee on record as it lands, before Flash is asked for the order it pays for. */
    async addFee(fee: Fee) {
      await db.insert(copies).values(fee).onConflictDoNothing()
    },

    /** Flash refused the order this fee was for: unless another order takes it, it bought nothing. */
    async refused(payFeeTx: string) {
      await db
        .update(copies)
        .set({ refusedAt: new Date() })
        .where(and(eq(copies.payFeeTx, payFeeTx), isNull(copies.flashOrderId)))
    },

    /**
     * Records the order a fee paid for, once, withdrawing her vote against the call. `repeat`: this
     * fee and this order are on record together already. `used`: either one is on record with
     * another.
     */
    async addCopy(copy: Fee & { flashOrderId: string }) {
      return db.transaction(async (tx) => {
        const [order] = await tx
          .select({ payFeeTx: copies.payFeeTx })
          .from(copies)
          .where(eq(copies.flashOrderId, copy.flashOrderId))
        if (order) return order.payFeeTx === copy.payFeeTx ? ('repeat' as const) : ('used' as const)
        const [row] = await tx
          .insert(copies)
          .values(copy)
          .onConflictDoUpdate({
            target: copies.payFeeTx,
            set: { flashOrderId: copy.flashOrderId, refusedAt: null },
            setWhere: isNull(copies.flashOrderId),
          })
          .returning({ payFeeTx: copies.payFeeTx })
        // This fee paid for another order already.
        if (!row) return 'used' as const
        await tx
          .delete(opposeVotes)
          .where(
            and(
              eq(opposeVotes.call, copy.call),
              arrayContains(opposeVotes.wallets, [copy.follower]),
            ),
          )
        return 'added' as const
      })
    },

    /** The call's bands, from its copies and votes now. */
    async bands(call: string) {
      const [[copied], [opposed]] = await Promise.all([
        db
          .select({ size: sum(copies.size).mapWith(Number) })
          .from(copies)
          .where(and(eq(copies.call, call), ordered)),
        db.select({ votes: count() }).from(opposeVotes).where(eq(opposeVotes.call, call)),
      ])
      return {
        followBand: bandOf(copied?.size ?? 0, CUT_OFFS.follow),
        opposeBand: bandOf(opposed?.votes ?? 0, CUT_OFFS.oppose),
      }
    },

    /** One Oppose vote from this account (spec, "Crowd signals"), or why it can't vote. */
    async oppose(call: string, account: { userId: string; wallets: string[] }) {
      const wallets = account.wallets.map((w) => w.toLowerCase())
      const [followed] = await db
        .select({ payFeeTx: copies.payFeeTx })
        .from(copies)
        .where(and(eq(copies.call, call), inArray(copies.follower, wallets), ordered))
        .limit(1)
      if (followed) return 'followed' as const
      const [copied] = await db
        .select({ size: sum(copies.size).mapWith(Number) })
        .from(copies)
        .where(and(inArray(copies.follower, wallets), ordered))
      if ((copied?.size ?? 0) < VOTER_MINIMUM) return 'never_copied' as const
      // ponytail: a copy landing between the check above and this insert leaves her in both
      // bands. Lock on the call if anyone does it on purpose.
      const [voted] = await db
        .insert(opposeVotes)
        .values({ call, privyUserId: account.userId, wallets })
        .onConflictDoNothing()
        .returning({ call: opposeVotes.call })
      return voted ? ('voted' as const) : ('repeat' as const)
    },

    /** One wallet's copies with an order on record, newest first. */
    async copiesBy(follower: string) {
      return db
        .select({
          payFeeTx: copies.payFeeTx,
          call: copies.call,
          size: copies.size,
          flashOrderId: copies.flashOrderId,
          closeOrderId: copies.closeOrderId,
          createdAt: copies.createdAt,
        })
        .from(copies)
        .where(and(eq(copies.follower, follower.toLowerCase()), ordered))
        .orderBy(desc(copies.createdAt))
        .limit(100)
    },

    /** One copy by the fee that paid for it. */
    async copy(payFeeTx: string) {
      const [row] = await db.select().from(copies).where(eq(copies.payFeeTx, payFeeTx))
      return row
    },

    /** One copy by the Flash order it bought. */
    async copyByOrder(flashOrderId: string) {
      const [row] = await db.select().from(copies).where(eq(copies.flashOrderId, flashOrderId))
      return row
    },

    /** Her signed cancel of her buy, for the worker to submit on a void. */
    async allowCancel(payFeeTx: string, cancelSignature: string) {
      await db.update(copies).set({ cancelSignature }).where(eq(copies.payFeeTx, payFeeTx))
    },

    /** The caller's backing, for the worker's void watch, once Arkiv's status record holds it. */
    async backed(backing: typeof backings.$inferInsert) {
      await db.insert(backings).values(backing).onConflictDoNothing()
    },

    /** Whether the void watch found the call's backing gone (spec, "Safety rules"). */
    async voided(call: string) {
      const [row] = await db.select({ at: voids.at }).from(voids).where(eq(voids.call, call))
      return row !== undefined
    },

    /** Every call the void watch found void. */
    async voids() {
      return (await db.select({ call: voids.call }).from(voids)).map((v) => v.call)
    },

    /** She sold before the call ended: her sell, once. False if a close is on record already. */
    async closed(payFeeTx: string, closeOrderId: string) {
      const rows = await db
        .update(copies)
        .set({ closeOrderId })
        .where(and(eq(copies.payFeeTx, payFeeTx), isNull(copies.closeOrderId)))
        .returning({ payFeeTx: copies.payFeeTx })
      return rows.length > 0
    },

    /** Whether this fee paid for an order on record. */
    async paidFor(payFeeTx: string) {
      const [found] = await db
        .select({ payFeeTx: copies.payFeeTx })
        .from(copies)
        .where(and(eq(copies.payFeeTx, payFeeTx), ordered))
      return found !== undefined
    },
  }
}

export type Crowd = ReturnType<typeof crowdOf>
