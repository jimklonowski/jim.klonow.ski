// TICKER's capsule maze — Pac-Man, where the ghosts are the soda log. A fixed maze of capsules
// (the dots) with a power capsule in each corner; four ghosts on patrol, each the can of one of
// the month's most-logged sodas (COKE, DR PEPPER …) with the classic four temperaments, and a
// slower germ in every slot the month didn't fill — so a clean month gets the kinder maze. The
// figure is TICKER's face, chomping. Every capsule eaten clears the level; the next one is a
// shade faster with a shorter scare.
//
// Pure and deterministic, like the runner, the crusher and the world: the world advances by
// stepMaze(state, dt) and reads back as plain data; the component
// (app/components/ticker/Maze.vue) draws it and feeds it input. The plain-node tests drive whole
// games with a scripted player and a seeded random source — the proof that the maze is
// clearable against the full set of cans.
//
// Units: tiles and seconds. x grows right, y grows DOWN; an entity's (x, y) is its centre, and a
// tile's centre is (col + 0.5, row + 0.5). Every export is named apart from the other games'
// (Nuxt auto-imports shared/utils as one registry).
import { MAX_DT } from './tickerRunner.ts'

export const MAZE_COLS = 19
export const MAZE_ROWS = 21

/**
 * The maze. `#` wall · `.` capsule · `o` power capsule · ` ` corridor · `-` the house door ·
 * `G` the ghost house · `T` the tunnel (wraps) · `P` the start. Mirror-symmetric, no dead ends.
 */
export const MAZE_MAP: readonly string[] = [
  '###################',
  '#........#........#',
  '#o##.###.#.###.##o#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '####.#... ...#.####',
  '####.#.##-##.#.####',
  'TT.....#GGG#.....TT',
  '####.#.#####.#.####',
  '####.#.......#.####',
  '####.#.#####.#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....P.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################'
]

export type MazeCell = 'wall' | 'dot' | 'power' | 'empty' | 'door' | 'house' | 'tunnel'
export type MazeDir = 'up' | 'down' | 'left' | 'right'
/** The classic tie-break order for a ghost choosing between equal distances. */
export const MAZE_DIRS: readonly MazeDir[] = ['up', 'left', 'down', 'right']
export const MAZE_STEP: Record<MazeDir, readonly [number, number]> = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] }
const OPPOSITE: Record<MazeDir, MazeDir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/** The start tile and the ghosts' spots, as (col, row). */
export const MAZE_START: readonly [number, number] = [9, 15]
export const MAZE_DOOR_TOP: readonly [number, number] = [9, 7]
export const MAZE_HOUSE: readonly (readonly [number, number])[] = [[9, 9], [8, 9], [10, 9]]
/** Where the bonus vial appears: the corridor under the house. */
export const MAZE_BONUS_AT: readonly [number, number] = [9, 11]

export const MAZE_PLAYER_SPEED = 6
export const MAZE_GHOST_SPEED = 5.4
export const MAZE_GHOST_SPEED_PER_LEVEL = 0.25
export const MAZE_GHOST_MAX_SPEED = 7.2
/** A germ's pace against a can's. */
export const MAZE_GERM_FACTOR = 0.85
export const MAZE_FRIGHT_SPEED = 3.2
export const MAZE_TUNNEL_FACTOR = 0.55
export const MAZE_EYES_SPEED = 11
export const MAZE_HOUSE_SPEED = 3
export const MAZE_FRIGHT_SECONDS = 7
export const MAZE_FRIGHT_LESS_PER_LEVEL = 0.6
export const MAZE_FRIGHT_MIN = 2
/** The frightened ghosts flash for the last stretch of the scare. */
export const MAZE_FRIGHT_FLASH = 2
/** Scatter, chase, scatter, chase … then chase for good. */
export const MAZE_MODES: readonly number[] = [7, 20, 7, 20, 5, 20, 5]
export const MAZE_DOT_POINTS = 10
export const MAZE_POWER_POINTS = 50
/** The first ghost of a scare, doubling for each one after. */
export const MAZE_GHOST_POINTS = 200
/** The bonus vial shows after this many capsules of a level, for this long, worth this much × level. */
export const MAZE_BONUS_DOTS: readonly number[] = [60, 120]
export const MAZE_BONUS_SECONDS = 9
export const MAZE_BONUS_POINTS = 100
export const MAZE_BONUS_MAX = 1000
export const MAZE_EXTRA_LIFE_EVERY = 10000
export const MAZE_MAX_LIVES = 5
export const MAZE_LIVES = 3
/** The house lets its ghosts out by capsules eaten since the start (or the last life), or after this long without one. */
export const MAZE_RELEASE_DOTS: readonly number[] = [0, 0, 12, 32]
export const MAZE_RELEASE_SECONDS = 4
/** The figure's keel-over, then the level's flash, seconds. */
export const MAZE_DEATH_SECONDS = 1.2
export const MAZE_CLEAR_SECONDS = 1.6
/** A ghost and the figure this close (tiles, each axis) have met. */
export const MAZE_HIT = 0.55
/** Sub-steps keep that true at any speed. */
const SUB_DT = 1 / 120
const EPS = 1e-6

