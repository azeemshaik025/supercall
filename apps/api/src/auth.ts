// Privy session on a request: `Authorization: Bearer <Privy access token>`.
import { AuthError, bearer, type Identify, type PrivyIdentity } from '@supercall/identity'
import type { Context, MiddlewareHandler } from 'hono'

export type AuthEnv = { Variables: { identity: PrivyIdentity } }

/** Rejects requests without a valid Privy session; puts the identity on the context. */
export function requireAuth(identify: Identify): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const token = bearer(c.req.header('authorization'))
    if (!token) return c.json({ code: 'unauthenticated', detail: 'Sign in first' }, 401)
    try {
      c.set('identity', await identify(token))
    } catch (e) {
      if (e instanceof AuthError) return c.json({ code: 'unauthenticated', detail: e.message }, 401)
      throw e
    }
    await next()
  }
}

export const identityOf = (c: Context<AuthEnv>) => c.get('identity')
