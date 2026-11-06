// The API built from the environment. Stripped to the read-side routes; layer-2 routes (publish,
// copy, markets, posts, deposits) add their deps here as they land.
import { createArkiv } from '@supercall/arkiv'
import { createDb } from '@supercall/db'
import { createPrivyIdentify, type WorldEnvironment } from '@supercall/identity'
import { createApp } from './app'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (see .env.example)`)
  return v
}

export const environment = (process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT ??
  'production') as WorldEnvironment
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

const db = createDb()

export const arkiv = createArkiv({
  writer: arkivWriter,
  settler,
  apiKey: process.env.ARKIV_API_KEY,
  project: 'supercall',
  rpcUrl: process.env.ARKIV_RPC_URL,
})

export const app = createApp({
  db,
  identify: createPrivyIdentify(required('NEXT_PUBLIC_PRIVY_APP_ID'), required('PRIVY_APP_SECRET')),
  arkiv,
  webOrigins: (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((o) => o.trim()),
  world: {
    rpId: required('NEXT_PUBLIC_WORLD_RP_ID'),
    signingKey: required('WORLD_RP_SIGNING_KEY'),
    environment,
  },
})
