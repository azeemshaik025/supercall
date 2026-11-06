// Privy, server-side: who is calling, from their access token. Wallets and linked X come
// from Privy's record of the user, never from the request, so nobody can claim an X
// account or a wallet they haven't proven.
import { PrivyClient } from '@privy-io/node'

export interface PrivyIdentity {
  userId: string
  email: string | null
  /** EVM wallets on the account (embedded and linked), lowercase. */
  wallets: string[]
  /** The X account linked through Privy's X login, if any. */
  x: { id: string; username: string; name: string | null; avatarUrl: string | null } | null
}

export class AuthError extends Error {}

/** Reads an identity from a Privy access token. Throws AuthError when it isn't valid. */
export type Identify = (accessToken: string) => Promise<PrivyIdentity>

export function createPrivyIdentify(appId: string, appSecret: string): Identify {
  const privy = new PrivyClient({ appId, appSecret })
  return async (accessToken) => {
    let userId: string
    try {
      ;({ user_id: userId } = await privy.utils().auth().verifyAccessToken(accessToken))
    } catch {
      throw new AuthError('Invalid or expired session')
    }
    const user = await privy.users()._get(userId)
    const wallets: string[] = []
    let email: string | null = null
    let x: PrivyIdentity['x'] = null
    for (const a of user.linked_accounts as unknown as Record<string, unknown>[]) {
      if (a.type === 'wallet' && a.chain_type === 'ethereum' && typeof a.address === 'string') {
        wallets.push(a.address.toLowerCase())
      } else if (a.type === 'email' && typeof a.address === 'string') {
        email = a.address
      } else if (a.type === 'twitter_oauth' && typeof a.username === 'string') {
        x = {
          id: String(a.subject),
          username: a.username,
          name: (a.name as string | null) ?? null,
          avatarUrl: (a.profile_picture_url as string | null) ?? null,
        }
      }
    }
    return { userId, email, wallets, x }
  }
}

/** The bearer token from an Authorization header, or null. */
export const bearer = (header: string | undefined) =>
  header?.startsWith('Bearer ') ? header.slice(7).trim() || null : null
