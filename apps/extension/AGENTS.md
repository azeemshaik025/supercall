# apps/extension

The X browser extension: a live call card under a caller's post. WXT and React, Chrome only.

## Owns

- Finding call posts in the X timeline and drawing the card.
- The side panel: Privy sign-in (the web app's Privy app, so the same account and embedded
  wallet), the wallet's USDC on Arc, and the copy sheet for the call a card's Copy picked. X's
  sign-in goes to X and back, so it runs in its own window (`entrypoints/auth`).
- Nothing is signed inside X's page: wallets only reach the extension's own pages. When the side
  panel can't open, Copy falls back to our site in a popup.

## Belongs elsewhere

- The copy flow's API (quote, fee, order): `apps/api`. Until it takes copies, the panel shows
  the fee and leaves Pay off.
- Call data: `apps/api`, in the shapes from `@supercall/api-schema`.

## Spec

"Architecture", "Surfaces", "How a call is made".

## Check

`npx --yes pnpm@11.9.0 --filter @supercall/extension test` and `typecheck`, then README.md's
steps on a logged-in X.