export type MazeGhostKind = 'can' | 'germ'
export interface MazeGhostInput {
  kind: MazeGhostKind
  /** The soda's name for a can ("COKE"); null for a germ. */
  label: string | null
}

export type MazeTemper = 'chaser' | 'ambusher' | 'flank' | 'shy'
const TEMPERS: readonly MazeTemper[] = ['chaser', 'ambusher', 'flank', 'shy']
/** Where each goes in scatter: the chaser top right, the ambusher top left, the flank bottom right, the shy one bottom left. */
const CORNERS: Record<MazeTemper, readonly [number, number]> = {
  chaser: [MAZE_COLS - 2, -2],
  ambusher: [1, -2],
  flank: [MAZE_COLS - 1, MAZE_ROWS + 1],
  shy: [0, MAZE_ROWS + 1]
}

export type MazeGhostMode = 'home' | 'leaving' | 'walk' | 'fright' | 'eyes' | 'enter'

export interface MazeGhost {
  id: number
  kind: MazeGhostKind
  label: string | null
  temper: MazeTemper
  x: number
  y: number
  dir: MazeDir
  mode: MazeGhostMode
}

export type MazeStatus = 'ready' | 'running' | 'dying' | 'cleared' | 'over'

export interface MazePop {
  x: number
  y: number
  text: string
  at: number
}

export interface MazeState {
  status: MazeStatus
  level: number
  /** Levels finished this game (the record's `cleared`). */
  levelsCleared: number
  grid: MazeCell[][]
  pelletsTotal: number
  pellets: number
  /** Capsules eaten this level, for the bonus. */
  dotsEaten: number
  /** Since the start or the last life, for the house. */
  dotsSinceReset: number
  sinceDot: number
  player: { x: number, y: number, dir: MazeDir | null, want: MazeDir | null }
  ghosts: MazeGhost[]
  mode: 'scatter' | 'chase'
  modeIndex: number
  modeTimer: number
  /** Seconds of scare left. */
  fright: number
  /** Ghosts eaten in this scare. */
  frightChain: number
  bonus: { x: number, y: number, until: number, value: number } | null
  bonusesShown: number
  lives: number
  score: number
  nextLifeAt: number
  elapsed: number
  /** When the last capsule went, for the chomp. */
  ateAt: number
  deadAt: number
  clearedAt: number
  pops: MazePop[]
  source: { ghosts: MazeGhostInput[], lives: number }
  rng: () => number
}

export interface MazeOptions {
  /** Four slots; fewer are padded with germs, more are cut. */
  ghosts: MazeGhostInput[]
  rng?: () => number
  lives?: number
}

// --- the grid ---------------------------------------------------------------------------------

export function mazeCellOf(ch: string): MazeCell {
  switch (ch) {
    case '#': return 'wall'
    case '.': return 'dot'
    case 'o': return 'power'
    case '-': return 'door'
    case 'G': return 'house'
    case 'T': return 'tunnel'
    default: return 'empty'
  }
}

