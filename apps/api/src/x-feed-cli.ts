// Run by hand, once per deploy, with X_BEARER_TOKEN set:
//   x:feed register <https://api…/x-events>  makes our webhook (or rechecks it); put its id in
//       X_WEBHOOK_ID. X sends a CRC challenge first, so the API must be up at that URL.
//   x:feed follow   subscribes every linked caller to the webhook. New callers are followed when
//       their caller record is written (src/publish.ts); this catches the ones before.
//   x:feed status   the webhook and every subscription, as X has them.
import { createArkiv } from '@supercall/arkiv'
import { createDb, profiles } from '@supercall/db'
import { isNotNull } from 'drizzle-orm'
import type { Hex } from 'viem'
import { createXFeed } from './x-feed'

function required(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set (see .env.example)`)
  return v
}

const feed = createXFeed({
  bearer: required('X_BEARER_TOKEN'),
  webhookId: process.env.X_WEBHOOK_ID || undefined,
})

async function register(url: string) {
  const known = (await feed.webhooks()).find((w) => w.url === url)
  if (known) {
    await feed.recheck(known.id)
    console.log(`Webhook ${known.id} at ${url}: rechecked`)
  } else {
    const made = await feed.register(url)
    console.log(`Webhook ${made.id} at ${made.url}, valid: ${made.valid}`)
  }
  console.log('Set X_WEBHOOK_ID to that id, then run x:feed follow')
}

async function follow() {
  required('X_WEBHOOK_ID')
  const db = createDb()
  const arkiv = createArkiv({
    writer: required('ARKIV_WRITER_ADDRESS') as Hex,
    apiKey: process.env.ARKIV_API_KEY,
    project: 'supercall',
    rpcUrl: process.env.ARKIV_RPC_URL,
  })
  const linked = await db
    .select({ xUserId: profiles.xUserId, xUsername: profiles.xUsername, wallet: profiles.wallet })
    .from(profiles)
    .where(isNotNull(profiles.xUserId))
  for (const p of linked) {
    if (!p.xUserId) continue
    // A linked account without a caller record can't post calls: following it would only cost.
    if (!(await arkiv.callerByWallet(p.wallet as Hex))) {
      console.log(`@${p.xUsername}: not a caller yet, skipped`)
      continue
    }
    const added = await feed.follow(p.xUserId)
    console.log(`@${p.xUsername}: ${added.length ? `subscribed ${added.join(', ')}` : 'already'}`)
  }
  await db.$client.end()
}

async function status() {
  console.log('Webhooks:', JSON.stringify(await feed.webhooks(), null, 2))
  console.log('Subscriptions:', JSON.stringify(await feed.subscriptions(), null, 2))
}

const [mode, arg] = process.argv.slice(2)
const run =
  mode === 'register' && arg
    ? register(arg)
    : mode === 'follow'
      ? follow()
      : mode === 'status'
        ? status()
        : Promise.reject(new Error('usage: x:feed register <url> | follow | status'))
run.catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
