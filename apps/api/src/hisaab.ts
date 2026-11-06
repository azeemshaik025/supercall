// Hisaab's writer (spec, "Architecture"): the API registers calls in Hisaab and submits each copy's
// fees with the follower's signature. Every transaction from the writer key waits its turn on one
// Postgres advisory lock, so API instances never send two with the same nonce.
import type { CallRecord } from '@supercall/arkiv'
import { type HisaabChain, hisaabAbi, viemChain } from '@supercall/chains'
import { FEE } from '@supercall/core'
import type { Db } from '@supercall/db'
import { sql } from 'drizzle-orm'
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  type Hex,
  hexToBigInt,
  http,
  isAddressEqual,
  parseAbi,
  parseEventLogs,
  type TransactionReceipt,
  TransactionReceiptNotFoundError,
  toHex,
  WaitForTransactionReceiptTimeoutError,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// Any number works; only the writer takes this lock.
export const WRITER_LOCK = 5042
const BPS = 10_000n

// Permit2 checks the follower's fee signature inside payFee; these name its refusals.
const permit2Errors = parseAbi([
  'error SignatureExpired(uint256 signatureDeadline)',
  'error InvalidNonce()',
  'error InvalidSignatureLength()',
  'error InvalidSignature()',
  'error InvalidSigner()',
  'error InvalidContractSignature()',
  'error InvalidAmount(uint256 maxAmount)',
])

/** Why Hisaab or Permit2 refused a transaction, or undefined if `e` isn't a refusal. */
export function refusal(e: unknown) {
  const revert = e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError)
  if (!(revert instanceof ContractFunctionRevertedError)) return undefined
  return revert.data?.errorName ?? revert.signature ?? 'reverted'
}

/** The writer's lock stayed taken for the whole wait: too many transactions at once. */
export class WriterBusy extends Error {}

/** A transaction was sent but hadn't landed when the wait ended. It may still land. */
export class StillLanding extends Error {
  constructor(readonly hash: Hex) {
    super(`${hash} hasn't landed yet`)
  }
}

// Postgres's lock_not_available, under however many wrappers.
const lockTimedOut = (e: unknown): boolean =>
  e instanceof Error && (('code' in e && e.code === '55P03') || lockTimedOut(e.cause))

/** One copy's fees in micro-USDC, each rounded down on its own, as Hisaab does (`_fees`). */
export function feesOf(size: bigint) {
  return {
    fee: (size * BigInt(Math.round(FEE.call * 10_000))) / BPS,
    platform: (size * BigInt(Math.round(FEE.platform * 10_000))) / BPS,
  }
}

export type Hisaab = ReturnType<typeof createHisaab>

