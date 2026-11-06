# packages/db

Postgres schema (Drizzle) for what runs the machine: World ID nullifiers, caller profiles,
copies, backings, voids, oppose votes, posts from X, and follower notifications.

## Rules

- Postgres never holds the only copy of anything that decides money or reputation. Wiping it
  loses only the Oppose votes, the notifications, and the reasons posts weren't calls
  (docs/supercall-spec.md, "Arkiv or Postgres").
- `world_nullifiers` is the only lasting guard against one human registering as two callers. The
  caller record on Arkiv publishes the nullifier but expires after 182 days unless extended.

## Spec

"Arkiv or Postgres".

## Check

`npx --yes pnpm@11.9.0 --filter @supercall/db test`
