// Caller profiles: a chosen username (the public handle) and the X account linked through
// Privy. The X details are copied from Privy on every read of /me, so unlinking or
// relinking X shows up without a separate step.
import type { Db } from '@supercall/db'
import { profiles, worldNullifiers } from '@supercall/db'
import { type Identify, type PrivyIdentity, WORLD_ACTION } from '@supercall/identity'
import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { type AuthEnv, identityOf, requireAuth } from './auth'

const USERNAME = /^[a-z0-9_]{3,20}$/
/** Words that are routes, roles or brand: never handles. */
const RESERVED = new Set([
  'admin',
  'api',
  'c',
  'callers',
  'compose',
  'explore',
  'help',
  'm',
  'markets',
  'me',
  'og',
  'onboarding',
  'profile',
  'root',
  'settings',
  'support',
  'supercall',
  'system',
  'u',
  'world',
])

/** Why a username can't be used, or null when it can. */
export function usernameProblem(name: string): string | null {
  if (!USERNAME.test(name)) return '3–20 characters: lowercase letters, numbers and _'
  if (RESERVED.has(name)) return 'That name is reserved'
  return null
}

type ProfileRow = typeof profiles.$inferSelect

const isUniqueViolation = (e: unknown, constraint: string) => {
  const err =
    (e as { cause?: { code?: string; constraint_name?: string } })?.cause ??
    (e as { code?: string; constraint_name?: string })
  return err?.code === '23505' && (!constraint || err.constraint_name === constraint)
}

const saveBody = z.object({
  username: z.string().trim().toLowerCase(),
  displayName: z.string().trim().max(40).optional(),
  wallet: z.string().optional(),
})

export function profileRoutes(db: Db, identify: Identify) {
  const app = new Hono<AuthEnv>()

  const worldVerified = async (wallets: string[]) =>
    wallets.length > 0 &&
    (
      await db
        .select({ w: worldNullifiers.wallet })
        .from(worldNullifiers)
        .where(
          and(inArray(worldNullifiers.wallet, wallets), eq(worldNullifiers.action, WORLD_ACTION)),
        )
        .limit(1)
    ).length > 0

  const publicView = async (p: ProfileRow) => ({
    username: p.username,
    displayName: p.displayName,
    wallet: p.wallet,
    x: p.xUsername ? { username: p.xUsername, name: p.xName, avatarUrl: p.xAvatarUrl } : null,
    worldVerified: await worldVerified([p.wallet]),
    createdAt: p.createdAt,
  })

  const xColumns = (id: PrivyIdentity) => ({
    xUserId: id.x?.id ?? null,
    xUsername: id.x?.username ?? null,
    xName: id.x?.name ?? null,
    xAvatarUrl: id.x?.avatarUrl ?? null,
  })

  app.get('/profiles/available/:username', async (c) => {
    const name = c.req.param('username').toLowerCase()
    const problem = usernameProblem(name)
    if (problem) return c.json({ available: false, reason: problem })
    const taken = await db
      .select({ u: profiles.username })
      .from(profiles)
      .where(eq(profiles.username, name))
    return c.json({ available: taken.length === 0, reason: taken.length ? 'Taken' : null })
  })

  app.get('/profiles/:username', async (c) => {
    const [p] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.username, c.req.param('username').toLowerCase()))
    if (!p) return c.json({ code: 'not_found', detail: 'No such caller' }, 404)
    return c.json(await publicView(p))
  })

  app.get('/me', requireAuth(identify), async (c) => {
    const id = identityOf(c)
    let [p] = await db.select().from(profiles).where(eq(profiles.privyUserId, id.userId))
    // Keep the X link in step with Privy (linked, relinked or removed since last time).
    if (p && p.xUserId !== (id.x?.id ?? null)) {
      try {
        ;[p] = await db
          .update(profiles)
          .set({ ...xColumns(id), updatedAt: new Date() })
          .where(eq(profiles.privyUserId, id.userId))
          .returning()
      } catch (e) {
        if (!isUniqueViolation(e, 'profiles_x_user_id')) throw e
      }
    }
    return c.json({
      profile: p ? await publicView(p) : null,
      account: { wallets: id.wallets, email: id.email, x: id.x },
      worldVerified: await worldVerified(id.wallets),
    })
  })

  app.put('/me', requireAuth(identify), async (c) => {
    const id = identityOf(c)
    const parsed = saveBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success)
      return c.json({ code: 'bad_request', detail: 'Expected { username }' }, 400)
    const { username, displayName } = parsed.data
    const problem = usernameProblem(username)
    if (problem) return c.json({ code: 'bad_username', detail: problem }, 400)
    const wallet = (parsed.data.wallet ?? id.wallets[0] ?? '').toLowerCase()
    if (!wallet || !id.wallets.includes(wallet)) {
      return c.json(
        { code: 'wallet_not_yours', detail: 'Publish from a wallet on your account' },
        403,
      )
    }
    const values = {
      username,
      displayName: displayName || null,
      wallet,
      ...xColumns(id),
      updatedAt: new Date(),
    }
    try {
      const [p] = await db
        .insert(profiles)
        .values({ privyUserId: id.userId, ...values })
        .onConflictDoUpdate({ target: profiles.privyUserId, set: values })
        .returning()
      if (!p) throw new Error('profile not saved')
      return c.json(await publicView(p))
    } catch (e) {
      if (isUniqueViolation(e, 'profiles_username')) {
        return c.json({ code: 'username_taken', detail: 'That username is taken' }, 409)
      }
      if (isUniqueViolation(e, 'profiles_x_user_id')) {
        return c.json({ code: 'x_in_use', detail: 'That X account backs another profile' }, 409)
      }
      throw e
    }
  })

  return app
}
