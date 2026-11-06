import { serve } from '@hono/node-server'
import { keepCallersDaily } from './lifetimes.ts'
import { app, arkiv } from './server.ts'

const port = Number(process.env.PORT) || 3001

serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on :${port}`)
})
keepCallersDaily(arkiv)

// Heal: open-type calls that were written as armed before the fix should be live.
arkiv
  .snapshot()
  .then(async ({ calls, statuses }) => {
    const byCall = new Map(statuses.map((s) => [s.call, s]))
    const stale = calls.filter((c) => {
      const st = byCall.get(c.key)
      return c.type === 'open' && st?.status === 'armed'
    })
    for (const call of stale) {
      const st = byCall.get(call.key)!
      await arkiv.updateStatus(st.key, { status: 'live', entryFilledAt: call.createdAt })
      console.log(`healed ${call.key} → live`)
    }
    if (stale.length) console.log(`healed ${stale.length} armed→live call(s)`)
  })
  .catch((e: unknown) => console.error('heal failed:', (e as Error).message))
