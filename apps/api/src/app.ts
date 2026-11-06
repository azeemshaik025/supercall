import { createPrivyIdentify } from '@supercall/identity'
import { Hono } from 'hono'
import type { AuthEnv } from './auth'

export function createApp() {
  const identify = createPrivyIdentify(
    process.env.PRIVY_APP_ID ?? '',
    process.env.PRIVY_APP_SECRET ?? '',
  )

  const app = new Hono<AuthEnv>()

  app.get('/health', (c) => c.json({ ok: true }))

  return { app, identify }
}
