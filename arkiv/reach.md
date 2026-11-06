# Reach

## Who is it for

Two groups. Traders who want to earn from their strategies by publishing calls with real, auditable outcomes. And followers who want to find and follow these traders based on a track record nobody can fake.

Today a follower has no way to tell whether a caller's "I called ETH at 3,000" is true or backfilled. Supercall turns every call into a public, uneditable Arkiv record with a settled outcome. The caller builds a verifiable history. The follower reads it without trusting anyone's word.

## Can they try it today

Yes. The app is live at [supercall.unitlabs.xyz](https://supercall.unitlabs.xyz). A visitor can browse the call feed and caller profiles. Every call on screen is read from Arkiv.

## Will you keep building it after Mumbai

Yes. The settlement pipeline, copy mechanics and super factor scoring are working. Next: finish the cross-chain deposit bridge (Base/Arbitrum/Ethereum to Arc USDC) so users can fund wallets without leaving the app, add direction and conviction filters to the explore feed, build a revenue model around the settlement fees and copy mechanics, and mature the product to handle more call types and market conditions.

## A query anyone can run

Every open call, read straight from Arkiv with no private key:

```
project = str('supercall') AND kind = str('status') AND (status = str('armed') OR status = str('live'))
```

Run it against the public Rabdi endpoint — see [the curl in the README](../README.md#a-query-you-can-run). Reader code: [packages/arkiv/src/arkiv.ts](../packages/arkiv/src/arkiv.ts).
