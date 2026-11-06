// The API from the extension's own pages. The manifest lists the API's host, so these requests
// skip CORS. Signed-in calls carry Privy's access token.

declare const __API_URL__: string

/** A refusal from the API: `code` says why, the message says it in words. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export async function api<T>(
  path: string,
  { token, method = 'GET', body }: { token?: string | null; method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${__API_URL__}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { code?: string; detail?: string }
  if (!res.ok) {
    throw new ApiError(json.code ?? `http_${res.status}`, json.detail ?? res.statusText, res.status)
  }
  return json as T
}