export function createHisaab({
  db,
  chain,
  privateKey,
}: {
  db: Db
  chain: HisaabChain
  privateKey: Hex
}) {
  const account = privateKeyToAccount(privateKey)
  const transport = http(chain.rpcUrl)
  const reader = createPublicClient({ chain: viemChain(chain), transport })
  const wallet = createWalletClient({ account, chain: viemChain(chain), transport })

  /**
   * Sends one writer transaction once the lock is ours, and waits for it to land. Callers simulate
   * first, outside the lock, so a request Hisaab would refuse never holds it. Both waits end well
   * inside Vercel's 300 s, so a request fails with an error instead of being cut off.
   */
  async function send(write: () => Promise<Hex>) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '60s'`)
        await tx.execute(sql`select pg_advisory_xact_lock(${WRITER_LOCK})`)
        const hash = await write()
        const receipt = await reader
          .waitForTransactionReceipt({ hash, timeout: 60_000 })
          .catch((e) => {
            throw e instanceof WaitForTransactionReceiptTimeoutError ? new StillLanding(hash) : e
          })
        if (receipt.status !== 'success') throw new Error(`Hisaab reverted ${hash}`)
        return receipt
      })
    } catch (e) {
      throw lockTimedOut(e) ? new WriterBusy('Too many Hisaab transactions at once') : e
    }
  }

  /** The fee a landed transaction paid into this Hisaab, if it paid one. */
  function feePaidIn(receipt: TransactionReceipt) {
    const [paid] = parseEventLogs({
      abi: hisaabAbi,
      eventName: 'Copied',
      logs: receipt.logs.filter((l) => isAddressEqual(l.address, chain.hisaab)),
    })
    return paid && { tx: receipt.transactionHash, ...paid.args }
  }

  return {
    /** Opens a call for fees, under its Arkiv key and the fingerprint of its record. */
    async registerCall(
      call: Pick<CallRecord, 'key' | 'fingerprint' | 'caller' | 'wallet' | 'shareBps' | 'deadline'>,
    ) {
      const { request } = await reader.simulateContract({
        account,
        address: chain.hisaab,
        abi: hisaabAbi,
        functionName: 'registerCall',
        args: [
          call.key,
          call.fingerprint,
          call.caller,
          call.wallet,
          call.shareBps,
          BigInt(call.deadline),
        ],
      })
      return send(() => wallet.writeContract(request))
    },

    isRegistered: async (call: Hex) =>
      (
        await reader.readContract({
          address: chain.hisaab,
          abi: hisaabAbi,
          functionName: 'getCall',
          args: [call],
        })
      ).deadline !== 0n,

    ended: async (call: Hex) => {
      const c = await reader.readContract({
        address: chain.hisaab,
        abi: hisaabAbi,
        functionName: 'getCall',
        args: [call],
      })
      return c.endingSet
    },

    /**
     * What the follower signs to pay one copy's fees: a Permit2 witness transfer of both fees to
     * Hisaab, bound to the call and her size, as eth_signTypedData_v4 JSON.
     */
    feeMessage(call: Hex, size: bigint) {
      const { fee, platform } = feesOf(size)
      const nonce = hexToBigInt(toHex(crypto.getRandomValues(new Uint8Array(32))))
      const deadline = Math.floor(Date.now() / 1000) + 10 * 60
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          // Hisaab.sol's WITNESS_TYPE.
          PermitWitnessTransferFrom: [
            { name: 'permitted', type: 'TokenPermissions' },
            { name: 'spender', type: 'address' },
            { name: 'nonce', type: 'uint256' },
            { name: 'deadline', type: 'uint256' },
            { name: 'witness', type: 'CallFee' },
          ],
          CallFee: [
            { name: 'call', type: 'bytes32' },
            { name: 'size', type: 'uint256' },
          ],
          TokenPermissions: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
        },
        primaryType: 'PermitWitnessTransferFrom',
        domain: { name: 'Permit2', chainId: chain.id, verifyingContract: chain.permit2 },
        message: {
          permitted: { token: chain.usdc.address, amount: String(fee + platform) },
          spender: chain.hisaab,
          nonce: String(nonce),
          deadline: String(deadline),
          witness: { call, size: String(size) },
        },
      }
      return { typedData: JSON.stringify(typedData), nonce: String(nonce), deadline }
    },

    /** Takes one copy's fees with the follower's signature, and says what Hisaab took. */
    async payFee(p: {
      call: Hex
      follower: Hex
      size: bigint
      nonce: bigint
      deadline: bigint
      signature: Hex
    }) {
      const { request } = await reader.simulateContract({
        account,
        address: chain.hisaab,
        abi: [...hisaabAbi, ...permit2Errors],
        functionName: 'payFee',
        args: [p.call, p.follower, p.size, p.nonce, p.deadline, p.signature],
      })
      const receipt = await send(() => wallet.writeContract(request))
      const paid = feePaidIn(receipt)
      if (!paid) throw new Error(`No FeePaid in ${receipt.transactionHash}`)
      return paid
    },

    /** The fee a transaction paid, or undefined if it paid none (or hasn't landed). */
    async feePaid(hash: Hex) {
      try {
        return feePaidIn(await reader.getTransactionReceipt({ hash }))
      } catch (e) {
        if (e instanceof TransactionReceiptNotFoundError) return undefined
        throw e
      }
    },
  }
}

export type FeePaid = NonNullable<Awaited<ReturnType<Hisaab['feePaid']>>>
