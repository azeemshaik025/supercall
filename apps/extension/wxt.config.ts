import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'wxt'

// An extension can't read .env at run time, so the URLs are written in at build time.
const env = fileURLToPath(new URL('../../.env', import.meta.url))
if (existsSync(env)) process.loadEnvFile(env)
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'
const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/,.*/, '').trim()

export default defineConfig({
  imports: false,
  // apps/web is on 3000 and apps/landing on 3200.
  dev: { server: { port: 3300 } },
  manifest: {
    name: 'Supercall',
    permissions: ['storage'],
    // A toolbar button, so its icon can follow the browser's theme (entrypoints/background.ts).
    action: { default_title: 'Supercall' },
    // The background script's lookups skip CORS for listed hosts, so the API needs no change.
    host_permissions: [`${new URL(api).origin}/*`],
  },
  vite: () => ({
    define: { __API_URL__: JSON.stringify(api), __WEB_ORIGIN__: JSON.stringify(web) },
  }),
})
