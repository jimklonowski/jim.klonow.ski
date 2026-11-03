// The labs save sanitizers (server/utils/labs.ts) — what reaches labs_entries / dexa_entries.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergedFasting, purgeOrphanPdfs, sanitizeDexa, sanitizeMarkers } from '../server/utils/labs.ts'

test('markers: numbers and numeric strings are kept, unknown keys and junk are dropped', () => {
  const { markers, dropped } = sanitizeMarkers({ hematocrit: 51.7, ferritin: ' 35 ', not_a_marker: 1, ldl: 'high' })
  assert.deepEqual(markers, { hematocrit: 51.7, ferritin: 35 })
  assert.deepEqual(dropped.sort(), ['ldl', 'not_a_marker'])
})

test('markers: a blank string is no reading — never a 0 (audit #43 item 3)', () => {
  const { markers, dropped } = sanitizeMarkers({ testosterone_total: '', estradiol: '   ', hematocrit: null, ferritin: 0 })
  assert.deepEqual(markers, { ferritin: 0 }, 'a real 0 is still a reading')
  assert.deepEqual(dropped, [], 'blank is absent, not refused')
})

test('dexa: a blank figure is absent, so an emptied block is null rather than a row of zeros', () => {
  const d = sanitizeDexa({
    total: { body_fat_pct: '17.6', lean_mass_lbs: '' },
    vat: { volume_in3: ' ', fat_mass_lbs: '' },
    ag_ratio: ''
  })
  assert.deepEqual(d.total, { body_fat_pct: 17.6 })
  assert.equal(d.vat, null)
  assert.equal(d.ag_ratio, null)
  assert.deepEqual(d.dropped, [])
})

test('fasting: an add-on panel never clears a fasting draw', () => {
  assert.equal(mergedFasting(true, { fasting: false }), true)
  assert.equal(mergedFasting(true, {}), true)
  assert.equal(mergedFasting(false, { fasting: true }), true)
  assert.equal(mergedFasting(false, { fasting: false }), false)
})

test('fasting: a flag flipped by hand is a correction and wins either way (audit #43 item 4)', () => {
  assert.equal(mergedFasting(true, { fasting: false, fasting_set: true }), false, 'a draw wrongly saved as fasting can be cleared')
  assert.equal(mergedFasting(false, { fasting: true, fasting_set: true }), true)
  assert.equal(mergedFasting(true, { fasting_set: true }), false, 'flipped to NO arrives as fasting: false — absent reads as not fasting')
})

test('orphan PDFs: only an unreferenced, bare .pdf key past the grace goes; the bucket is paged (audit #43 item 45)', async () => {
  const DAY = 86_400_000
  const now = Date.parse('2026-11-03T12:00:00Z')
  const at = days => new Date(now - days * DAY)
  // Enough of D1 for the sweep: the two `sources` reads. A number inside a sources array is
  // junk the sweep must skip rather than crash on.
  const d1 = {
    prepare: sql => ({
      async all() {
        const dexa = [{ sources: '["DEXA-2026-09-12.pdf"]' }, { sources: null }]
        const labs = [{ sources: '["CHW-2026-10-17.pdf", 7]' }, { sources: '[]' }]
        return { results: sql.includes('dexa_entries') ? dexa : labs }
      }
    })
  }
  const objects = [
    { key: 'CHW-2026-10-17.pdf', uploaded: at(60) }, // a draw names it
    { key: 'DEXA-2026-09-12.pdf', uploaded: at(60) }, // a scan names it
    { key: 'Preview-never-saved.pdf', uploaded: at(8) }, // the orphan: past the grace
    { key: 'Preview-on-screen.pdf', uploaded: at(1) }, // inside the grace
    { key: 'Exactly-at-the-edge.pdf', uploaded: at(7) }, // not yet older than the grace
    { key: 'backups/d1/jim-klonow-ski-db/2026-09-24.json.gz', uploaded: at(400) }, // prefixed: never a candidate
    { key: 'demo/seed.json', uploaded: at(400) },
    { key: 'Odd%20Encoded%20Name.pdf', uploaded: at(400) } // not a lab-pdf key (measured in the local bucket): left alone
  ]
  const deleted = []
  const bucket = {
    lists: 0,
    async list({ cursor }) {
      this.lists++
      const start = cursor ? Number(cursor) : 0
      const truncated = start + 3 < objects.length
      return { objects: objects.slice(start, start + 3), truncated, cursor: truncated ? String(start + 3) : undefined }
    },
    async delete(keys) {
      deleted.push(...keys)
    }
  }
  assert.equal(await purgeOrphanPdfs(d1, bucket, now), 1)
  assert.deepEqual(deleted, ['Preview-never-saved.pdf'])
  assert.equal(bucket.lists, 3, 'every page of the bucket is read')
})

test('orphan PDFs: nothing to remove means no delete call', async () => {
  const d1 = { prepare: () => ({ async all() {
    return { results: [{ sources: '["CHW-2026-10-17.pdf"]' }] }
  } }) }
  const bucket = {
    async list() {
      return { objects: [{ key: 'CHW-2026-10-17.pdf', uploaded: new Date(0) }], truncated: false }
    },
    async delete() {
      assert.fail('an empty delete is a wasted R2 call')
    }
  }
  assert.equal(await purgeOrphanPdfs(d1, bucket, Date.now()), 0)
})
