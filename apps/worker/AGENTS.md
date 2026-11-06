# apps/worker

The long-running process that settles calls: it decides how each call ended, pays it out through
Hisaab in batches of up to 50, and writes the settlement to Arkiv. One process, one settler key.

## Owns

- Reading what a settlement needs: the price path, Flash orders and fills, Hisaab's copies.
- Hisaab's settleRight, settleWrong, refund and anchorSettlement.
- The settlement record on Arkiv.
- The void watch on supercalls, and submitting followers' pre-signed cancels on a void.

## Belongs elsewhere

- Resolution from a price path, and the arithmetic of settlement and SuperFactor:
  `@supercall/core`. The worker gathers inputs and moves results.
- Anything a browser calls, and every write with the writer key: `apps/api`. The API shows a
  settled call's ending and its caller's SuperFactor from the settlement record; nothing patches
  the status record at settlement.

## Spec

"A call's life", "Endings", "Money", "Safety rules", "Architecture", "Data on Arkiv".

## Check

`npx --yes pnpm@11.9.0 --filter @supercall/worker test` and `typecheck`
