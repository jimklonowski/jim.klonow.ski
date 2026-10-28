// TICKER's capsule drop — Dr. Mario, where the germs are the soda log. A bottle eight wide and
// sixteen tall, germs in three colours sitting in the bottom of it (one per soda logged in the
// trailing month, never fewer than four, never more than the bottle can take), and two-tone
// capsules dropped in from the neck: line up four of a colour, across or down, and they go.
// Every germ gone cleans the bottle; the next one holds four more and falls a shade faster. No
// lives — a bottle that fills to the neck is the game.
//
// Pure and deterministic, like the other games: stepDrop(state, dt, soft) advances the clocks,
// moveDrop / rotateDrop take the player's hand, and everything reads back as plain data for the
// component (app/components/ticker/Drop.vue) to draw. The plain-node tests drive whole games with
// a scripted player and a seeded random source — the proof that a bottle is clearable.
//
// Units: cells and seconds. x grows right, y grows DOWN; row 0 is the top of the bottle and a
// capsule may stick up into the neck (y < 0) while it is still falling. Every export is named
// apart from the other games' (Nuxt auto-imports shared/utils as one registry).
import { MAX_DT } from './tickerRunner.ts'

export const DROP_COLS = 8
export const DROP_ROWS = 16
export const DROP_COLORS = 3
/** Four of a colour in a line clears them. */
export const DROP_MATCH = 4
export const DROP_MIN_GERMS = 4
export const DROP_MAX_GERMS = 40
export const DROP_GERMS_PER_LEVEL = 4
/** Germs never start in the top rows; a bottle with many of them fills deeper. */
export const DROP_TOP_FREE_ROWS = 4
/** Where a capsule enters: the neck, over these two columns. */
export const DROP_SPAWN_X = 3
export const DROP_FALL_SECONDS = 0.75
export const DROP_FALL_LESS_PER_LEVEL = 0.05
export const DROP_FALL_MIN = 0.2
/** Holding down: a row this often. */
export const DROP_SOFT_SECONDS = 0.05
/** The matched cells flash this long before they go, then loose halves fall a row this often. */
export const DROP_CLEAR_SECONDS = 0.3
export const DROP_CASCADE_SECONDS = 0.07
export const DROP_LEVEL_SECONDS = 1.6
export const DROP_GERM_POINTS = 100
export const DROP_HALF_POINTS = 10
/** Each clear a cascade sets off doubles the next, up to this many doublings. */
export const DROP_CHAIN_CAP = 4

export type DropColor = 0 | 1 | 2
export type DropDir = 'left' | 'right' | 'up' | 'down'
export type DropRot = 0 | 1 | 2 | 3

export interface DropCell {
  color: DropColor
  kind: 'germ' | 'half'
  /** Which way a capsule half's other half lies; null for a germ or a half on its own. */
  link: DropDir | null
}

export type DropGrid = (DropCell | null)[][]

export interface DropPiece {
  /** The anchor cell; see dropPieceCells for where the two halves sit by rotation. */
  x: number
  y: number
  rot: DropRot
  colors: [DropColor, DropColor]
}

export type DropStatus = 'ready' | 'running' | 'clearing' | 'falling' | 'cleared' | 'over'

export interface DropPop {
  x: number
  y: number
  text: string
  at: number
}

export interface DropState {
  status: DropStatus
  level: number
  /** Bottles cleaned this game (the record's `cleared`). */
  levelsCleared: number
  grid: DropGrid
  germsTotal: number
  germs: number
  /** The capsule in hand; null between one locking and the next entering. */
  piece: DropPiece | null
  next: [DropColor, DropColor]
  /** Capsules placed this game. */
  pieces: number
  fallTimer: number
  /** Clears set off by the one capsule, so far. */
  chain: number
  /** The matched cells, flashing. */
  clearing: Array<{ x: number, y: number }>
  clearAt: number
  score: number
  elapsed: number
  lockedAt: number
  clearedAt: number
  endedAt: number
  pops: DropPop[]
  /** The scripted player's intent for the capsule in hand (autoDrop). */
  plan: { x: number, rot: DropRot, piece: number } | null
  source: { germs: number }
  rng: () => number
}

export interface DropOptions {
  /** Germs in the first bottle; clamped to what a bottle takes. */
  germs: number
  rng?: () => number
}

