# Why Arkiv

## The claim the product makes

Supercall makes one claim: the call you see is the call that was made, and nobody edited it afterward.

A caller cannot move a stop loss after the fact. The platform cannot delete a loss to flatter a caller's record.

## Why Postgres cannot make that claim

Anyone with database access can update or delete rows. The user must trust the operator's word. On Arkiv, a call, its close, and its settlement are owned by the burn address (`0x...dEaD`) and marked read-only. No key exists to change them. The guarantee comes from where the data lives, not from a promise.

## Public reads without the platform

Calls, caller histories, and settlements are public Arkiv records. Anyone can query them with the SDK or JSON-RPC. If Supercall's servers go down, the record is still there and still queryable. On Postgres, that history sits behind our API. It disappears if we turn it off.

## Per-record lifetime control

Each record has an owner and an expiry. A call carries `permissionlessExtension`. Anyone can pay to extend its life past Rabdi's 182-day cap without editing it. A status that only matters while a call is open expires with it. That lifetime is a property of the data, not a cron job.

## What stays off Arkiv

Rule from [packages/arkiv/AGENTS.md](../packages/arkiv/AGENTS.md):

> If someone could be cheated by it, it's on Arkiv. If it only runs the machine, it's in Postgres.

Session state, parser caches, rate-limit counters, and worker bookkeeping stay in Postgres. A user would never audit these. No one could be cheated by them. Putting them on Arkiv would cost a write and a lifetime for data nobody queries.
