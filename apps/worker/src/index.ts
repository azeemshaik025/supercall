import { isHex } from 'viem'
import { createLoop } from './loop.ts'
import { settleCall, workerFromEnv } from './settle-call.ts'
import { createWatch } from './watch.ts'

const ROUND = 5 * 60 * 1000
const TICK = 10 * 1000

async function main() {
  const w = workerFromEnv()
  const loop = createLoop(w)
  const watch = createWatch(w)
  console.log(JSON.stringify({ event: 'started', settler: w.settler.address }))

  const runLoop = async () => {
    for (;;) {
      try {
        await loop.round()
      } catch (e) {
        console.error('round', (e as Error).message)
      }
      await new Promise((r) => setTimeout(r, ROUND))
    }
  }

  const runWatch = async () => {
    for (;;) {
      try {
        await watch.tick()
      } catch (e) {
        console.error('tick', (e as Error).message)
      }
      await new Promise((r) => setTimeout(r, TICK))
    }
  }

  await Promise.all([runLoop(), runWatch()])
}

const [, , command, arg] = process.argv
if (command === 'settle' && arg && isHex(arg)) {
  const w = workerFromEnv()
  settleCall(w, arg)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
} else {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
