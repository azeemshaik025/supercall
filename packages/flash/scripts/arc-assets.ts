// Lists what Flash can trade on Arc for each symbol, to pick the app's markets.
// Usage: FLASH_API_KEY=... pnpm --filter @supercall/flash assets [SYMBOL ...]
import { createFlashClient } from '../src/index.ts'

const apiKey = process.env.FLASH_API_KEY
if (!apiKey) {
  console.error('Set FLASH_API_KEY')
  process.exit(1)
}
const flash = createFlashClient({ apiKey })
const symbols = process.argv.slice(2)
for (const query of symbols.length
  ? symbols
  : ['USDC', 'ETH', 'WETH', 'BTC', 'cbBTC', 'AERO', 'DEGEN', 'VIRTUAL']) {
  const assets = await flash.search(query, { chain: 'arc', limit: 5 })
  console.log(`\n${query}: ${assets.length ? '' : 'nothing on Arc'}`)
  for (const a of assets) {
    const flag = a.riskFlagged ? '  RISK' : ''
    console.log(
      `  ${a.symbol.padEnd(10)} ${a.address}  $${a.price}  liquidity $${a.liquidity}${flag}`,
    )
  }
}
