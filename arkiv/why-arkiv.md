# Why Arkiv

## If we swapped Arkiv for Postgres

Supercall is a public record of trading calls. A caller posts a call. Later it wins or loses. The platform settles it and pays out.

The product makes one claim: **the call you see is the call that was made, and nobody edited it afterwards.** A caller cannot move a stop loss after the fact. The platform cannot erase a loss to flatter a caller's record.

Postgres cannot make that claim. Anyone with database access can update or delete rows. The user has to trust the operator's word that they didn't. On Arkiv, a call, its close and its settlement are owned by the burn address and marked read-only. No key exists to change them. The guarantee comes from where the data lives, not from a promise.

Users read the data without us. Calls, caller histories and settlements are public Arkiv records. Anyone can query them with the SDK or JSON-RPC. If Supercall's servers go down, the record is still there and still queryable for as long as someone pays to extend it. On Postgres that history sits behind our API, gone if we turn it off.

Each record has an owner and an expiry we choose. A call carries `permissionlessExtension`, so anyone can pay to keep it alive past its initial lifetime without editing it. A status that only matters while a call is open expires with it. That lifetime is a property of the data, not a cron job we run.

## What we keep off Arkiv, and why

The rule, from [packages/arkiv/AGENTS.md](../packages/arkiv/AGENTS.md):

> If someone could be cheated by it, it's on Arkiv. If it only runs the machine, it's in Postgres.

On Postgres (`@supercall/db`): session state, parser caches, rate-limit counters, worker bookkeeping. A user would never audit these and no one could be cheated by them. Putting them on Arkiv would cost a write and a lifetime for data nobody queries. The track does not count that.

Private keys and the payment rails stay off Arkiv. They live on the chain and in the signer.
