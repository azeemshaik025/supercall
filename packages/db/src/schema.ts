import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

export const worldNullifiers = pgTable(
  'world_nullifiers',
  {
    nullifier: numeric('nullifier', { precision: 78, scale: 0 }).notNull(),
    action: text('action').notNull(),
    wallet: text('wallet').notNull(),
    environment: text('environment').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('world_nullifiers_nullifier_action').on(t.nullifier, t.action),
    unique('world_nullifiers_wallet_action').on(t.wallet, t.action),
  ],
)

export const profiles = pgTable(
  'profiles',
  {
    privyUserId: text('privy_user_id').primaryKey(),
    username: text('username').notNull(),
    displayName: text('display_name'),
    wallet: text('wallet').notNull(),
    xUserId: text('x_user_id'),
    xUsername: text('x_username'),
    xName: text('x_name'),
    xAvatarUrl: text('x_avatar_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('profiles_username').on(t.username), unique('profiles_x_user_id').on(t.xUserId)],
)

export const copies = pgTable(
  'copies',
  {
    payFeeTx: text('pay_fee_tx').primaryKey(),
    call: text('call').notNull(),
    follower: text('follower').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    flashOrderId: text('flash_order_id'),
    closeOrderId: text('close_order_id'),
    cancelSignature: text('cancel_signature'),
    refusedAt: timestamp('refused_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('copies_flash_order_id').on(t.flashOrderId),
    index('copies_call').on(t.call),
    index('copies_follower').on(t.follower),
  ],
)

export const voids = pgTable('voids', {
  call: text('call').primaryKey(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  reason: text('reason').notNull(),
  evidence: jsonb('evidence').notNull(),
})

export const backings = pgTable('backings', {
  call: text('call').primaryKey(),
  order: text('order').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  at: timestamp('at', { withTimezone: true }).notNull(),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
})

export const opposeVotes = pgTable(
  'oppose_votes',
  {
    call: text('call').notNull(),
    privyUserId: text('privy_user_id').notNull(),
    wallets: text('wallets').array().notNull(),
    votedAt: timestamp('voted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.call, t.privyUserId] })],
)

export const posts = pgTable(
  'posts',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    text: text('text'),
    verdict: text('verdict', { enum: ['call', 'close', 'not-a-call'] }),
    reason: text('reason'),
    reading: jsonb('reading'),
    call: text('call'),
    readAt: timestamp('read_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [check('posts_verdict', sql`${t.verdict} in ('call', 'close', 'not-a-call')`)],
)

export const notifications = pgTable(
  'notifications',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    wallet: text('wallet').notNull(),
    call: text('call').notNull(),
    kind: text('kind', { enum: ['ending'] }).notNull(),
    what: text('what', {
      enum: ['target', 'stop', 'deadline', 'caller', 'unfired', 'void'],
    }).notNull(),
    price: bigint('price', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    unique('notifications_once').on(t.wallet, t.call, t.kind),
    check('notifications_kind', sql`${t.kind} in ('ending')`),
    check(
      'notifications_what',
      sql`${t.what} in ('target', 'stop', 'deadline', 'caller', 'unfired', 'void')`,
    ),
  ],
)