export function mazeGrid(): MazeCell[][] {
  return MAZE_MAP.map(row => [...row].map(mazeCellOf))
}

/** The cell at (col, row), the columns wrapping through the tunnel; outside the rows is wall. */
export function mazeCellAt(grid: MazeCell[][], col: number, row: number): MazeCell {
  const r = grid[row]
  if (!r) return 'wall'
  return r[((col % MAZE_COLS) + MAZE_COLS) % MAZE_COLS] ?? 'wall'
}

/** Whether `who` may enter a cell: nobody the walls, nobody the door (the house has its own script), only ghosts the house. */
export function mazePassable(cell: MazeCell, who: 'player' | 'ghost'): boolean {
  if (cell === 'wall' || cell === 'door') return false
  if (cell === 'house') return who === 'ghost'
  return true
}

const tileX = (x: number) => Math.floor(x)
const tileY = (y: number) => Math.floor(y)
const centreOf = ([c, r]: readonly [number, number]) => ({ x: c + 0.5, y: r + 0.5 })

function opens(grid: MazeCell[][], x: number, y: number, d: MazeDir, who: 'player' | 'ghost'): boolean {
  const [dx, dy] = MAZE_STEP[d]
  return mazePassable(mazeCellAt(grid, tileX(x) + dx, tileY(y) + dy), who)
}

// --- building and resetting -------------------------------------------------------------------

function ghostsFor(inputs: MazeGhostInput[]): MazeGhost[] {
  const slots: MazeGhostInput[] = Array.from({ length: 4 }, (_, i) => inputs[i] ?? { kind: 'germ', label: null })
  return slots.map((g, i) => ({ id: i, kind: g.kind, label: g.label, temper: TEMPERS[i]!, x: 0, y: 0, dir: 'left', mode: 'home' }))
}

/** Everyone back to their marks; the house's count starts over. */
function placeAll(s: MazeState) {
  const start = centreOf(MAZE_START)
  s.player = { x: start.x, y: start.y, dir: 'left', want: null }
  s.ghosts.forEach((g, i) => {
    if (i === 0) {
      const top = centreOf(MAZE_DOOR_TOP)
      Object.assign(g, { x: top.x, y: top.y, dir: 'left', mode: 'walk' })
    }
    else {
      const spot = centreOf(MAZE_HOUSE[i - 1]!)
      Object.assign(g, { x: spot.x, y: spot.y, dir: 'up', mode: 'home' })
    }
  })
  s.mode = 'scatter'
  s.modeIndex = 0
  s.modeTimer = 0
  s.fright = 0
  s.frightChain = 0
  s.dotsSinceReset = 0
  s.sinceDot = 0
  s.bonus = null
}

export function createMaze(o: MazeOptions): MazeState {
  const grid = mazeGrid()
  const pellets = grid.flat().filter(c => c === 'dot' || c === 'power').length
  const lives = o.lives ?? MAZE_LIVES
  const s: MazeState = {
    status: 'ready',
    level: 1,
    levelsCleared: 0,
    grid,
    pelletsTotal: pellets,
    pellets,
    dotsEaten: 0,
    dotsSinceReset: 0,
    sinceDot: 0,
    player: { x: 0, y: 0, dir: null, want: null },
    ghosts: ghostsFor(o.ghosts),
    mode: 'scatter',
    modeIndex: 0,
    modeTimer: 0,
    fright: 0,
    frightChain: 0,
    bonus: null,
    bonusesShown: 0,
    lives,
    score: 0,
    nextLifeAt: MAZE_EXTRA_LIFE_EVERY,
    elapsed: 0,
    ateAt: -1,
    deadAt: -1,
    clearedAt: -1,
    pops: [],
    source: { ghosts: o.ghosts, lives },
    rng: o.rng ?? Math.random
  }
  placeAll(s)
  return s
}

/**
 * The one button. Ready: go. Over: a fresh game against the same ghosts. Anything else: nothing
 * (a mashed key mid-game does nothing; the keel-over and the level flash play out).
 */
