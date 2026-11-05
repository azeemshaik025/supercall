import {
  createPrivyClient,
  type VerifyAccessTokenResponse,
  verifyAccessToken,
  verifyWorldId,
} from '@supercall/identity'
import { Hono } from 'hono'
import { z } from 'zod'

type Env = {
  Variables: {
    user: VerifyAccessTokenResponse
  }
}

export function createApp() {
  const privy = createPrivyClient(
    process.env.PRIVY_APP_ID ?? '',
    process.env.PRIVY_APP_SECRET ?? '',
  )

  const app = new Hono<Env>()

  app.get('/health', (c) => c.json({ ok: true }))

  app.use('/api/*', async (c, next) => {
    const header = c.req.header('Authorization')
    if (!header?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401)
    try {
      const claims = await verifyAccessToken(privy, header.slice(7))
      c.set('user', claims)
      await next()
    } catch {
      return c.json({ error: 'invalid token' }, 401)
    }
  })

  const worldIdBody = z.object({
    merkle_root: z.string(),
    nullifier_hash: z.string(),
    proof: z.string(),
    verification_level: z.enum(['orb', 'device']),
    signal: z.string().optional(),
  })

  app.post('/api/worldid/verify', async (c) => {
    const body = worldIdBody.parse(await c.req.json())
    const appId = process.env.WORLD_ID_APP_ID as `app_${string}`
    const result = await verifyWorldId(body, appId, 'verify-caller', body.signal)
    return c.json(result)
  })

  return app
}
