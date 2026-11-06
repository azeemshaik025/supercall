import { type Hex, type PublicClient, parseAbiItem } from 'viem'

export type Pool = { address: Hex; coinIsToken0: boolean; coinDecimals: number }

const USDC_DECIMALS = 6

const POOLS: Record<string, Pool> = {
  // WETH/USDC on Aerodrome Slipstream.
  '0x128cc466b61f542da60c70e3aa11c10e19b84edb': {
    address: '0xad5eea00214715cce97cdc4d0d13e9ee2b57eace',
    coinIsToken0: true,
    coinDecimals: 18,
  },
  // cirBTC/USDC on Uniswap v3.
  '0x171a4217b86a807a64eb94757db6849fb4bdbaa0': {
    address: '0x82916bee18fcef517b26c72d7cb5f13694e1db41',
    coinIsToken0: true,
    coinDecimals: 8,
  },
}

export const hasPool = (coin: string) => Object.hasOwn(POOLS, coin.toLowerCase())

export function poolOf(coin: Hex): Pool {
  const pool = POOLS[coin.toLowerCase()]
  if (!pool) throw new Error(`no pool to judge ${coin} on`)
  return pool
}

const Q192 = 2n ** 192n
const SCALE = 10n ** 18n

export function swapPrice(sqrtPriceX96: bigint, pool: Pool) {
  const raw = Number((sqrtPriceX96 * sqrtPriceX96 * SCALE) / Q192) / Number(SCALE)
  const decimals = 10 ** (pool.coinDecimals - USDC_DECIMALS)
  return pool.coinIsToken0 ? raw * decimals : decimals / raw
}

const SLOT0 = parseAbiItem('function slot0() view returns (uint160 sqrtPriceX96)')

export async function priceNow(arc: PublicClient, pool: Pool) {
  const sqrtPriceX96 = await arc.readContract({
    address: pool.address,
    abi: [SLOT0],
    functionName: 'slot0',
  })
  return swapPrice(sqrtPriceX96, pool)
}

export async function blockAt(arc: PublicClient, seconds: number) {
  let low = 0n
  let high = await arc.getBlockNumber()
  while (low < high) {
    const mid = (low + high + 1n) / 2n
    const { timestamp } = await arc.getBlock({ blockNumber: mid })
    if (timestamp <= BigInt(seconds)) low = mid
    else high = mid - 1n
  }
  return low
}

export async function priceAt(arc: PublicClient, pool: Pool, seconds: number) {
  const block = await blockAt(arc, seconds)
  const sqrtPriceX96 = await arc.readContract({
    address: pool.address,
    abi: [SLOT0],
    functionName: 'slot0',
    blockNumber: block,
  })
  return { price: swapPrice(sqrtPriceX96, pool), block }
}
