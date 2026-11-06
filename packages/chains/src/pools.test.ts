import { describe, expect, it } from 'vitest'
import { poolOf, swapPrice } from './pools.ts'

const WETH = '0x128cc466b61f542da60c70e3aa11c10e19b84edb'
const CIRBTC = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0'

describe('A swap', () => {
  it('prices WETH in dollars from the pool after a real swap', () => {
    // Block 27,897,651, tx 0xc5e46d60…53d8: GeckoTerminal recorded the trade at $2,302.58.
    const price = swapPrice(3_801_261_312_844_083_740_278_784n, poolOf(WETH))
    expect(Math.abs(price / 2302.58 - 1)).toBeLessThan(0.001)
  })

  it('prices cirBTC in dollars from its pool after a real swap', () => {
    // Block 27,905,149, tx 0xfb2929c2…b206: GeckoTerminal recorded the trade at $79,646.36.
    const price = swapPrice(2_236_312_417_162_043_973_185_088_633_823n, poolOf(CIRBTC))
    expect(Math.abs(price / 79_646.36 - 1)).toBeLessThan(0.001)
  })
})
