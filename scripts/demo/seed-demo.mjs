#!/usr/bin/env node
// Seeds the demo sandbox: materializes scripts/demo/demo-seed.json (relative @D<n> offsets ->
// real dates anchored to yesterday, Chicago time), wipes + repopulates the DEMO_DB D1 database,
// uploads the seed to R2 (demo/seed.json in LABS_BUCKET, read nightly by the demo:reset task)
// and the placeholder photo SVGs to PHOTOS_BUCKET under demo/.
//
//   pnpm demo:seed:local     — wrangler's local emulator (stop `pnpm dev` first)
//   pnpm demo:seed:remote    — the real Cloudflare resources (requires wrangler login)
//
// NOTE: `pnpm sync:local` deletes ALL of .wrangler/state/v3/d1 (demo DB included) when it
// re-baselines from prod — run `pnpm db:migrate` (builds the empty demo DB) and then
// `pnpm demo:seed:local` after it.
//
// The date materialization is shared/utils/demoSeed.ts, the same code server/tasks/demo/reset.ts
// runs nightly (node imports the .ts directly) — one implementation, so the two can't drift.
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { materializeSeedRows } from '../../shared/utils/demoSeed.ts'
import { localDaysAgo } from '../../shared/utils/time.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const mode = process.argv.includes('--remote') ? 'remote' : process.argv.includes('--local') ? 'local' : null
if (!mode) {
  console.error('Usage: node scripts/demo/seed-demo.mjs --local | --remote')
  process.exit(1)
}

const SEED_PATH = join(HERE, 'demo-seed.json')
const SEED_R2_KEY = 'demo/seed.json'
const LABS_BUCKET_NAME = 'jim-klonow-ski-labs'
const PHOTOS_BUCKET_NAME = 'jim-klonow-ski-photos'
const DEMO_DB_NAME = 'jim-klonow-ski-demo'
const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'))

// --- Date materialization (shared/utils/demoSeed.ts) ----------------------------------------

// Anchor = yesterday as a Chicago calendar day, moved by calendar days from there. The old
// `Date.now() - (offset + 1) * 86400000` stepped in hours, and across a DST change two offsets
// landed on one date — a primary-key clash on journal_entries after the wipe.
const anchor = localDaysAgo(1)
const materializedRows = table => materializeSeedRows(table, anchor)

// --- Local: programmatic bindings ------------------------------------------------------------

async function seedLocal() {
  const { getPlatformProxy } = await import('wrangler')
  const proxy = await getPlatformProxy({
    configPath: 'wrangler.jsonc',
    persist: { path: '.wrangler/state/v3' }
  })
  try {
    const db = proxy.env.DEMO_DB
    for (const [name, table] of Object.entries(seed.tables)) {
      await db.prepare(`DELETE FROM ${name}`).run()
      const rows = materializedRows(table)
      const perStatement = Math.max(1, Math.floor(90 / table.cols.length)) // D1 caps ~100 bound params
      for (let i = 0; i < rows.length; i += perStatement) {
        const chunk = rows.slice(i, i + perStatement)
        const placeholders = chunk.map(r => `(${r.map(() => '?').join(',')})`).join(',')
        await db.prepare(`INSERT INTO ${name} (${table.cols.join(',')}) VALUES ${placeholders}`)
          .bind(...chunk.flat())
          .run()
      }
      console.log(`  ${name}: ${rows.length} rows`)
    }

    await proxy.env.LABS_BUCKET.put(SEED_R2_KEY, readFileSync(SEED_PATH), {
      httpMetadata: { contentType: 'application/json' }
    })
    console.log(`  ${LABS_BUCKET_NAME}/${SEED_R2_KEY}`)
    for (const file of readdirSync(join(HERE, 'assets')).filter(f => f.endsWith('.svg'))) {
      await proxy.env.PHOTOS_BUCKET.put(`demo/${file}`, readFileSync(join(HERE, 'assets', file)), {
        httpMetadata: { contentType: 'image/svg+xml' }
      })
      console.log(`  ${PHOTOS_BUCKET_NAME}/demo/${file}`)
    }
  }
  finally {
    await proxy.dispose()
  }
}

// --- Remote: wrangler CLI --------------------------------------------------------------------

function sqlLiteral(v) {
  if (v == null) return 'NULL'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replaceAll('\'', '\'\'')}'`
}

function seedRemote() {
  const statements = []
  for (const [name, table] of Object.entries(seed.tables)) {
    statements.push(`DELETE FROM ${name};`)
    const rows = materializedRows(table)
    for (let i = 0; i < rows.length; i += 40) {
      const chunk = rows.slice(i, i + 40)
      const values = chunk.map(r => `(${r.map(sqlLiteral).join(',')})`).join(',\n')
      statements.push(`INSERT INTO ${name} (${table.cols.join(',')}) VALUES\n${values};`)
    }
    console.log(`  ${name}: ${rows.length} rows`)
  }

  const tmp = mkdtempSync(join(tmpdir(), 'demo-seed-'))
  const sqlFile = join(tmp, 'demo-seed.sql')
  try {
    writeFileSync(sqlFile, statements.join('\n'))
    execSync(`npx wrangler d1 execute ${DEMO_DB_NAME} --remote -y --file "${sqlFile}"`, { stdio: 'inherit' })
  }
  finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  execSync(`npx wrangler r2 object put "${LABS_BUCKET_NAME}/${SEED_R2_KEY}" --remote --file "${SEED_PATH}" --content-type application/json`, { stdio: 'inherit' })
  for (const file of readdirSync(join(HERE, 'assets')).filter(f => f.endsWith('.svg'))) {
    execSync(`npx wrangler r2 object put "${PHOTOS_BUCKET_NAME}/demo/${file}" --remote --file "${join(HERE, 'assets', file)}" --content-type image/svg+xml`, { stdio: 'inherit' })
  }
}

console.log(`Seeding demo sandbox (${mode})...`)
if (mode === 'local') await seedLocal()
else seedRemote()
console.log('Done.')
