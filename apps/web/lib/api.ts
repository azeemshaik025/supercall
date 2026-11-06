// The API, from the browser. Signed-in calls carry Privy's access token; the API checks it.

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

/** A refusal from the API: its `code` says why, `detail` says it in words. */
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
  const res = await fetch(`${API}${path}`, {
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
