# ADR-0001: Monorepo and stack

Accepted.

## Context

We're building a market where callers publish trading calls and followers copy them. The caller
is paid only when right. A wrong call returns the follower's fee and pays credit from the
caller's fund.

The product has a website, a browser extension for X, an API, a background worker, and one
smart contract. Several pieces share types and logic (money math, API shapes, chain addresses),
so they belong in one repo with shared packages.

## Decision

### Monorepo

pnpm workspaces. One `pnpm dev` starts everything. Turborepo for task orchestration (build,
typecheck, lint, test run in dependency order).

```
apps/
  web/          Next.js 15 — the website
  extension/    WXT — the call card under a caller's post on X
  landing/      Next.js — the public landing page
  api/          Hono on Cloudflare Workers — Privy, World ID, Flash, Arkiv
  worker/       Hono on Cloudflare Workers — resolution, settlement, payouts
packages/
  core/         Pure functions: money math, SuperFactor, entries, endings
  api-schema/   Zod request and response shapes shared by browser and API
  arkiv/        The five Arkiv records: caller, call, status, close, settlement
  chains/       Arc and Base: chain config, addresses, Hisaab ABI and bindings
  flash/        Definitive Flash client: quote, submit, read orders
  identity/     Privy and World ID verification
  db/           Postgres schema for jobs and the state machine
  config/       Shared tsconfig
contracts/evm/  Hisaab (Foundry, deployed on Arc)
```

### Dependencies point one way

1. Apps import packages, never another app.
2. Packages never import apps.
3. `core` imports nothing from the workspace — it is pure math.
4. A new workspace dependency is an architecture change.

### Stack choices

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere, Solidity for contracts | One language across the stack |
| Web | Next.js 15, App Router, Tailwind CSS 4 | SSR for the call pages, shared with landing |
| Extension | WXT with React | Cross-browser, hot reload, content scripts |
| API | Hono on Cloudflare Workers | Edge-native, typed routes, runs on same infra as worker |
| Worker | Hono on Cloudflare Workers | Scheduled triggers, queues, same deploy target |
| Contract | Foundry | Fast tests, script deploys, one contract |
| DB | Postgres | Jobs, state machine, follower data |
| Chain | Arc mainnet (chain 5042), USDC as gas | Circle's chain, stablecoin settlement |
| Trading | Definitive Flash | Bracket orders on Arc, the only venue |
| Records | Arkiv (Rabdi testnet) | Immutable call and settlement history |
| Auth | Privy | Wallet + email + social login |
| Identity | World ID Proof of Human | One human per caller, no KYC |
| Formatting | Biome | Lint and format in one tool, fast |

### What we don't build

- No aggregator — Flash is the only venue.
- No Solana, no multi-chain in v1 — Arc, with Base as fallback.
- No Telegram bot — X only.
- No deposits in v1.
- No WhatsApp bot.

## Consequences

- Every app and package builds from one `pnpm install`.
- CI runs typecheck, lint and test on every PR.
- Shared types in `api-schema` and `core` prevent drift between frontend and backend.
- One contract means one audit surface.
