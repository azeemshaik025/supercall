# apps/extension

The X browser extension: a live call card under a caller's post. WXT and React, Chrome only.

## Owns

- Finding call posts in the X timeline and drawing the card.
- The side panel: the account, wallet, USDC and caller status, and the copy sheet for the call a
  card's Copy picked. It has no sign-in of its own: a script on the Supercall site
  (`entrypoints/site.ts`) hands over the site's Privy session, and the panel sends it to the API.
- Anything a wallet signs (sign-in, World ID, the caller record, a copy's fee) opens the site in a
  wallet-sized window, where the session and wallet already are. Nothing is signed in X's page.

## Belongs elsewhere

- Signing and the copy flow: `apps/web`, in its popup pages (`/connect`, `/verify`, `/m/<id>`).
- Call data: `apps/api`, in the shapes from `@supercall/api-schema`.

## Spec

"Architecture", "Surfaces", "How a call is made".

## Check

`npx --yes pnpm@11.9.0 --filter @supercall/extension test` and `typecheck`, then README.md's
steps on a logged-in X.
