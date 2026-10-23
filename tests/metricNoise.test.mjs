// The one noise table both vitals engines judge by (shared/utils/metricNoise.ts), audit #42 item
// 43: the floors themselves, and a drift guard that the two consumers still read them from here
// rather than carrying a copy each — which is how the digest and the cycle watch once disagreed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { METRIC_NOISE_FLOOR, MIN_WINDOW_POINTS } from '../shared/utils/metricNoise.ts'

test('every metric has a positive floor in its own unit, and a window needs more than a couple of points', () => {
  assert.deepEqual(Object.keys(METRIC_NOISE_FLOOR).sort(), ['bp_systolic', 'hrv', 'recovery', 'rhr', 'sleep', 'weight'])
  for (const [k, v] of Object.entries(METRIC_NOISE_FLOOR)) assert.ok(Number.isFinite(v) && v > 0, `${k} > 0`)
  assert.ok(MIN_WINDOW_POINTS >= 3)
})

test('the trend engine and the cycle vitals watch both take their floors from this table', () => {
  for (const file of ['trends', 'cycleSignals']) {
    const src = readFileSync(new URL(`../shared/utils/${file}.ts`, import.meta.url), 'utf8')
    assert.match(src, /from '\.\/metricNoise\.ts'/, `${file}.ts imports the table`)
    for (const key of Object.keys(METRIC_NOISE_FLOOR)) assert.match(src, new RegExp(`METRIC_NOISE_FLOOR\\.${key}\\b`), `${file}.ts reads ${key} from it`)
    assert.doesNotMatch(src, /MIN_POINTS\s*=\s*\d/, `${file}.ts has no local point minimum`)
    assert.doesNotMatch(src, /threshold:\s*\d/, `${file}.ts has no literal threshold`)
  }
})
