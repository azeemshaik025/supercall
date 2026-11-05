// A small typed client for the Definitive Flash REST API. Server-side only: it carries the
// integrator API key, which must never reach a browser.
import type {
  Asset,
  Balance,
  Chain,
  FlashErrorBody,
  GetOrderResponse,
  ListOrdersQuery,
  ListOrdersResponse,
  Order,
  QuoteRequest,
  QuoteResponse,
  SubmitOrderRequest,
  SubmitOrderResponse,
} from './types.ts'

export const FLASH_API = 'https://flash.definitive.fi/v1'

export interface FlashClientOptions {
  apiKey: string
  /** Defaults to the production API. */
  baseUrl?: string
  /**
   * Our fee on every trade, in basis points (max 1000). Sent on quotes and orders alike, as Flash
   * requires the two to match.
   */
  integratorFeeBps?: number
  fetch?: typeof fetch
}

/** A non-2xx answer from Flash, with its error code (for example FAILED_PRECONDITION). */
export class FlashError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(`Flash ${status} ${code}: ${message}`)
    this.name = 'FlashError'
  }

  /** Worth retrying later: rate limited, or Flash is down or slow. */
  get retryable() {
    return this.status === 429 || this.status >= 500
  }
}

export function createFlashClient(options: FlashClientOptions) {
  const base = (options.baseUrl ?? FLASH_API).replace(/\/$/, '')
  const doFetch = options.fetch ?? fetch
  const fee = options.integratorFeeBps
  if (fee !== undefined && !(Number.isInteger(fee) && fee >= 0 && fee <= 1000)) {
    throw new RangeError('integratorFeeBps must be an integer from 0 to 1000')
  }
  const feeField = fee === undefined ? {} : { flashIntegratorFeeBps: String(fee) }

  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: {
        'x-definitive-api-key': options.apiKey,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    const json: unknown = text ? safeJson(text) : null
    if (!res.ok) {
      const err = (json as Partial<FlashErrorBody> | null)?.error
      throw new FlashError(
        res.status,
        err?.code ?? 'UNKNOWN',
        err?.message ?? (text || res.statusText),
        err?.details ?? null,
      )
    }
    return json as T
  }

  return {
    /** Find tradeable assets by symbol, name or address. `limit` is 1 to 25. */
    search(query: string, opts: { chain?: Chain; limit?: number } = {}) {
      const q = new URLSearchParams({ query })
      if (opts.chain) q.set('chain', opts.chain)
      if (opts.limit) q.set('limit', String(opts.limit))
      return call<{ assets: Asset[] }>('GET', `/search?${q}`).then((r) => r.assets)
    },

    /** Price an order and get what the funder must approve and sign. */
    quote(req: QuoteRequest) {
      return call<QuoteResponse>('POST', '/quote', { ...req, ...feeField })
    },

    /** Submit a signed order. Returns its id; read it back with `getOrder`. */
    submitOrder(req: SubmitOrderRequest) {
      return call<SubmitOrderResponse>('POST', '/order', { ...req, ...feeField })
    },

    /** Send one funder-signed entry of `QuoteResponse.setupTxs`. Send them one at a time, in order. */
    submitSetupTransaction(signedSetupTx: string) {
      return call<{ status: 'confirmed' | 'pending' }>('POST', '/setup-transaction', {
        signedSetupTx,
      })
    },

    /** One order with its fills. */
    getOrder(orderId: string, funderAddress: string) {
      const q = new URLSearchParams({ funderAddress })
      return call<GetOrderResponse>('GET', `/orders/${encodeURIComponent(orderId)}?${q}`)
    },

    /** One page of orders, newest first. */
    listOrders(query: ListOrdersQuery = {}) {
      const q = new URLSearchParams()
      if (query.funderAddress) q.set('funderAddress', query.funderAddress)
      if (query.statuses?.length) q.set('statuses', query.statuses.join(','))
      if (query.pageSize) q.set('pageSize', String(query.pageSize))
      if (query.pageToken) q.set('pageToken', query.pageToken)
      const qs = q.toString()
      return call<ListOrdersResponse>('GET', `/orders${qs ? `?${qs}` : ''}`)
    },

    /** Every order matching `query`, following page tokens. */
    async *allOrders(query: Omit<ListOrdersQuery, 'pageToken'> = {}): AsyncGenerator<Order> {
      let pageToken: string | undefined
      do {
        const page = await this.listOrders({ ...query, pageToken })
        yield* page.orders
        pageToken = page.nextPageToken ?? undefined
      } while (pageToken)
    },

    /**
     * Cancel an order with the funder's signature over `cancelMessage(orderId)`. Cancelling an
     * order that is already cancelled also succeeds.
     */
    cancelOrder(orderId: string, userSignature: string) {
      return call<{ ok: true }>('POST', `/orders/${encodeURIComponent(orderId)}/cancel`, {
        cancelMessage: cancelMessage(orderId),
        userSignature,
      })
    },

    /** Token balances of a wallet across Flash's chains. */
    balances(address: string) {
      return call<{ balances: Balance[] }>('GET', `/balances/${encodeURIComponent(address)}`).then(
        (r) => r.balances,
      )
    },
  }
}

export type FlashClient = ReturnType<typeof createFlashClient>

/** The exact text a funder signs (EIP-191 personal_sign on EVM) to cancel an order. */
export function cancelMessage(orderId: string) {
  return `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
