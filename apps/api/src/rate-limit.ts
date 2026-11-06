// Limits on the routes that spend our Flash key, whose quota is 5 requests a second per endpoint
// (packages/flash/AGENTS.md), per sender, so one client in a loop can't spend it for everyone.
import { BlockList, isIP } from 'node:net'
import { getConnInfo } from '@hono/node-server/conninfo'
import type { RateLimitedResponse } from '@supercall/api-schema'
import type { Context, Hono, MiddlewareHandler } from 'hono'

// ponytail: Cloudflare's edges as published on 2026-11-03; refresh from
// https://www.cloudflare.com/ips/ when they add a range, or their new edges count as one sender.
const cloudflare = new BlockList()
for (const range of [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
]) {
  const [net = '', prefix] = range.split('/')
  cloudflare.addSubnet(net, Number(prefix), isIP(net) === 6 ? 'ipv6' : 'ipv4')
}

/**
 * Who sent the request. Traefik doesn't trust the X-Forwarded-For it's sent, so the header's last
 * entry is the hop Traefik saw. Only when that hop is Cloudflare's is CF-Connecting-IP its client;
 * from anywhere else the header is anyone's to forge.
 */
function senderOf(c: Context) {
  const hop = (
    c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim() ||
    getConnInfo(c).remote.address ||
    ''
  ).replace(/^::ffff:(?=\d+\.)/i, '')
  const client = c.req.header('cf-connecting-ip') ?? ''
  const family = isIP(hop) === 6 ? 'ipv6' : 'ipv4'
  const ip = isIP(hop) && cloudflare.check(hop, family) && isIP(client) ? client : hop
  return isIP(ip) === 6 ? slash64(ip) : ip
}

/** The /64 an IPv6 address is in: a phone, or a home, is handed a whole /64 to pick from. */
function slash64(ip: string) {
  const [head, tail] = ip.split('::')
  const groups = head ? head.split(':') : []
  if (tail !== undefined) {
    const after = tail ? tail.split(':').length : 0
    groups.push(...Array<string>(8 - groups.length - after).fill('0'))
  }
  return groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')
}

/** At most `perMinute` requests from one sender in each minute on the clock. */
function rateLimit(perMinute: number): MiddlewareHandler {
  // ponytail: in memory, so it holds for one API instance; a second instance gets its own counts.
  // Move them to Postgres (packages/db/AGENTS.md) before running two.
  const counts = new Map<string, number>()
  let resets = 0
  return async (c, next) => {
    const now = Date.now()
    if (now >= resets) {
      counts.clear()
      resets = (Math.floor(now / 60_000) + 1) * 60_000
    }
    const key = senderOf(c)
    const n = (counts.get(key) ?? 0) + 1
    counts.set(key, n)
    if (n > perMinute) {
      const seconds = Math.ceil((resets - now) / 1000)
      c.header('Retry-After', String(seconds))
      const body = {
        code: 'rate_limited',
        detail: `Too many requests; try again in ${seconds} s`,
        retryAfter: seconds,
      } satisfies RateLimitedResponse
      return c.json(body, 429)
    }
    await next()
  }
}

/** One count for every route that quotes on Flash, and one for reading a wallet's balances. */
export function limitFlash(app: Hono) {
  const quotes = rateLimit(30)
  app.use('/calls/:id/copy/quote', quotes)
  app.use('/calls/:id/backing/quote', quotes)
  app.use('/wallets/:wallet/copies/:payFeeTx/close/quote', quotes)
  app.use('/deposits/quote', quotes)
  app.use('/wallets/:wallet/deposit-tokens', rateLimit(10))
}
