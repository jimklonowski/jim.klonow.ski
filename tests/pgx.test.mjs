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

// Audit #44 item 27: the marker card is the caller, and the estradiol card asks for both assays.
test('a card that stands for several keys gets a note naming any of them, once, in the order entered', () => {
  const more = [
    ...notes,
    { id: 3, gene: 'GENE3', genotype: null, compounds: [], markers: ['estradiol_sensitive', 'estradiol'], note: 'Both assays.' },
    { id: 4, gene: 'GENE4', genotype: null, compounds: [], markers: ['estradiol'], note: 'One assay.' }
  ]
  assert.deepEqual(pgxNotesForMarker(more, ['estradiol_sensitive', 'estradiol']).map(n => n.id), [3, 4])
  assert.deepEqual(pgxNotesForMarker(more, 'estradiol_sensitive').map(n => n.id), [3])
  assert.deepEqual(pgxNotesForMarker(more, ['bilirubin']).map(n => n.id), [2])
  assert.deepEqual(pgxNotesForMarker(more, []), [])
  assert.deepEqual(pgxNotesForMarker(more, 'bili'), [], 'a key matches whole, never as a fragment')
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
