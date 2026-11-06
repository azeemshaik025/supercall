import type { Arkiv } from '@supercall/arkiv'
import type { Db } from '@supercall/db'
import type { FlashClient } from '@supercall/flash'
import type { Identify } from '@supercall/identity'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { callerRoutes } from './callers'
import { arkivSnapshot, callRoutes, type PriceOf } from './calls'
import { copyRoutes, walletCopyRoutes } from './copy'
import { crowdOf } from './crowd'
import type { Hisaab } from './hisaab'
import type { createMarkets } from './market-data/markets'
import { marketRoutes } from './markets'
import { profileRoutes } from './profiles'
import { publishRoutes } from './publish'
import { limitFlash } from './rate-limit'
import { requestLog } from './request-log'
import { type WorldConfig, worldRoutes } from './world'
import type { XFeed } from './x-feed'

export function createApp(deps: {
  db: Db
  identify: Identify
  world: WorldConfig
  markets: ReturnType<typeof createMarkets>
  flash: FlashClient
  arkiv: Arkiv
  hisaab?: Hisaab
  priceOf: PriceOf
  usdcOf: (wallet: `0x${string}`) => Promise<bigint>
  webOrigins: string[]
  xFeed?: XFeed
}) {
  const app = new Hono()
  app.get('/health', (c) => c.json({ ok: true }))
  app.use(requestLog)
  app.use(
    '*',
    cors({
      origin: (origin) => (deps.webOrigins.includes(origin) ? origin : null),
      allowHeaders: ['content-type', 'authorization'],
    }),
  )
  limitFlash(app)
  app.route('/world', worldRoutes(deps.db, deps.world, deps.identify))
  app.route('/', profileRoutes(deps.db, deps.identify))
  app.route('/markets', marketRoutes(deps.markets))
  const crowd = crowdOf(deps.db)
  const snapshot = arkivSnapshot(deps.arkiv, crowd.voids)
  app.route('/', publishRoutes({ ...deps, snapshot }))
  app.route('/calls', callRoutes(deps.arkiv, deps.priceOf, snapshot))
  app.route('/calls', copyRoutes({ ...deps, snapshot, crowd }))
  app.route('/', walletCopyRoutes({ ...deps, crowd }))
  app.route('/callers', callerRoutes(deps.arkiv, deps.priceOf, snapshot))
  return app
}
