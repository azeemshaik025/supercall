import { defineChain } from 'viem'

export type TokenConfig = {
  symbol: string
  address: `0x${string}`
  decimals: number
}

export type ChainConfig = {
  id: number
  name: string
  flashChain: string
  rpcUrl: string
  explorerUrl: string
  native: { symbol: string; decimals: number }
  usdc: { address: `0x${string}`; decimals: number }
  permit2: `0x${string}`
  hisaab?: `0x${string}`
  hisaabBlock?: number
  tradeable: TokenConfig[]
}

export const ARC: ChainConfig = {
  id: 5042,
  name: 'Arc',
  flashChain: 'arc',
  rpcUrl: 'https://rpc.mainnet.arc.io',
  explorerUrl: 'https://explorer.arc.io',
  native: { symbol: 'USDC', decimals: 18 },
  usdc: { address: '0x3600000000000000000000000000000000000000', decimals: 6 },
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  tradeable: [
    { symbol: 'WETH', address: '0x128cc466b61f542da60c70e3aa11c10e19b84edb', decimals: 18 },
    { symbol: 'cirBTC', address: '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0', decimals: 8 },
  ],
}

export const CHAIN = ARC

export type HisaabChain = Omit<ChainConfig, 'flashChain' | 'tradeable' | 'hisaab'> & {
  hisaab: `0x${string}`
}

export const ARC_TESTNET = {
  id: 5042002,
  name: 'Arc Testnet',
  rpcUrl: 'https://rpc.testnet.arc.io',
  explorerUrl: 'https://explorer.testnet.arc.io',
  native: ARC.native,
  usdc: ARC.usdc,
  permit2: ARC.permit2,
  hisaab: '0x0c9c8EddEA11FF8edc314dDFB3923f388Da543C9',
} satisfies HisaabChain

export { hisaabAbi } from './hisaab-abi.ts'
export { blockAt, hasPool, type Pool, poolOf, priceAt, priceNow, swapPrice } from './pools.ts'

export function viemChain(
  c: Omit<ChainConfig, 'flashChain' | 'tradeable'> = CHAIN,
  rpcUrl = c.rpcUrl,
) {
  return defineChain({
    id: c.id,
    name: c.name,
    nativeCurrency: { name: c.native.symbol, symbol: c.native.symbol, decimals: c.native.decimals },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: `${c.name} Explorer`, url: c.explorerUrl } },
  })
}
