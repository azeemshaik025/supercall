# Supercall for Chrome

`supercall-extension-1.0.0.zip` is the extension built for the live site
(`supercall.unitlabs.xyz`) and API (`supercall-api.unitlabs.xyz`). Until it's on the Chrome Web
Store, install it by hand:

1. Download the zip and unzip it. You get a folder with `manifest.json` inside.
2. Open `chrome://extensions` (Brave, Arc and Edge work the same way).
3. Turn on **Developer mode**, top right.
4. Click **Load unpacked** and pick the unzipped folder.
5. Pin Supercall from the puzzle-piece menu, then open **x.com**.

Sign in on [supercall.unitlabs.xyz](https://supercall.unitlabs.xyz) once: the extension uses that
sign-in. Click the Supercall icon for the side panel (account, wallet, copy).

Keep the folder where it is: Chrome loads the extension from it. To update, replace the folder's
contents with a newer zip and press **Reload** on the extension in `chrome://extensions`.

To rebuild the zip from source: `pnpm --filter @supercall/extension zip:live`, then copy
`apps/extension/.output/supercallextension-*-chrome.zip` here.