export function startMaze(s: MazeState): MazeState {
  if (s.status === 'over') Object.assign(s, createMaze({ rng: s.rng, ...s.source }))
  if (s.status === 'ready') s.status = 'running'
  return s
}

/** The player's wish: taken at the next tile centre it opens on, or at once when it's a reverse. */
export function steerMaze(s: MazeState, d: MazeDir): MazeState {
  s.player.want = d
  if (s.player.dir && d === OPPOSITE[s.player.dir]) s.player.dir = d
  return s
}

// --- moving -----------------------------------------------------------------------------------

interface Mover { x: number, y: number, dir: MazeDir | null }

function wrap(e: Mover) {
  if (e.x < 0) e.x += MAZE_COLS
  else if (e.x >= MAZE_COLS) e.x -= MAZE_COLS
}

/**
 * Carries a mover `dist` tiles along its direction, stopping at every tile centre to ask `decide`
 * for the next direction (null = stop there). A centre is the only place a turn can happen, so
 * nothing cuts a corner; what's left of the distance carries on in the new direction.
 */
function travel(e: Mover, dist: number, decide: (e: Mover) => MazeDir | null) {
  let left = dist
  // Whether the centre under the mover has already had its say this call (or when it was
  // stopped there): then the next centre is a whole tile on. Otherwise a mover sitting on a
  // centre — or a hair short of it after last frame's partial move — decides here, now; the
  // old "less than epsilon means past it" read let a mover a hair short skip the centre and
  // walk through the wall beyond.
  let decided = false
  for (let guard = 0; left > EPS && guard < 64; guard++) {
    if (e.dir == null) {
      const d = decide(e)
      if (!d) return
      e.dir = d
      decided = true
    }
    const [dx, dy] = MAZE_STEP[e.dir]
    const cx = tileX(e.x) + 0.5
    const cy = tileY(e.y) + 0.5
    let toCentre = dx !== 0 ? (cx - e.x) * dx : (cy - e.y) * dy
    if (decided || toCentre < -EPS) toCentre += 1
    else if (toCentre < 0) toCentre = 0
    if (left < toCentre) {
      e.x += dx * left
      e.y += dy * left
      wrap(e)
      return
    }
    e.x += dx * toCentre
    e.y += dy * toCentre
    wrap(e)
    e.x = tileX(e.x) + 0.5
    e.y = tileY(e.y) + 0.5
    left -= toCentre
    const d = decide(e)
    if (!d) {
      e.dir = null
      return
    }
    e.dir = d
    decided = true
  }
}

function playerDecide(s: MazeState): (e: Mover) => MazeDir | null {
  return (e) => {
    const want = s.player.want
    if (want && opens(s.grid, e.x, e.y, want, 'player')) return want
    if (e.dir && opens(s.grid, e.x, e.y, e.dir, 'player')) return e.dir
    return null
  }
}

/** Where a ghost is heading this moment, by temper and mode. */
export function mazeTarget(s: MazeState, g: MazeGhost): readonly [number, number] {
  if (g.mode === 'eyes') return MAZE_DOOR_TOP
  if (s.mode === 'scatter') return CORNERS[g.temper]
  const p = s.player
  const px = tileX(p.x)
  const py = tileY(p.y)
  const [dx, dy] = p.dir ? MAZE_STEP[p.dir] : [0, 0]
  switch (g.temper) {
    case 'chaser': return [px, py]
    case 'ambusher': return [px + 4 * dx, py + 4 * dy]
    case 'flank': {
      const chaser = s.ghosts[0]!
      const ax = px + 2 * dx
      const ay = py + 2 * dy
      return [ax + (ax - tileX(chaser.x)), ay + (ay - tileY(chaser.y))]
    }
    case 'shy': {
      const far = Math.hypot(px - tileX(g.x), py - tileY(g.y)) > 8
      return far ? [px, py] : CORNERS[g.temper]
    }
  }
}

