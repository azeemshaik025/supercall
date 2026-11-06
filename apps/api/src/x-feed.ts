// X's live feed (the X Activity API, spec "Partners"): our webhook, and one subscription per
// linked caller for each event `/x-events` reads. Public posts need no authorization from the
// caller, only our app's bearer token.

const API = 'https://api.x.com/2'

/** The events `/x-events` reads, each a subscription per caller. */
export const EVENTS = ['post.create', 'post.delete'] as const

export type Webhook = { id: string; url: string; valid: boolean }
export type Subscription = {
  subscription_id: string
  event_type: string
  filter: { user_id?: string }
  webhook_id?: string
}

export function createXFeed(opts: {
  bearer: string
  /** The webhook events are sent to; `register` makes it. Absent, `follow` does nothing. */
  webhookId?: string
  fetch?: typeof fetch
}) {
  const fetcher = opts.fetch ?? fetch

  async function x<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetcher(`${API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${opts.bearer}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`X ${method} ${path}: ${res.status} ${text}`)
    return (text ? JSON.parse(text) : {}) as T
  }

  const subscriptions = async () =>
    (await x<{ data?: Subscription[] }>('GET', '/activity/subscriptions')).data ?? []

  return {
    webhooks: async () => (await x<{ data?: Webhook[] }>('GET', '/webhooks')).data ?? [],
    /** X checks the URL with a CRC challenge before it answers, so `/x-events` must be up. */
    register: async (url: string) =>
      (await x<{ data: Webhook }>('POST', '/webhooks', { url })).data,
    /** Asks X to check the URL again: X stops sending to one that failed a check. */
    recheck: (id: string) => x('PUT', `/webhooks/${id}`),
    subscriptions,

    /**
     * Sends this X account's posts and deletes to our webhook. Safe to repeat: an event already
     * subscribed is skipped.
     */
    async follow(xUserId: string) {
      const webhookId = opts.webhookId
      if (!webhookId) return []
      const have = new Set(
        (await subscriptions())
          .filter((s) => s.filter.user_id === xUserId && s.webhook_id === webhookId)
          .map((s) => s.event_type),
      )
      const missing = EVENTS.filter((e) => !have.has(e))
      for (const event_type of missing) {
        await x('POST', '/activity/subscriptions', {
          event_type,
          filter: { user_id: xUserId },
          webhook_id: webhookId,
          tag: 'supercall',
        })
      }
      return missing
    },
  }
}
export type XFeed = ReturnType<typeof createXFeed>
