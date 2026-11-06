import type { Arkiv } from '@supercall/arkiv'
import type { Db } from '@supercall/db'
import type { Identify } from '@supercall/identity'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { callerRoutes } from './callers'
import { arkivSnapshot, callRoutes, type PriceOf } from './calls'
import { profileRoutes } from './profiles'
import { type WorldConfig, worldRoutes } from './world'

export function createApp(deps: {
  db: Db
  identify: Identify
  arkiv: Arkiv
  webOrigins: string[]
  world: WorldConfig
}) {
  const app = new Hono()

  app.get('/health', (c) => c.json({ ok: true }))
  app.use(
    '*',
    cors({
      origin: (origin) => (deps.webOrigins.includes(origin) ? origin : null),
      allowHeaders: ['content-type', 'authorization'],
    }),
  )

  // ponytail: noop priceOf until Flash/markets land; calls fall back to entry price.
  const priceOf: PriceOf = async () => undefined
  const snapshot = arkivSnapshot(deps.arkiv)

  app.route('/world', worldRoutes(deps.db, deps.world, deps.identify))
  app.route('/', profileRoutes(deps.db, deps.identify))
  app.route('/calls', callRoutes(deps.arkiv, priceOf, snapshot))
  app.route('/callers', callerRoutes(deps.arkiv, priceOf, snapshot))

  return app
}
