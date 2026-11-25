// Touch screens (audit #44 item 55): the rules in main.css's "Touch" section, and the one thing
// about them a later edit can silently undo — a control drawn as a bare glyph (✕ ▾ ‹ …) that
// nobody gave a tap area. Every template in the app is parsed and each such control must have
// one: `tap` on itself, `tap-actions` on the cluster it sits in, or a real size.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { parse } from 'vue/compiler-sfc'

const root = new URL('../', import.meta.url)
const css = readFileSync(new URL('app/assets/css/main.css', root), 'utf8').replace(/\r\n/g, '\n')

/** Every .vue file under app/, as [repo path, source]. */
function vueFiles(dir = 'app') {
  const out = []
  for (const entry of readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...vueFiles(path))
    else if (entry.name.endsWith('.vue')) out.push([path, readFileSync(new URL(path, root), 'utf8')])
  }
  return out
}

/** How deep in braces a position in the stylesheet is: 0 = not inside any block or layer. */
const depthAt = index => [...css.slice(0, index)].reduce((d, ch) => d + (ch === '{' ? 1 : ch === '}' ? -1 : 0), 0)

test('on a touch screen no field\'s text is under 16px, and no layer can outrank the rule', () => {
  const at = css.indexOf('@media (pointer: coarse) {\n  input:not(')
  assert.ok(at > 0, 'the rule is in main.css')
  assert.equal(depthAt(at), 0, 'unlayered: a rule inside @layer loses to every utility')
  const rule = css.slice(at, css.indexOf('\n}\n', at))
  for (const part of ['\n  textarea,\n', '\n  select,\n', '[contenteditable]:not([contenteditable=\'false\']) {\n', 'font-size: max(16px, 1em);']) {
    assert.ok(rule.includes(part), `the rule has ${part.trim()}`)
  }
  // The inputs that hold no text are left alone; the ones that do are all covered.
  const skipped = [...rule.slice(0, rule.indexOf('\n  textarea')).matchAll(/\[type='(\w+)'\]/g)].map(m => m[1])
  for (const type of ['checkbox', 'radio', 'range', 'file']) assert.ok(skipped.includes(type), `${type} is not a text field`)
  for (const type of ['text', 'number', 'date', 'time', 'search', 'email', 'password', 'tel', 'url']) assert.ok(!skipped.includes(type), `${type} is covered`)
})

test('the one rule is the only place: no field sets its own touch size', () => {
  const own = vueFiles().filter(([, source]) => /pointer-coarse:text-/.test(source)).map(([path]) => path)
  assert.deepEqual(own, [], 'a call site with its own size would drift from the rule')
})

test('buttons and the tap utilities enlarge only under a coarse pointer', () => {
  for (const [name, opener] of [['.tui-btn', '.tui-btn::after {'], ['tap', '@utility tap {'], ['tap-actions', '@utility tap-actions {']]) {
    const at = css.indexOf(opener)
    assert.ok(at > 0, `${name} is defined`)
    const block = name === '.tui-btn' ? css.slice(css.lastIndexOf('@media', at), at) : css.slice(at, css.indexOf('\n}\n', at))
    assert.match(block, /@media \(pointer: coarse\)/, `${name}: nothing changes under a mouse`)
  }
  // 44px, the size the calendar's month arrows are really drawn at.
  assert.equal([...css.matchAll(/max\(0px, \(2\.75rem - 100%\) \/ 2\)/g)].length, 8, 'four sides each for .tui-btn and tap')
})

// ── every bare-glyph control has a tap area ──────────────────────────────────

const GLYPHS = /^[✕▾▴▸◂‹›⋯×✎\s]+$/
const ELEMENT = 1
const TEXT = 2
const INTERPOLATION = 5
const classOf = node => node.props?.find(p => p.type === 6 && p.name === 'class')?.value?.content ?? ''
const has = (node, name) => classOf(node).split(/\s+/).includes(name)

/** What a control shows, if it shows only glyphs: its text, with `{{ a ? '▾' : '▴' }}` read as its string literals. */
function glyphsOnly(node) {
  let shown = ''
  for (const child of node.children ?? []) {
    if (child.type === TEXT) shown += child.content
    else if (child.type === INTERPOLATION) {
      const literals = [...child.content.content.matchAll(/'([^']*)'/g)].map(m => m[1])
      if (!literals.length) return null
      shown += literals.join(' ')
    }
    else if (child.type === ELEMENT) return null
  }
  return shown.trim() && GLYPHS.test(shown) ? shown.replace(/\s+/g, ' ').trim() : null
}

/** Every bare-glyph button or link in a template, with the element it sits in (a <template> wrapper looked through). */
function glyphControls(node, parent = null, out = []) {
  if (node.type === ELEMENT) {
    const shown = ['button', 'NuxtLink', 'a'].includes(node.tag) ? glyphsOnly(node) : null
    if (shown) out.push({ node, parent, shown })
    const here = node.tag === 'template' ? parent : node
    for (const child of node.children ?? []) glyphControls(child, here, out)
  }
  else for (const child of node.children ?? []) glyphControls(child, parent, out)
  return out
}

test('every control drawn as a bare glyph has a tap area', () => {
  const bare = []
  let seen = 0
  for (const [path, source] of vueFiles()) {
    const ast = parse(source, { filename: path }).descriptor.template?.ast
    if (!ast) continue
    for (const { node, parent, shown } of glyphControls(ast)) {
      seen++
      const sized = has(node, 'tap') || has(node, 'tui-btn') || has(node, 'min-w-11') || (parent && has(parent, 'tap-actions'))
      if (!sized) bare.push(`${path}:${node.loc.start.line} "${shown}"`)
    }
  }
  assert.ok(seen >= 30, `the scan finds the controls it is meant to (${seen})`)
  assert.deepEqual(bare, [], 'add `tap` (main.css, "Touch"), or `tap-actions` to the cluster it ends')
})

test('the scan reads a control the way a reader would', () => {
  const controls = source => glyphControls(parse(`<template>${source}</template>`).descriptor.template.ast).map(c => c.shown)
  assert.deepEqual(controls('<button>✕</button>'), ['✕'])
  assert.deepEqual(controls('<button>{{ open ? \'▴\' : \'▾\' }}</button>'), ['▴ ▾'], 'a glyph either way')
  assert.deepEqual(controls('<span><template v-if="x"><button>⋯</button></template></span>'), ['⋯'])
  assert.deepEqual(controls('<button>✕ delete</button><button>{{ open ? \'custom ▴\' : \'custom ▾\' }}</button><button>{{ label }}</button>'), [], 'words are a target already')
  assert.deepEqual(controls('<span>✕</span><button><UIcon name="x" /></button>'), [], 'not a control; not a glyph')
})

test('a clipped box never holds a tap area it would cut off', () => {
  // `truncate` and `overflow-hidden` clip all round; a tap area reaching past the element is lost.
  const clipped = []
  for (const [path, source] of vueFiles()) {
    const ast = parse(source, { filename: path }).descriptor.template?.ast
    if (!ast) continue
    const walk = (node) => {
      if (node.type === ELEMENT && has(node, 'tap') && (has(node, 'truncate') || has(node, 'overflow-hidden'))) clipped.push(`${path}:${node.loc.start.line}`)
      for (const child of node.children ?? []) walk(child)
    }
    walk(ast)
  }
  assert.deepEqual(clipped, [])
  // TuiHeader's label holds the vitals ‹ ›: truncated, but clipped sideways only.
  const header = readFileSync(new URL('app/components/TuiHeader.vue', root), 'utf8')
  assert.match(header, /<span class="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap">┌ <slot name="label">/)
})
