import { PrivyClient, type VerifyAccessTokenResponse } from '@privy-io/node'

export type { VerifyAccessTokenResponse }
export { PrivyClient }

export function createPrivyClient(appId: string, appSecret: string) {
  return new PrivyClient({ appId, appSecret })
}

export async function verifyAccessToken(client: PrivyClient, token: string) {
  return client.utils().auth().verifyAccessToken(token)
}
