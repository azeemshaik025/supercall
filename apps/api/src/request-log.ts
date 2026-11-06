import type { MiddlewareHandler } from 'hono'

/**
 * One line per request: method, path, status, milliseconds. Never the query, which can carry a
 * wallet (`/deposits/:orderId?wallet=`), nor headers or bodies. hono/logger keeps the query.
 */
export const requestLog: MiddlewareHandler = async (c, next) => {
  const start = Date.now()
  await next()
  console.log(c.req.method, c.req.path, c.res.status, `${Date.now() - start}ms`)
}
