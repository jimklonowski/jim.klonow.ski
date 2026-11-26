// Nitro hands server code every export of server/utils and shared/utils as a global (its
// auto-imports), so most server modules name helpers they never import — parseJournalRow,
// isMissingTable, loadCycles… In plain node those names are simply undefined. This puts them
// where Nitro puts them, for the test process only (the runner gives each test file its own).
//
// A name already on globalThis (fetch, URL…) is never replaced. `createError` is h3's, reduced to
// what the code reads back: an Error carrying statusCode. Audit #44 item 56.
import { readdirSync } from 'node:fs'

const ROOT = new URL('../../', import.meta.url)

/** Modules that plain node cannot load, and nothing under test needs. */
const SKIP = new Set(['server/utils/taskRuns.ts']) // a TypeScript parameter property: not strippable

export async function installAutoImports() {
  globalThis.createError ??= ({ statusCode = 500, message = '', statusMessage, data } = {}) =>
    Object.assign(new Error(message || statusMessage || String(statusCode)), { statusCode, statusMessage, data })
  for (const dir of ['shared/utils', 'server/utils']) {
    for (const file of readdirSync(new URL(`${dir}/`, ROOT)).filter(f => f.endsWith('.ts')).sort()) {
      if (SKIP.has(`${dir}/${file}`)) continue
      const module = await import(new URL(`${dir}/${file}`, ROOT))
      for (const [name, value] of Object.entries(module)) {
        if (!(name in globalThis)) globalThis[name] = value
      }
    }
  }
}
