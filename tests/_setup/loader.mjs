// Node resolve hook for the test runner: Nuxt's path aliases, resolved the way Nuxt resolves
// them, so a module under app/utils that imports `#shared/utils/dates` or `~/data/compoundInfo`
// loads in plain node (Node 24 strips the types itself). Only the specifier changes — the
// default loader still reads the file. Without this, every app/utils module with an aliased
// import was untestable outside the browser (audit #42 item 43: vialInventory, adherence).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** Alias prefix → directory under the repo root, longest prefix first. */
const ALIASES = [
  ['#shared/', 'shared/'],
  ['~~/', ''],
  ['~/', 'app/']
]

const EXTENSIONS = ['.ts', '.mjs', '.js', '/index.ts']

export async function resolve(specifier, context, next) {
  for (const [prefix, dir] of ALIASES) {
    if (!specifier.startsWith(prefix)) continue
    let file = path.join(ROOT, dir, specifier.slice(prefix.length))
    if (!existsSync(file) || !path.extname(file)) {
      const found = EXTENSIONS.map(ext => file + ext).find(f => existsSync(f))
      if (found) file = found
    }
    return next(pathToFileURL(file).href, context)
  }
  return next(specifier, context)
}
