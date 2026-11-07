# Supercall

Copy-trading platform where every call, outcome, and payout is an on-chain record.

A caller publishes a crypto trade call. Supercall writes it to Arkiv as an immutable record. A worker tracks the call to a win or loss. The Hisaab contract on Arc settles the payout in USDC. Every trade executes through Definitive's Flash API as a bracket order.

No one can edit a call after creation. The record is burned (owned by `0x...dEaD`) and marked read-only on Arkiv. Anyone can query every call, close, and settlement without Supercall's servers.

## Try it

- **Web app:** [supercall.unitlabs.xyz](https://supercall.unitlabs.xyz)
- **Chrome extension:** load `apps/extension/release/` as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked). The extension marks calls on X, shows caller stats, and copies a call from your wallet.

## Arkiv

Supercall writes five record types to Arkiv. Three are immutable (call, close, settlement). Two are mutable (caller, status).

- **Network:** Rabdi testnet (chain ID 7794095), project `supercall`
- **SDK version:** `@arkiv-network/sdk` 1.0.1
- **Writer wallet:** `0x69C9Fb11006788a118520eD66518a666c0cf0772` — owns mutable records and creates immutable ones before burning them
- **Settler wallet:** `0x59B6D1d967bdf035E3849f244063c3F61411A0dE` — writes settlement records from the worker
- **Architecture, and the life of a call:** [arkiv/architecture.md](arkiv/architecture.md)

### What each record stores

| Record | Mutable | Owner | Indexed attributes |
|---|---|---|---|
| Caller (profile) | yes | writer wallet | `handle`, `wallet`, `nullifier` |
| Call (trade thesis) | no, burned | `0x...dEaD` | `caller`, `asset` |
| Status (live state) | yes | writer wallet | `call`, `caller`, `asset`, `status`, `super_factor`, `boost_bps` |
| Close (ending post + price) | no, burned | `0x...dEaD` | `call`, `caller` |
| Settlement (payout breakdown) | no, burned | `0x...dEaD` | `call`, `caller` |

Full schema, ownership rules, and expiry policy: [arkiv/schema.md](arkiv/schema.md)

### Why Arkiv, not Postgres

Postgres cannot guarantee that a record was not edited after creation. On Arkiv, burned records have no owner key. The guarantee comes from the storage layer, not from a promise. Details: [arkiv/why-arkiv.md](arkiv/why-arkiv.md)

### How the app reads Arkiv

The API reads a full snapshot from Arkiv once per minute and filters in memory. Every Arkiv query is billed. One snapshot serving many page loads costs less than one query per request. Details: [arkiv/how-you-use-arkiv.md](arkiv/how-you-use-arkiv.md)

### Friction and feedback

Seven friction points with expected behavior, actual behavior, and reproduction steps: [arkiv/friction.md](arkiv/friction.md)

### A query you can run

This query returns every open call. It reads from the public Rabdi endpoint. No private key is needed.

```
project = str('supercall') AND kind = str('status') AND (status = str('armed') OR status = str('live'))
```

```bash
curl -s https://rpc.rabdi.db-chain.testnet.arkiv.network \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["project = str('\''supercall'\'') AND kind = str('\''status'\'') AND (status = str('\''armed'\'') OR status = str('\''live'\''))",{"select":{"key":true,"attributes":true},"limit":"0x14"}]}'
```

Reader code: [packages/arkiv/src/arkiv.ts](packages/arkiv/src/arkiv.ts)

## Arc

Arc (chain ID 5042) is the settlement chain. USDC is the native gas token. Users pay for every transaction in USDC. They never need ETH.

The Hisaab contract on Arc does four things:

1. **registerCall** — records a call's fingerprint on-chain
2. **payFee** — pulls the follower's fee in USDC through Permit2
3. **settleBatch** — settles up to 50 copies per transaction, pays caller, followers, and treasury
4. **continueAsRefund** — refunds unsettled copies after the 7-day grace period

