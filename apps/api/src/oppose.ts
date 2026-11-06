// Oppose (spec, "Crowd signals"): a free vote that a call is wrong. No trade, no fee, no score.
import type { Arkiv } from '@supercall/arkiv'
import type { Identify } from '@supercall/identity'
import { Hono } from 'hono'
import { type AuthEnv, identityOf, requireAuth } from './auth'
import { isEntityKey, type Snapshot } from './calls'
import type { Crowd } from './crowd'
import type { Hisaab } from './hisaab'

export function opposeRoutes(deps: {
  arkiv: Arkiv
  crowd: Crowd
  identify: Identify
  snapshot: Snapshot
  hisaab?: Hisaab
}) {
  const { arkiv, crowd, identify, snapshot, hisaab } = deps
  const app = new Hono<AuthEnv>()

  app.post('/:id/oppose', requireAuth(identify), async (c) => {
    const id = c.req.param('id').toLowerCase()
    const call = isEntityKey(id) ? await arkiv.call(id) : undefined
    if (!call) return c.json({ code: 'not_found', detail: 'No such call' }, 404)
    if (call.deadline <= Date.now() / 1000 || (await hisaab?.ended(call.key)))
      return c.json({ code: 'ended', detail: 'This call has ended' }, 409)
    const vote = await crowd.oppose(call.key, identityOf(c))
    if (vote === 'followed') {
      const detail = "You copied this call, so you can't oppose it"
      return c.json({ code: 'followed', detail }, 409)
    }
    if (vote === 'never_copied')
      return c.json({ code: 'never_copied', detail: 'Copy $100 in total before you vote' }, 403)
    await arkiv
      .setBands(call.key, () => crowd.bands(call.key))
      .catch((e) => console.error('bands not set', call.key, e))
    snapshot.stale()
    const { opposeBand } = await crowd.bands(call.key)
    return c.json({ opposeBand }, vote === 'voted' ? 201 : 200)
  })

  return app
}
