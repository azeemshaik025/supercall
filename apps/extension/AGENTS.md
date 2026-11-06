# apps/extension

The X browser extension: a live call card under a caller's post. WXT and React, Chrome only.

## Owns

- Finding call posts in the X timeline and drawing the card.
- Copy, which opens our site in a popup. Wallets can't be reached inside X's page, so nothing
  is signed in the extension.

## Belongs elsewhere

- Every signature and the copy flow: `apps/web`.
- Call data: `apps/api`, in the shapes from `@supercall/api-schema`.

## Spec

"Architecture", "Surfaces", "How a call is made".

## Check

`npx --yes pnpm@11.9.0 --filter @supercall/extension test` and `typecheck`, then README.md's
steps on a logged-in X.
