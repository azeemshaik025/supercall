import { serve } from '@hono/node-server'
import { keepCallersDaily } from './lifetimes.ts'
import { app, arkiv } from './server.ts'

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on :${port}`)
})
keepCallersDaily(arkiv)
