# How we use Arkiv

## Indexed attributes map to app filters

Each indexed attribute maps to a filter the app uses.

| Query | Screen |
|---|---|
| `kind = caller AND handle = X` | A caller's profile page |
| `kind = caller AND wallet = X` | Wallet-to-caller lookup |
| `kind = call AND caller = X` | Every call a caller made |
| `kind = call AND asset = WETH` | The per-asset call feed |
| `kind = status AND asset = WETH AND status IN (armed, live)` | Open calls on an asset |
| `kind = status AND super_factor >= N` | The supercall / high-conviction filter |
| `kind = settlement AND caller = X` | A caller's settled track record |

## Snapshot reads, not per-request queries

The API reads a full snapshot from Arkiv once per minute ([calls.ts](../apps/api/src/calls.ts), `arkivSnapshot`). It filters in memory. Every Arkiv query is billed. One snapshot serving many page loads costs less than one query per request.

`snapshot()` calls `find('caller')`, `find('call')`, `find('status')`, and `settlements()` in parallel. The per-attribute indexes (`asset`, `status`, `super_factor`, `boost_bps`) are used in the SDK's `statuses()` and `callsByAsset()` methods. These methods are tested but not yet wired to per-request API calls. The snapshot covers the current data volume.

## Who can edit each record

- A **call** is a claim that must not change. It is burned and read-only.
- A **close** is the judging result. It is burned and read-only.
- A **settlement** is the final accounting of money paid. It is burned and read-only.
- A **status** moves through its life (`pending → armed → live → won`). It stays writer-owned and mutable.
- A **caller** links new wallets and socials over time. It stays mutable.

## When each record expires

- A **status** only matters while its call is open. It expires at the call's deadline + 30 days.
- A **call**, **close**, and **settlement** are history. They carry `permissionlessExtension`. Anyone can pay to extend their life past Rabdi's 182-day cap without editing them.
- A **caller** is extended before it lapses for as long as the caller is active.

## Planned additions

Direction, band, and creation time live in the call payload today, not as indexed attributes. We will promote `direction`, `band`, and `createdAt` to indexed attributes on the `call` and `status` records. Each maps to a filter control on the explore feed.
