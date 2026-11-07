# Supercall

A public, uneditable record of trading calls. A caller posts a call (on X, Telegram, or in-app);
Supercall writes it to Arkiv, tracks it to a win or loss, and settles the payout. Because the call,
its close and its settlement are burned and read-only on Arkiv, nobody — not the caller, not us —
can edit history. Anyone can query the whole record without our servers.

## Try it

- **Web app:** [supercall.unitlabs.xyz](https://supercall.unitlabs.xyz)
- **Chrome extension:** load `apps/extension/release/` as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked). It marks calls on X, shows caller stats, and lets you copy from your own wallet.

## Arkiv

- **Network:** Rabdi testnet (chainId 7794095), project `supercall`.
- **Writer wallet** (owns the mutable records, created the rest before burning them):
  `0x69C9Fb11006788a118520eD66518a666c0cf0772`
- **Settler wallet** (writes settlement records from the worker):
  `0x59B6D1d967bdf035E3849f244063c3F61411A0dE`
- **Architecture, and the life of a call:** [arkiv/architecture.md](arkiv/architecture.md)
- **Records, owners, expiry, indexed fields:** [arkiv/schema.md](arkiv/schema.md)
- **Why Arkiv over Postgres:** [arkiv/why-arkiv.md](arkiv/why-arkiv.md)
- **How the filters and lifetimes fit the app:** [arkiv/how-you-use-arkiv.md](arkiv/how-you-use-arkiv.md)
- **Friction and feedback:** [arkiv/friction.md](arkiv/friction.md)
- **Reach:** [arkiv/reach.md](arkiv/reach.md)

### A query you can run

Every open call, read straight from Arkiv with no private key:

```
project = str('supercall') AND kind = str('status') AND (status = str('armed') OR status = str('live'))
```

Via JSON-RPC against the public Rabdi endpoint (no key needed, rate-limited):

```bash
curl -s https://rpc.rabdi.db-chain.testnet.arkiv.network \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["project = str('\''supercall'\'') AND kind = str('\''status'\'') AND (status = str('\''armed'\'') OR status = str('\''live'\''))",{"select":{"key":true,"attributes":true},"limit":"0x14"}]}'
```

Reader code: [packages/arkiv/src/arkiv.ts](packages/arkiv/src/arkiv.ts). No private key needed to
read. The SDK wraps the same RPC calls with typed results.

## Arc

Settlement chain (ID 5042). USDC is the native gas token — users never need ETH.

- **Hisaab contract:** [`0x79Ce4b6CB5ccA888Df653E1cd51cD1B2241A56CE`](https://explorer.arc.io/address/0x79Ce4b6CB5ccA888Df653E1cd51cD1B2241A56CE)
- **Arc Studio chat** (contract was scaffolded here): [studio.arc.io/app/a09ef04b-2843-495c-a57c-5ea3b5afd646](https://studio.arc.io/app/a09ef04b-2843-495c-a57c-5ea3b5afd646?thread=6f738311-adb3-4c0e-b870-04195f23b727)
- **Example transactions on Arc mainnet:**
  - [Deploy Hisaab](https://explorer.arc.io/tx/0x093dce9062b9afde1095e984f36f026980108b6bbe7b37934949255b9c2e13b3) — contract creation
  - [registerCall](https://explorer.arc.io/tx/0x9e69ecc1e460a994602bb1e773c6343ab7e5d0c416fb3672b672c6bba0b66510) — a call registered on-chain
  - [payFee](https://explorer.arc.io/tx/0x0af961b885a6ce719851544112156ec42f7dd8675340e5fd8de2c10d05e0b49a) — a follower's fee pulled via Permit2
  - [settleBatch](https://explorer.arc.io/tx/0x29a1f890906890364f3627fe05c9804e5e1f52a362f087ee84c11dc87a5af2ae) — settler pays out caller, followers, and treasury

Code: [contracts/evm/src/Hisaab.sol](contracts/evm/src/Hisaab.sol), [packages/chains/src/index.ts](packages/chains/src/index.ts)

## Definitive (Flash API)

Every trade runs through Definitive's Flash API. No other venue, no aggregator.

- **Bracket orders:** each copy is a market buy with take-profit and stop-loss attached atomically. Future-level calls use limit orders with expiry.
- **Cross-chain deposits:** any token on Base, Arbitrum, or Ethereum → ARC USDC in one Flash cross-chain order.
- **Order lifecycle:** quote → sign → submit → poll. The API manages the full flow with the integrator key; the browser only signs.

Code: [packages/flash/src/client.ts](packages/flash/src/client.ts), [apps/api/src/copy.ts](apps/api/src/copy.ts), [apps/api/src/deposits.ts](apps/api/src/deposits.ts)

## Chrome extension

Shows which X posts are calls, the caller's SuperFactor on their profile, and copies a call from
your own wallet. Install it from
[apps/extension/release/supercall-extension-1.0.0.zip](apps/extension/release/supercall-extension-1.0.0.zip):
unzip, open `chrome://extensions`, turn on Developer mode, **Load unpacked**, pick the folder. Steps
in [apps/extension/release/README.md](apps/extension/release/README.md).

## Stack

Monorepo (pnpm + turbo): `apps/{web,api,worker,extension}`, `packages/{arkiv,core,db,…}`,
`contracts/evm`. See [docs/adr/0001-monorepo-and-stack.md](docs/adr/0001-monorepo-and-stack.md).

## What was built at ETHGlobal Mumbai

This repo's first commit is from 5 November 2026. All code — the Arkiv record layer, settlement pipeline, super factor scoring, copy mechanics, the API, the web app, the Chrome extension and the worker — was written during the event.

## AI usage

Code generated with Claude Code (coding agent). Design decisions, architecture and the retention model were ours.

## License

MIT — see [LICENSE](LICENSE).