const OPPOSITE: Record<DropDir, DropDir> = { left: 'right', right: 'left', up: 'down', down: 'up' }
const STEP: Record<DropDir, readonly [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }

// --- the bottle -------------------------------------------------------------------------------

export function dropEmptyGrid(): DropGrid {
  return Array.from({ length: DROP_ROWS }, () => Array<DropCell | null>(DROP_COLS).fill(null))
}

/** The cell at (x, y); null when empty, out of the bottle, or in the neck above it. */
export function dropCellAt(grid: DropGrid, x: number, y: number): DropCell | null {
  return grid[y]?.[x] ?? null
}

/** Germs in the first bottle, then four more a level, within what a bottle takes. */
export function dropGermsFor(base: number, level: number): number {
  const first = Math.max(DROP_MIN_GERMS, Math.min(DROP_MAX_GERMS, Math.round(base)))
  return Math.min(DROP_MAX_GERMS, first + DROP_GERMS_PER_LEVEL * (level - 1))
}

/** How deep the germs sit: six rows for a few, deeper for more, never into the top rows. */
export function dropGermRows(germs: number): number {
  return Math.max(6, Math.min(DROP_ROWS - DROP_TOP_FREE_ROWS, Math.ceil(germs / 4) + 3))
}

/** The run of `color` through (x, y) along (dx, dy), counting the cell itself. */
function runThrough(grid: DropGrid, x: number, y: number, dx: number, dy: number, color: DropColor): number {
  let n = 1
  for (let i = 1; dropCellAt(grid, x + dx * i, y + dy * i)?.color === color; i++) n++
  for (let i = 1; dropCellAt(grid, x - dx * i, y - dy * i)?.color === color; i++) n++
  return n
}

/** Germs scattered over the bottom rows, no three of a colour in a line — nothing clears for free. */
export function dropPlaceGerms(grid: DropGrid, germs: number, rng: () => number): number {
  const rows = dropGermRows(germs)
  const spots: Array<[number, number]> = []
  for (let y = DROP_ROWS - rows; y < DROP_ROWS; y++) for (let x = 0; x < DROP_COLS; x++) spots.push([x, y])
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[spots[i], spots[j]] = [spots[j]!, spots[i]!]
  }
  let placed = 0
  for (const [x, y] of spots) {
    if (placed >= germs) break
    const first = Math.floor(rng() * DROP_COLORS)
    for (let k = 0; k < DROP_COLORS; k++) {
      const color = ((first + k) % DROP_COLORS) as DropColor
      if (runThrough(grid, x, y, 1, 0, color) >= 3 || runThrough(grid, x, y, 0, 1, color) >= 3) continue
      grid[y]![x] = { color, kind: 'germ', link: null }
      placed++
      break
    }
  }
  return placed
}

// --- the capsule in hand ----------------------------------------------------------------------

export interface DropHalfAt {
  x: number
  y: number
  color: DropColor
}

/** Where a capsule's two halves sit: side by side (0, 2) or stacked (1, 3), the anchor at the bottom left. */
export function dropPieceCells(p: DropPiece): [DropHalfAt, DropHalfAt] {
  const [a, b] = p.colors
  switch (p.rot) {
    case 0: return [{ x: p.x, y: p.y, color: a }, { x: p.x + 1, y: p.y, color: b }]
    case 1: return [{ x: p.x, y: p.y, color: a }, { x: p.x, y: p.y - 1, color: b }]
    case 2: return [{ x: p.x + 1, y: p.y, color: a }, { x: p.x, y: p.y, color: b }]
    case 3: return [{ x: p.x, y: p.y - 1, color: a }, { x: p.x, y: p.y, color: b }]
  }
}

/** Whether a capsule could sit there: inside the bottle's walls and floor, over nothing; the neck above row 0 is open. */
export function dropFits(grid: DropGrid, p: DropPiece): boolean {
  return dropPieceCells(p).every(c => c.x >= 0 && c.x < DROP_COLS && c.y < DROP_ROWS && (c.y < 0 || !grid[c.y]![c.x]))
}

const randomColor = (rng: () => number): DropColor => Math.floor(rng() * DROP_COLORS) as DropColor