function ghostDecide(s: MazeState, g: MazeGhost): (e: Mover) => MazeDir | null {
  return (e) => {
    if (g.mode === 'eyes' && tileX(e.x) === MAZE_DOOR_TOP[0] && tileY(e.y) === MAZE_DOOR_TOP[1]) {
      g.mode = 'enter'
      return null
    }
    const back = e.dir ? OPPOSITE[e.dir] : null
    let options = MAZE_DIRS.filter(d => d !== back && opens(s.grid, e.x, e.y, d, 'ghost'))
    if (!options.length) options = back && opens(s.grid, e.x, e.y, back, 'ghost') ? [back] : []
    if (!options.length) return null
    if (g.mode === 'fright') return options[Math.floor(s.rng() * options.length)]!
    const [tx, ty] = mazeTarget(s, g)
    let pick = options[0]!
    let bestD = Infinity
    for (const d of options) {
      const [dx, dy] = MAZE_STEP[d]
      const nx = tileX(e.x) + dx
      const ny = tileY(e.y) + dy
      const dist = (nx - tx) ** 2 + (ny - ty) ** 2
      if (dist < bestD) {
        bestD = dist
        pick = d
      }
    }
    return pick
  }
}

/** A ghost's pace right now: eyes fly, a scare crawls, the tunnel slows everyone, germs are lazier than cans. */
export function mazeGhostSpeed(s: MazeState, g: MazeGhost): number {
  if (g.mode === 'eyes') return MAZE_EYES_SPEED
  const tunnel = mazeCellAt(s.grid, tileX(g.x), tileY(g.y)) === 'tunnel' ? MAZE_TUNNEL_FACTOR : 1
  if (g.mode === 'fright') return MAZE_FRIGHT_SPEED * tunnel
  const base = Math.min(MAZE_GHOST_MAX_SPEED, MAZE_GHOST_SPEED + MAZE_GHOST_SPEED_PER_LEVEL * (s.level - 1))
  return base * (g.kind === 'germ' ? MAZE_GERM_FACTOR : 1) * tunnel
}

/** Inside the house: a leaving ghost lines up under the door and rises out; an entering one (eyes home) sinks to the middle and turns around. */
function moveHouse(s: MazeState, g: MazeGhost, t: number) {
  const top = centreOf(MAZE_DOOR_TOP)
  const mid = centreOf(MAZE_HOUSE[0]!)
  let left = MAZE_HOUSE_SPEED * t
  if (g.mode === 'enter') {
    const down = mid.y - g.y
    if (left >= down) {
      g.y = mid.y
      g.mode = 'leaving'
      left -= down
    }
    else {
      g.y += left
      return
    }
  }
  // leaving: across to the door's column, then up and out
  const across = Math.abs(top.x - g.x)
  if (across > EPS) {
    const step = Math.min(left, across)
    g.x += Math.sign(top.x - g.x) * step
    g.dir = top.x > g.x ? 'right' : 'left'
    left -= step
    if (left <= EPS) return
  }
  g.x = top.x
  g.dir = 'up'
  const up = g.y - top.y
  if (left >= up) {
    g.y = top.y
    g.mode = s.fright > 0 ? 'fright' : 'walk'
    g.dir = s.rng() < 0.5 ? 'left' : 'right'
  }
  else {
    g.y -= left
  }
}

/** The house lets the next ghost out by capsules eaten, or after a lull. */
function releaseGhosts(s: MazeState) {
  for (const g of s.ghosts) {
    if (g.mode !== 'home') continue
    const due = s.dotsSinceReset >= MAZE_RELEASE_DOTS[g.id]! || s.sinceDot >= MAZE_RELEASE_SECONDS
    if (due) {
      g.mode = 'leaving'
      s.sinceDot = 0
      return // one at a time
    }
  }
}

function reverseWalkers(s: MazeState) {
  for (const g of s.ghosts) if (g.mode === 'walk' || g.mode === 'fright') g.dir = OPPOSITE[g.dir]
}

function pop(s: MazeState, x: number, y: number, text: string) {
  s.pops.push({ x, y, text, at: s.elapsed })
  if (s.pops.length > 8) s.pops.shift()
}

