# Reach

## Who it is for

Two groups:

1. **Callers** who want to earn from their strategies by publishing calls with real, auditable outcomes.
2. **Followers** who want to find and copy these callers based on a track record nobody can fake.

Today a follower cannot tell whether a caller's "I called ETH at 3,000" is true or backfilled. Supercall turns every call into a public, uneditable Arkiv record with a settled outcome. The caller builds a verifiable history. The follower reads it without trusting anyone's word.

## Can they try it today

Yes. The app is live at [supercall.unitlabs.xyz](https://supercall.unitlabs.xyz). A visitor can browse the call feed and caller profiles. Every call on screen is read from Arkiv. The Chrome extension marks calls on X and shows caller stats.

## What works today

- Publishing calls (from X, Telegram, or in-app)
- Copy-trading with bracket orders through Flash API
- Settlement pipeline with batch payouts on Arc
- Super factor scoring and caller verification
- Cross-chain deposit bridge (Base, Arbitrum, Ethereum to ARC USDC)
- Chrome extension for X integration

## A query anyone can run

Every open call, read from Arkiv with no private key:

```
project = str('supercall') AND kind = str('status') AND (status = str('armed') OR status = str('live'))
```

Run it against the public Rabdi endpoint. See [the curl in the README](../README.md#a-query-you-can-run). Reader code: [packages/arkiv/src/arkiv.ts](../packages/arkiv/src/arkiv.ts).
