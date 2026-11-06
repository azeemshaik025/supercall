import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'wxt'

// An extension can't read .env at run time, so the URLs are written in at build time.
const env = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(env)) process.loadEnvFile(env)
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/,.*/, '').trim()
// Every origin the Supercall site runs on: its sign-in is the extension's (entrypoints/site.ts).
const sites = (process.env.WEB_ORIGIN ?? 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => `${new URL(o).origin}/*`)

// When this build was made, in UTC, so chrome://extensions and the panel show which build is
// running: "1.0.0 · Nov 7 02:10".
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const built = new Date().toLocaleString('en-US', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})
const buildName = `${version} · ${built} UTC`

export default defineConfig({
  imports: false,
  // apps/web is on 3000 and apps/landing on 3200.
  dev: { server: { port: 3300 } },
  manifest: {
    name: 'Supercall',
    version_name: buildName,
    description:
      'See which X posts are real trade calls, the caller’s SuperFactor, and copy a call from your own wallet.',
    homepage_url: web,
    // sidePanel: the account, wallet and copy sheet live in Chrome's side panel.
    permissions: ['storage', 'sidePanel'],
    // A toolbar button, so its icon can follow the browser's theme (entrypoints/background.ts).
    action: { default_title: 'Supercall' },
    // The background script's lookups skip CORS for listed hosts, so the API needs no change.
    host_permissions: [`${new URL(api).origin}/*`],
    // On the Supercall site only: reads its sign-in so the extension never asks again.
    content_scripts: [{ matches: sites, js: ['site.js'] }],
  },
  vite: () => ({
    define: {
      __API_URL__: JSON.stringify(api),
      __WEB_ORIGIN__: JSON.stringify(web),
      __BUILD__: JSON.stringify(buildName),
    },
  }),
})
