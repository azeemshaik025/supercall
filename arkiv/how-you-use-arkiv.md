# How we use Arkiv

## The filters fit what the app shows

Each indexed attribute maps to a filter the app uses or will use.

| Query | Screen |
|---|---|
| `kind = caller && handle = X` | A caller's profile page |
| `kind = caller && wallet = X` | Wallet-to-caller lookup |
| `kind = call && caller = X` | Every call a caller has made, on their page |
| `kind = call && asset = WETH` | The per-asset call feed |
| `kind = status && asset = WETH && status in (armed, live)` | The explore feed: open calls on an asset |
| `kind = status && super_factor >= N` | The supercall / high-conviction filter |
| `kind = settlement && caller = X` | A caller's settled track record |

The API reads a full snapshot from Arkiv once a minute ([calls.ts](../apps/api/src/calls.ts), `arkivSnapshot`) and filters it in memory. Every query is billed, so one snapshot serving many page loads is cheaper than one query per request. `snapshot()` calls `find('caller')`, `find('call')` and `find('status')`, filtering only by project, kind and creator. The per-attribute indexes (`asset`, `status`, `super_factor`, `boost_bps`) are used in the SDK's `statuses()` and `callsByAsset()` methods, which are tested but not yet wired to the API — the snapshot covers the current data volume.

## Who can edit each record

- A **call** is a claim that must not change. It is burned and read-only.
- A **status** moves through its life (`pending -> armed -> live -> won`). It stays writer-owned and mutable. The state machine is the whole point of the record.
- A **caller** links new wallets and socials over time. It stays mutable.
- A **settlement** is the final accounting of money paid. It is burned and read-only.

## When each record expires

- A **status** only matters while its call is open. It expires at the call's deadline + 30 days.
- A **call**, **close** and **settlement** are history. They carry `permissionlessExtension`: anyone can pay to extend their life past Rabdi's 182-day cap without editing them. A caller funds the life of their own record.
- A **caller** is extended before it lapses for as long as the caller is active.

## Active filters

`super_factor` and `boost_bps` are indexed on the `status` record. The SDK's `statuses({ minSuper, boosted })` queries them ([arkiv.ts](../packages/arkiv/src/arkiv.ts)). The web app displays `superFactor` on caller profiles and call pages, and filters boosted calls in the browser ([explore/page.tsx](../apps/web/app/(app)/explore/page.tsx)). `callsByAsset` reads every call on an asset across callers. These SDK methods are tested but not yet wired to per-request API queries — the snapshot handles the current volume.

## Planned filter additions

Direction, band and creation time live in the call payload today, not as indexed attributes. To let users filter the feed by long/short, by conviction band and by date, we will promote `direction`, `band` and `createdAt` to indexed attributes on the `call` and `status` records. Each maps to a filter control on the explore feed.
