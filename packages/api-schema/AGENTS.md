# packages/api-schema

The contract between the browser (web, extension) and `apps/api`: a zod schema for every request
and response. Both sides import it; neither declares its own wire types.

## Rules

- Shapes only. Rules and arithmetic live in `@supercall/core`.
- A breaking change is agreed by both sides (Rakesh for web, Azeem for api) before it merges.

## Spec

"Architecture".

## Check

`npx --yes pnpm@11.9.0 --filter @supercall/api-schema test`