function award(s: MazeState, points: number) {
  s.score += points
  if (s.score >= s.nextLifeAt) {
    s.nextLifeAt += MAZE_EXTRA_LIFE_EVERY
    if (s.lives < MAZE_MAX_LIVES) s.lives += 1
  }
}

export function mazeFrightSeconds(level: number): number {
  return Math.max(MAZE_FRIGHT_MIN, MAZE_FRIGHT_SECONDS - MAZE_FRIGHT_LESS_PER_LEVEL * (level - 1))
}

function eat(s: MazeState) {
  const col = tileX(s.player.x)
  const row = tileY(s.player.y)
  const cell = mazeCellAt(s.grid, col, row)
  if (cell === 'dot' || cell === 'power') {
    s.grid[row]![((col % MAZE_COLS) + MAZE_COLS) % MAZE_COLS] = 'empty'
    s.pellets -= 1
    s.dotsEaten += 1
    s.dotsSinceReset += 1
    s.sinceDot = 0
    s.ateAt = s.elapsed
    award(s, cell === 'power' ? MAZE_POWER_POINTS : MAZE_DOT_POINTS)
    if (cell === 'power') {
      s.fright = mazeFrightSeconds(s.level)
      s.frightChain = 0
      for (const g of s.ghosts) {
        if (g.mode === 'walk') {
          g.mode = 'fright'
          g.dir = OPPOSITE[g.dir]
        }
      }
    }
    const bonusIndex = MAZE_BONUS_DOTS.findIndex((n, i) => i === s.bonusesShown && s.dotsEaten >= n)
    if (bonusIndex >= 0 && !s.bonus) {
      const at = centreOf(MAZE_BONUS_AT)
      s.bonus = { x: at.x, y: at.y, until: s.elapsed + MAZE_BONUS_SECONDS, value: Math.min(MAZE_BONUS_MAX, MAZE_BONUS_POINTS * s.level) }
      s.bonusesShown += 1
    }
  }
  if (s.bonus && Math.abs(s.bonus.x - s.player.x) < MAZE_HIT && Math.abs(s.bonus.y - s.player.y) < MAZE_HIT) {
    award(s, s.bonus.value)
    pop(s, s.bonus.x, s.bonus.y, String(s.bonus.value))
    s.bonus = null
  }
}

function meet(s: MazeState) {
  const p = s.player
  for (const g of s.ghosts) {
    if (g.mode !== 'walk' && g.mode !== 'fright') continue
    if (Math.abs(g.x - p.x) >= MAZE_HIT || Math.abs(g.y - p.y) >= MAZE_HIT) continue
    if (g.mode === 'fright') {
      const points = MAZE_GHOST_POINTS * 2 ** Math.min(3, s.frightChain)
      s.frightChain += 1
      award(s, points)
      pop(s, g.x, g.y, String(points))
      g.mode = 'eyes'
    }
    else {
      s.status = 'dying'
      s.deadAt = s.elapsed
      s.lives -= 1
      return
    }
  }
}

function tick(s: MazeState, t: number) {
  // The clocks: a scare pauses the scatter/chase schedule.
  if (s.fright > 0) {
    s.fright = Math.max(0, s.fright - t)
    if (s.fright === 0) for (const g of s.ghosts) if (g.mode === 'fright') g.mode = 'walk'
  }
  else if (s.modeIndex < MAZE_MODES.length) {
    s.modeTimer += t
    if (s.modeTimer >= MAZE_MODES[s.modeIndex]!) {
      s.modeTimer = 0
      s.modeIndex += 1
      s.mode = s.modeIndex % 2 === 0 ? 'scatter' : 'chase'
      reverseWalkers(s)
    }
  }
  s.sinceDot += t
  releaseGhosts(s)
  if (s.bonus && s.elapsed >= s.bonus.until) s.bonus = null

  travel(s.player, MAZE_PLAYER_SPEED * t, playerDecide(s))
  eat(s)

  for (const g of s.ghosts) {
    if (g.mode === 'home') continue
    if (g.mode === 'leaving' || g.mode === 'enter') {
      moveHouse(s, g, t)
      continue
    }
    travel(g, mazeGhostSpeed(s, g) * t, ghostDecide(s, g))
  }

  meet(s)
  if (s.status === 'running' && s.pellets === 0) {
    s.status = 'cleared'
    s.clearedAt = s.elapsed
  }
}

