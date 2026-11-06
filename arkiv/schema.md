# Arkiv schema

Supercall's data lives in the Arkiv project `supercall` on the Rabdi testnet (chainId 5042).
Five record types. Each record's JSON is the `payload` column; every other column is an indexed
attribute a query can filter on.

Writer wallet: `0xcd404dBEa31D0066576c55BF0864Bd03663Bb188`.

## The records

| Record | kind | Owner | Mutable | Expiry |
|---|---|---|---|---|
| Caller | `caller` | writer wallet | yes | 182 days, extended before it lapses |
| Call | `call` | `0x…dEaD` (burn) | no, read-only | call deadline + 30 days, extendable |
| Status | `status` | writer wallet | yes (transitions) | call deadline + 30 days |
| Close | `close` | `0x…dEaD` (burn) | no, read-only | call deadline + 30 days, extendable |
| Settlement | `settlement` | `0x…dEaD` (burn) | no, read-only | 182 days, extendable |

Burned records carry `permissionlessExtension`, so anyone can pay to extend their life without
gaining the ability to edit them — see "Retention" below.

Code: [packages/arkiv/src/arkiv.ts](../packages/arkiv/src/arkiv.ts) writes and reads,
[records.ts](../packages/arkiv/src/records.ts) defines and parses every payload.

## Who owns each record, and why

A call, its close and its settlement are the record of who said what and what it paid. Nobody may
rewrite them. They are created, then their ownership is transferred to the burn address
`0x000000000000000000000000000000000000dEaD` and marked read-only. No one holds that key, so no
one — not the caller, not the platform — can delete or edit them. A correction is never an edit;
it is a new `close` record pointing at the original.

A caller profile and a call's status change over their life (a profile links a new wallet, a status
moves `pending → armed → live → won`), so they stay owned by the writer wallet and mutable.

## Indexed attributes (what queries filter on)

Every record carries `project`, `kind`, `v`. Beyond those:

| Record | Indexed attributes |
|---|---|
| Caller | `handle`, `wallet`, `nullifier` |
| Call | `caller`, `asset` |
| Status | `call`, `caller`, `asset`, `status`, `super_factor`, `boost_bps` |
| Close | `call`, `caller` |
| Settlement | `call`, `caller` |

Everything else (direction, entry/stop/target, bands, thesis, the source post, the settlement
accounting) lives in the JSON payload, read after the query returns it.

## How a reader checks a record

A read returns a record only when it passes these checks; anything else reads as missing.

1. It has a `payload` (a record with no payload is not one of ours).
2. The payload parses against its zod schema in [records.ts](../packages/arkiv/src/records.ts).
3. For a call, close or settlement: the entity is `readonly` and owned by the burn address.
   A mutable call is a forgery and reads as missing.

## Units

Payloads store integers, never floats:

- Prices and money: micro-USDC (`micro`), 1 USDC = 1,000,000.
- Shares, cuts, bands: basis points (`bps`), 0–10,000.
- Settlement ratios: millionths.

Conversions to core's dollars and fractions live only in
[units.ts](../packages/arkiv/src/units.ts).

## Retention past 182 days

Rabdi caps an entity's life at 182 days. Calls, closes and settlements are created with the
`permissionlessExtension` flag, so anyone — a caller keeping their own record alive — can pay to
extend an entity's lifetime without being able to edit it. The record stays burned and read-only;
only its expiry moves. Each extension renews up to the 182-day cap, so a call lives for as long as
someone funds its renewal.

Swarm is an optional durability layer on top of this, not a dependency — see
[swarm.md](./swarm.md).
