// Drug-gene notes (shared/utils/pgx.ts) — audit #43 item 78. Fixtures are made up: no real
// genotype belongs in this repository.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compoundMatches, parseList, pgxHeading, pgxNotesForCompound, pgxNotesForMarker, pgxPromptBlock } from '../shared/utils/pgx.ts'

const notes = [
  { id: 1, gene: 'GENE1', genotype: '*1/*9 — slow', compounds: ['Examplifen', 'Samplomid'], markers: [], note: 'Converts poorly; prefer the alternative.' },
  { id: 2, gene: 'GENE2', genotype: null, compounds: [], markers: ['bilirubin'], note: 'Runs a little high at baseline.' }
]

test('a note matches its compound by name, tolerant of salts and case, never by a short fragment', () => {
  assert.equal(compoundMatches('Examplifen', 'examplifen citrate'), true)
  assert.equal(compoundMatches('Examplifen Citrate', 'Examplifen'), true)
  assert.equal(compoundMatches('T3', 'T3 Cytomel'), false, 'under four characters only an exact match counts')
  assert.equal(compoundMatches('T3', 't3'), true)
  assert.equal(compoundMatches('Examplifen', 'Otheramine'), false)
  assert.deepEqual(pgxNotesForCompound(notes, 'Samplomid').map(n => n.id), [1])
  assert.deepEqual(pgxNotesForCompound(notes, 'HGH'), [])
  assert.deepEqual(pgxNotesForMarker(notes, 'bilirubin').map(n => n.id), [2])
  assert.deepEqual(pgxNotesForMarker(notes, 'ldl'), [])
})

test('headings, the typed list, and the prompt block', () => {
  assert.equal(pgxHeading(notes[0]), 'GENE1 *1/*9 — slow')
  assert.equal(pgxHeading(notes[1]), 'GENE2')
  assert.deepEqual(parseList(' Examplifen, samplomid;  examplifen\n\n Thirdol '), ['Examplifen', 'samplomid', 'Thirdol'])
  const block = pgxPromptBlock(notes)
  assert.match(block, /^Pharmacogenomic notes/)
  assert.match(block, /- GENE1 \*1\/\*9 — slow \(compounds: Examplifen, Samplomid\): Converts poorly/)
  assert.match(block, /- GENE2 \(markers: bilirubin\): Runs a little high/)
  assert.equal(pgxPromptBlock([]), '')
})