function afterDeath(s: MazeState) {
  if (s.lives <= 0) {
    s.status = 'over'
    return
  }
  placeAll(s)
  s.status = 'ready'
}

function nextLevel(s: MazeState) {
  s.level += 1
  s.levelsCleared += 1
  s.grid = mazeGrid()
  s.pellets = s.pelletsTotal
  s.dotsEaten = 0
  s.bonusesShown = 0
  placeAll(s)
  s.status = 'ready'
}

/** Advance the world by dt seconds (clamped). */
export function stepMaze(s: MazeState, dt: number): MazeState {
  if (s.status === 'over') return s
  const t = Math.min(MAX_DT, Math.max(0, dt))
  s.elapsed += t
  if (s.status === 'ready') return s
  if (s.status === 'dying') {
    if (s.elapsed - s.deadAt >= MAZE_DEATH_SECONDS) afterDeath(s)
    return s
  }
  if (s.status === 'cleared') {
    if (s.elapsed - s.clearedAt >= MAZE_CLEAR_SECONDS) nextLevel(s)
    return s
  }
  const n = Math.max(1, Math.ceil(t / SUB_DT))
  for (let i = 0; i < n && s.status === 'running'; i++) tick(s, t / n)
  return s
}

/** The frightened ghosts are about to recover: the renderer flashes them. */
export function mazeFrightFlashing(s: MazeState): boolean {
  return s.fright > 0 && s.fright <= MAZE_FRIGHT_FLASH
}

/** Which of the companion's faces the renderer should draw. */
export function mazePose(s: MazeState): 'idle' | 'eating' | 'happy' | 'worried' | 'flatline' | 'petted' {
  if (s.status === 'dying' || s.status === 'over') return 'flatline'
  if (s.status === 'cleared') return 'petted'
  if (s.fright > 0) return 'happy'
  const p = s.player
  const near = s.ghosts.some(g => g.mode === 'walk' && Math.hypot(g.x - p.x, g.y - p.y) < 2.5)
  if (near) return 'worried'
  if (s.status === 'running' && p.dir) return Math.floor(s.elapsed * 8) % 2 === 0 ? 'eating' : 'idle'
  return 'idle'
}

// --- the scripted player (tests, and the dev hook) -------------------------------------------

/** Breadth-first distances over the grid from the given tiles, for `who`; Infinity where unreachable. */
function distances(grid: MazeCell[][], from: Array<readonly [number, number]>, who: 'player' | 'ghost', blocked?: (c: number, r: number) => boolean): number[][] {
  const dist = Array.from({ length: MAZE_ROWS }, () => Array<number>(MAZE_COLS).fill(Infinity))
  const queue: Array<[number, number]> = []
  for (const [c, r] of from) {
    const cc = ((c % MAZE_COLS) + MAZE_COLS) % MAZE_COLS
    if (dist[r]?.[cc] !== Infinity) continue
    dist[r]![cc] = 0
    queue.push([cc, r])
  }
  for (let i = 0; i < queue.length; i++) {
    const [c, r] = queue[i]!
    for (const d of MAZE_DIRS) {
      const [dx, dy] = MAZE_STEP[d]
      const nc = ((c + dx) % MAZE_COLS + MAZE_COLS) % MAZE_COLS
      const nr = r + dy
      if (!mazePassable(mazeCellAt(grid, nc, nr), who) || dist[nr]![nc] !== Infinity) continue
      if (blocked?.(nc, nr)) continue
      dist[nr]![nc] = dist[r]![c]! + 1
      queue.push([nc, nr])
    }
  }
  return dist
}

