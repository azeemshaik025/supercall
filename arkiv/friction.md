# Arkiv friction

What got in our way, what we expected, what happened, and how to reproduce it.

## Storage is capped, and the record should be permanent

The core tension in our design. A trading call is history. It should be readable years later. Rabdi caps an entity's lifetime at 182 days (7,884,000 blocks). Our product promises "this call existed and nobody changed it." A single entity cannot guarantee that on its own.

It got worse before it got better. We burn a call's ownership so nobody can delete or edit it. But a burned entity has no owner. Our first assumption was that no one could extend it either. Immutability and extendability pulled against each other on the same record.

The flag that resolves it: `permissionlessExtension`. Set at creation, it lets anyone pay to extend an entity's lifetime without gaining the ability to change it. We now create calls, closes and settlements with it ([arkiv.ts](../packages/arkiv/src/arkiv.ts), `writeCall`). A caller can fund the life of their own call history while it stays read-only.

What still bit us:

- The flag must be set **at creation**. A call already burned without it can never be extended. We cannot retrofit the history already on chain. A clean start was the only fix.
- Each extension renews only up to the 182-day cap. "Forever" means a recurring renewal, not one payment. A max-lifetime extension (pay once for N years) would be simpler.

Finding `permissionlessExtension` took reading the SDK's flag types. The docs do not make it obvious that burned-but-extendable is a supported combination.

## Every query is billed, so we snapshot instead of querying per request

`getEntities` and `getEntity` both count against the query budget. A web app that ran one Arkiv query per page load would burn through the budget in minutes. We read a full snapshot once a minute and filter in memory ([calls.ts](../apps/api/src/calls.ts), `arkivSnapshot`). The indexed attributes still drive the snapshot's own queries, but the user-facing API never hits Arkiv directly.

Expected: reads against your own entities to be free or very cheap, so the indexed filters could drive real per-request queries.

## The public RPC is rate-limited hard

The public Rabdi endpoint (`rpc.rabdi.db-chain.testnet.arkiv.network`) rate-limits aggressively. Our test suite and seed script trip it under normal use. After a 429, the `Retry-After` header is set to minutes, not seconds. A single stuck read holds an API request for that long. We route reads through an API key header (`X-API-KEY`) to get usable throughput. We set `retryCount: 0` on the read transport to fail fast ([arkiv.ts](../packages/arkiv/src/arkiv.ts)).

Expected: a public testnet endpoint usable for a demo's read volume.
Reproduce: run the arkiv package's live tests against the public RPC with no key and watch them throttle.

## Gas estimate comes out too low

Arkiv transactions occasionally fail because viem's `eth_estimateGas` returns a number that is not enough. We multiply the estimate by 1.25 on every write ([arkiv.ts](../packages/arkiv/src/arkiv.ts), the `sending` transport). The overhead costs nothing because a transaction pays only for the gas it uses, but we had to find this by debugging failed writes.

Expected: the gas estimate to be sufficient without a manual bump.

## Transactions take longer than 10 seconds

Write transactions regularly take longer than viem's default 10-second timeout. We raised the write timeout to 30 seconds ([arkiv.ts](../packages/arkiv/src/arkiv.ts), `sending`). Reads keep a 10-second timeout to fail fast.

Expected: writes to confirm within 10 seconds on a testnet.

## Uppercase attribute names are rejected

The chain rejects indexed attribute names that contain uppercase letters ([arkiv.ts](../packages/arkiv/src/arkiv.ts), line 162). We write all attribute names in snake_case by hand (`super_factor`, `boost_bps`).

Expected: either the SDK to reject uppercase names with a clear error at write time, or the chain to accept them.
Reproduce: write an entity with `superFactor` as an attribute name. Read it back. The attribute is missing.

## The access key wants to go in the URL, and viem prints URLs in errors

The natural place for the Rabdi access key is the RPC URL. But viem includes the full request URL in its error messages. Any failed request leaks the key into logs. We pass the key as a header instead and keep it out of the URL (see the comment at `RABDI_RPC` in [arkiv.ts](../packages/arkiv/src/arkiv.ts)).

Expected: a key-handling path that does not end up in error output.

## Expiry reads are block numbers, not timestamps

The SDK's `ExpirationTime.atDate` handles the block conversion on writes. But when reading, `$expiresAt` comes back as a block height. "Expires in N days" means reading the current block and doing the arithmetic every time. We cache the block number because reading it on Rabdi is not billed as a query. But the blocks-to-days conversion is friction every place expiry matters on the read side.

Expected: `$expiresAt` to return a timestamp, or the SDK to convert it.
