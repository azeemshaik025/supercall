// Writes and reads the records in arkiv/schema.md. A read returns a record only when it passes
// that file's checks ("How a reader checks a record"); anything else reads as missing.
import {
  type ArkivValue,
  createPublicClient,
  createWalletClient,
  ExpirationTime,
  NoEntityFoundError,
  type ResolvedCreationFlags,
} from '@arkiv-network/sdk'
import { rabdi } from '@arkiv-network/sdk/chains'
import { asc, type Expression, eq, gt, lte, MAX_LIMIT, or } from '@arkiv-network/sdk/query'
import { addr, bytes, defineSchema, i32, key, str, u64 } from '@arkiv-network/sdk/schema'
import {
  type Address,
  BaseError,
  bytesToString,
  ContractFunctionRevertedError,
  custom,
  type Hex,
  hexToBytes,
  http,
  isAddressEqual,
  stringToBytes,
  toHex,
  verifyTypedData,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  type CallerPayload,
  type CallerRecord,
  type CallPayload,
  type ClosePayload,
  callerPayload,
  callerTypedData,
  callPayload,
  callTypedData,
  closePayload,
  fingerprintOf,
  type SettlementPayload,
  type StatusPayload,
  settlementFingerprint,
  settlementPayload,
  statusPayload,
} from './records.ts'

/** Owner of every call and settlement: nobody holds its key, so nobody can delete them. */
export const BURN = '0x000000000000000000000000000000000000dEaD'

const DAY = 86_400
/** Half a day under Rabdi's cap of 7,884,000 blocks, 182.5 days (arkiv/friction.md). */
const LONGEST = ExpirationTime.fromDays(182)
/** The RPC when ARKIV_RPC_URL is unset. The key never goes in a URL: viem prints it in errors. */
export const RABDI_RPC = 'https://rpc.rabdi.db-chain.testnet.arkiv.network'

// Each record's JSON is the `payload` column; the rest are the attributes queries filter on
// (arkiv/schema.md).
const common = {
  project: str().indexed(),
  kind: str().indexed(),
  v: i32().indexed(),
  payload: bytes(),
}
const CallerSchema = defineSchema({
  ...common,
  handle: str().indexed(),
  wallet: addr().indexed(),
  nullifier: str().indexed(),
})
const CallSchema = defineSchema({ ...common, caller: key().indexed(), asset: str().indexed() })
const CloseSchema = defineSchema({ ...common, call: key().indexed(), caller: key().indexed() })
const StatusSchema = defineSchema({
  ...common,
  call: key().indexed(),
  caller: key().indexed(),
  asset: str().indexed(),
  status: str().indexed(),
  super_factor: i32().indexed(),
  boost_bps: i32().indexed(),
})
const SettlementSchema = defineSchema({ ...common, call: key().indexed(), caller: key().indexed() })

const toPayload = (record: object) => stringToBytes(JSON.stringify(record))

/** A record as both a lookup by key and a query return it. */
type Found = { key: Hex; owner: Hex; creationFlags: ResolvedCreationFlags; payload: Uint8Array }

/** A record without a payload isn't one of ours, so it reads as missing. */
const found = (
  e: { $key: Hex; $owner: Hex; $creationFlags: ResolvedCreationFlags },
  payload: ArkivValue | undefined,
): Found | undefined =>
  payload?.type === 'bytes'
    ? {
        key: e.$key,
        owner: e.$owner,
        creationFlags: e.$creationFlags,
        payload: hexToBytes(payload.value),
      }
    : undefined

const json = (e: Found): unknown => JSON.parse(bytesToString(e.payload))

type CallerOf = (callerKey: Hex) => Promise<CallerRecord | undefined> | CallerRecord | undefined

// A call written in the app also carries its caller's signature over the levels, from a wallet
// on their caller record; otherwise our key could attach any wallet's signature to their call.
async function asCall(e: Found, callerOf: CallerOf) {
  if (!e.creationFlags.readonly || !isAddressEqual(e.owner, BURN)) return undefined
  const c = callPayload.parse(json(e))
  if (c.source === 'app') {
    const caller = await callerOf(c.caller)
    if (!caller?.wallets.includes(c.wallet)) return undefined
    const { signature, ...fields } = c
    const signed = await verifyTypedData({ address: c.wallet, signature, ...callTypedData(fields) })
    if (!signed) return undefined
  }
  return { key: e.key, ...c, fingerprint: fingerprintOf(c, e.payload) }
}

