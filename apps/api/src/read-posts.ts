// Run by hand; spends Claude credits.
//   posts:live [--record] [--model <id>] [--rows 5,14]  the test set against the configured model, every row's
//       answer quoted. --record saves Claude's answers as the unit tests' recordings once every row
//       run is right; with --rows, only those rows' recordings change.
import { writeFileSync } from 'node:fs'
import { readerFromEnv } from './ask'
import { CASES, recordings, runCase } from './posts.cases'
import type { Ask } from './reading'

/** Keys sorted and undefined dropped, so two answers compare as text. */
const plain = (v: unknown): string =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  )

async function live(pick: string | undefined, record: boolean, only?: Set<number>) {
  const reader = readerFromEnv(process.env, pick)
  if (!reader) throw new Error('Set ANTHROPIC_API_KEY or OPENAI_API_KEY (see .env.example)')
  const { ask, model } = reader
  const cases = only ? CASES.filter((c) => only.has(c.n)) : CASES
  const answers: Record<number, { reader?: unknown; reviewer?: unknown }> = {}
  let right = 0
  for (const c of cases) {
    const heard: { reader?: unknown; reviewer?: unknown } = {}
    const listening: Ask = async (role, schema, system, user) => {
      const answer = await ask(role, schema, system, user)
      heard[role] = answer
      return answer
    }
    const got = await runCase(c, listening, model).catch((e: unknown) => ({ error: String(e) }))
    if (heard.reader) answers[c.n] = heard
    const ok = plain(got) === plain(c.expect)
    if (ok) right++
    console.log(`${ok ? 'right' : 'WRONG'}  row ${c.n}: ${c.text}`)
    console.log(`       expected ${plain(c.expect)}`)
    console.log(`       got      ${plain(got)}`)
  }
  console.log(`\n${right} of ${cases.length} rows right on ${model}`)
  if (!record) return
  if (right < cases.length) return console.log('Not recorded: every row must be right first')
  if (only && recordings.model !== model) {
    return console.log(`Not recorded: the other rows are ${recordings.model}'s answers`)
  }
  const others = Object.entries(recordings.cases).filter(([n]) => !only?.has(Number(n)))
  const file = new URL('./posts.recorded.json', import.meta.url)
  const all = { model, cases: { ...(only ? Object.fromEntries(others) : {}), ...answers } }
  writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`)
  console.log(`Recorded ${Object.keys(answers).length} rows' answers`)
}

const [mode, ...rest] = process.argv.slice(2)
const model = rest.includes('--model') ? rest[rest.indexOf('--model') + 1] : undefined
const rows = rest.includes('--rows') ? rest[rest.indexOf('--rows') + 1] : undefined
const run =
  mode === 'live'
    ? live(
        model,
        rest.includes('--record'),
        rows ? new Set(rows.split(',').map(Number)) : undefined,
      )
    : Promise.reject(new Error('usage: read-posts live [--record] [--model <id>] [--rows 5,14]'))
run.catch((e) => {
  console.error(e)
  process.exit(1)
})