- **Hisaab contract:** [`0x79Ce4b6CB5ccA888Df653E1cd51cD1B2241A56CE`](https://explorer.arc.io/address/0x79Ce4b6CB5ccA888Df653E1cd51cD1B2241A56CE)
- **USDC (system predeploy):** `0x3600000000000000000000000000000000000000`
- **Arc Studio chat** (contract scaffolded here): [studio.arc.io/app/a09ef04b](https://studio.arc.io/app/a09ef04b-2843-495c-a57c-5ea3b5afd646?thread=6f738311-adb3-4c0e-b870-04195f23b727)

### Transactions on Arc mainnet

| Transaction | What it does | Link |
|---|---|---|
| Deploy Hisaab | Contract creation | [0x093d...13b3](https://explorer.arc.io/tx/0x093dce9062b9afde1095e984f36f026980108b6bbe7b37934949255b9c2e13b3) |
| registerCall | A call registered on-chain | [0x9e69...6510](https://explorer.arc.io/tx/0x9e69ecc1e460a994602bb1e773c6343ab7e5d0c416fb3672b672c6bba0b66510) |
| payFee | A follower's fee pulled via Permit2 | [0x0af9...b49a](https://explorer.arc.io/tx/0x0af961b885a6ce719851544112156ec42f7dd8675340e5fd8de2c10d05e0b49a) |
| settleBatch | Settler pays out caller, followers, and treasury | [0x29a1...f2ae](https://explorer.arc.io/tx/0x29a1f890906890364f3627fe05c9804e5e1f52a362f087ee84c11dc87a5af2ae) |

Code: [contracts/evm/src/Hisaab.sol](contracts/evm/src/Hisaab.sol), [packages/chains/src/index.ts](packages/chains/src/index.ts)

## Definitive (Flash API)

Every trade executes through Definitive's Flash API. Supercall uses no other trading venue and no aggregator.

### What Supercall does with Flash

1. **Bracket orders for copy-trading.** Each copy is a market buy with take-profit and stop-loss attached in one order. Future-level calls use limit orders with expiry. The call's target price is the take-profit. The call's stop price is the stop-loss.
2. **Cross-chain deposits.** A user deposits any token from Base, Arbitrum, or Ethereum. Flash converts it to USDC on Arc in one cross-chain market order. The API rejects deposits where the bridge cost exceeds 10% of the input.
3. **Order lifecycle.** The API quotes with the integrator key. The browser signs. The API submits. The frontend polls until the order fills or fails.

### Flash API endpoints used

| Endpoint | Purpose |
|---|---|
| `POST /v1/quote` | Price an order, get EVM typed data for signing |
| `POST /v1/order` | Submit a signed order |
| `GET /v1/orders/:id` | Poll order status and fills |
| `GET /v1/balances/:address` | List token balances across chains |
| `GET /v1/search` | Find tradeable assets by symbol or address |
| `POST /v1/orders/:id/cancel` | Cancel with the funder's signature |

Code: [packages/flash/src/client.ts](packages/flash/src/client.ts), [apps/api/src/copy.ts](apps/api/src/copy.ts), [apps/api/src/deposits.ts](apps/api/src/deposits.ts)

## Stack

Monorepo (pnpm + turbo): `apps/{web,api,worker,extension}`, `packages/{arkiv,core,db,flash,chains,api-schema}`, `contracts/evm`.

| Layer | Technology |
|---|---|
| Frontend | Next.js, Tailwind CSS v4 |
| API | Hono on Node |
| Worker | Node, viem |
| Contracts | Solidity, Foundry |
| Wallet auth | Privy (embedded wallets) |
| Signing | `eth_signTypedData_v4` via Privy provider |
| Trading | Definitive Flash API |
| On-chain records | Arkiv SDK on Rabdi testnet |
| Settlement chain | Arc mainnet (chain ID 5042) |
| Schema validation | Zod (shared `@supercall/api-schema`) |

Architecture decision record: [docs/adr/0001-monorepo-and-stack.md](docs/adr/0001-monorepo-and-stack.md)

## What was built at ETHGlobal Mumbai

This repo's first commit is from 5 November 2026. We wrote all code during the event. This includes the Arkiv record layer, settlement pipeline, super factor scoring, copy mechanics, API, web app, Chrome extension, deposit bridge, and worker.

## AI usage

Code generated with Claude Code (coding agent). Arc Studio generated the initial Hisaab contract code. Design decisions, architecture, and the retention model were ours.

## License

MIT — see [LICENSE](LICENSE).