// ponytail: EOA signatures only. A contract wallet (ERC-1271) needs viem's client-side
// verifyTypedData against Arc; add it when a caller signs from one.
async function asCaller(e: Found) {
  const c = callerPayload.parse(json(e))
  const signed =
    c.wallets.includes(c.wallet) &&
    (await verifyTypedData({ address: c.wallet, signature: c.signature, ...callerTypedData(c) }))
  return signed ? { key: e.key, ...c } : undefined
}

// A close, like a call, is readonly and owned by the burn address.
function asClose(e: Found) {
  if (!e.creationFlags.readonly || !isAddressEqual(e.owner, BURN)) return undefined
  return { key: e.key, ...closePayload.parse(json(e)) }
}

const asStatus = (e: Found) => ({ key: e.key, ...statusPayload.parse(json(e)) })

// A settlement, like a call, is readonly and owned by the burn address.
function asSettlement(e: Found) {
  if (!e.creationFlags.readonly || !isAddressEqual(e.owner, BURN)) return undefined
  const s = settlementPayload.parse(json(e))
  return { key: e.key, ...s, fingerprint: settlementFingerprint(s.call, e.payload) }
}

/**
 * Another process on our key (the API beside the worker) took our nonce, or minted the key a
 * call's batch predicted. Either way the chain accepted nothing, so the write can be retried. A
 * timeout is not retried: that transaction may still land.
 */
function lostRace(err: unknown): boolean {
  if (err instanceof ContractFunctionRevertedError) return err.data?.errorName === 'EntityNotFound'
  if (
    err instanceof BaseError &&
    /replacement transaction underpriced|nonce too low/i.test(err.details)
  ) {
    return true
  }
  return err instanceof Error && lostRace(err.cause)
}

// Attribute names are lowercase: the chain rejects uppercase ones (arkiv/friction.md).
const statusAttributes = (s: StatusPayload) => ({
  v: s.v,
  status: s.status,
  super_factor: s.superFactor,
  boost_bps: s.boostBps,
})

type Band = 'low' | 'medium' | 'high' | 'superhigh'
type CallStatus =
  | 'pending'
  | 'armed'
  | 'live'
  | 'won'
  | 'lost'
  | 'expired-profit'
  | 'expired-loss'
  | 'unfired'
  | 'void'

/**
 * Reads trust records created by `writer`, and settlements created by `settler`, so reading needs
 * only those addresses. Writing needs `privateKey` as well: the settler's for settlements, the
 * writer's for everything else. `apiKey` is our Arkiv Hub access key; without it, requests go to
 * Rabdi's public endpoint, which is heavily rate limited.
 */
