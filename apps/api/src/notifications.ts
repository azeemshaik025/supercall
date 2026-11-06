// A follower's bell: the rows the worker writes as calls she copied end (spec, "Endings"). Like her
// copies, each route answers only the signed-in account, about one of its own wallets.
import {
  type NotificationsResponse,
  type ReadNotificationsResponse,
  readNotificationsRequest,
} from '@supercall/api-schema'
import { fromMicroUsdc } from '@supercall/arkiv'
import { type Db, notifications } from '@supercall/db'
import type { Identify } from '@supercall/identity'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { Hono, type MiddlewareHandler } from 'hono'
import { type AuthEnv, identityOf, requireAuth } from './auth'

/** The bell shows this many, newest first. */
const SHOWN = 50

export function notificationRoutes(deps: { db: Db; identify: Identify }) {
  const { db } = deps
  const app = new Hono<AuthEnv>()
  const auth = requireAuth(deps.identify)
  const own: MiddlewareHandler<AuthEnv> = async (c, next) => {
    const wallet = c.req.param('wallet')?.toLowerCase()
    if (!wallet || !identityOf(c).wallets.includes(wallet)) {
      return c.json({ code: 'not_found', detail: 'Not one of your wallets' }, 404)
    }
    await next()
  }

  app.get('/wallets/:wallet/notifications', auth, own, async (c) => {
    const rows = await db.query.notifications.findMany({
      where: (n, { eq }) => eq(n.wallet, c.req.param('wallet').toLowerCase()),
      orderBy: (n, { desc }) => [desc(n.createdAt), desc(n.id)],
      limit: SHOWN,
    })
    return c.json({
      notifications: rows.map((r) => ({
        id: r.id,
        call: r.call,
        kind: r.kind,
        what: r.what,
        price: r.price === null ? null : fromMicroUsdc(r.price),
        at: r.createdAt.toISOString(),
        readAt: r.readAt?.toISOString() ?? null,
      })),
    } satisfies NotificationsResponse)
  })

  app.post('/wallets/:wallet/notifications/read', auth, own, async (c) => {
    const body = readNotificationsRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ code: 'bad_request', detail: 'Expected { ids }' }, 400)
    const read = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.wallet, c.req.param('wallet').toLowerCase()),
          inArray(notifications.id, body.data.ids),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id })
    return c.json({ read: read.map((r) => r.id) } satisfies ReadNotificationsResponse)
  })

  return app
}