function freshGrid(germs: number, rng: () => number): { grid: DropGrid, placed: number } {
  const grid = dropEmptyGrid()
  const placed = dropPlaceGerms(grid, germs, rng)
  return { grid, placed }
}

export function createDrop(o: DropOptions): DropState {
  const rng = o.rng ?? Math.random
  const germs = dropGermsFor(o.germs, 1)
  const { grid, placed } = freshGrid(germs, rng)
  return {
    status: 'ready',
    level: 1,
    levelsCleared: 0,
    grid,
    germsTotal: placed,
    germs: placed,
    piece: null,
    next: [randomColor(rng), randomColor(rng)],
    pieces: 0,
    fallTimer: 0,
    chain: 0,
    clearing: [],
    clearAt: -1,
    score: 0,
    elapsed: 0,
    lockedAt: -1,
    clearedAt: -1,
    endedAt: -1,
    pops: [],
    plan: null,
    source: { germs: o.germs },
    rng
  }
}

/** A capsule enters at the neck; one that has nowhere to go is the end. */
function spawn(s: DropState) {
  const piece: DropPiece = { x: DROP_SPAWN_X, y: 0, rot: 0, colors: s.next }
  s.next = [randomColor(s.rng), randomColor(s.rng)]
  s.piece = piece
  s.fallTimer = 0
  s.chain = 0
  if (!dropFits(s.grid, piece)) {
    s.status = 'over'
    s.endedAt = s.elapsed
    return
  }
  s.status = 'running'
}

/**
 * The one button. Ready: the first capsule (or the next bottle's) enters. Over: a fresh game
 * against the same month. Anything else: nothing.
 */
export function startDrop(s: DropState): DropState {
  if (s.status === 'over') Object.assign(s, createDrop({ rng: s.rng, ...s.source }))
  if (s.status === 'ready') spawn(s)
  return s
}

/** A step sideways, when the bottle allows it. */
export function moveDrop(s: DropState, dir: 'left' | 'right'): boolean {
  const p = s.piece
  if (s.status !== 'running' || !p) return false
  const moved = { ...p, x: p.x + (dir === 'left' ? -1 : 1) }
  if (!dropFits(s.grid, moved)) return false
  s.piece = moved
  return true
}

/** A quarter turn clockwise; a capsule standing up against the right wall is nudged left to lie down. */
export function rotateDrop(s: DropState): boolean {
  const p = s.piece
  if (s.status !== 'running' || !p) return false
  const rot = ((p.rot + 1) % 4) as DropRot
  for (const kick of rot % 2 === 0 ? [0, -1] : [0]) {
    const turned = { ...p, rot, x: p.x + kick }
    if (dropFits(s.grid, turned)) {
      s.piece = turned
      return true
    }
  }
  return false
}

export function dropFallSeconds(level: number): number {
  return Math.max(DROP_FALL_MIN, DROP_FALL_SECONDS - DROP_FALL_LESS_PER_LEVEL * (level - 1))
}

// --- matching and falling, on a bare grid (the game and the scripted player share them) ------

/** Every cell in a line of four or more of a colour, across or down. */
export function dropMatches(grid: DropGrid): Array<{ x: number, y: number }> {
  const hit = new Set<number>()
  const key = (x: number, y: number) => y * DROP_COLS + x
  for (let y = 0; y < DROP_ROWS; y++) {
    let x = 0
    while (x < DROP_COLS) {
      const c = grid[y]![x]
      if (!c) {
        x++
        continue
      }
      let end = x + 1
      while (end < DROP_COLS && grid[y]![end]?.color === c.color) end++
      if (end - x >= DROP_MATCH) for (let i = x; i < end; i++) hit.add(key(i, y))
      x = end
    }
  }
  for (let x = 0; x < DROP_COLS; x++) {
    let y = 0
    while (y < DROP_ROWS) {
      const c = grid[y]![x]
      if (!c) {
        y++
        continue
      }
      let end = y + 1
      while (end < DROP_ROWS && grid[end]![x]?.color === c.color) end++
      if (end - y >= DROP_MATCH) for (let i = y; i < end; i++) hit.add(key(x, i))
      y = end
    }
  }
  return [...hit].sort((a, b) => a - b).map(k => ({ x: k % DROP_COLS, y: Math.floor(k / DROP_COLS) }))
}

