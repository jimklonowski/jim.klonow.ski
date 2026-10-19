// The palette lives in three places that must agree: the @theme tokens in main.css (Tailwind, and
// the default preset), shared/utils/themePresets.ts (the presets as data — phosphor a copy of
// main.css, the others derived from it), and app/assets/css/themes.css (generated from the
// presets). The chart layer names tokens as var() strings on top. This holds the copies together,
// keeps the generated file fresh, and gates every preset on the contrast the default was tuned to.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ANNOTATION_STYLE, BAND_COLORS, CHART_AXIS, CHART_TOOLTIP, STATUS_COLORS, THEME } from '../app/utils/chartTheme.ts'
import {
  DEFAULT_THEME, PRESETS, SCALE_STEPS, THEME_IDS, THEME_LIST, TOKEN_KEYS, accentScale, isThemeId
} from '../shared/utils/themePresets.ts'
import { DEFAULT_FONT, FONTS, FONT_IDS, FONT_LIST, isFontId } from '../shared/utils/displayFonts.ts'
import { displayCss } from '../shared/utils/displayCss.ts'
import { contrast, hexToOklch, hueDistance, oklchToHex } from '../shared/utils/oklch.ts'

const root = new URL('../', import.meta.url)
const css = readFileSync(new URL('app/assets/css/main.css', root), 'utf8')
const themeBlock = css.slice(css.indexOf('@theme'), css.indexOf('}', css.indexOf('@theme')))
const tokens = Object.fromEntries(
  [...themeBlock.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map(([, name, hex]) => [name, hex.toLowerCase()])
)
const HEX = /^#[0-9a-f]{6}$/
const phosphor = PRESETS[DEFAULT_THEME]

test('main.css declares the tokens this test reads', () => {
  assert.ok(Object.keys(tokens).length > 20, `parsed ${Object.keys(tokens).length} tokens`)
})

test('the default preset is main.css, token for token and scale step for step', () => {
  assert.equal(DEFAULT_THEME, 'phosphor')
  for (const key of TOKEN_KEYS) {
    assert.ok(key in tokens, `--color-${key} is missing from main.css`)
    assert.equal(phosphor.tokens[key], tokens[key], `PRESETS.phosphor.tokens['${key}'] drifted from --color-${key}`)
  }
  for (const step of SCALE_STEPS) {
    assert.equal(phosphor.scale[step], tokens[`phosphor-${step}`], `phosphor scale ${step} drifted from --color-phosphor-${step}`)
  }
})

test('every preset sets every token and scale step as #rrggbb', () => {
  assert.deepEqual(THEME_LIST.map(p => p.id), [...THEME_IDS])
  for (const p of THEME_LIST) {
    assert.equal(PRESETS[p.id], p)
    assert.ok(p.label && p.blurb, `${p.id} needs a label and blurb for the picker`)
    for (const key of TOKEN_KEYS) assert.match(p.tokens[key] ?? '', HEX, `${p.id}.${key}`)
    for (const step of SCALE_STEPS) assert.match(p.scale[step] ?? '', HEX, `${p.id} scale ${step}`)
    assert.equal(p.scale[400], p.tokens.accent, `${p.id}: scale step 400 is the accent`)
  }
  assert.ok(isThemeId('amber') && !isThemeId('paper') && !isThemeId(undefined))
})

test('app/assets/css/themes.css is what the presets generate (run `pnpm theme:css`)', () => {
  // Line endings are git's business (autocrlf hands a Windows checkout CRLF), not the generator's.
  const onDisk = readFileSync(new URL('app/assets/css/themes.css', root), 'utf8').replace(/\r\n/g, '\n')
  assert.equal(onDisk, displayCss())
  for (const p of THEME_LIST) {
    const present = onDisk.includes(`html[data-theme="${p.id}"]`)
    assert.equal(present, p.id !== DEFAULT_THEME, `${p.id} block ${present ? 'present' : 'absent'}`)
  }
  for (const f of FONT_LIST) {
    const present = onDisk.includes(`html[data-font="${f.id}"]`)
    assert.equal(present, f.id !== DEFAULT_FONT, `${f.id} font block ${present ? 'present' : 'absent'}`)
  }
  assert.ok(css.includes('@import "./themes.css"'), 'main.css imports the generated file')
})

// --- faces ------------------------------------------------------------------------------------
const faceTokens = Object.fromEntries(
  [...themeBlock.matchAll(/--font-(mono|sans|serif|display):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
)

test('the default face is main.css, and main.css sets the three body tokens to it', () => {
  assert.equal(DEFAULT_FONT, 'jetbrains')
  for (const token of ['mono', 'sans', 'serif']) {
    assert.equal(faceTokens[token], FONTS[DEFAULT_FONT].stack, `--font-${token} drifted from the default face`)
  }
  assert.ok(faceTokens.display?.startsWith('\'Departure Mono\''), 'the display face is Departure Mono')
  assert.ok(!displayCss().includes('--font-display'), 'no font preset touches the display face')
})

test('every face is complete, and every web face is self-hosted without preloading', () => {
  assert.deepEqual(FONT_LIST.map(f => f.id), [...FONT_IDS])
  const config = readFileSync(new URL('nuxt.config.ts', root), 'utf8')
  for (const f of FONT_LIST) {
    assert.equal(FONTS[f.id], f)
    assert.ok(f.label && f.blurb && f.stack, `${f.id} needs a label, blurb and stack`)
    assert.ok(f.stack.endsWith('monospace'), `${f.id} falls back to generic monospace`)
    if (f.family == null) continue
    assert.ok(f.stack.startsWith(`'${f.family}'`), `${f.id}: the stack leads with its family`)
    const listed = config.includes(`'${f.family}'`)
    assert.ok(listed, `${f.family} is missing from fonts.families in nuxt.config.ts`)
  }
  // The alternates must not be preloaded: @nuxt/fonts would otherwise put every face in the entry
  // CSS on each page's <head>, and a visitor uses one. The default keeps its preload (first paint).
  const alternates = FONT_LIST.filter(f => f.family && f.id !== DEFAULT_FONT).map(f => f.family)
  const block = config.slice(config.indexOf('fonts: {'), config.indexOf('icon: {'))
  const preloadOff = /preload:\s*false/.test(block)
  assert.ok(preloadOff, 'the alternate families set preload: false')
  for (const family of alternates) assert.ok(block.includes(`'${family}'`), `${family} is in the fonts block`)
  assert.ok(isFontId('system') && !isFontId('comic') && !isFontId(undefined))
})

// The text ramp was tuned for contrast against the near-black surfaces (main.css notes the 4.5:1
// AA floor for faint, and ghost's deliberate exception). No preset may be less legible than the
// default: each text token must clear the default's own ratio, capped at AA, on both the page
// and the raised panel surface. Status colors clear 3:1, the floor for graphics and large text.
const TEXT_TOKENS = ['hi', 'body', 'dim', 'muted', 'faint', 'ghost', 'nav-idle', 'mark']
const STATUS_TOKENS = ['accent', 'warn', 'danger', 'ember']

test('every preset keeps the default\'s contrast', () => {
  for (const p of THEME_LIST) {
    for (const surface of ['bg', 'raised']) {
      for (const t of TEXT_TOKENS) {
        const floor = Math.min(4.5, contrast(phosphor.tokens[t], phosphor.tokens[surface])) - 0.02
        const got = contrast(p.tokens[t], p.tokens[surface])
        assert.ok(got >= floor, `${p.id}: ${t} on ${surface} is ${got.toFixed(2)}:1, under ${floor.toFixed(2)}`)
      }
      for (const t of STATUS_TOKENS) {
        const got = contrast(p.tokens[t], p.tokens[surface])
        assert.ok(got >= 3, `${p.id}: ${t} on ${surface} is ${got.toFixed(2)}:1, under 3`)
      }
    }
  }
})

test('every preset keeps the accent and the status trio apart', () => {
  for (const p of THEME_LIST) {
    const hues = Object.fromEntries(STATUS_TOKENS.map(t => [t, hexToOklch(p.tokens[t]).h]))
    for (let i = 0; i < STATUS_TOKENS.length; i++) {
      for (let j = i + 1; j < STATUS_TOKENS.length; j++) {
        const [a, b] = [STATUS_TOKENS[i], STATUS_TOKENS[j]]
        const d = hueDistance(hues[a], hues[b])
        assert.ok(d >= 18, `${p.id}: ${a} (${hues[a].toFixed(0)}°) and ${b} (${hues[b].toFixed(0)}°) are only ${d.toFixed(0)}° apart`)
      }
    }
  }
})

test('a generated accent scale has the hand-picked phosphor scale\'s shape', () => {
  const generated = accentScale(phosphor.tokens.accent)
  let prev = Infinity
  for (const step of SCALE_STEPS) {
    const want = hexToOklch(phosphor.scale[step]).L
    const got = hexToOklch(generated[step]).L
    assert.ok(Math.abs(got - want) < 0.03, `step ${step}: L ${got.toFixed(3)} vs hand-picked ${want.toFixed(3)}`)
    assert.ok(got < prev, `step ${step} is not darker than the step before`)
    prev = got
  }
  assert.equal(generated[400], phosphor.tokens.accent)
})

test('oklch round-trips sRGB', () => {
  for (const hex of ['#070a09', '#2ce8a4', '#e8b34b', '#ffffff', '#000000', '#7a9688']) {
    const back = oklchToHex(hexToOklch(hex))
    const diff = Math.max(...[1, 3, 5].map(i => Math.abs(parseInt(hex.slice(i, i + 2), 16) - parseInt(back.slice(i, i + 2), 16))))
    assert.ok(diff <= 1, `${hex} → ${back}`)
  }
})

test('chart colors are var() references to tokens main.css declares', () => {
  const refs = []
  const collect = (group, obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && v.startsWith('var(')) refs.push([`${group}.${k}`, v])
      else if (v && typeof v === 'object') collect(`${group}.${k}`, v)
    }
  }
  collect('THEME', THEME)
  collect('STATUS_COLORS', STATUS_COLORS)
  collect('BAND_COLORS', BAND_COLORS)
  collect('CHART_AXIS', CHART_AXIS)
  collect('ANNOTATION_STYLE', ANNOTATION_STYLE)
  collect('CHART_TOOLTIP', CHART_TOOLTIP)
  assert.ok(refs.length >= 20, `found ${refs.length} var() colors`)
  for (const [where, v] of refs) {
    const m = /^var\(--(color|font)-([\w-]+)\)$/.exec(v)
    assert.ok(m, `${where} = ${v} is not a plain var(--color-*) or var(--font-*)`)
    const declared = m[1] === 'color' ? tokens : faceTokens
    assert.ok(m[2] in declared, `${where} names --${m[1]}-${m[2]}, which main.css does not declare`)
  }
  for (const [k, v] of Object.entries(ANNOTATION_STYLE)) {
    assert.ok(v.opacity > 0 && v.opacity < 0.5, `ANNOTATION_STYLE.${k} is a faint tint`)
  }
  assert.deepEqual(Object.keys(STATUS_COLORS).sort(), ['high', 'low', 'optimal', 'unknown'], 'getStatus() values')
})
