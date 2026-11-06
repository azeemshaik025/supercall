// Tells a call's followers it ended, as the worker first sees the ending: "close now" helps a
// follower only while she still holds the coin, so this can't wait for settlement.
import { toMicroUsdc } from '@supercall/arkiv'
import type { Resolution } from '@supercall/core'
import { type Db, notifications } from '@supercall/db'
import type { Hex } from 'viem'

function whatEnded(ending: Resolution, close?: { at: number }) {
  switch (ending.ending) {
    case 'won':
      return 'target'
    case 'lost':
      return 'stop'
    case 'expired-profit':
    case 'expired-loss':
      return close && Date.parse(ending.at) === close.at * 1000 ? 'caller' : 'deadline'
    default:
      return ending.ending
  }
}

export async function notifyEnding(db: Db, call: Hex, ending: Resolution, close?: { at: number }) {
  const copies = await db.query.copies.findMany({
    where: (c, { eq }) => eq(c.call, call.toLowerCase()),
    columns: { follower: true },
  })
  const followers = [...new Set(copies.map((c) => c.follower))]
  if (!followers.length) return
  const what = whatEnded(ending, close)
  const price = 'price' in ending ? toMicroUsdc(ending.price) : null
  await db
    .insert(notifications)
    .values(
      followers.map((wallet): typeof notifications.$inferInsert => ({
        wallet,
        call: call.toLowerCase(),
        kind: 'ending',
        what,
        price,
      })),
    )
    .onConflictDoNothing()
}
