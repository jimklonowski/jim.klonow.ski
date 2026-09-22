// Unit tests for the role→page policy (shared/utils/access.ts). This is the one piece of
// security-relevant logic that is pure, and it is read by three callers — the server middleware,
// the global route middleware, and the ⌘K palette — so a change here moves what a share link
// can reach. Same plain node:test + native TS type-stripping setup as cycles.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canAccessPage, isFullAccessRole, isProtectedPage, LOGIN_PATH, normalizePath
} from '../shared/utils/access.ts'

const ROLES = ['owner', 'friend', 'doctor', 'demo']

/** path → the roles allowed to open it. Anything not listed is denied for that role. */
const MATRIX = {
  '/labs': ['owner', 'friend', 'doctor', 'demo'],
  '/labs/dexa': ['owner', 'friend', 'doctor', 'demo'],
  '/labs/upload': ['owner'],
  '/journal': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/trends': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/compounds': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/workouts': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/calendar': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/supplements': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/vaccines': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/cycles': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/cycle/3': ['owner', 'friend', 'doctor', 'demo'],
  '/journal/compound/HGH': ['owner', 'friend', 'doctor', 'demo'],
  '/tools/calculator': ['owner', 'friend', 'doctor', 'demo'],
  // The daily log, the ledger and the photos are the doctor's blind spot by design.
  '/journal/2026-09-22': ['owner', 'friend', 'demo'],
  '/journal/entries': ['owner', 'friend', 'demo'],
  '/journal/photos': ['owner', 'friend', 'demo'],
  // Spends money, uploads binaries, or manages access.
  '/tools/import': ['owner'],
  '/tools/sharing': ['owner'],
  '/ask': ['owner'],
  // Demo gets the inventory (it edits the sandbox); friend and doctor do not.
  '/tools/inventory': ['owner', 'demo']
}

test('every role sees exactly the pages the policy grants it', () => {
  for (const [path, allowed] of Object.entries(MATRIX)) {
    for (const role of ROLES) {
      assert.equal(
        canAccessPage(role, path), allowed.includes(role),
        `${role} → ${path} should be ${allowed.includes(role) ? 'allowed' : 'denied'}`
      )
    }
  }
})

test('owner is never denied anything', () => {
  for (const path of Object.keys(MATRIX)) assert.equal(canAccessPage('owner', path), true)
})

test('the doctor allowlist is closed — an unlisted page is denied', () => {
  assert.equal(canAccessPage('doctor', '/journal/something-new'), false)
  // …while friend and demo are deny-list based, so a new page is open to them.
  assert.equal(canAccessPage('friend', '/journal/something-new'), true)
  assert.equal(canAccessPage('demo', '/journal/something-new'), true)
})

test('isFullAccessRole covers the daily-entry surfaces', () => {
  assert.deepEqual(ROLES.map(isFullAccessRole), [true, true, false, true])
  assert.equal(isFullAccessRole(null), false)
  assert.equal(isFullAccessRole(undefined), false)
})

test('isProtectedPage gates every section and nothing else', () => {
  for (const p of ['/labs', '/labs/dexa', '/journal', '/journal/2026-09-22', '/tools', '/tools/calculator', '/ask']) {
    assert.equal(isProtectedPage(p), true, p)
  }
  for (const p of ['/', '/privacy', '/share/abc', '/demo', '/labsomething', '/asking']) {
    assert.equal(isProtectedPage(p), false, p)
  }
  // The login page sits inside the /labs prefix and is deliberately still "protected" here —
  // both middlewares exempt it explicitly, so the prefix test stays a pure prefix test.
  assert.equal(isProtectedPage(LOGIN_PATH), true)
})

test('trailing slashes do not open a hole', () => {
  assert.equal(normalizePath('/journal/'), '/journal')
  assert.equal(normalizePath('/'), '/')
  assert.equal(normalizePath(''), '/')
  assert.equal(isProtectedPage('/ask/'), true)
  assert.equal(canAccessPage('doctor', normalizePath('/journal/entries/')), false)
})
