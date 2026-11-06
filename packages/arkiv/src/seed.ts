// Seeds one synthetic caller and one open call into project "supercall" on Rabdi, so the
// screens show real records. Safe to rerun: it reuses Raj and his call if they're on record.
// Run: npx --yes pnpm@11.9.0 --filter @supercall/arkiv seed
import { type Hex, isHex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createArkiv } from './arkiv.ts'
import { callerTypedData } from './records.ts'
import { toBps } from './units.ts'

const key = process.env.ARKIV_PRIVATE_KEY ?? ''
if (!isHex(key)) throw new Error('ARKIV_PRIVATE_KEY is not set (see .env.example)')
const arkiv = createArkiv({
  writer: privateKeyToAccount(key).address,
  privateKey: key,
  apiKey: process.env.ARKIV_API_KEY,
  project: 'supercall',
  rpcUrl: process.env.ARKIV_RPC_URL,
})
const now = Math.floor(Date.now() / 1000)
const day = 86_400

// Synthetic Raj, signed by the throwaway test key 0x11…11. Nobody real.
const raj = privateKeyToAccount(`0x${'11'.repeat(32)}`)
const wallet: Hex = `0x${raj.address.slice(2).toLowerCase()}`

// shareFor(50) = 0.2474…, but we inline the bps to avoid a core dependency in the seed.
const shareBps = toBps(0.2474873734152916)

let caller = await arkiv.callerByHandle('synthetic_raj')
if (!caller) {
  const fields = {
    v: 1 as const,
    handle: 'synthetic_raj',
    displayName: 'Raj (synthetic)',
    wallet,
    wallets: [wallet],
    x: { id: '1700000000000000001', username: 'synthetic_raj' },
    telegram: null,
    world: { nullifier: `0x${'2c'.repeat(32)}` as const, action: 'verify-caller', verifiedAt: now },
    joinedAt: now,
  }
  const signature = await raj.signTypedData(callerTypedData(fields))
  await arkiv.writeCaller({ ...fields, signature })
  caller = await arkiv.callerByHandle('synthetic_raj')
}
if (!caller) throw new Error('the seeded caller did not read back')
console.log('caller', caller.key)

const [existing] = await arkiv.callsBy(caller.key)
if (existing) {
  console.log('call', existing.key, '(already on record)')
} else {
  const deadline = now + 3 * day
  const { key: callKey } = await arkiv.writeCall({
    v: 1,
    caller: caller.key,
    wallet,
    source: 'x',
    post: {
      url: 'https://x.com/synthetic_raj/status/1850000000000000001',
      id: '1850000000000000001',
      authorId: '1700000000000000001',
      text: 'Long ETH 3,000, SL 2,850, TP 3,400, 3 days. Synthetic example post.',
      postedAt: now,
    },
    reading: { model: 'synthetic-parser-1' },
    asset: 'WETH',
    assetAddress: '0x128cc466b61f542da60c70e3aa11c10e19b84edb',
    chain: 'arc',
    type: 'future-level',
    direction: 'long',
    entry: 3000000000,
    bandBps: 50,
    stop: 2850000000,
    target: 3400000000,
    deadline,
    shareBps,
    boostBps: 0,
    createdAt: now,
  })
  await arkiv.writeStatus(
    {
      v: 2,
      call: callKey,
      caller: caller.key,
      asset: 'WETH',
      status: 'armed',
      supercall: false,
      superFactor: 50,
      boostBps: 0,
      followBand: 'low',
      opposeBand: 'low',
    },
    deadline,
  )
  console.log('call', callKey)
}
