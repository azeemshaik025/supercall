// The call a card's Copy asked for, handed from the background to the side panel. Session storage:
// it goes with the browser session, and the side panel can read it before it's been told.
import type { Call } from './lookup'

export type Pending = { id: string; call?: Call; at: number }

type Storage = {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

const KEY = 'copy:pending'

export const savePending = (storage: Storage, pending: Pending) => storage.set({ [KEY]: pending })

export async function readPending(storage: Storage): Promise<Pending | undefined> {
  const value = (await storage.get([KEY]))[KEY] as Pending | undefined
  return value && typeof value.id === 'string' ? value : undefined
}

export const pendingKey = KEY
