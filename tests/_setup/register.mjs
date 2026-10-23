// Registered by `pnpm test` (--import) before the suite loads: lets the plain-node tests import
// app-side modules that use Nuxt's `#shared/…` and `~/…` aliases (see loader.mjs).
import { register } from 'node:module'

register('./loader.mjs', import.meta.url)
