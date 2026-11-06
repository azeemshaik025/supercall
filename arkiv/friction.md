# Arkiv friction

What got in our way, what we expected, what happened, how to reproduce it.

## Storage is capped, and the record is meant to be permanent

The core tension in our design. A trading call is history: it should be readable years later. Rabdi
caps an entity's lifetime at 182 days (7,884,000 blocks). So the one thing our product promises —
"this call existed and nobody changed it, forever" — is the one thing a single entity seems unable
to do.

It got worse before it got better. We burn a call's ownership so nobody can delete or edit it, and
a burned entity has no owner — so our first assumption was that no one could extend it either, and
immutability and extendability pulled against each other on the same record.

The flag that resolves it: `permissionlessExtension`. Set at creation, it lets **anyone** pay to
extend an entity's lifetime without being able to change it — exactly the "pay to keep it alive,
still unable to rewrite it" we wanted. We now create calls, closes and settlements with it, so a
caller can fund the life of their own call history forever while it stays read-only
([arkiv.ts](../packages/arkiv/src/arkiv.ts), `writeCall`).

What still bit us:

- The flag must be set **at creation**. A call already burned without it can never be extended, so
  we can't retrofit the history already on chain — a clean start was the only fix.
- Each extension still renews only up to the 182-day cap, so "forever" means a recurring renewal,
  not one payment. A documented max-lifetime extension (pay once for N years) would be simpler.

Finding `permissionlessExtension` took reading the SDK's flag types; it isn't obvious from the docs
that burned-but-extendable is a supported combination.

## The public RPC is heavily rate limited

The public Rabdi endpoint (`rpc.rabdi.db-chain.testnet.arkiv.network`) rate-limits hard enough that
our test suite and seed script trip it under normal use. We route reads through an API key header
(`X-API-KEY`) to get usable throughput.

Expected: a public testnet endpoint usable for a demo's read volume.
Reproduce: run the arkiv package's live tests against the public RPC with no key and watch them
throttle.

## The access key wants to go in the URL, and viem prints URLs in errors

The natural place to put the Rabdi access key is the RPC URL. But viem includes the full request
URL in its error messages, so any failed request leaks the key into logs. We pass the key as a
header instead and keep it out of the URL (see the comment at `RABDI_RPC` in
[arkiv.ts](../packages/arkiv/src/arkiv.ts)).

Expected: a key-handling path that doesn't end up in error output.

## Expiry is a block number, not a timestamp

An entity's expiry is a block height, so "expires in N days" means fetching the current block and
doing the arithmetic every time. We cache the block number because, usefully, reading it on Rabdi
is not billed as a query — but the days ↔ blocks conversion is friction every place expiry matters.

Expected: an expiry we could set and read as a time, with the SDK doing the block math.