/** Takes the matched cells out; a half whose other half went is on its own now. */
export function dropSweep(grid: DropGrid, cells: Array<{ x: number, y: number }>): { germs: number, halves: number } {
  let germs = 0
  let halves = 0
  for (const { x, y } of cells) {
    const c = grid[y]![x]
    if (!c) continue
    if (c.kind === 'germ') germs++
    else halves++
    grid[y]![x] = null
    if (c.link) {
      const [dx, dy] = STEP[c.link]
      const other = dropCellAt(grid, x + dx, y + dy)
      if (other && other.link === OPPOSITE[c.link]) other.link = null
    }
  }
  return { germs, halves }
}

/**
 * One row of gravity for everything loose: a half on its own, a lying capsule with nothing
 * under either half, a standing one with nothing under its foot. Germs never move. Bottom row
 * first, so a stack of loose halves falls as one. True when anything moved.
 */
export function dropCascade(grid: DropGrid): boolean {
  let moved = false
  for (let y = DROP_ROWS - 2; y >= 0; y--) {
    for (let x = 0; x < DROP_COLS; x++) {
      const c = grid[y]![x]
      if (!c || c.kind === 'germ') continue
      if (c.link === 'left' || c.link === 'up') continue // handled from the other half
      if (c.link === 'right') {
        if (grid[y + 1]![x] || grid[y + 1]![x + 1]) continue
        grid[y + 1]![x] = c
        grid[y + 1]![x + 1] = grid[y]![x + 1] ?? null
        grid[y]![x] = null
        grid[y]![x + 1] = null
      }
      else if (c.link === 'down') {
        // the top half: its foot is the cell below
        const foot = grid[y + 1]![x]
        if (!foot || y + 2 >= DROP_ROWS || grid[y + 2]![x]) continue
        grid[y + 2]![x] = foot
        grid[y + 1]![x] = c
        grid[y]![x] = null
      }
      else {
        if (grid[y + 1]![x]) continue
        grid[y + 1]![x] = c
        grid[y]![x] = null
      }
      moved = true
    }
  }
  return moved
}

/** Clears and cascades until nothing more happens; what went, by kind. */
export function dropResolve(grid: DropGrid): { germs: number, halves: number } {
  let germs = 0
  let halves = 0
  for (let guard = 0; guard < 64; guard++) {
    const matches = dropMatches(grid)
    if (!matches.length) break
    const went = dropSweep(grid, matches)
    germs += went.germs
    halves += went.halves
    while (dropCascade(grid)) { /* settle */ }
  }
  return { germs, halves }
}

// --- the clocks -------------------------------------------------------------------------------

function pop(s: DropState, x: number, y: number, text: string) {
  s.pops.push({ x, y, text, at: s.elapsed })
  if (s.pops.length > 8) s.pops.shift()
}

/** The capsule in hand comes to rest; one still up in the neck is the end. */
function lock(s: DropState) {
  const p = s.piece
  if (!p) return
  const cells = dropPieceCells(p)
  if (cells.some(c => c.y < 0)) {
    s.status = 'over'
    s.endedAt = s.elapsed
    return
  }
  const [a, b] = cells
  const linkA: DropDir = a.x < b.x ? 'right' : a.x > b.x ? 'left' : a.y < b.y ? 'down' : 'up'
  s.grid[a.y]![a.x] = { color: a.color, kind: 'half', link: linkA }
  s.grid[b.y]![b.x] = { color: b.color, kind: 'half', link: OPPOSITE[linkA] }
  s.piece = null
  s.pieces++
  s.lockedAt = s.elapsed
  s.chain = 0
  settle(s)
}

/** After a lock or a fall: anything matched flashes; otherwise a clean bottle, or the next capsule. */
function settle(s: DropState) {
  const matches = dropMatches(s.grid)
  if (matches.length) {
    s.clearing = matches
    s.clearAt = s.elapsed
    s.status = 'clearing'
    return
  }
  if (s.germs === 0) {
    s.status = 'cleared'
    s.clearedAt = s.elapsed
    return
  }
  spawn(s)
}

