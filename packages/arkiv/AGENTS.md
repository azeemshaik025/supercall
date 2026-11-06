# packages/arkiv

The five Arkiv records (caller, call, settlement, call status, support note): how each is
written, read and queried.

## Owns

- Payloads, indexed attributes, owners and lifetimes for each record.
- Record units (micro-USDC, basis points, millionths) and the only conversions between them and
  core's dollars and fractions. Why each unit: `arkiv/schema.md`, "Units".
- The read rule in the spec, "Data on Arkiv", and the checks in `arkiv/schema.md`, "How a reader
  checks a record".

## Rules

- If someone could be cheated by it, it's on Arkiv. If it only runs the machine, it's in
  Postgres (`@supercall/db`).
- Calls are created read-only. A correction is a new support note pointing at the original.
- Log each Arkiv problem in `arkiv/friction.md` when you hit it, not afterwards. It is 25% of
  Arkiv's score. Document the records in `arkiv/schema.md`.

## Spec

"Data on Arkiv", "Arkiv or Postgres".

## Check

`npx --yes pnpm@11.9.0 --filter @supercall/arkiv test`
