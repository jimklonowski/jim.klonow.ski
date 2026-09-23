// The palette lives in two places that can't share one source: main.css @theme tokens, for
// Tailwind classes, and the THEME map in app/utils/chartTheme.ts, for echarts options and inline
// styles, which need literal colors. This keeps the second an exact copy of the first.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BAND_COLORS, CHART_AXIS, STATUS_COLORS, THEME } from '../app/utils/chartTheme.ts'

const css = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8')
const themeBlock = css.slice(css.indexOf('@theme'), css.indexOf('}', css.indexOf('@theme')))
const tokens = Object.fromEntries(
  [...themeBlock.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(([, name, hex]) => [name, hex.toLowerCase()])
)

test('main.css declares the tokens this test reads', () => {
  assert.ok(Object.keys(tokens).length > 20, `parsed ${Object.keys(tokens).length} tokens`)
})

test('every chartTheme color equals its main.css token', () => {
  for (const [name, hex] of Object.entries(THEME)) {
    assert.ok(name in tokens, `--color-${name} is missing from main.css`)
    assert.equal(hex.toLowerCase(), tokens[name], `THEME['${name}'] drifted from --color-${name}`)
  }
})

test('status, band and axis colors come from the theme, not new literals', () => {
  const palette = new Set(Object.values(THEME))
  for (const [group, colors] of Object.entries({ STATUS_COLORS, BAND_COLORS, CHART_AXIS })) {
    for (const [k, v] of Object.entries(colors)) assert.ok(palette.has(v), `${group}.${k} = ${v} is not a THEME color`)
  }
  assert.deepEqual(Object.keys(STATUS_COLORS).sort(), ['high', 'low', 'optimal', 'unknown'], 'getStatus() values')
})
