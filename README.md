# Supercall

A public, uneditable record of trading calls. A caller posts a call (on X, Telegram, or in-app);
Supercall writes it to Arkiv, tracks it to a win or loss, and settles the payout. Because the call,
its close and its settlement are burned and read-only on Arkiv, nobody — not the caller, not us —
can edit history. Anyone can query the whole record without our servers.

## Arkiv

- **Network:** Rabdi testnet (chainId 5042), project `supercall`.
- **Writer wallet** (owns the mutable records, created the rest before burning them):
  `0x69C9Fb11006788a118520eD66518a666c0cf0772`
- **Settler wallet** (writes settlement records from the worker):
  `0x59B6D1d967bdf035E3849f244063c3F61411A0dE`
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
