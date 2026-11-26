// app/utils/format.ts and app/utils/digestParts.ts — the page-side formatters, untested until
// audit #44 item 56. The dates and the workout clock are the ones with a history of being a day
// or five hours off; the finding colours were run over every result on file, which is where the
// blood-group case below came from.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDate, formatDateTerse, formatDayLabel, pdfLabel, qualitativeClass, qualitativeColor, shortSite, workoutTime
} from '../app/utils/format.ts'
import { splitDigest } from '../app/utils/digestParts.ts'

test('a date renders as its own day in every style, wherever the reader is', () => {
  // Anchored at noon: a midnight anchor is the day before for anyone west of UTC.
  assert.equal(formatDate('2026-08-15'), 'Aug 15, 2026')
  assert.equal(formatDate('2026-08-15', 'monthDay'), 'Aug 15')
  assert.equal(formatDate('2026-08-15', 'monthYear'), 'Aug 2026')
  assert.equal(formatDate('2026-08-15', 'long'), 'August 15, 2026')
  assert.equal(formatDate('2026-08-15', 'weekday'), 'Saturday, August 15, 2026')
  // The edges of a year and a leap day.
  assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026')
  assert.equal(formatDate('2026-12-31'), 'Dec 31, 2026')
  assert.equal(formatDate('2028-02-29', 'weekday'), 'Tuesday, February 29, 2028')
})

test('the terse title form, and the day label that drops the year only inside this one', () => {
  assert.equal(formatDateTerse('2026-08-05'), 'AUG 5 2026')
  assert.equal(formatDayLabel('2026-10-25', '2026-11-26'), 'OCT 25')
  assert.equal(formatDayLabel('2020-09-21', '2026-11-26'), 'SEP 21 2020', 'the record starts in 2020: the year has to show')
  assert.equal(formatDayLabel('2025-12-31', '2026-01-01'), 'DEC 31 2025', 'yesterday, across the new year')
})

test('a workout\'s time is its home-timezone clock, whichever source wrote it', () => {
  // The same 7:36 pm ride: Whoop stores the instant in UTC, Health Auto Export the local clock
  // with its offset. Reading the leading digits gave "00:36" for the first.
  assert.equal(workoutTime('2026-10-22T00:36:00.000Z'), '19:36')
  assert.equal(workoutTime('2026-10-21 19:36:00 -0500'), '19:36')
  assert.equal(workoutTime('2026-01-15T01:05:00Z'), '19:05', 'winter: six hours behind UTC')
  assert.equal(workoutTime(null), null)
  assert.equal(workoutTime('not a time'), null)
})

test('an injection site is shortened with its side kept capital', () => {
  assert.equal(shortSite('right_glute'), 'R glute')
  assert.equal(shortSite('left_delt'), 'L delt')
  assert.equal(shortSite('abdomen'), 'abdomen')
  assert.equal(shortSite('oral'), 'oral')
  assert.equal(shortSite('Left Ventrogluteal'), 'L ventrogluteal', 'a site typed by hand, not one of the keys')
})

test('a PDF is labelled by its file name, without the path, the extension or the content hash', () => {
  assert.equal(pdfLabel('/api/labs/pdf/2026-10-17/Quest%20Panel-1a2b3c4d.pdf'), 'Quest Panel')
  assert.equal(pdfLabel('report.PDF'), 'report')
  assert.equal(pdfLabel('labs/2026/cbc-deadbeef.pdf'), 'cbc')
  assert.equal(pdfLabel('x/panel-12345678-9.pdf'), 'panel-12345678-9', 'only a trailing 8-hex hash is noise')
})