/** The flash is over: the matched cells go, the score climbs (doubling down a chain), the loose halves fall. */
function sweep(s: DropState) {
  const cells = s.clearing
  const { germs, halves } = dropSweep(s.grid, cells)
  s.germs -= germs
  const points = (DROP_GERM_POINTS * germs + DROP_HALF_POINTS * halves) * 2 ** Math.min(DROP_CHAIN_CAP, s.chain)
  if (points > 0) {
    s.score += points
    const cx = cells.reduce((sum, c) => sum + c.x, 0) / cells.length + 0.5
    const cy = cells.reduce((sum, c) => sum + c.y, 0) / cells.length + 0.5
    pop(s, cx, cy, s.chain > 0 ? `${points} ×${2 ** Math.min(DROP_CHAIN_CAP, s.chain)}` : String(points))
  }
  s.chain++
  s.clearing = []
  s.fallTimer = 0
  s.status = 'falling'
}

function nextLevel(s: DropState) {
  s.level++
  s.levelsCleared++
  const { grid, placed } = freshGrid(dropGermsFor(s.source.germs, s.level), s.rng)
  s.grid = grid
  s.germsTotal = placed
  s.germs = placed
  s.piece = null
  s.plan = null
  s.status = 'ready'
}

/** Advance the clocks by dt seconds (clamped); `soft` while the player holds down. */
export function stepDrop(s: DropState, dt: number, soft = false): DropState {
  if (s.status === 'over') return s
  const t = Math.min(MAX_DT, Math.max(0, dt))
  s.elapsed += t
  switch (s.status) {
    case 'ready':
      return s
    case 'running': {
      const interval = soft ? DROP_SOFT_SECONDS : dropFallSeconds(s.level)
      // A finger that just came down should not spend the whole wait at once.
      if (soft && s.fallTimer > interval) s.fallTimer = interval
      s.fallTimer += t
      while (s.fallTimer >= interval && s.status === 'running') {
        s.fallTimer -= interval
        const p = s.piece!
        const down = { ...p, y: p.y + 1 }
        if (dropFits(s.grid, down)) s.piece = down
        else lock(s)
      }
      return s
    }
    case 'clearing':
      if (s.elapsed - s.clearAt >= DROP_CLEAR_SECONDS) sweep(s)
      return s
    case 'falling':
      s.fallTimer += t
      while (s.fallTimer >= DROP_CASCADE_SECONDS && s.status === 'falling') {
        s.fallTimer -= DROP_CASCADE_SECONDS
        if (!dropCascade(s.grid)) settle(s)
      }
      return s
    case 'cleared':
      if (s.elapsed - s.clearedAt >= DROP_LEVEL_SECONDS) nextLevel(s)
      return s
  }
}

/** How high the bottle is filled, in rows. */
export function dropHeight(grid: DropGrid): number {
  for (let y = 0; y < DROP_ROWS; y++) if (grid[y]!.some(Boolean)) return DROP_ROWS - y
  return 0
}

/** Which of the companion's faces the renderer should draw. */
export function dropPose(s: DropState): 'idle' | 'eating' | 'happy' | 'worried' | 'flatline' | 'petted' {
  if (s.status === 'over') return 'flatline'
  if (s.status === 'cleared') return 'petted'
  if (s.status === 'clearing' && s.clearing.some(c => s.grid[c.y]![c.x]?.kind === 'germ')) return 'happy'
  if (dropHeight(s.grid) >= DROP_ROWS - 4) return 'worried'
  if (s.lockedAt >= 0 && s.elapsed - s.lockedAt < 0.25) return 'eating'
  return 'idle'
}

// --- the scripted player (tests, and the dev hook) -------------------------------------------

function copyGrid(grid: DropGrid): DropGrid {
  return grid.map(row => row.map(c => (c ? { ...c } : null)))
}

/**
 * How good a settled bottle looks: germs gone above all, then halves sitting on their own colour
 * (a column building toward four), never a germ buried under another colour, the stack kept low
 * and the bottle kept tidy.
 */
