// The day form's two prefill helpers (app/data/journal.ts) — audit #43 item 52: "copy prev"
// adds the last dosed day's doses without replacing what is typed, and "+ add" opens a soda
// row with the last soda named.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyDoses, lastSoda } from '../app/data/journal.ts'

const dose = (compound, site = '', extra = {}) => ({ time: '08:00', compound, dose: 1, unit: 'mg', site, ...extra })

test('copy prev keeps the typed rows, drops blank ones, adds the rest with sites mirrored', () => {
  const typed = [dose('HGH', 'abdomen', { dose: 2, unit: 'iu' }), dose('', 'left_glute')]
  const previous = [dose('hCG', 'left_glute', { dose: 250, unit: 'iu' }), dose('HGH', 'abdomen', { dose: 2.5, unit: 'iu' })]
  const out = copyDoses(typed, previous)
  assert.deepEqual(out.map(p => [p.compound, p.dose, p.site]), [
    ['HGH', 2, 'abdomen'], // typed, kept as typed (2 IU, not the previous 2.5)
    ['hCG', 250, 'right_glute'] // added, on the mirror site
  ])
  assert.deepEqual(copyDoses([], previous).map(p => p.site), ['right_glute', 'abdomen'], 'an empty form gets the whole day')
  assert.deepEqual(copyDoses([dose('', '')], []), [], 'nothing to copy leaves no blank row behind')
})

test('the next soda is the last one named — today first, then the newest day with one', () => {
  const entries = [
    { date: '2026-10-01', sodas: [{ time: '12:00', drink: 'Coke', size: '12oz can' }] },
    { date: '2026-10-03', sodas: [{ time: '15:00', drink: 'Dr Pepper', size: '20oz bottle' }, { time: '18:00', drink: '', size: '' }] },
    { date: '2026-10-04', sodas: [] }
  ]
  assert.deepEqual(lastSoda([], entries), { drink: 'Dr Pepper', size: '20oz bottle' }, 'a blank tap on the newest day is skipped')
  assert.deepEqual(lastSoda([{ time: '09:00', drink: 'Sprite', size: '12oz can' }], entries), { drink: 'Sprite', size: '12oz can' }, 'today\'s own row wins')
  assert.deepEqual(lastSoda([{ time: '09:00', drink: '', size: '' }], entries), { drink: 'Dr Pepper', size: '20oz bottle' })
  assert.equal(lastSoda([], [{ date: '2026-10-01', sodas: [] }]), null)
  assert.equal(lastSoda([], []), null)
})
