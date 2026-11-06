// Run by hand when Arkiv writes fail: `pnpm --filter @supercall/arkiv check`. Prints which chain
// the RPC is, whether the writer key matches ARKIV_WRITER_ADDRESS, and the writer's balance there.
// Never prints a key.
import { rabdi } from '@arkiv-network/sdk/chains'
import { createPublicClient, formatEther, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { RABDI_RPC } from './arkiv.ts'

const apiKey = process.env.ARKIV_API_KEY
const url = process.env.ARKIV_RPC_URL || RABDI_RPC
const chain = rabdi({ accessKey: apiKey ?? '' })
const client = createPublicClient({
  chain,
  transport: http(url, apiKey ? { fetchOptions: { headers: { 'X-API-KEY': apiKey } } } : {}),
})

const key = process.env.ARKIV_PRIVATE_KEY as `0x${string}` | undefined
const writer = process.env.ARKIV_WRITER_ADDRESS as `0x${string}` | undefined
const fromKey = key ? privateKeyToAccount(key).address : undefined

console.log('RPC            ', new URL(url).host)
console.log('chain id       ', await client.getChainId(), `(expected ${chain.id})`)
console.log('writer address ', writer ?? 'not set')
console.log('key matches it ', fromKey ? fromKey.toLowerCase() === writer?.toLowerCase() : 'no key')
if (writer) {
  const balance = await client.getBalance({ address: writer })
  console.log('writer balance ', formatEther(balance), chain.nativeCurrency.symbol)
  if (balance === 0n)
    console.log('→ The writer has no funds: Arkiv writes will fail. Fund it from the Rabdi faucet.')
}
