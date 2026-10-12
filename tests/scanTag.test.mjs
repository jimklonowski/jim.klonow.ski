// The body mesh's scan tags (shared/utils/scanTag.ts): stable, short, and not the date.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanTag } from '../shared/utils/scanTag.ts'

test('a scan tag is a stable 8-hex token that does not contain the date', () => {
  const tag = scanTag('2026-09-30')
  assert.match(tag, /^[0-9a-f]{8}$/)
  assert.equal(scanTag('2026-09-30'), tag, 'deterministic')
  assert.notEqual(scanTag('2026-06-12'), tag, 'a different scan, a different tag')
  assert.notEqual(scanTag('2026-09-29'), tag, 'one day apart, a different tag')
  assert.ok(!tag.includes('2026') && !tag.includes('09'), 'the date is not in it')
})
