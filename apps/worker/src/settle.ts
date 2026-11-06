// Hisaab's settlement transactions for one call: batches of up to 50 copies from its cursor, sent
// with the settler key.
import { type HisaabChain, hisaabAbi, viemChain } from '@supercall/chains'
import { type Abi, createPublicClient, createWalletClient, type Hex, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { Inputs } from './inputs.ts'

const BATCH = 50
const abi: Abi = hisaabAbi

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex

export type Batch = {
  functionName: 'settleBatch'
  args: readonly [
    Hex,
    number,
    bigint,
    readonly { filled: boolean; keptFee: bigint; creditAsk: bigint; inputs: Hex }[],
  ]
}

const copiesIn = (inputs: Inputs) =>
  inputs.kind === 'right'
    ? inputs.kept.length
    : inputs.kind === 'wrong'
      ? inputs.asks.length
      : inputs.count

export function batchPlan(call: Hex, inputs: Inputs, cursor: number, inputHashes: Hex[]): Batch[] {
  const copies = copiesIn(inputs)
  const plan: Batch[] = []
  for (let from = cursor; from < copies; from += BATCH) {
    plan.push(oneBatch(call, inputs, from, Math.min(from + BATCH, copies), inputHashes))
  }
  return plan
}

function oneBatch(call: Hex, inputs: Inputs, from: number, to: number, inputHashes: Hex[]): Batch {
  const hashes = inputHashes.slice(from, to)
  switch (inputs.kind) {
    case 'right': {
      const kept = inputs.kept.slice(from, to)
      const filled = inputs.filled.slice(from, to)
      return {
        functionName: 'settleBatch',
        args: [
          call,
          inputs.aboveEntry ? 1 : 0,
          0n,
          kept.map((keptFee, i) => ({
            filled: filled[i] ?? false,
            keptFee,
            creditAsk: 0n,
            inputs: hashes[i] ?? ZERO_HASH,
          })),
        ],
      }
    }
    case 'wrong': {
      const asks = inputs.asks.slice(from, to)
      return {
        functionName: 'settleBatch',
        args: [
          call,
          2,
          inputs.totalAsk,
          asks.map((creditAsk, i) => ({
            filled: creditAsk > 0n,
            keptFee: 0n,
            creditAsk,
            inputs: hashes[i] ?? ZERO_HASH,
          })),
        ],
      }
    }
    case 'refund':
      return {
        functionName: 'settleBatch',
        args: [
          call,
          3,
          0n,
          Array.from({ length: to - from }, () => ({
            filled: false,
            keptFee: 0n,
            creditAsk: 0n,
            inputs: ZERO_HASH,
          })),
        ],
      }
  }
}

export function createSettler(chain: HisaabChain, privateKey: Hex) {
  const account = privateKeyToAccount(privateKey)
  const transport = http(chain.rpcUrl, { timeout: 15_000, retryCount: 3, retryDelay: 2_000 })
  const reader = createPublicClient({ chain: viemChain(chain), transport })
  const wallet = createWalletClient({ account, chain: viemChain(chain), transport })

  async function send(b: Batch) {
    const { request } = await reader.simulateContract({
      account,
      address: chain.hisaab,
      abi,
      ...b,
    })
    const hash = await wallet.writeContract(request)
    const { status } = await reader.waitForTransactionReceipt({ hash })
    if (status !== 'success') throw new Error(`settleBatch ${hash} reverted`)
    return hash
  }

  const onHisaab = (call: Hex) =>
    reader.readContract({
      address: chain.hisaab,
      abi: hisaabAbi,
      functionName: 'getCall',
      args: [call],
    })

  return {
    reader,
    address: account.address,
    onHisaab,
    async settle(call: Hex, inputs: Inputs, inputHashes: Hex[]) {
      const info = await onHisaab(call)
      const hashes: Hex[] = []
      for (const b of batchPlan(call, inputs, Number(info.cursor), inputHashes))
        hashes.push(await send(b))
      return hashes
    },
    fund(caller: Hex) {
      return Promise.all([
        reader.readContract({
          address: chain.hisaab,
          abi: hisaabAbi,
          functionName: 'earnedFund',
          args: [caller],
        }),
        reader.readContract({
          address: chain.hisaab,
          abi: hisaabAbi,
          functionName: 'creditOnlyFund',
          args: [caller],
        }),
      ]).then(([earned, creditOnly]) => ({ earned, creditOnly }))
    },
  }
}
