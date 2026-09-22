// One-time migration (2026-09-22): `invites.id` used to hold the raw share token; it now holds
// sha256(token) — see hashInviteToken in server/utils/auth.ts for why.
//
// Hashing each existing id IN PLACE keeps every already-issued link working: the URL still
// carries the token, and /api/auth/redeem hashes what it receives before looking the row up.
//
//   node scripts/hash-invite-tokens.mjs --local
//   node scripts/hash-invite-tokens.mjs --remote
//
// Idempotent — a row whose id is already 64 hex characters is left alone, so re-running is a
// no-op. SQLite has no sha256(), which is why this is a script rather than a .sql migration.
//
// Raw tokens are never printed and never written to disk: each UPDATE goes out as its own
// --command rather than a temp .sql file.
//
// One side effect: guest session cookies carry the invite id, so sessions minted BEFORE this
// runs stop validating (the middleware's liveness lookup misses) and those visitors are signed
// out. Their link still works — they just open it again.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const DB = 'jim-klonow-ski-db'
// Invoke wrangler's JS entry directly: on Windows `npx` is a .cmd, which execFileSync won't run
// without a shell, and a shell would mean quoting SQL by hand.
const WRANGLER = join('node_modules', 'wrangler', 'bin', 'wrangler.js')

const target = process.argv.includes('--remote')
  ? '--remote'
  : process.argv.includes('--local') ? '--local' : null

if (!target) {
  console.error('Pass --local or --remote')
  process.exit(1)
}

const IS_HASH = /^[0-9a-f]{64}$/
const IS_TOKEN = /^[\w-]{1,64}$/

function d1(command) {
  const out = execFileSync(
    process.execPath,
    [WRANGLER, 'd1', 'execute', DB, target, '--json', '--command', command],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
  )
  // wrangler prints a banner before the JSON on some versions — start at the first bracket.
  return JSON.parse(out.slice(out.indexOf('[')))
}

const rows = d1('SELECT id FROM invites')[0]?.results ?? []
const ids = rows.map(r => r.id)
const pending = ids.filter(id => !IS_HASH.test(id))

console.log(`${target.slice(2)}: ${ids.length} invite(s), ${pending.length} still keyed by the raw token`)

if (!pending.length) {
  console.log('Nothing to do.')
  process.exit(0)
}

let done = 0
for (const token of pending) {
  if (!IS_TOKEN.test(token)) {
    // Refuse anything that isn't a plain base64url token rather than interpolate it into SQL.
    console.error(`Skipped a row whose id is not a valid token (${token.length} chars)`)
    continue
  }
  const hash = createHash('sha256').update(token).digest('hex')
  d1(`UPDATE invites SET id = '${hash}' WHERE id = '${token}'`)
  done++
  // Identify the row by its new (public-safe) digest, never by the token.
  console.log(`  → ${hash.slice(0, 12)}…`)
}

const left = (d1('SELECT id FROM invites')[0]?.results ?? []).filter(r => !IS_HASH.test(r.id)).length
console.log(`Rehashed ${done}. Rows still holding a raw token: ${left}`)
process.exit(left === 0 ? 0 : 1)
