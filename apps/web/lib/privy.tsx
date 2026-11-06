'use client'

import { type PrivyClientConfig, PrivyProvider } from '@privy-io/react-auth'
import { createConfig, WagmiProvider } from '@privy-io/wagmi'
import { viemChain } from '@supercall/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'
import { http } from 'wagmi'

export const arc = viemChain()

const wagmiConfig = createConfig({
  chains: [arc],
  transports: { [arc.id]: http() },
  ssr: true,
})

const privyConfig: PrivyClientConfig = {
  loginMethods: ['wallet', 'email', 'twitter'],
  defaultChain: arc,
  supportedChains: [arc],
  appearance: { theme: 'dark', walletChainType: 'ethereum-only' },
  embeddedWallets: {
    ethereum: { createOnLogin: 'users-without-wallets' },
    showWalletUIs: false,
  },
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!appId) throw new Error('NEXT_PUBLIC_PRIVY_APP_ID is not set (apps/web/.env.local)')
  return (
    <PrivyProvider appId={appId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}
