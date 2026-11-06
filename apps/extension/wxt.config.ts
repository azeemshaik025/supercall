import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'wxt'

// An extension can't read .env at run time, so the URLs are written in at build time.
const env = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(env)) process.loadEnvFile(env)
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/,.*/, '').trim()
// The web app's Privy app: one account and one embedded wallet across the site and the extension.
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? ''
// World ID for becoming a caller from the side panel: the web app's World ID app.
const world = {
  appId: process.env.NEXT_PUBLIC_WORLD_APP_ID ?? '',
  rpId: process.env.NEXT_PUBLIC_WORLD_RP_ID ?? '',
  environment: process.env.NEXT_PUBLIC_WORLD_ENVIRONMENT === 'staging' ? 'staging' : 'production',
}

export default defineConfig({
  imports: false,
  // apps/web is on 3000 and apps/landing on 3200.
  dev: { server: { port: 3300 } },
  manifest: {
    name: 'Supercall',
    // sidePanel: sign-in, wallet and copy live in Chrome's side panel.
    permissions: ['storage', 'sidePanel'],
    // A toolbar button, so its icon can follow the browser's theme (entrypoints/background.ts).
    action: { default_title: 'Supercall' },
    // The background script's lookups skip CORS for listed hosts, so the API needs no change.
    host_permissions: [`${new URL(api).origin}/*`],
  },
  vite: () => ({
    define: {
      __API_URL__: JSON.stringify(api),
      __WEB_ORIGIN__: JSON.stringify(web),
      __PRIVY_APP_ID__: JSON.stringify(privyAppId),
      __WORLD__: JSON.stringify(world),
    },
  }),
})
