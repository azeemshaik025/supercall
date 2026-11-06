# How we use Arkiv

## The filters fit what the app shows

Every indexed attribute backs a screen a user actually looks at.

| Query | Screen it drives |
|---|---|
| `kind = caller && handle = X` | a caller's profile page |
| `kind = caller && wallet = X` | "who is this wallet" lookup, wallet → caller |
| `kind = call && caller = X` | every call a caller has made, on their page |
| `kind = call && asset = WETH` | the per-asset call feed |
| `kind = status && asset = WETH && status in (armed, live)` | the explore feed: open calls on an asset |
| `kind = status && super_factor >= N` | the supercall / high-conviction filter |
| `kind = settlement && caller = X` | a caller's settled track record |

The explore feed already queries `status` by `status` and `asset` together
([arkiv.ts](../packages/arkiv/src/arkiv.ts), `statuses`). The caller page queries `call` by
`caller`. These are reads a page makes, not a background log.

## Who can edit each record fits what it is

- A **call** is a claim that must not change, so it is burned and read-only.
- A **status** moves through its life (`pending → armed → live → won`), so it stays writer-owned
  and mutable; the state machine is the whole point of the record.
- A **caller** links new wallets and socials over time, so it is mutable too.
- A **settlement** is the final accounting of money paid, so it is burned and read-only.

## When each record expires fits what it is

- A **status** only matters while its call is open, so it expires at the call's deadline + 30 days.
- A **call**, **close** and **settlement** are history, so they carry `permissionlessExtension`:
  anyone can pay to extend their life past Rabdi's 182-day cap without being able to edit them.
  A caller funds the life of their own record.
- A **caller** is extended before it lapses for as long as the caller is active.

## Active filters

`super_factor` and `boost_bps` are indexed on the `status` record and queryable today
([arkiv.ts](../packages/arkiv/src/arkiv.ts), `statuses({ minSuper, boosted })`): a high-conviction
feed and a boosted-calls feed. `callsByAsset` reads every call on an asset across callers.

## Planned filter additions

Direction, band and creation time live in the call payload today, not as indexed attributes. To let
users filter the feed by long/short, by conviction band, and by date, we will promote `direction`,
`band` and `createdAt` to indexed attributes on the `call` and `status` records. Each maps to a
filter control on the explore feed.