export function createArkiv({
  writer,
  settler,
  privateKey,
  apiKey,
  project,
  rpcUrl,
}: {
  writer: Address
  settler?: Address
  privateKey?: Hex
  apiKey?: string
  project: string
  rpcUrl?: string
}) {
  const chain = rabdi({ accessKey: apiKey ?? '' })
  const url = rpcUrl ?? RABDI_RPC
  const fetchOptions = apiKey ? { headers: { 'X-API-KEY': apiKey } } : undefined
  // Writes: Arkiv can take over viem's default 10 s to accept a transaction, and its gas estimate
  // has come out too low (arkiv/friction.md). A quarter more costs nothing: a transaction pays
  // only for the gas it uses. Reads fail fast instead: viem waits out a 429's Retry-After, which
  // Arkiv has set to minutes once the query budget runs out, so one stuck read would hold an API
  // request that long.
  const sending = http(url, { timeout: 30_000, fetchOptions })({})
  const transport = custom(
    {
      async request({ method, params }) {
        const result = await sending.request({ method, params })
        return method === 'eth_estimateGas' && typeof result === 'string'
          ? toHex((BigInt(result) * 5n) / 4n)
          : result
      },
    },
    { retryCount: 0 },
  )
  const reader = createPublicClient({
    chain,
    transport: http(url, { timeout: 10_000, retryCount: 0, fetchOptions }),
  })
  const account = privateKey ? privateKeyToAccount(privateKey) : undefined
  if (
    account &&
    !isAddressEqual(account.address, writer) &&
    !(settler && isAddressEqual(account.address, settler))
  ) {
    throw new Error(`privateKey is the key of neither the writer ${writer} nor the settler`)
  }
  const wallet = account && createWalletClient({ account, chain, transport })
  type Signer = NonNullable<typeof wallet>

  // Writes from this client go one at a time, so they never share a nonce or a predicted key.
  let queue: Promise<unknown> = Promise.resolve()
  function write<T>(send: (wallet: Signer) => Promise<T>, by: Address = writer): Promise<T> {
    if (!wallet) return Promise.reject(new Error('read-only: this client has no ARKIV_PRIVATE_KEY'))
    if (!isAddressEqual(wallet.account.address, by)) {
      return Promise.reject(new Error(`this client's key isn't ${by}'s`))
    }
    const signer = wallet
    const attempt = async (left: number): Promise<T> => {
      try {
        return await send(signer)
      } catch (err) {
        if (left === 0 || !lostRace(err)) throw err
        await new Promise((r) => setTimeout(r, 2_000))
        return attempt(left - 1)
      }
    }
    const run = queue.then(() => attempt(3))
    queue = run.catch(() => undefined)
    return run
  }

  async function entity(entityKey: Hex): Promise<Found | undefined> {
    try {
      const e = await reader.getEntity(entityKey)
      return isAddressEqual(e.$creator, writer) ? found(e, e.$attributes.payload) : undefined
    } catch (err) {
      if (err instanceof NoEntityFoundError) return undefined
      throw err
    }
  }

  /**
   * Every record of a kind matching the filters, created by `by`, a page at a time. Pages follow
   * the key, not an offset: a record written between two pages would shift every offset after it.
   */
  async function findBy(by: Address, kind: string, ...filters: Expression[]): Promise<Found[]> {
    const all: Found[] = []
    for (let after: Hex | undefined; ; ) {
      const next = after ? [gt('$key', key(after))] : []
      const { entities } = await reader
        .select({ $key: true, $owner: true, $creationFlags: true, payload: true })
        .where(eq('project', project), eq('kind', kind), ...filters, ...next)
        .createdBy(by)
        .orderBy(asc('$key'))
        .limit(MAX_LIMIT)
        .fetch()
      all.push(...entities.flatMap((e) => found(e, e.payload) ?? []))
      if (entities.length < MAX_LIMIT) return all
      after = entities.at(-1)?.$key
    }
  }

  const find = (kind: string, ...filters: Expression[]) => findBy(writer, kind, ...filters)

  // Without a settler address, no settlement can be trusted, so none is read.
  const settlements = async (...filters: Expression[]) =>
    settler
      ? (await findBy(settler, 'settlement', ...filters)).flatMap((e) => asSettlement(e) ?? [])
      : []

  // Expiry is a block number. Rabdi's block number isn't billed as a query (arkiv/friction.md).
  const expiringWithin = async (days: number) =>
    lte(
      '$expiresAt',
      u64(
        (await reader.getBlockNumber({ cacheTime: 0 })) + ExpirationTime.fromDays(days).minLifetime,
      ),
    )

  async function findCaller(filter: Expression) {
    const [e] = await find('caller', filter)
    return e && asCaller(e)
  }

  async function caller(callerKey: Hex) {
    const e = await entity(callerKey)
    return e && asCaller(e)
  }

  return {
    writeCall: (call: CallPayload) =>
      write(async (wallet) => {
        const [next] = await reader.predictEntityKeys({ owner: writer, count: 1 })
        const payload = toPayload(call)
        const { createdEntities, txHash } = await wallet.executeBatch({
          creates: [
            {
              schema: CallSchema,
              values: {
                project,
                kind: 'call',
                v: 1,
                payload,
                caller: key(call.caller),
                asset: call.asset,
              },
              expiration: ExpirationTime.atDate(new Date((call.deadline + 30 * DAY) * 1000)),
              // Burned, so no one can edit it; permissionlessExtension lets anyone pay to keep it
              // alive past Rabdi's cap without regaining write access (arkiv/friction.md).
              flags: { readonly: true, permissionlessExtension: true },
              salt: next.salt,
            },
          ],
          ownershipChanges: [{ entityKey: next.key, newOwner: BURN }],
        })
        if (createdEntities[0] !== next.key) {
          throw new Error(`call minted as ${createdEntities[0]}, expected ${next.key}`)
        }
        return { key: next.key, fingerprint: fingerprintOf(call, payload), txHash }
      }),

    /** The caller's post ending a call. Readonly and burned like the call, and as long-lived. */
    writeClose: (close: ClosePayload, deadline: number) =>
      write(async (wallet) => {
        const [next] = await reader.predictEntityKeys({ owner: writer, count: 1 })
        const { createdEntities } = await wallet.executeBatch({
          creates: [
            {
              schema: CloseSchema,
              values: {
                project,
                kind: 'close',
                v: 1,
                payload: toPayload(close),
                call: key(close.call),
                caller: key(close.caller),
              },
              expiration: ExpirationTime.atDate(new Date((deadline + 30 * DAY) * 1000)),
              flags: { readonly: true, permissionlessExtension: true },
              salt: next.salt,
            },
          ],
          ownershipChanges: [{ entityKey: next.key, newOwner: BURN }],
        })
        if (createdEntities[0] !== next.key) {
          throw new Error(`close minted as ${createdEntities[0]}, expected ${next.key}`)
        }
        return next.key
      }),

    /** The post that ended a call, if its caller closed it: the earliest, should there be two. */
    async closeOf(callKey: Hex) {
      const closes = (await find('close', eq('call', key(callKey)))).flatMap(
        (e) => asClose(e) ?? [],
      )
      return closes.sort((a, b) => a.at - b.at)[0]
    },

    /** Each of these calls' first close, as `closeOf` reads it, in one query for all of them. */
    async closesOf(callKeys: Hex[]) {
      if (callKeys.length === 0) return []
      const closes = (await find('close', or(callKeys.map((c) => eq('call', key(c)))))).flatMap(
        (e) => asClose(e) ?? [],
      )
      return closes
        .sort((a, b) => a.at - b.at)
        .filter((c, i, all) => all.findIndex((first) => first.call === c.call) === i)
    },

    async call(callKey: Hex) {
      const e = await entity(callKey)
      return e && asCall(e, caller)
    },

    async callsBy(callerKey: Hex) {
      const owner = await caller(callerKey)
      const found = await Promise.all(
        (await find('call', eq('caller', key(callerKey)))).map((e) => asCall(e, () => owner)),
      )
      return found.flatMap((c) => c ?? [])
    },

    /** Every call on an asset, across callers. Each caller is looked up once. */
    async callsByAsset(asset: string) {
      const entities = await find('call', eq('asset', asset))
      const seen = new Map<Hex, Promise<CallerRecord | undefined>>()
      const callerOf = (k: Hex) => {
        const hit = seen.get(k)
        if (hit) return hit
        const looked = caller(k)
        seen.set(k, looked)
        return looked
      }
      const found = await Promise.all(entities.map((e) => asCall(e, callerOf)))
      return found.flatMap((c) => c ?? [])
    },

    async snapshot() {
      const [callerEntities, callEntities, statusEntities, settled] = await Promise.all([
        find('caller'),
        find('call'),
        find('status'),
        settlements(),
      ])
      const callers = (await Promise.all(callerEntities.map(asCaller))).flatMap((c) => c ?? [])
      const byKey = new Map(callers.map((c) => [c.key, c]))
      const calls = (
        await Promise.all(callEntities.map((e) => asCall(e, (k) => byKey.get(k))))
      ).flatMap((c) => c ?? [])
      return { callers, calls, statuses: statusEntities.map(asStatus), settlements: settled }
    },

    /** `deadline` is the call's: the status lives until 30 days after it. */
    writeStatus: (status: StatusPayload, deadline: number) =>
      write(async (wallet): Promise<Hex> => {
        const { entityKey } = await wallet.createEntity(
          StatusSchema,
          {
            project,
            kind: 'status',
            payload: toPayload(status),
            call: key(status.call),
            caller: key(status.caller),
            asset: status.asset,
            ...statusAttributes(status),
          },
          { expiration: ExpirationTime.atDate(new Date((deadline + 30 * DAY) * 1000)) },
        )
        return entityKey
      }),

    async statusOf(callKey: Hex) {
      const [e] = await find('status', eq('call', key(callKey)))
      return e && asStatus(e)
    },

    async statusesOf(callKeys: Hex[]) {
      if (callKeys.length === 0) return []
      return (await find('status', or(callKeys.map((c) => eq('call', key(c)))))).map(asStatus)
    },

    async statuses({
      status,
      asset,
      minSuper,
      boosted,
    }: {
      status?: CallStatus[]
      asset?: string
      /** Only calls whose super factor is at least this (0–100). */
      minSuper?: number
      /** Only calls the caller boosted. */
      boosted?: boolean
    } = {}) {
      const filters = [
        ...(status?.length ? [or(status.map((s) => eq('status', s)))] : []),
        ...(asset ? [eq('asset', asset)] : []),
        ...(minSuper ? [gt('super_factor', i32(minSuper - 1))] : []),
        ...(boosted ? [gt('boost_bps', i32(0))] : []),
      ]
      return (await find('status', ...filters)).map(asStatus)
    },

    updateStatus: (
      statusKey: Hex,
      changes: Partial<Omit<StatusPayload, 'v' | 'call' | 'caller' | 'asset'>>,
    ) =>
      write(async (wallet) => {
        const e = await entity(statusKey)
        if (!e) throw new Error(`no status record ${statusKey}`)
        const next = { ...asStatus(e), ...changes }
        const { key: _, ...payload } = next
        await wallet.patchEntity(StatusSchema, statusKey, {
          set: { payload: toPayload(payload), ...statusAttributes(next) },
        })
      }),

    setBands: (callKey: Hex, bandsNow: () => Promise<{ followBand: Band; opposeBand: Band }>) =>
      write(async (wallet) => {
        const [e] = await find('status', eq('call', key(callKey)))
        if (!e) return
        const status = asStatus(e)
        const bands = await bandsNow()
        if (status.followBand === bands.followBand && status.opposeBand === bands.opposeBand) return
        const { key: _, ...payload } = { ...status, ...bands }
        await wallet.patchEntity(StatusSchema, e.key, {
          set: { payload: toPayload(payload), ...statusAttributes(payload) },
        })
      }),

    writeCaller: (caller: CallerPayload) =>
      write(async (wallet): Promise<Hex> => {
        const { entityKey } = await wallet.createEntity(
          CallerSchema,
          {
            project,
            kind: 'caller',
            v: 1,
            payload: toPayload(caller),
            handle: caller.handle,
            wallet: addr(caller.wallet),
            nullifier: caller.world.nullifier,
          },
          { expiration: LONGEST },
        )
        return entityKey
      }),

    caller,

    writeSettlement: (settlement: SettlementPayload) => {
      if (!settler) return Promise.reject(new Error('this client has no settler address'))
      return write(async (wallet) => {
        const [next] = await reader.predictEntityKeys({ owner: wallet.account.address, count: 1 })
        const payload = toPayload(settlement)
        const { createdEntities } = await wallet.executeBatch({
          creates: [
            {
              schema: SettlementSchema,
              values: {
                project,
                kind: 'settlement',
                v: 1,
                payload,
                call: key(settlement.call),
                caller: key(settlement.caller),
              },
              expiration: LONGEST,
              flags: { readonly: true, permissionlessExtension: true },
              salt: next.salt,
            },
          ],
          ownershipChanges: [{ entityKey: next.key, newOwner: BURN }],
        })
        if (createdEntities[0] !== next.key) {
          throw new Error(`settlement minted as ${createdEntities[0]}, expected ${next.key}`)
        }
        return { key: next.key, fingerprint: settlementFingerprint(settlement.call, payload) }
      }, settler)
    },

    async settlementOf(callKey: Hex) {
      const [s] = await settlements(eq('call', key(callKey)))
      return s
    },

    async latestSettlementBy(callerKey: Hex) {
      const all = await settlements(eq('caller', key(callerKey)))
      const pointedTo = new Set(all.map((s) => s.previous))
      return all.find((s) => !pointedTo.has(s.key))
    },

    settlementsExpiringWithin: async (days: number) => settlements(await expiringWithin(days)),

    async callersExpiringWithin(days: number) {
      const found = await find('caller', await expiringWithin(days))
      return (await Promise.all(found.map(asCaller))).flatMap((c) => c ?? [])
    },

    extend: (keys: Hex[]) =>
      write(
        async (wallet) =>
          (
            await wallet.executeBatch({
              extensions: keys.map((entityKey) => ({ entityKey, expiration: LONGEST })),
            })
          ).txHash,
        account?.address,
      ),

    callerByHandle: (handle: string) => findCaller(eq('handle', handle)),
    callerByWallet: (wallet: Hex) => findCaller(eq('wallet', addr(wallet))),
  }
}

export type Arkiv = ReturnType<typeof createArkiv>