test('a finding is amber when it names one, green when it clears one, plain otherwise', () => {
  const warning = ['Mild regurgitation; normal leaflets, no stenosis', 'Moderate concentric thickening', 'Positive', 'Detected', 'Heterozygous c.845G>A', 'Normal with mild dilation']
  const success = ['Normal in size', 'Negative', 'No stenosis, no regurgitation', 'No pericardial effusion. No evidence of pleural fluid accumulation.', 'Not detected', 'NOT DETECTED', 'Unremarkable']
  const neutral = ['A', 'Trace', 'See report', '']
  for (const text of warning) assert.equal(qualitativeColor(text), 'warning', text)
  for (const text of success) assert.equal(qualitativeColor(text), 'success', text)
  for (const text of neutral) assert.equal(qualitativeColor(text), 'neutral', text)
  assert.equal(qualitativeClass('Mild regurgitation'), 'text-warn')
  assert.equal(qualitativeClass('Normal'), 'text-accent')
  assert.equal(qualitativeClass('A'), 'text-body')
})

test('"none detected" and "no … detected" clear a finding, the same as "not detected"', () => {
  assert.equal(qualitativeColor('None detected'), 'success')
  assert.equal(qualitativeColor('No pathogenic variant detected'), 'success')
  assert.equal(qualitativeColor('No mutation detected in F5 or F2'), 'success')
  // …but a detection elsewhere in the result still counts.
  assert.equal(qualitativeColor('No F2 mutation detected. F5 mutation detected'), 'warning')
  assert.equal(qualitativeColor('Heterozygous mutation detected; no second mutation detected'), 'warning')
})

test('a blood group is not a finding: "Rh Factor: Positive" is not a positive test', () => {
  assert.equal(qualitativeColor('Positive'), 'warning', 'with nothing to say what was tested, positive is a finding')
  assert.equal(qualitativeColor('Positive', 'Rh Factor'), 'neutral')
  assert.equal(qualitativeColor('Negative', 'Rh(D) Typing'), 'neutral')
  assert.equal(qualitativeColor('A', 'ABO Grouping'), 'neutral')
  assert.equal(qualitativeColor('O Positive', 'Blood Type'), 'neutral')
  assert.equal(qualitativeClass('Positive', 'Rh Factor'), 'text-body')
  // A test that only starts with the same letters, or mentions Rh later, is still read.
  assert.equal(qualitativeColor('Positive', 'Rheumatoid Factor'), 'warning')
  assert.equal(qualitativeColor('Positive', 'Antibody Screen, Rh'), 'warning')
  assert.equal(qualitativeColor('Negative', 'Factor V (Leiden) Mutation Analysis'), 'success')
})

// ── splitDigest ──────────────────────────────────────────────────────────────

test('a digest\'s closing list is split off as its recommendations', () => {
  const parts = splitDigest('Good week.\n\nSleep held up.\n\n1. **Sleep**: get to bed by 11\n2. Cut the afternoon soda\n3) Retest ferritin\n')
  assert.equal(parts.prose, 'Good week.\n\nSleep held up.')
  assert.deepEqual(parts.recommendations, ['Sleep — get to bed by 11', 'Cut the afternoon soda', 'Retest ferritin'])
  // Bullets, blank lines between the items, Windows line endings.
  assert.deepEqual(splitDigest('Intro\r\n\r\n- a\r\n\r\n* b\r\n\r\n+ c\r\n\r\n'), { prose: 'Intro', recommendations: ['a', 'b', 'c'] })
  // The whole thing a list: nothing left as prose.
  assert.deepEqual(splitDigest('1. a\n2. b'), { prose: '', recommendations: ['a', 'b'] })
})

test('prose stays whole when there is no closing list to split', () => {
  assert.deepEqual(splitDigest(null), { prose: '', recommendations: [] })
  assert.deepEqual(splitDigest(''), { prose: '', recommendations: [] })
  assert.deepEqual(splitDigest('Just prose.\n'), { prose: 'Just prose.', recommendations: [] })
  // One trailing bullet is a sentence with a dash, not a list.
  assert.deepEqual(splitDigest('Prose\n- one only'), { prose: 'Prose\n- one only', recommendations: [] })
  // A list that is not at the end belongs to the prose.
  const early = '- first\n- second\n\nThen the wrap-up.'
  assert.deepEqual(splitDigest(early), { prose: early, recommendations: [] })
  // A number in running text is not an item: "2026. Then" has no list marker at the line start.
  assert.deepEqual(splitDigest('Weight 187.\n3 workouts this week.').recommendations, [])
})