function judge(grid: DropGrid, went: { germs: number, halves: number }): number {
  let score = 1000 * went.germs + 60 * went.halves
  let halves = 0
  let tallest = 0
  for (let x = 0; x < DROP_COLS; x++) {
    let top = DROP_ROWS
    for (let y = 0; y < DROP_ROWS; y++) {
      const c = grid[y]![x]
      if (!c) continue
      if (top === DROP_ROWS) top = y
      if (c.kind !== 'half') continue
      halves++
      const below = dropCellAt(grid, x, y + 1)
      if (below) {
        if (below.color === c.color) score += below.kind === 'germ' ? 40 : 14
        else if (below.kind === 'germ') score -= 45
        else score -= 10
      }
      else if (y + 1 < DROP_ROWS) {
        score -= 25 // a half hanging over a hole (its other half holds it up)
      }
      const right = dropCellAt(grid, x + 1, y)
      if (right && right.color === c.color) score += 6
    }
    tallest = Math.max(tallest, DROP_ROWS - top)
  }
  score -= 4 * halves + 5 * tallest
  if (tallest > DROP_ROWS - 3) score -= 400
  return score
}

interface Placement { x: number, rot: DropRot, grid: DropGrid, score: number }

/** Every column and turn the capsule can be walked to along the neck and dropped from, judged after the bottle settles. */
function placements(grid: DropGrid, colors: [DropColor, DropColor]): Placement[] {
  const out: Placement[] = []
  const clearAcross = (from: number, to: number) => {
    const [lo, hi] = from < to ? [from, to] : [to, from]
    for (let x = lo; x <= hi; x++) if (grid[0]![x]) return false
    return true
  }
  for (const rot of [0, 1, 2, 3] as DropRot[]) {
    for (let x = 0; x < DROP_COLS; x++) {
      let p: DropPiece = { x, y: 0, rot, colors }
      if (!dropFits(grid, p) || !clearAcross(DROP_SPAWN_X, x) || !clearAcross(DROP_SPAWN_X, x + (rot % 2 === 0 ? 1 : 0))) continue
      while (dropFits(grid, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 }
      const cells = dropPieceCells(p)
      if (cells.some(c => c.y < 0)) continue
      const trial = copyGrid(grid)
      const [a, b] = cells
      const linkA: DropDir = a.x < b.x ? 'right' : a.x > b.x ? 'left' : a.y < b.y ? 'down' : 'up'
      trial[a.y]![a.x] = { color: a.color, kind: 'half', link: linkA }
      trial[b.y]![b.x] = { color: b.color, kind: 'half', link: OPPOSITE[linkA] }
      const went = dropResolve(trial)
      out.push({ x, rot, grid: trial, score: judge(trial, went) })
    }
  }
  return out
}

/** The scripted player looks this many moves ahead for the capsule after this one. */
export const DROP_BOT_LOOKAHEAD = 6

/** Where the scripted player will put the capsule in hand: the best-judged drop, the next capsule's best drop weighed in for the top few. */
export function planDrop(s: DropState): { x: number, rot: DropRot, piece: number } {
  const p = s.piece
  if (!p) return { x: DROP_SPAWN_X, rot: 0, piece: s.pieces }
  const first = placements(s.grid, p.colors).sort((a, b) => b.score - a.score || a.x - b.x || a.rot - b.rot)
  if (!first.length) return { x: p.x, rot: p.rot, piece: s.pieces }
  let best = first[0]!
  let bestScore = -Infinity
  for (const cand of first.slice(0, DROP_BOT_LOOKAHEAD)) {
    const after = placements(cand.grid, s.next)
    const follow = after.length ? Math.max(...after.map(a => a.score)) : -2000
    const total = cand.score + 0.6 * follow
    if (total > bestScore) {
      bestScore = total
      best = cand
    }
  }
  return { x: best.x, rot: best.rot, piece: s.pieces }
}

/**
 * A scripted player: starts when ready, then for each capsule picks a column and a turn
 * (planDrop) and walks it there one move a call, then holds down. Returns whether to hold down
 * this frame — the caller passes it to stepDrop.
 */
export function autoDrop(s: DropState): boolean {
  if (s.status === 'ready') {
    startDrop(s)
    return false
  }
  const p = s.piece
  if (s.status !== 'running' || !p) return false
  if (!s.plan || s.plan.piece !== s.pieces) s.plan = planDrop(s)
  const plan = s.plan
  if (p.rot !== plan.rot) {
    if (!rotateDrop(s)) plan.rot = p.rot
    return false
  }
  if (p.x !== plan.x) {
    if (!moveDrop(s, p.x < plan.x ? 'right' : 'left')) plan.x = p.x
    return false
  }
  return true
}
