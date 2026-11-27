// Things that go stale without anything failing (audit #44 item 57): a link to a page that has
// moved, a page the command palette was never told about, a colour token nothing uses, the
// dimmest text colour on words meant to be read, a parser loaded on every page for a rare action.
// Each was found by hand in that audit; these read the source and fail the next time.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { parse } from 'vue/compiler-sfc'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root), 'utf8')

/** Every file under `dir` whose name matches, as [repo path, source]. */
function files(dir, match) {
  const out = []
  for (const entry of readdirSync(new URL(`${dir}/`, root), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...files(path, match))
    else if (match.test(entry.name)) out.push([path, read(path)])
  }
  return out
}
const vue = files('app', /\.vue$/)
const ELEMENT = 1
const TEXT = 2
const INTERPOLATION = 5
const templateOf = (path, source) => parse(source, { filename: path }).descriptor.template?.ast
/** Calls `visit(element)` for every element of a template. */
function eachElement(node, visit) {
  if (node.type === ELEMENT) visit(node)
  for (const child of node.children ?? []) eachElement(child, visit)
}
const attr = (node, name) => node.props?.find(p => p.type === 6 && p.name === name)?.value?.content
const hasClass = (node, name) => (attr(node, 'class') ?? '').split(/\s+/).includes(name)

// ── links ────────────────────────────────────────────────────────────────────

/** The site's page routes, from app/pages: "/journal/[date]" style, index files folded. */
const pageRoutes = files('app/pages', /\.vue$/).map(([path]) =>
  path.replace(/^app\/pages/, '').replace(/\.vue$/, '').replace(/\/index$/, '') || '/')
const staticPages = pageRoutes.filter(r => !r.includes('['))
const pagePatterns = pageRoutes.map(r => new RegExp(`^${r.replace(/\[[^\]]+\]/g, '[^/]+')}$`))
const serverRoutes = files('server/routes', /\.ts$/).map(([path]) => path.replace(/^server\/routes/, '').replace(/\.(get|head|post)\.ts$/, ''))
const config = read('nuxt.config.ts')
/** Old addresses that answer 301: they still work, but nothing should point at them. */
const retired = [...config.matchAll(/'(\/[^']*)': \{ redirect: \{ to: '[^']*', statusCode: 301 \}/g)].map(m => m[1])
/** Landing redirects (302): a section's bare address, fine to link. */
const landings = [...config.matchAll(/'(\/[^']*)': \{ redirect: \{ to: '[^']*', statusCode: 302 \}/g)].map(m => m[1])

