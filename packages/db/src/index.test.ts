import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDb } from './index.ts'

afterEach(() => vi.unstubAllEnvs())

describe('createDb', () => {
  // whileHolding keeps one connection for its transaction while the work queries on another.
  it('opens more than one connection unless DATABASE_POOL_MAX caps it', () => {
    vi.stubEnv('DATABASE_POOL_MAX', '')
    expect(createDb('postgres://localhost/x').$client.options.max).toBeGreaterThan(1)
    vi.stubEnv('DATABASE_POOL_MAX', '1')
    expect(createDb('postgres://localhost/x').$client.options.max).toBe(1)
  })
})
