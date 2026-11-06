# Supercall

A public, uneditable record of trading calls. A caller posts a call (on X, Telegram, or in-app);
Supercall writes it to Arkiv, tracks it to a win or loss, and settles the payout. Because the call,
its close and its settlement are burned and read-only on Arkiv, nobody — not the caller, not us —
can edit history. Anyone can query the whole record without our servers.

## Arkiv

- **Network:** Rabdi testnet (chainId 5042), project `supercall`.
- **Writer wallet** (owns the mutable records, created the rest before burning them):
  `0xcd404dBEa31D0066576c55BF0864Bd03663Bb188`
- **Records, owners, expiry, indexed fields:** [arkiv/schema.md](arkiv/schema.md)
- **Why Arkiv over Postgres:** [arkiv/why-arkiv.md](arkiv/why-arkiv.md)
- **How the filters and lifetimes fit the app:** [arkiv/how-you-use-arkiv.md](arkiv/how-you-use-arkiv.md)
- **Friction and feedback:** [arkiv/friction.md](arkiv/friction.md)
- **Permanent archive on Swarm:** [arkiv/swarm.md](arkiv/swarm.md)

### A query you can run

Every open call on an asset, read straight from Arkiv:

```
project = "supercall" && kind = "status" && asset = "WETH" && status = "armed"
```

Via the SDK in this repo:

```bash
ARKIV_API_KEY=<rabdi key> npx --yes pnpm@11.9.0 --filter @supercall/arkiv seed
# prints the seeded caller key and call key, both queryable above
```

Reader code: [packages/arkiv/src/arkiv.ts](packages/arkiv/src/arkiv.ts). It needs no private key to
read; `ARKIV_PRIVATE_KEY` is only for writing.

## Stack

Monorepo (pnpm + turbo): `apps/{web,api,worker,extension}`, `packages/{arkiv,core,db,…}`,
`contracts/evm`. See [docs/adr/0001-monorepo-and-stack.md](docs/adr/0001-monorepo-and-stack.md).

## AI usage

<!-- NEED FROM YOU: ETHGlobal requires an AI-usage statement. One or two lines, e.g.
  "Built with Claude Code: scaffolding, the Arkiv record layer, and these docs. All design
  decisions and the retention model were ours." Edit to what's accurate. -->

## License

MIT — see [LICENSE](LICENSE).