/** The first step from (c, r) toward a tile where `goal` holds, over tiles where `allowed` holds; null when none. */
function stepToward(grid: MazeCell[][], c: number, r: number, goal: (c: number, r: number) => boolean, allowed: (c: number, r: number) => boolean): MazeDir | null {
  const seen = Array.from({ length: MAZE_ROWS }, () => Array<MazeDir | null | undefined>(MAZE_COLS).fill(undefined))
  const queue: Array<[number, number]> = [[c, r]]
  seen[r]![c] = null
  for (let i = 0; i < queue.length; i++) {
    const [qc, qr] = queue[i]!
    if (goal(qc, qr) && !(qc === c && qr === r)) return seen[qr]![qc] ?? null
    for (const d of MAZE_DIRS) {
      const [dx, dy] = MAZE_STEP[d]
      const nc = ((qc + dx) % MAZE_COLS + MAZE_COLS) % MAZE_COLS
      const nr = qr + dy
      if (!mazePassable(mazeCellAt(grid, nc, nr), 'player') || seen[nr]![nc] !== undefined || !allowed(nc, nr)) continue
      seen[nr]![nc] = seen[qr]![qc] ?? d
      queue.push([nc, nr])
    }
  }
  return null
}

/** The scripted player keeps this many tiles of lead on the hunters along any path it takes. */
export const MAZE_BOT_MARGIN = 1

/**
 * A scripted player: starts when ready, then heads for the nearest capsule (or the bonus, or a
 * frightened ghost worth chasing) along tiles it reaches with a tile to spare before any
 * hunting ghost could — the Pac-Man habit of reading the ghosts' distances, not their
 * positions. When every capsule is cut off it waits where it is safe, or with a hunter on its
 * heels runs for the open neighbour the hunters are furthest from. Returns true when it did
 * something.
 */
export function autoMaze(s: MazeState): boolean {
  if (s.status === 'ready') {
    startMaze(s)
    return true
  }
  if (s.status !== 'running') return false
  const c = tileX(s.player.x)
  const r = tileY(s.player.y)
  // The hunters: everyone walking, a scare about to end, and the door while someone is on their way out.
  const sources: Array<readonly [number, number]> = s.ghosts
    .filter(g => g.mode === 'walk' || (g.mode === 'fright' && s.fright < 0.5))
    .map(g => [tileX(g.x), tileY(g.y)] as const)
  if (s.ghosts.some(g => g.mode === 'leaving' || g.mode === 'enter')) sources.push(MAZE_DOOR_TOP)
  const threat = distances(s.grid, sources, 'ghost')
  const reach = distances(s.grid, [[c, r]], 'player')
  const safe = (tc: number, tr: number) => reach[tr]![tc]! + MAZE_BOT_MARGIN < threat[tr]![tc]!
  let goal: (tc: number, tr: number) => boolean = (tc, tr) => {
    const cell = mazeCellAt(s.grid, tc, tr)
    return cell === 'dot' || cell === 'power' || (!!s.bonus && tileX(s.bonus.x) === tc && tileY(s.bonus.y) === tr)
  }
  if (s.fright > 2) {
    const close = s.ghosts.filter(g => g.mode === 'fright' && reach[tileY(g.y)]![tileX(g.x)]! <= 8)
    if (close.length) goal = (tc, tr) => close.some(g => tileX(g.x) === tc && tileY(g.y) === tr)
  }
  let d = stepToward(s.grid, c, r, goal, safe)
  const here = threat[r]![c]!
  if (!d && here >= 5) d = stepToward(s.grid, c, r, goal, () => true) // nothing near: the long way round is fine
  if (!d && here <= 2) {
    // A hunter on its heels: the open neighbour the hunters are furthest from, the way it's going when tied.
    let best = -1
    for (const dir of [...(s.player.dir ? [s.player.dir] : []), ...MAZE_DIRS]) {
      if (!opens(s.grid, s.player.x, s.player.y, dir, 'player')) continue
      const [dx, dy] = MAZE_STEP[dir]
      const far = threat[r + dy]![((c + dx) % MAZE_COLS + MAZE_COLS) % MAZE_COLS]!
      if (far > best) {
        best = far
        d = dir
      }
    }
  }
  if (d) steerMaze(s, d)
  return true
}
