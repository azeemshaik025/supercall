# Arkiv schema

Supercall's data lives in the Arkiv project `supercall` on the Rabdi testnet (chainId 5042).
Five record types. Each record's JSON is the `payload` column. Every other column is an indexed
attribute a query can filter on.

Writer wallet: `0x69C9Fb11006788a118520eD66518a666c0cf0772`.
Settler wallet: `0x59B6D1d967bdf035E3849f244063c3F61411A0dE`.

## The records

| Record | kind | Owner | Mutable | Expiry |
|---|---|---|---|---|
| Caller | `caller` | writer wallet | yes | 182 days, extended before it lapses |
| Call | `call` | `0x...dEaD` (burn) | no, read-only | call deadline + 30 days, extendable |
| Status | `status` | writer wallet | yes (transitions) | call deadline + 30 days |
| Close | `close` | `0x...dEaD` (burn) | no, read-only | call deadline + 30 days, extendable |
| Settlement | `settlement` | `0x...dEaD` (burn) | no, read-only | 182 days, extendable |

Burned records carry `permissionlessExtension`. Anyone can pay to extend their life without gaining the ability to edit them. See "Retention" below.

Code: [packages/arkiv/src/arkiv.ts](../packages/arkiv/src/arkiv.ts) writes and reads.
[records.ts](../packages/arkiv/src/records.ts) defines and parses every payload.

## Who owns each record, and why

A call, its close and its settlement are the record of who said what and what it paid. Nobody may rewrite them. At creation, ownership transfers to the burn address `0x000000000000000000000000000000000000dEaD` and the entity is marked read-only. No one holds that key. Not the caller, not the platform.

A caller profile and a call's status change over their life. A profile links a new wallet. A status moves `pending -> armed -> live -> won`. Both stay owned by the writer wallet and mutable.

## Indexed attributes (what queries filter on)

Every record carries `project`, `kind`, `v`. Beyond those:

| Record | Indexed attributes |
|---|---|
| Caller | `handle`, `wallet`, `nullifier` |
| Call | `caller`, `asset` |
| Status | `call`, `caller`, `asset`, `status`, `super_factor`, `boost_bps` |
| Close | `call`, `caller` |
| Settlement | `call`, `caller` |

Everything else (direction, entry/stop/target, bands, thesis, the source post, the settlement accounting) lives in the JSON payload. A query returns it, then the app reads it.

## How a reader checks a record

A read returns a record only when it passes these checks. Anything else reads as missing.

1. It has a `payload`. A record with no payload is not one of ours.
2. The entity was created by the writer wallet or the settler wallet. An entity from any other creator is ignored.
3. The payload parses against its zod schema in [records.ts](../packages/arkiv/src/records.ts).
4. For a call from the app: the EIP-712 signature must come from one of the caller's linked wallets.
5. For a call, close or settlement: the entity is `readonly` and owned by the burn address. A mutable call is a forgery and reads as missing.

## Units

Payloads store integers, never floats:

- Prices and money: micro-USDC (`micro`), 1 USDC = 1,000,000.
- Shares, cuts, bands: basis points (`bps`), 0-10,000.
- Settlement ratios: millionths.

Conversions to core's dollars and fractions live only in [units.ts](../packages/arkiv/src/units.ts).

## Retention past 182 days

Rabdi caps an entity's life at 182 days. Calls, closes and settlements are created with the `permissionlessExtension` flag. Anyone can pay to extend an entity's lifetime without editing it. A caller keeping their own record alive pays the extension. The record stays burned and read-only. Only its expiry moves. Each extension renews up to the 182-day cap. A call lives for as long as someone funds its renewal.

The record stays on Arkiv for as long as someone funds its renewal.
