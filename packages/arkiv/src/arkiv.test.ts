import {
  type ArkivValue,
  createPublicClient,
  createWalletClient,
  ExpirationTime,
} from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { bytes, defineSchema, i32, key, str } from '@arkiv-network/sdk/schema'
import {
  formatEther,
  type Hex,
  hexToBytes,
  http,
  isAddressEqual,
  keccak256,
  parseEther,
  stringToBytes,
  toHex,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BURN, createArkiv, RABDI_RPC } from './arkiv.ts'
import {
  type CallerPayload,
  type CallPayload,
  type ClosePayload,
  callerTypedData,
  postedCallFingerprint,
  type SettlementPayload,
  settlementFingerprint,
  statusPayload,
} from './records.ts'

const writerKey = process.env.ARKIV_PRIVATE_KEY as Hex | undefined
const liveArkiv = process.env.ARKIV_LIVE_TESTS === '1'
const apiKey = process.env.ARKIV_API_KEY
const chain = rabdi({ accessKey: apiKey ?? '' })
const keyed = () => http(RABDI_RPC, { fetchOptions: { headers: { 'X-API-KEY': apiKey ?? '' } } })
const hour = 3600
const now = () => Math.floor(Date.now() / 1000)
const payloadOf = (value: ArkivValue | undefined) => {
  if (value?.type !== 'bytes') throw new Error('no payload on chain')
  return hexToBytes(value.value)
}

