#!/usr/bin/env node
// Full prod -> local sync: dumps the remote D1 database, replaces the local emulated copy,
// then mirrors the referenced R2 objects (lab/DEXA PDFs, progress photos) into local storage.
//
//   pnpm sync:local
//
// Stop `pnpm dev` first — the import needs exclusive access to .wrangler/state/v3/d1.
// The prod dump (your full health history as SQL) is written to the OS temp dir, never the
// repo (the repo is public), and is deleted as soon as the import finishes.
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DB = 'jim-klonow-ski-db'
const LOCAL_D1_STATE = '.wrangler/state/v3/d1'

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' })
}

const tmp = mkdtempSync(join(tmpdir(), 'd1-sync-'))
const dump = join(tmp, 'prod-dump.sql')

try {
  console.log('\n[1/4] Exporting remote D1...')
  run(`npx wrangler d1 export ${DB} --remote --output "${dump}"`)

  console.log('\n[2/4] Resetting local D1...')
  try {
    rmSync(LOCAL_D1_STATE, { recursive: true, force: true })
  }
  catch (err) {
    console.error(`Could not clear ${LOCAL_D1_STATE} — is \`pnpm dev\` still running? Stop it and retry.`)
    throw err
  }

  console.log('\n[3/4] Importing into local D1...')
  run(`npx wrangler d1 execute ${DB} --local --file "${dump}"`)
}
finally {
  // The dump is the entire health history in plaintext — never leave it on disk.
  rmSync(tmp, { recursive: true, force: true })
}

console.log('\n[4/4] Mirroring R2 objects (PDFs/photos) to local...')
run('node scripts/sync-r2-local.mjs')

console.log('\nLocal environment now mirrors prod. Restart `pnpm dev`.')
