export interface WorldIdProof {
  merkle_root: string
  nullifier_hash: string
  proof: string
  verification_level: 'orb' | 'device'
}

export interface WorldIdResult {
  success: boolean
  nullifier_hash: string
  action: string
}

const VERIFY_URL = 'https://developer.worldcoin.org/api/v2/verify'

export async function verifyWorldId(
  proof: WorldIdProof,
  appId: `app_${string}`,
  action: string,
  signal?: string,
): Promise<WorldIdResult> {
  const res = await fetch(`${VERIFY_URL}/${appId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...proof, action, signal }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`World ID verification failed (${res.status}): ${body}`)
  }
  return res.json() as Promise<WorldIdResult>
}
