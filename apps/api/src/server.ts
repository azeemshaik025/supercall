// The API built from the environment: reads, publishing, copying, and markets.
import { createArkiv } from '@supercall/arkiv'
import { CHAIN, viemChain } from '@supercall/chains'
import { createDb } from '@supercall/db'
import { createFlashClient } from '@supercall/flash'
import { createPrivyIdentify, type WorldEnvironment } from '@supercall/identity'
import { createPublicClient, erc20Abi, http } from 'viem'
import { createApp } from './app'
import { readerFromEnv } from './ask'
import { createHisaab } from './hisaab'
import { createMarkets } from './market-data/markets'
import { priceIn } from './posts'
import { createXFeed } from './x-feed'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (see .env.example)`)
  return v
}

// Staging until the production World ID app is approved: set it to production to switch.
export const environment = (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT ??
  'staging') as WorldEnvironment
if (environment !== 'production' && environment !== 'staging') {
  throw new Error('NEXT_PUBLIC_WORLD_ENVIRONMENT must be production or staging')
}

const isAddress = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(s)
const arkivWriter = required('ARKIV_WRITER_ADDRESS')
if (!isAddress(arkivWriter)) throw new Error('ARKIV_WRITER_ADDRESS must be an address')

const settlerAddress = process.env.SETTLER_ADDRESS || undefined
if (settlerAddress && !isAddress(settlerAddress))
  throw new Error('SETTLER_ADDRESS must be an address')
const settler = settlerAddress && isAddress(settlerAddress) ? settlerAddress : undefined

const writerKey = process.env.ARKIV_PRIVATE_KEY || undefined
if (writerKey && !/^0x[0-9a-fA-F]{64}$/.test(writerKey))
  throw new Error('ARKIV_PRIVATE_KEY must be a 32-byte hex key')

const isKey = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{64}$/.test(s)
const hisaabKey = process.env.HISAAB_WRITER_KEY || undefined
if (hisaabKey && !isKey(hisaabKey)) throw new Error('HISAAB_WRITER_KEY must be a 32-byte hex key')

const db = createDb()
const arcRpc = process.env.ARC_RPC_URL || CHAIN.rpcUrl
const arc = createPublicClient({ chain: viemChain(CHAIN), transport: http(arcRpc) })

const flash = createFlashClient({ apiKey: required('FLASH_API_KEY') })
const markets = createMarkets(flash)
const reader = readerFromEnv()

export const arkiv = createArkiv({
  writer: arkivWriter,
  settler,
  privateKey: writerKey as `0x${string}` | undefined,
  apiKey: process.env.ARKIV_API_KEY,
  project: 'supercall',
  rpcUrl: process.env.ARKIV_RPC_URL,
})

export const xFeed =
  process.env.X_BEARER_TOKEN && process.env.X_WEBHOOK_ID
    ? createXFeed({ bearer: process.env.X_BEARER_TOKEN, webhookId: process.env.X_WEBHOOK_ID })
    : undefined

export const app = createApp({
  db,
  hisaab:
    CHAIN.hisaab && hisaabKey && isKey(hisaabKey)
      ? createHisaab({
          db,
          chain: { ...CHAIN, hisaab: CHAIN.hisaab, rpcUrl: arcRpc },
          privateKey: hisaabKey,
        })
      : undefined,
  identify: createPrivyIdentify(required('NEXT_PUBLIC_PRIVY_APP_ID'), required('PRIVY_APP_SECRET')),
  markets,
  flash,
  arkiv,
  priceOf: async (address) =>
    (await markets.list().catch(() => [])).find(
      (m) => m.address.toLowerCase() === address.toLowerCase(),
    )?.price,
  usdcOf: (wallet) =>
    arc.readContract({
      address: CHAIN.usdc.address,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [wallet],
    }),
  ask: reader?.ask,
  model: reader?.model ?? 'none',
  xSecret: process.env.X_API_SECRET || undefined,
  xFeed,
  priceAt: priceIn(arc),
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
  world: {
    rpId: required('NEXT_PUBLIC_WORLD_RP_ID'),
    signingKey: required('WORLD_RP_SIGNING_KEY'),
    environment,
  },
})
