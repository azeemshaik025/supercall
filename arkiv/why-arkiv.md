# Why Arkiv

## If we swapped Arkiv for Postgres

Supercall is a public record of trading calls. A caller posts a call; later it wins or loses; the
platform settles it and pays out. The whole product rests on one claim: **the call you see is the
call that was made, and nobody edited it afterwards.** A caller cannot quietly move a stop loss
after the fact, and the platform cannot erase a loss to flatter a caller's record.

Postgres cannot make that claim. Rows can be updated and deleted, and the user has to trust the
operator's word that they weren't. On Arkiv, a call, its close and its settlement are owned by the
burn address and read-only: no key exists to change them. The guarantee is in where the data lives,
not in a promise.

Users also read the data without us. A call, a caller's history and a settlement are public Arkiv
records anyone can query with the SDK or JSON-RPC. If Supercall's servers go down, the record of
every call ever made is still there and still queryable. On Postgres that history is ours alone,
behind our API, gone if we turn it off.

And each record has an owner and an expiry we choose. A call outlives the platform; a status that
only matters while a call is open expires with it. That lifetime is a property of the data itself,
not a cron job we have to run.

## What we keep off Arkiv, and why

The rule, from [packages/arkiv/AGENTS.md](../packages/arkiv/AGENTS.md):

> If someone could be cheated by it, it's on Arkiv. If it only runs the machine, it's in Postgres.

On Postgres (`@supercall/db`): session state, parser caches, rate-limit counters, worker
bookkeeping, anything a user would never audit and no one could be cheated by. Putting it on Arkiv
would cost a write and a lifetime for data nobody queries — Arkiv used as a log that nothing reads,
which the track explicitly does not count.

Private keys and the payment rails stay off Arkiv entirely, on the chain and in the signer.
