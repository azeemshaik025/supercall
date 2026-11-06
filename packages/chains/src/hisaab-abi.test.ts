import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { hisaabAbi } from './index.ts'

const contracts = path.resolve(__dirname, '../../../contracts/evm')
const forge = (() => {
  try {
    execFileSync('forge', ['--version'])
    return existsSync(path.join(contracts, 'lib/forge-std/src'))
  } catch {
    return false
  }
})()

describe.skipIf(!forge)('Hisaab ABI', () => {
  it('matches the contract', () => {
    const built = execFileSync('forge', ['inspect', 'Hisaab', 'abi', '--json'], {
      cwd: contracts,
      encoding: 'utf8',
    })
    expect(hisaabAbi).toEqual(JSON.parse(built))
  })
})
