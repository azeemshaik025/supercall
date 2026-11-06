// Which model reads posts, from the environment: Anthropic with ANTHROPIC_API_KEY, OpenAI with
// OPENAI_API_KEY. With both, READER_PROVIDER picks (default anthropic: the test set is recorded
// against Claude). READER_MODEL overrides the provider's default model.
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { type Ask, claudeAsk, MODEL, openaiAsk } from './reading'

/** OpenAI's default for reading posts; set READER_MODEL to use another. */
export const OPENAI_MODEL = 'gpt-5'

export type Reader = { ask: Ask; model: string; provider: 'anthropic' | 'openai' }

/** The post reader the environment configures, or undefined when it has no key for one. */
export function readerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  model?: string,
): Reader | undefined {
  const anthropicKey = env.ANTHROPIC_API_KEY || undefined
  const openaiKey = env.OPENAI_API_KEY || undefined
  // An empty line in .env (READER_PROVIDER=) means not set, like a missing one.
  const chosen = env.READER_PROVIDER || undefined
  if (chosen && chosen !== 'anthropic' && chosen !== 'openai') {
    throw new Error('READER_PROVIDER must be anthropic or openai')
  }
  const provider = chosen ?? (anthropicKey ? 'anthropic' : openaiKey ? 'openai' : undefined)
  if (provider === 'anthropic' && anthropicKey) {
    const m = model ?? (env.READER_MODEL || MODEL)
    return { provider, model: m, ask: claudeAsk(new Anthropic({ apiKey: anthropicKey }), m) }
  }
  if (provider === 'openai' && openaiKey) {
    const m = model ?? (env.READER_MODEL || OPENAI_MODEL)
    return { provider, model: m, ask: openaiAsk(new OpenAI({ apiKey: openaiKey }), m) }
  }
  if (chosen) throw new Error(`READER_PROVIDER is ${chosen} but its API key isn't set`)
  return undefined
}
