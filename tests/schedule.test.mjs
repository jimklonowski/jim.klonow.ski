// The cron schedule has to be declared twice: server/schedule.ts tells Nitro which tasks a cron
// runs, and wrangler.jsonc tells Cloudflare which crons to fire at all. Nothing at build time
// checks that they agree, and a mismatch fails silently: a cron Cloudflare never fires simply
// never runs. These tests are that check.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { SCHEDULED_TASKS, TASK_STALE_AFTER_HOURS } from '../server/schedule.ts'

const root = new URL('../', import.meta.url)

/** JSON with // and /* *\/ comments and trailing commas, which is what wrangler accepts. */
function parseJsonc(text) {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      // Copy a string literal verbatim, escapes included, so "https://…" isn't read as a comment.
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j
    }
    else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    }
    else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1
    }
    else {
      out += c
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'))
}

const wrangler = parseJsonc(readFileSync(new URL('wrangler.jsonc', root), 'utf8'))
const fired = wrangler.triggers?.crons ?? []
const scheduled = Object.keys(SCHEDULED_TASKS)

test('the JSONC reader keeps URLs in strings and drops comments', () => {
  assert.deepEqual(
    parseJsonc('{ "a": "https://x.dev/y", // note\n /* block */ "b": [1, 2,], }'),
    { a: 'https://x.dev/y', b: [1, 2] }
  )
})

test('Cloudflare fires exactly the crons Nitro has tasks for', () => {
  const missingInWrangler = scheduled.filter(c => !fired.includes(c))
  const unusedInWrangler = fired.filter(c => !scheduled.includes(c))
  assert.deepEqual(missingInWrangler, [], 'scheduled in server/schedule.ts but never fired: add to wrangler.jsonc triggers.crons')
  assert.deepEqual(unusedInWrangler, [], 'fired by wrangler.jsonc but no task runs: remove it, or schedule a task')
  assert.equal(new Set(fired).size, fired.length, 'duplicate cron in wrangler.jsonc')
})

test('every scheduled task name has a task file', () => {
  for (const [cron, tasks] of Object.entries(SCHEDULED_TASKS)) {
    assert.ok(tasks.length > 0, `${cron} runs nothing`)
    for (const name of tasks) {
      // Nitro names a task by its path under server/tasks, with ":" for "/".
      const file = new URL(`server/tasks/${name.replaceAll(':', '/')}.ts`, root)
      assert.ok(existsSync(file), `${cron} → ${name}: no server/tasks/${name.replaceAll(':', '/')}.ts`)
    }
  }
})

test('crons are five-field expressions', () => {
  for (const cron of scheduled) assert.equal(cron.trim().split(/\s+/).length, 5, cron)
})

test('every scheduled task has a staleness window for /api/health, and nothing else does', () => {
  const tasks = [...new Set(Object.values(SCHEDULED_TASKS).flat())].sort()
  assert.deepEqual(Object.keys(TASK_STALE_AFTER_HOURS).sort(), tasks)
  for (const [name, hours] of Object.entries(TASK_STALE_AFTER_HOURS)) {
    assert.ok(Number.isFinite(hours) && hours >= 24, `${name}: ${hours}h is shorter than any cron cadence here`)
  }
})
