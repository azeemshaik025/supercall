# packages/chains

Arc and Base for everything else: viem chain definitions, token and Permit2 addresses, Hisaab's
bindings.

## Rules

- Arc only; Base is a later fallback. Never both.
- Chain ids and addresses are copied exactly from the spec's "Config".
- `CHAIN` is Arc mainnet. `ARC_TESTNET` holds the testnet Hisaab for tests and scripts; nothing
  runs on it, because Flash isn't there.
- Hisaab's ABI is generated: after changing `contracts/evm`, run
  `npx --yes pnpm@11.9.0 --filter @supercall/chains abi`. The test fails until you do.
- `pools.ts`: the pool each coin's calls are judged on, and a coin's price in it at a block. The
  worker resolves calls on these prices; the API takes a posted call's entry and a close's price
  from them.
- `@supercall/chains/local-arc` starts anvil with Hisaab, Permit2 and a test USDC from the Foundry
  build, for the API's and the worker's tests. It has its own import path because it runs Node's
  `child_process`, which nothing a browser loads may import.

## Spec

"Chains", "Config", "Copying" (Permit2, WETH).

## Check

`npx --yes pnpm@11.9.0 --filter @supercall/chains test`