const rajsCall = (callerKey: Hex): CallPayload => ({
  v: 1,
  caller: callerKey,
  wallet: '0x00000000000000000000000000000000000000a1',
  source: 'x',
  post: {
    url: 'https://x.com/synthetic_raj/status/1850000000000000001',
    id: '1850000000000000001',
    authorId: '1700000000000000001',
    text: 'Long ETH 3,000, SL 2,850, TP 3,400, 3 days. Synthetic example post.',
    postedAt: now(),
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
  deadline: now() + hour,
  shareBps: 2474,
  boostBps: 0,
  createdAt: now(),
})

const rajsSettlement = (call: Hex, caller: Hex, previous: Hex | null): SettlementPayload => ({
  v: 1,
  call,
  caller,
  entry: 3000000000,
  stop: 2850000000,
  target: 3400000000,
  direction: 'long',
  ending: {
    kind: 'lost',
    price: 2850000000,
    at: now(),
    pool: '0xad5eea00214715cce97cdc4d0d13e9ee2b57eace',
    txHash: `0x${'5a'.repeat(32)}`,
  },
  fills: { filled: 1, bought: 999000000, sold: 948100000, definitiveFee: 1947000 },
  keptTotal: 0,
  cutBps: 0,
  toCaller: 0,
  toFund: 0,
  toCreditOnly: 0,
  toTreasury: 0,
  creditTotal: 9854145,
  budget: 9854145,
  fund: {
    before: { earned: 100000000, creditOnly: 0, limit: 120000000 },
    after: { earned: 90145855, creditOnly: 0, limit: 67214889 },
  },
  need: { before: { total: 60000000, count: 1000000 }, after: { total: 63854145, count: 1900000 } },
  s: -1000000,
  S: { before: 2000000, after: 960000 },
  W: { before: 1000000, after: 1980000 },
  copies: 1,
  followersNet: -51847151,
  followersProfitable: 0,
  previous,
  hisaabTxs: [`0x${'b1'.repeat(32)}`],
})

async function rajSigns(raj = privateKeyToAccount(generatePrivateKey())): Promise<CallerPayload> {
  const wallet: Hex = `0x${raj.address.slice(2).toLowerCase()}`
  const nullifier: Hex = `0x${'2c'.repeat(32)}`
  const fields = {
    v: 1 as const,
    handle: `synthetic_raj_${Date.now()}`,
    displayName: 'Raj (synthetic)',
    wallet,
    wallets: [wallet],
    x: { id: '1700000000000000001', username: 'synthetic_raj' },
    telegram: null,
    world: { nullifier, action: 'verify-caller', verifiedAt: now() },
    joinedAt: now(),
  }
  return { ...fields, signature: await raj.signTypedData(callerTypedData(fields)) }
}

describe('a status record', () => {
  it('keeps the order Raj backed his supercall with: $500 at 3,000', () => {
    const backed = {
      v: 2,
      call: `0x${'cd'.repeat(32)}`,
      caller: `0x${'ab'.repeat(32)}`,
      asset: 'WETH',
      status: 'armed',
      supercall: true,
      backing: {
        order: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        size: 500_000_000,
        at: 1_790_000_000,
      },
      superFactor: 50,
      boostBps: 0,
      followBand: 'low',
      opposeBand: 'low',
    }

    expect(statusPayload.parse(backed)).toEqual(backed)
  })
})

describe.skipIf(!liveArkiv || !writerKey)('records on Rabdi', () => {
  const privateKey = (writerKey || generatePrivateKey()) as Hex
  const writer = privateKeyToAccount(privateKey).address
  const project = `supercall-test-${Date.now()}`
  const arkiv = createArkiv({ writer, privateKey, apiKey, project })
  const anyone = createPublicClient({ chain, transport: keyed() })
  const someCaller: Hex = `0x${'ab'.repeat(32)}`
  const deletable: Hex[] = []
  afterAll(async () => {
    const cleaner = createWalletClient({
      account: privateKeyToAccount(privateKey),
      chain,
      transport: keyed(),
    })
    if (deletable.length)
      await cleaner.executeBatch({ deletes: deletable.map((entityKey) => ({ entityKey })) })
  }, 60_000)

  it('reads through a client that holds only the writer address, and refuses writes there', async () => {
    const readOnly = createArkiv({ writer, apiKey, project })
    const { key: callKey } = await arkiv.writeCall(rajsCall(someCaller))

    expect(await readOnly.call(callKey)).toMatchObject({ key: callKey })
    await expect(readOnly.writeCall(rajsCall(someCaller))).rejects.toThrow(/read-only/)
  }, 60_000)

  it('refuses even our key when it tries to delete, change, extend or reclaim a call', async () => {
    const { key: callKey } = await arkiv.writeCall(rajsCall(someCaller))
    const us = createWalletClient({
      account: privateKeyToAccount(privateKey),
      chain,
      transport: keyed(),
    })
    const entityKey = callKey

    await expect(us.deleteEntity({ entityKey })).rejects.toThrow(/owned by/)
    const moveStop = stringToBytes(JSON.stringify({ ...rajsCall(someCaller), stop: 2700000000 }))
    const Payload = defineSchema({ payload: bytes() })
    await expect(
      us.patchEntity(Payload, entityKey, { set: { payload: moveStop } }),
    ).rejects.toThrow(/owned by/)
    const longer = ExpirationTime.fromDays(60)
    await expect(us.extendEntity({ entityKey, expiration: longer })).rejects.toThrow(/owned by/)
    await expect(us.changeOwnership({ entityKey, newOwner: writer })).rejects.toThrow(/owned by/)
    expect(await arkiv.call(callKey)).toMatchObject({ stop: 2850000000 })
  }, 120_000)

  it('lands two calls written at once, both burned', async () => {
    const written = await Promise.all([
      arkiv.writeCall(rajsCall(someCaller)),
      arkiv.writeCall({ ...rajsCall(someCaller), asset: 'cirBTC' }),
    ])
    const keys = written.map((w) => w.key)
    expect(new Set(keys).size).toBe(2)
    for (const key of keys) expect(await arkiv.call(key)).toMatchObject({ key })
  }, 120_000)

  it("moves a call's status, and its bands as copies arrive", async () => {
    const { key: callKey } = await arkiv.writeCall(rajsCall(someCaller))
    const posted = {
      v: 2 as const,
      call: callKey,
      caller: someCaller,
      asset: 'WETH',
      status: 'pending' as const,
      supercall: false,
      superFactor: 50,
      boostBps: 0,
      followBand: 'low' as const,
      opposeBand: 'low' as const,
    }
    const key = await arkiv.writeStatus(posted, now() + hour)
    deletable.push(key)
    expect(await arkiv.statusOf(callKey)).toEqual({ key, ...posted })

    await arkiv.updateStatus(key, { status: 'armed' })
    await arkiv.setBands(callKey, async () => ({ followBand: 'medium', opposeBand: 'low' }))
    expect(await arkiv.statusOf(callKey)).toEqual({
      key,
      ...posted,
      status: 'armed',
      followBand: 'medium',
    })
  }, 90_000)

  it("finds Raj's calls by Raj's caller key, and nobody else's", async () => {
    const raj = await arkiv.writeCaller(await rajSigns())
    deletable.push(raj)
    const { key: first } = await arkiv.writeCall(rajsCall(raj))
    const { key: second } = await arkiv.writeCall({ ...rajsCall(raj), asset: 'cirBTC' })
    await arkiv.writeCall(rajsCall(someCaller))

    const found = await arkiv.callsBy(raj)
    expect(found.map((c) => c.key).sort()).toEqual([first, second].sort())
  }, 120_000)

  it('finds open calls by status and asset, the way Explore asks', async () => {
    const statusOf = (status: 'pending' | 'armed', asset: string) => ({
      v: 2 as const,
      call: keccak256(toHex(`${status}-${asset}-${Date.now()}`)),
      caller: someCaller,
      asset,
      status,
      supercall: false,
      superFactor: 50,
      boostBps: 0,
      followBand: 'low' as const,
      opposeBand: 'low' as const,
    })
    const armedEth = await arkiv.writeStatus(statusOf('armed', 'WETH'), now() + hour)
    const pendingEth = await arkiv.writeStatus(statusOf('pending', 'WETH'), now() + hour)
    const armedBtc = await arkiv.writeStatus(statusOf('armed', 'cirBTC'), now() + hour)
    deletable.push(armedEth, pendingEth, armedBtc)

    const keys = (await arkiv.statuses({ status: ['armed', 'live'], asset: 'WETH' })).map(
      (s) => s.key,
    )
    expect(keys).toContain(armedEth)
    expect(keys).not.toContain(pendingEth)
    expect(keys).not.toContain(armedBtc)
  }, 120_000)

  it("reads all 101 of an asset's statuses, past the 100 a page holds", async () => {
    const asset = `PAGED${Date.now()}`
    const Page = defineSchema({
      project: str().indexed(),
      kind: str().indexed(),
      asset: str().indexed(),
      payload: bytes(),
    })
    const status = (n: number) => ({
      v: 2,
      call: keccak256(toHex(`${asset}-${n}`)),
      caller: someCaller,
      asset,
      status: 'armed',
      supercall: false,
      superFactor: 50,
      boostBps: 0,
      followBand: 'low',
      opposeBand: 'low',
    })
    const us = createWalletClient({
      account: privateKeyToAccount(privateKey),
      chain,
      transport: keyed(),
    })
    const batch = (from: number, to: number) =>
      us.executeBatch({
        creates: Array.from({ length: to - from }, (_, i) => ({
          schema: Page,
          values: {
            project,
            kind: 'status',
            asset,
            payload: stringToBytes(JSON.stringify(status(from + i))),
          },
          expiration: ExpirationTime.fromHours(1),
        })),
      })
    const written = [await batch(0, 51), await batch(51, 101)].flatMap((b) => b.createdEntities)

    const keys = (await arkiv.statuses({ asset })).map((s) => s.key)
    expect(keys.sort()).toEqual(written.sort())
  }, 120_000)

  it('ignores a call written by any key but ours', async () => {
    const impostorKey = generatePrivateKey()
    const funder = createWalletClient({
      account: privateKeyToAccount(privateKey),
      chain,
      transport: keyed(),
    })
    const hash = await funder.sendTransaction({
      to: privateKeyToAccount(impostorKey).address,
      value: parseEther('0.001'),
    })
    await anyone.waitForTransactionReceipt({ hash })
    const impostor = createArkiv({
      writer: privateKeyToAccount(impostorKey).address,
      privateKey: impostorKey,
      apiKey,
      project,
    })
    const someone = keccak256(toHex(`someone-${Date.now()}`))

    const { key: forged } = await impostor.writeCall(rajsCall(someone))
    expect(await arkiv.call(forged)).toBeUndefined()
    expect(await arkiv.callsBy(someone)).toEqual([])
  }, 120_000)

  it('ignores a caller record whose signature is not from its wallet', async () => {
    const signed = await rajSigns()
    const someoneElse: Hex = '0x00000000000000000000000000000000000000b2'
    const forged = { ...signed, wallet: someoneElse, wallets: [someoneElse] }
    const key = await arkiv.writeCaller(forged)
    deletable.push(key)

    expect(await arkiv.caller(key)).toBeUndefined()
    expect(await arkiv.callerByHandle(forged.handle)).toBeUndefined()
  }, 60_000)

  it("finds Raj's caller record as signed, by key, handle and wallet", async () => {
    const written = await rajSigns()
    const key = await arkiv.writeCaller(written)
    deletable.push(key)

    const raj = { key, ...written }
    expect(await arkiv.caller(key)).toEqual(raj)
    expect(await arkiv.callerByHandle(written.handle)).toEqual(raj)
    expect(await arkiv.callerByWallet(written.wallet)).toEqual(raj)
  }, 60_000)

  it('reads a call back as written, readonly, owned by nobody', async () => {
    const written = rajsCall(someCaller)
    const { key, fingerprint } = await arkiv.writeCall(written)

    expect(await arkiv.call(key)).toEqual({ key, ...written, fingerprint })
    const onChain = await anyone.getEntity(key)
    expect(onChain.$creationFlags.readonly).toBe(true)
    expect(isAddressEqual(onChain.$owner, BURN)).toBe(true)
    expect(isAddressEqual(onChain.$creator, writer)).toBe(true)
  }, 60_000)

  it('fingerprints a posted call by its payload exactly as stored, as Hisaab anchors it', async () => {
    const { key, fingerprint } = await arkiv.writeCall(rajsCall(someCaller))

    const onChain = await anyone.getEntity(key)
    expect(postedCallFingerprint(payloadOf(onChain.$attributes.payload))).toBe(fingerprint)
    expect(await arkiv.call(key)).toMatchObject({ key, fingerprint })
  }, 60_000)

  it('ends a call with a readonly close nobody can change, found by its call', async () => {
    const { key: call } = await arkiv.writeCall(rajsCall(someCaller))
    const close: ClosePayload = {
      v: 1,
      call,
      caller: someCaller,
      post: {
        url: 'https://x.com/synthetic_raj/status/1850000000000000002',
        id: '1850000000000000002',
        authorId: '1700000000000000001',
        text: "Took profit on ETH here, I'm out. Synthetic example post.",
        postedAt: now(),
      },
      reading: { model: 'synthetic-parser-1' },
      price: 3210000000,
      at: now(),
      pool: '0xad5eea00214715cce97cdc4d0d13e9ee2b57eace',
      block: 41_000_000,
    }
    const key = await arkiv.writeClose(close, now() + hour)

    let found = await arkiv.closeOf(call)
    for (let i = 0; !found && i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      found = await arkiv.closeOf(call)
    }
    expect(found).toEqual({ key, ...close })
    const onChain = await anyone.getEntity(key)
    expect(onChain.$creationFlags.readonly).toBe(true)
    expect(isAddressEqual(onChain.$owner, BURN)).toBe(true)
  }, 120_000)

  describe('settlements', () => {
    const fund = async (key: Hex) => {
      const funder = createWalletClient({
        account: privateKeyToAccount(privateKey),
        chain,
        transport: keyed(),
      })
      const hash = await funder.sendTransaction({
        to: privateKeyToAccount(key).address,
        value: parseEther('0.005'),
      })
      await anyone.waitForTransactionReceipt({ hash })
    }
    const settlerKey = generatePrivateKey()
    const settler = privateKeyToAccount(settlerKey).address
    const settling = createArkiv({ writer, settler, privateKey: settlerKey, apiKey, project })
    const reader = createArkiv({ writer, settler, apiKey, project })
    const fresh = (name: string) => keccak256(toHex(`${name}-${Date.now()}`))
    beforeAll(() => fund(settlerKey), 60_000)

    it("finds Raj's settlement by its call, readonly, burned and extendable by anyone, under the fingerprint of its stored bytes", async () => {
      const call = fresh('call')
      const written = rajsSettlement(call, fresh('raj'), null)
      const { key, fingerprint } = await settling.writeSettlement(written)

      expect(await reader.settlementOf(call)).toEqual({ key, ...written, fingerprint })
      expect((await reader.snapshot()).settlements).toContainEqual({ key, ...written, fingerprint })
      const onChain = await anyone.getEntity(key)
      expect(onChain.$creationFlags.readonly).toBe(true)
      expect(isAddressEqual(onChain.$owner, BURN)).toBe(true)
      expect(isAddressEqual(onChain.$creator, settler)).toBe(true)
      expect(onChain.$creationFlags.permissionlessExtension).toBe(true)
      expect(settlementFingerprint(call, payloadOf(onChain.$attributes.payload))).toBe(fingerprint)
    }, 120_000)

    it("finds Raj's latest settlement: the one none of his others points back to", async () => {
      const raj = fresh('raj')
      const first = await settling.writeSettlement(rajsSettlement(fresh('call'), raj, null))
      const second = await settling.writeSettlement(rajsSettlement(fresh('call'), raj, first.key))

      expect((await reader.latestSettlementBy(raj))?.key).toBe(second.key)
    }, 120_000)

    it("extends Raj's settlement with a day left, from the settler's key though it's burned", async () => {
      const asSettler = createWalletClient({
        account: privateKeyToAccount(settlerKey),
        chain,
        transport: keyed(),
      })
      const Settlement = defineSchema({
        project: str().indexed(),
        kind: str().indexed(),
        v: i32().indexed(),
        payload: bytes(),
        call: key().indexed(),
        caller: key().indexed(),
      })
      const settled = rajsSettlement(fresh('call'), fresh('raj'), null)
      const [next] = await anyone.predictEntityKeys({ owner: settler, count: 1 })
      await asSettler.executeBatch({
        creates: [
          {
            schema: Settlement,
            values: {
              project,
              kind: 'settlement',
              v: 1,
              payload: stringToBytes(JSON.stringify(settled)),
              call: key(settled.call),
              caller: key(settled.caller),
            },
            expiration: ExpirationTime.fromDays(1),
            flags: { readonly: true, permissionlessExtension: true },
            salt: next.salt,
          },
        ],
        ownershipChanges: [{ entityKey: next.key, newOwner: BURN }],
      })
      const longLived = await settling.writeSettlement(
        rajsSettlement(fresh('call'), fresh('raj'), null),
      )
      const expiring = async () => (await reader.settlementsExpiringWithin(30)).map((s) => s.key)

      expect(await expiring()).toEqual([next.key])
      const hash = await settling.extend([next.key])
      const { gasUsed, effectiveGasPrice } = await anyone.getTransactionReceipt({ hash })
      console.log('extension', { hash, gasUsed, tGLM: formatEther(gasUsed * effectiveGasPrice) })

      expect(await expiring()).toEqual([])
      expect((await anyone.getEntity(next.key)).$expiresAt).toBeGreaterThanOrEqual(
        (await anyone.getEntity(longLived.key)).$expiresAt ?? 0n,
      )
    }, 120_000)

    it('ignores a settlement written by the writer key, or by any key but the settler', async () => {
      const call = fresh('call')
      const asWriter = createArkiv({ writer, settler: writer, privateKey, apiKey, project })
      await asWriter.writeSettlement(rajsSettlement(call, fresh('raj'), null))
      const impostorKey = generatePrivateKey()
      await fund(impostorKey)
      const impostor = createArkiv({
        writer,
        settler: privateKeyToAccount(impostorKey).address,
        privateKey: impostorKey,
        apiKey,
        project,
      })
      await impostor.writeSettlement(rajsSettlement(call, fresh('raj'), null))

      expect(await reader.settlementOf(call)).toBeUndefined()
    }, 180_000)

    it("refuses to write a settlement from a client without the settler's key", async () => {
      const call = fresh('call')
      await expect(arkiv.writeSettlement(rajsSettlement(call, fresh('raj'), null))).rejects.toThrow(
        /no settler/,
      )
    })
  })
})
