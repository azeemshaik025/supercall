// Privy in the extension's own pages: the same app as apps/web, so a sign-in here is the same
// account and the same embedded wallet there.
import type { PrivyClientConfig } from '@privy-io/react-auth'
import { viemChain } from '@supercall/chains'

declare const __PRIVY_APP_ID__: string

export const privyAppId = __PRIVY_APP_ID__
export const arc = viemChain()

export const privyConfig: PrivyClientConfig = {
  loginMethods: ['email', 'twitter', 'wallet'],
  defaultChain: arc,
  supportedChains: [arc],
  appearance: { theme: 'dark', walletChainType: 'ethereum-only' },
  embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
}