/** Why a path cannot be linked to, or null when it can. */
function problemWith(target) {
  const path = target.split(/[?#]/)[0].replace(/(.)\/+$/, '$1')
  if (path.startsWith('/api/')) return null
  if (retired.includes(path)) return 'a retired address (301): link to where it went'
  if (pagePatterns.some(re => re.test(path)) || serverRoutes.includes(path) || landings.includes(path)) return null
  if (existsSync(new URL(`public${path}`, root))) return null
  return 'no such page'
}

/** Every literal in-app address a component links or navigates to, as [where, target]. */
function linkTargets() {
  const out = []
  for (const [path, source] of vue) {
    const ast = templateOf(path, source)
    if (ast) {
      eachElement(ast, (node) => {
        for (const name of ['to', 'href']) {
          const value = attr(node, name)
          if (value?.startsWith('/') && !value.startsWith('//')) out.push([`${path}:${node.loc.start.line}`, value])
        }
      })
    }
    // In script and in bound attributes: go('/x'), navigateTo('/x'), to: '/x', path: '/x'.
    for (const m of source.matchAll(/(?:\bgo\(|\bnavigateTo\(|\bto: |\bpath: |:to=")'(\/[^'$]*)'/g)) out.push([path, m[1]])
  }
  return out
}

test('every in-app link goes to a page that exists, at its current address', () => {
  assert.ok(retired.includes('/journal/supplements') && landings.includes('/tools'), 'the redirects were read out of nuxt.config.ts')
  const targets = linkTargets()
  assert.ok(targets.length > 100, `links found: ${targets.length}`)
  const broken = targets.map(([where, target]) => [where, target, problemWith(target)]).filter(([, , problem]) => problem)
  assert.deepEqual(broken.map(([where, target, problem]) => `${where} → ${target}: ${problem}`), [])
  // The check itself: it knows a dynamic page, a server route, a public file, and what is gone.
  assert.equal(problemWith('/journal/2026-11-12'), null)
  assert.equal(problemWith('/journal/compound/hCG?tab=pk'), null)
  assert.equal(problemWith('/demo'), null)
  assert.equal(problemWith('/offline.html'), null)
  assert.match(problemWith('/journal/supplements'), /retired/)
  assert.match(problemWith('/labs/nowhere'), /no such page/)
  // (Any one segment under /journal reads as a day's entry — which is why a retired address has
  // to be named: /journal/supplements would otherwise pass as "the entry for supplements".)
})

test('the command palette can reach every page', () => {
  const palette = read('app/components/CommandPalette.vue')
  const reachable = new Set([...palette.matchAll(/\bgo\('(\/[^']*)'\)/g)].map(m => m[1]))
  // Pages reached some other way, each with its reason.
  const elsewhere = {
    '/privacy': 'a notice, linked from the footer and the sign-in page; not somewhere to jump to'
  }
  const missing = staticPages.filter(page => !reachable.has(page) && !(page in elsewhere))
  assert.deepEqual(missing, [], 'a page the palette does not list — add it to CommandPalette.vue (or say here why not)')
  for (const target of reachable) assert.equal(problemWith(target), null, `the palette offers ${target}`)
  for (const page of Object.keys(elsewhere)) assert.ok(staticPages.includes(page), `${page} is still a page`)
})

// ── the palette's course row follows the journal's tab ───────────────────────

test('the accutane page is offered by the tab and the palette on the same days', async () => {
  const { courseOnFile, PROCEDURE_DEFERRAL_DAYS } = await import('../shared/utils/accutane.ts')
  const { cycleEnd } = await import('../shared/utils/cycles.ts')
  const { shiftDays } = await import('../shared/utils/dates.ts')
  const course = { id: 4, name: 'Isotretinoin Course', start_date: '2026-11-07', start_precision: 'day', planned_weeks: 30, planned_days: null, actual_end: null, compounds: [{ compound: 'Isotretinoin', dose: 40, unit: 'mg', weekdays: [0, 1, 2, 3, 4, 5, 6], fromWeek: 1, toWeek: null }], goal: null, notes: null, created_at: 'x' }
  const blast = { ...course, id: 5, name: 'Blast', compounds: [{ ...course.compounds[0], compound: 'Testosterone Cypionate' }] }
  const end = cycleEnd(course)
  assert.equal(courseOnFile([], '2026-11-20'), false, 'nothing planned: no tab, no row')
  assert.equal(courseOnFile([blast], '2026-11-20'), false, 'a cycle without isotretinoin is not a course')
  assert.equal(courseOnFile([course], '2026-10-01'), true, 'planned and not yet begun')
  assert.equal(courseOnFile([course, blast], '2026-12-01'), true, 'running')
  assert.equal(courseOnFile([course], shiftDays(end, PROCEDURE_DEFERRAL_DAYS)), true, 'ended, the last rung of its ladder still ahead')
  assert.equal(courseOnFile([course], shiftDays(end, PROCEDURE_DEFERRAL_DAYS + 1)), false, 'and gone the day after')
  // One rule, asked from both places.
  for (const path of ['app/components/journal/Nav.vue', 'app/components/CommandPalette.vue']) assert.match(read(path), /courseOnFile\(/, path)
})

// ── colours ──────────────────────────────────────────────────────────────────

const GLYPHS_ONLY = /^[^A-Za-z0-9]*$/

/** What an element shows of its own, when that is words or data: null for glyphs, rules and nothing. */
function wordsOf(node) {
  let shown = ''
  for (const child of node.children ?? []) {
    if (child.type === TEXT) shown += child.content
    else if (child.type === INTERPOLATION) {
      // `{{ last ? '└' : '├' }}` is a glyph either way; any other expression is something to read.
      const literals = [...child.content.content.matchAll(/'([^']*)'/g)].map(m => m[1])
      shown += literals.length && literals.every(l => GLYPHS_ONLY.test(l)) ? literals.join('') : ` {{${child.content.content}}} `
    }
  }
  shown = shown.replace(/\s+/g, ' ').trim()
  return /[A-Za-z]{3}|\{\{/.test(shown) ? shown : null
}

test('the dimmest text colour is never set on words', () => {
  // `ghost` sits at about 3:1 against the page: fine for a rule, a separator or a disabled arrow,
  // under the AA floor for anything meant to be read. `faint` is the dimmest colour for words.
  // The one exception is the add-a-snack affordances, a step below "+ add" on purpose.
  const allowed = [/^\+ another$/, /^\+ \{\{row\.label\.toLowerCase\(\)\}\}$/]
  const worded = []
  let seen = 0
  for (const [path, source] of vue) {
    const ast = templateOf(path, source)
    if (!ast) continue
    eachElement(ast, (node) => {
      if (!hasClass(node, 'text-ghost') || hasClass(node, 'invisible')) return
      seen++
      const words = wordsOf(node)
      if (words && !allowed.some(re => re.test(words))) worded.push(`${path}:${node.loc.start.line} "${words.slice(0, 60)}"`)
    })
  }
  assert.ok(seen >= 20, `elements in the dimmest colour: ${seen}`)
  assert.deepEqual(worded, [], 'use text-faint for words; text-ghost is for rules, separators and disabled glyphs')
})

test('every design token main.css declares is used somewhere', () => {
  const css = read('app/assets/css/main.css')
  const blocks = [...css.matchAll(/@theme[^{]*\{([\s\S]*?)\n\}/g)]
  const declared = blocks.flatMap(m => [...m[1].matchAll(/--((?:color|container|text|font)-[\w-]+):/g)].map(t => t[1]))
  assert.ok(declared.length > 60, `tokens declared: ${declared.length}`)
  const rest = blocks.reduce((text, m) => text.replace(m[0], ''), css)
  const source = [...vue, ...files('app', /\.(ts|css)$/), ...files('shared', /\.ts$/), ...files('server', /\.ts$/)]
    .filter(([path]) => path !== 'app/assets/css/main.css').map(([, text]) => text).join('\n') + config
  const unused = declared.filter((token) => {
    const name = token.replace(/^(color|container|text|font)-/, '')
    // As a variable, as a utility ("bg-raised", "max-w-12xl", "text-faint"), or by name in a
    // token table ('cyan-dot' in chartTheme.ts).
    return !rest.includes(`--${token}`) && !source.includes(`--${token}`) && !new RegExp(`[-:('"]${name}(?![\\w-])`).test(source)
  })
  assert.deepEqual(unused, [], 'declared in @theme and referenced nowhere: every preset carries it for nothing')
})

// ── weight ───────────────────────────────────────────────────────────────────

test('the EXIF parser is loaded when a photo is picked, not with the page', () => {
  const eager = [...vue, ...files('app', /\.ts$/)].filter(([, source]) => /^\s*import\b[^\n]*\bfrom 'exifr'/m.test(source)).map(([path]) => path)
  assert.deepEqual(eager, [], 'a static import puts 74 KB on every page that touches the upload helper')
  assert.match(read('app/utils/photoUpload.ts'), /await import\('exifr'\)/)
})

// ── the README ───────────────────────────────────────────────────────────────

test('the README has a row for every page, and its screenshots are the files on disk', () => {
  const readme = read('README.md')
  // The Sections table names each route in backticks, dynamic ones as the page file spells them.
  const unlisted = pageRoutes.filter(route => !readme.includes(`| \`${route}\` |`))
  assert.deepEqual(unlisted, [], 'a page with no row in the README\'s Sections table')
  const shown = [...readme.matchAll(/\]\(\.github\/screenshots\/([\w.-]+)\)/g)].map(m => m[1])
  assert.ok(shown.length >= 20, `screenshots referenced: ${shown.length}`)
  const onDisk = readdirSync(new URL('.github/screenshots/', root))
  assert.deepEqual(shown.filter(name => !onDisk.includes(name)), [], 'the README shows an image that is not there')
  assert.deepEqual(onDisk.filter(name => !shown.includes(name)), [], 'a screenshot nothing shows — delete it or caption it')
  // Node: the README promises what package.json's engines allow, no more.
  const engines = JSON.parse(read('package.json')).engines.node
  const majors = [...engines.matchAll(/\^(\d+)\./g)].map(m => m[1])
  for (const line of readme.split('\n').filter(l => /\bNode \d/.test(l) && /Requires|on \*\*Node/.test(l))) {
    for (const [, major] of line.matchAll(/\b(\d{2})(?:\.\d+)*\+/g)) assert.ok(majors.includes(major), `the README says Node ${major}+; engines says ${engines}`)
  }
})

// ── a row's columns ──────────────────────────────────────────────────────────

test('the workout row has a column for every figure, each sized by its text', () => {
  // Two figures once shared one fixed column ("512 kcal · ⚡ 12.8" in 80px) and ran into the
  // heart rate beside it; and columns in px do not grow with the text-size setting.
  const path = 'app/pages/journal/workouts.vue'
  let row
  eachElement(templateOf(path, read(path)), (node) => {
    if (/\blg:grid-cols-\[/.test(attr(node, 'class') ?? '')) row = node
  })
  assert.ok(row, 'the session row')
  const tracks = /lg:grid-cols-\[([^\]]+)\]/.exec(attr(row, 'class'))[1].split('_')
  const cells = row.children.filter(c => c.type === ELEMENT)
  const wrapper = cells.find(c => hasClass(c, 'lg:contents'))
  const stats = wrapper.children.filter(c => c.type === ELEMENT)
  assert.equal(tracks.length, cells.length - 1 + stats.length, `${tracks.length} columns for ${cells.length - 1} leading cells and ${stats.length} figures`)
  assert.deepEqual(tracks.filter(t => /px$/.test(t)), [], 'sized in ch (or fr), so the columns follow the text size')
  for (const stat of stats) assert.ok(hasClass(stat, 'whitespace-nowrap'), 'a figure never wraps inside its column')
})
