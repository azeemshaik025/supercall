# Arkiv + Swarm

Retention is solved on Arkiv itself (`permissionlessExtension`, see [schema.md](./schema.md)), so
Swarm is not load-bearing. It is a durability bonus: the heavy content a call carries — the full
source post text, and any image attached to it — is bulky to keep on-chain and never queried by a
filter. We move that to Swarm and point the Arkiv call at it.

> Status: designed, bonus scope. Upload/read code lands after the filter work; the placeholders
> below are filled once we buy a postage stamp and run the first upload.

## What goes where

- **On Arkiv:** every indexed field a query filters on, plus the call's terms (entry, stop, target,
  bands) — the data that makes a call auditable and queryable.
- **On Swarm:** the bulky, read-only content — the full post text and any attached image —
  uploaded once, referenced by its content hash.
- **The link:** the call payload's `post` object gains a `swarm` field holding the Swarm reference.
  A reader fetches the content from Swarm when it opens the call; the feed never needs it.

The reference we store is a plain (unencrypted) content hash. The content is public, like the call
it belongs to, so there is no key to leak. If we ever store private data, we encrypt it first and
keep the reference off Arkiv — an encrypted Swarm reference contains its key, and Arkiv entities
are public.

## One entity → its Swarm reference

<!-- NEED FROM YOU (after first archive run):
  - one Arkiv index entity key
  - the Swarm reference it points to, as an openable https://…/bzz/<ref> link
-->

## Provenance

<!-- NEED FROM YOU:
  - postage stamp batch ID: ______
  - wallet that bought the stamp (or who gave you the batch): ______
  - Bee node or gateway you upload through: ______
-->

## Files

- Upload: `packages/arkiv/src/swarm.ts` (`upload()`) — *to be added*
- Read: same module (`fromSwarm()`) — *to be added*

## Run it yourself

<!-- NEED: fill once the code lands.
  1. Set BEE_API_URL and SWARM_BATCH_ID in .env
  2. `pnpm --filter @supercall/arkiv swarm-upload <file>` → uploads, prints the Swarm reference
  3. `pnpm --filter @supercall/arkiv swarm-read <ref>` → fetches the content back
  What you should see: the uploaded post text returned byte-for-byte.
-->

## Demo moment

<!-- NEED FROM YOU: the timestamp in the demo video where the Swarm upload/read happens. -->

## What got in our way with Swarm

<!-- NEED FROM YOU: fill as you hit it — stamp funding, Bee setup, gateway limits, gBZZ faucet. -->
