// The client's copy of the JSON merge patch (shared/utils/mergePatch.ts) has to agree with
// SQLite's json_patch(), which the server applies to the same writes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { mergePatch } from '../shared/utils/mergePatch.ts'

const cases = [
  ['adds and keeps keys', { a: 1, keys: { x: 1 } }, { keys: { y: 1 }, date: 'd' }],
  ['a null removes a key', { a: 1, b: 2 }, { b: null }],
  ['an array replaces, never merges', { keys: ['x'] }, { keys: { y: 1 } }],
  ['a scalar over an object replaces it', { nested: { a: 1 } }, { nested: 3 }],
  ['an object over a scalar replaces it', { nested: 3 }, { nested: { a: 1 } }],
  ['nested merge', { a: { b: { c: 1, d: 2 } } }, { a: { b: { d: 3, e: 4 } } }]
]

test('mergePatch matches SQLite json_patch on every case', () => {
  const db = new DatabaseSync(':memory:')
  const q = db.prepare('SELECT json_patch(?, ?) AS out')
  for (const [name, target, patch] of cases) {
    const sqlite = JSON.parse(q.get(JSON.stringify(target), JSON.stringify(patch)).out)
    assert.deepEqual(mergePatch(target, patch), sqlite, name)
  }
})

test('a non-object patch replaces whatever was there, and the target is never mutated', () => {
  const target = { a: { b: 1 } }
  assert.equal(mergePatch(target, 7), 7)
  assert.deepEqual(mergePatch(target, { a: { c: 2 } }), { a: { b: 1, c: 2 } })
  assert.deepEqual(target, { a: { b: 1 } }, 'untouched')
  assert.deepEqual(mergePatch(undefined, { x: 1 }), { x: 1 }, 'a first write merges into nothing')
})
