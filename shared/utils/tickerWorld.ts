// TICKER WORLD — a platformer whose level is the month. Each day is a stretch of ground, left
// to right in calendar order, and the castle at the far right is today. The ground rises and
// falls with recovery; an unlogged day is a pit; a workout is a floating platform as long as the
// session, with that day's doses lined up on it as capsules to collect; doses without a workout
// lie along the ground; a blood draw is a question block; a week boundary is a checkpoint flag.
// (Session two adds the soda cans as the enemies that patrol their day, the shrink on a hit, and
// the draw blocks' reveals.)
//
// Pure and deterministic, like the runner and the crusher: buildLevel() turns a `days[]` array
// into tiles and entities, stepWorld() advances the world by dt with the player's input, and the
// component (app/components/ticker/World.vue) draws it. The plain-node tests run whole months
// with a scripted runner — the proof that every month the log can produce is finishable, which
// the generator guarantees by construction (no pit wider than a jump, no step taller than a tile).
//
// Units: canvas pixels and seconds. x grows right, y grows DOWN from the top of the playfield.
// The figure is drawn at 3px cells (84×48); tiles are 24px.

export const TILE = 24
export const ROWS = 16
/** Tiles per day of ground. */
export const DAY_TILES = 20
/** Flat ground starts at this row (rows below it are solid); hills raise it by up to two rows. */
export const BASE_ROW = 13
/** The widest pit the generator makes — always short of a jump at run speed. */
export const MAX_PIT = 3
/** Tiles of runway before the first day and after the castle. */
export const START_TILES = 4
export const END_TILES = 10

export const GRAVITY = 1800
/** Holding jump while rising weakens gravity: a tap clears a step, a hold reaches a platform three rows up. */
export const HOLD_GRAVITY = 990
export const JUMP_V = 470
export const RUN_SPEED = 200
export const ACCEL = 1400
export const FRICTION = 1800
/** A frame longer than this is a tab that was hidden, not a slow device: don't tunnel. */
export const MAX_DT = 0.05
/** The player's box: the heart's trunk, not the arms. */
export const PLAYER_W = 44
export const PLAYER_H = 44
/** How far the figure's canvas (84 wide) is offset from the box. */
export const PLAYER_ART_DX = -20
export const STRIDE_PX = 26
/** Fallen this far below the last row: a life. */
export const FALL_LIMIT = ROWS * TILE + 60

export type Tile = 0 | 1 | 2
export const EMPTY: Tile = 0
export const GROUND: Tile = 1
/** One-way: solid from above only, so a jump passes up through it. */
export const PLATFORM: Tile = 2

export interface DayInput {
  date: string
  logged: boolean
  doses: number
  sodas: Array<{ oz: number | null }>
  workoutMin: number
  recovery: number | null
  /** A blood draw on file that day. */
  draw: boolean
}

export interface Capsule { x: number, y: number, taken: boolean, day: number }
export interface Flag { x: number, week: number, day: number }
export interface Block { x: number, y: number, day: number, hit: boolean }
export interface Sign { x: number, label: string }

export interface Level {
  cols: number
  tiles: Uint8Array
  days: DayInput[]
  /** Ground row per day, after the hills. */
  groundRows: number[]
  capsules: Capsule[]
  flags: Flag[]
  blocks: Block[]
  sign: Sign | null
  /** The castle's left edge, in px; reaching it wins. */
  castleX: number
  spawnX: number
}

export interface WorldInput {
  left: boolean
  right: boolean
  /** Jump pressed this frame. */
  jump: boolean
  /** Jump still held (for the higher arc). */
  jumpHeld: boolean
}

export type WorldStatus = 'ready' | 'running' | 'over' | 'cleared'

export interface WorldState {
  status: WorldStatus
  level: Level
  width: number
  height: number
  player: { x: number, y: number, vx: number, vy: number, onGround: boolean, facing: 1 | -1, walked: number }
  camera: number
  lives: number
  score: number
  collected: number
  /** Respawn x: the last flag passed, else the spawn. */
  checkpoint: number
  checkpointWeek: number
  elapsed: number
  deathAt: number
  source: { days: DayInput[], lives: number, seed: number }
  rng: () => number
}

export const NO_INPUT: WorldInput = { left: false, right: false, jump: false, jumpHeld: false }

/** mulberry32, seedable — shared with the other games' tests. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- the generator ------------------------------------------------------------------------------

/** Hills: a great recovery lifts the ground two rows, a decent one a row; a rough or unknown day is flat. */
export function groundRowFor(recovery: number | null): number {
  if (recovery == null) return BASE_ROW
  if (recovery >= 80) return BASE_ROW - 2
  if (recovery >= 60) return BASE_ROW - 1
  return BASE_ROW
}

/** Platform length in tiles for a workout: three for a short one, up to ten for a long one. */
export function platformLength(workoutMin: number): number {
  return Math.max(3, Math.min(10, 3 + Math.floor(workoutMin / 20)))
}

export function buildLevel(days: DayInput[], rng: () => number = Math.random): Level {
  const cols = START_TILES + days.length * DAY_TILES + END_TILES
  const tiles = new Uint8Array(cols * ROWS)
  const set = (col: number, row: number, t: Tile) => {
    if (col >= 0 && col < cols && row >= 0 && row < ROWS) tiles[row * cols + col] = t
  }
  const fill = (col: number, fromRow: number) => {
    for (let r = fromRow; r < ROWS; r++) set(col, r, GROUND)
  }

  // Ground rows per day, then stairs: a change between days happens one row per three tiles,
  // so the generator never produces a step taller than a tile (a tap-jump clears one).
  const groundRows = days.map(d => groundRowFor(d.recovery))
  const rowAt: number[] = new Array(cols).fill(BASE_ROW)
  for (let c = START_TILES; c < cols - END_TILES; c++) {
    const day = Math.floor((c - START_TILES) / DAY_TILES)
    rowAt[c] = groundRows[day]!
  }
  for (let c = cols - END_TILES; c < cols; c++) rowAt[c] = groundRows.at(-1) ?? BASE_ROW
  for (let c = 1; c < cols; c++) {
    const prev = rowAt[c - 1]!
    const want = rowAt[c]!
    if (want < prev - 1) rowAt[c] = prev - 1 // climbing: one row at a time
    else if (want > prev + 1) rowAt[c] = prev + 1
    // Hold each stair for three tiles so the figure can land on it.
    if (rowAt[c] !== prev) {
      rowAt[c + 1] = rowAt[c]!
      rowAt[c + 2] = rowAt[c]!
      c += 2
    }
  }

  const capsules: Capsule[] = []
  const flags: Flag[] = []
  const blocks: Block[] = []
  const pits = new Set<number>()

  days.forEach((d, i) => {
    const c0 = START_TILES + i * DAY_TILES
    // An unlogged day is a pit in the middle of the day, with flat ground on both sides.
    if (!d.logged) {
      const start = c0 + 8
      for (let c = start; c < start + MAX_PIT; c++) pits.add(c)
      const edge = rowAt[start - 1]!
      for (let c = start - 2; c < start + MAX_PIT + 2; c++) rowAt[c] = edge
    }
    if (i > 0 && i % 7 === 0) flags.push({ x: c0 * TILE + TILE / 2, week: Math.floor(i / 7), day: i })
  })

  for (let c = 0; c < cols; c++) {
    if (pits.has(c)) continue
    fill(c, rowAt[c]!)
  }

  days.forEach((d, i) => {
    const c0 = START_TILES + i * DAY_TILES
    const ground = rowAt[c0 + 4]!
    if (d.workoutMin > 0) {
      // A platform three rows up, the day's capsules along it.
      const len = platformLength(d.workoutMin)
      const row = ground - 3
      const from = c0 + 3 + Math.floor(rng() * Math.max(1, DAY_TILES - 6 - len))
      for (let c = from; c < from + len; c++) set(c, row, PLATFORM)
      const n = Math.min(d.doses, len)
      for (let k = 0; k < n; k++) capsules.push({ x: (from + k + 0.5) * TILE, y: (row - 1) * TILE + TILE / 2, taken: false, day: i })
    }
    else if (d.doses > 0) {
      const n = Math.min(d.doses, 6)
      for (let k = 0; k < n; k++) {
        const c = c0 + 3 + k * 2
        if (pits.has(c)) continue
        capsules.push({ x: (c + 0.5) * TILE, y: (rowAt[c]! - 2) * TILE + TILE / 2, taken: false, day: i })
      }
    }
    if (d.draw) blocks.push({ x: (c0 + 14) * TILE, y: (ground - 4) * TILE, day: i, hit: false })
  })

  return {
    cols,
    tiles,
    days,
    groundRows,
    capsules,
    flags,
    blocks,
    sign: null,
    castleX: (cols - END_TILES + 3) * TILE,
    spawnX: 2 * TILE
  }
}

export function tileAt(level: Level, col: number, row: number): Tile {
  if (col < 0 || col >= level.cols) return GROUND // the world's walls
  if (row < 0) return EMPTY
  if (row >= ROWS) return EMPTY
  return level.tiles[row * level.cols + col] as Tile
}

/** The ground row (top of the first solid tile) under a column, or ROWS when it's a pit. */
export function groundRowAt(level: Level, col: number): number {
  for (let r = 0; r < ROWS; r++) if (tileAt(level, col, r) === GROUND) return r
  return ROWS
}

export function levelWidth(level: Level): number {
  return level.cols * TILE
}

// --- the world ------------------------------------------------------------------------------------

export interface WorldOptions {
  days: DayInput[]
  width: number
  height: number
  seed?: number
  lives?: number
}

export function createWorld(o: WorldOptions): WorldState {
  const seed = o.seed ?? 1
  const rng = makeRng(seed)
  const level = buildLevel(o.days, rng)
  const lives = o.lives ?? 3
  const s: WorldState = {
    status: 'ready',
    level,
    width: o.width,
    height: o.height,
    player: { x: level.spawnX, y: 0, vx: 0, vy: 0, onGround: false, facing: 1, walked: 0 },
    camera: 0,
    lives,
    score: 0,
    collected: 0,
    checkpoint: level.spawnX,
    checkpointWeek: 0,
    elapsed: 0,
    deathAt: -1,
    source: { days: o.days, lives, seed },
    rng
  }
  placeOnGround(s, level.spawnX)
  return s
}

/** Stands the player on the ground under x (feet on the tile top). */
function placeOnGround(s: WorldState, x: number) {
  const col = Math.floor((x + PLAYER_W / 2) / TILE)
  const row = groundRowAt(s.level, col)
  s.player.x = x
  s.player.y = row * TILE - PLAYER_H
  s.player.vx = 0
  s.player.vy = 0
  s.player.onGround = true
}

/** The one-shot button: ready → running; over or cleared → a fresh world on the same month. */
export function start(s: WorldState): WorldState {
  if (s.status === 'over' || s.status === 'cleared') {
    Object.assign(s, createWorld({ width: s.width, height: s.height, days: s.source.days, lives: s.source.lives, seed: s.source.seed }))
  }
  if (s.status === 'ready') s.status = 'running'
  return s
}

function solidBelow(level: Level, x0: number, x1: number, footY: number, wasAbove: boolean): number | null {
  // The row the feet are entering; a platform only counts when the feet were above it.
  const row = Math.floor(footY / TILE)
  const c0 = Math.floor(x0 / TILE)
  const c1 = Math.floor((x1 - 1) / TILE)
  for (let c = c0; c <= c1; c++) {
    const t = tileAt(level, c, row)
    if (t === GROUND || (t === PLATFORM && wasAbove)) return row * TILE
  }
  return null
}

function blockedSide(level: Level, x: number, y0: number, y1: number): boolean {
  const col = Math.floor(x / TILE)
  const r0 = Math.floor(y0 / TILE)
  const r1 = Math.floor((y1 - 1) / TILE)
  for (let r = r0; r <= r1; r++) if (tileAt(level, col, r) === GROUND) return true
  return false
}

function die(s: WorldState) {
  s.lives -= 1
  s.deathAt = s.elapsed
  if (s.lives <= 0) {
    s.status = 'over'
    return
  }
  placeOnGround(s, s.checkpoint)
  s.player.facing = 1
}

function advance(s: WorldState, t: number, input: WorldInput) {
  const p = s.player
  const level = s.level

  // Run.
  const want = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (want) {
    p.vx += want * ACCEL * t
    p.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, p.vx))
    p.facing = want > 0 ? 1 : -1
  }
  else if (p.vx !== 0) {
    const f = FRICTION * t
    p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f
  }

  // Jump: on the ground only; a hold softens gravity on the way up.
  if (input.jump && p.onGround) {
    p.vy = -JUMP_V
    p.onGround = false
  }
  const g = p.vy < 0 && input.jumpHeld ? HOLD_GRAVITY : GRAVITY
  p.vy = Math.min(900, p.vy + g * t)

  // Horizontal move and walls, with a one-tile step-up: a stair is walked, not jumped.
  const dx = p.vx * t
  if (dx !== 0) {
    const nx = p.x + dx
    const edge = dx > 0 ? nx + PLAYER_W : nx
    if (blockedSide(level, edge, p.y + 2, p.y + PLAYER_H - 2)) {
      const stepUp = !blockedSide(level, edge, p.y + 2 - TILE, p.y + PLAYER_H - 2 - TILE) && p.onGround
      if (stepUp) {
        p.y -= TILE
        p.x = nx
      }
      else {
        const col = Math.floor(edge / TILE)
        p.x = dx > 0 ? col * TILE - PLAYER_W - 0.01 : (col + 1) * TILE + 0.01
        p.vx = 0
      }
    }
    else {
      p.x = nx
    }
    p.x = Math.max(0, Math.min(levelWidth(level) - PLAYER_W, p.x))
    if (p.onGround) p.walked += Math.abs(dx)
  }

  // Vertical move: land on ground and (from above) platforms; bump the head on ground.
  const dy = p.vy * t
  const footBefore = p.y + PLAYER_H
  const ny = p.y + dy
  if (dy >= 0) {
    const land = solidBelow(level, p.x + 4, p.x + PLAYER_W - 4, ny + PLAYER_H, footBefore <= Math.floor((ny + PLAYER_H) / TILE) * TILE + 0.5)
    if (land != null) {
      p.y = land - PLAYER_H
      p.vy = 0
      p.onGround = true
    }
    else {
      p.y = ny
      p.onGround = false
    }
  }
  else {
    const headRow = Math.floor(ny / TILE)
    const c0 = Math.floor((p.x + 4) / TILE)
    const c1 = Math.floor((p.x + PLAYER_W - 5) / TILE)
    let bumped = false
    for (let c = c0; c <= c1 && !bumped; c++) {
      if (tileAt(level, c, headRow) === GROUND) bumped = true
    }
    if (bumped) {
      p.y = (headRow + 1) * TILE
      p.vy = 0
    }
    else {
      p.y = ny
    }
    p.onGround = false
  }

  // Capsules.
  for (const cap of level.capsules) {
    if (cap.taken) continue
    if (cap.x > p.x - 8 && cap.x < p.x + PLAYER_W + 8 && cap.y > p.y - 8 && cap.y < p.y + PLAYER_H + 8) {
      cap.taken = true
      s.collected += 1
      s.score += 10
    }
  }

  // Flags: a checkpoint the first time it is passed.
  for (const f of level.flags) {
    if (f.week > s.checkpointWeek && p.x + PLAYER_W / 2 >= f.x) {
      s.checkpointWeek = f.week
      s.checkpoint = f.x
      s.score += 50
    }
  }

  // The castle.
  if (p.x + PLAYER_W / 2 >= level.castleX) {
    s.status = 'cleared'
    s.score += 200 + s.lives * 50
    return
  }

  // The pit.
  if (p.y > FALL_LIMIT) die(s)
}

/** Advance the world by dt seconds (clamped). Only a running world moves. */
export function stepWorld(s: WorldState, dt: number, input: WorldInput = NO_INPUT): WorldState {
  if (s.status !== 'running') return s
  const t = Math.min(MAX_DT, Math.max(0, dt))
  s.elapsed += t
  // Sub-steps of at most a few px, so a fast fall can't pass through a tile.
  const n = Math.max(1, Math.ceil((Math.max(Math.abs(s.player.vx), Math.abs(s.player.vy)) * t) / 6))
  const one: WorldInput = { ...input }
  for (let i = 0; i < n && s.status === 'running'; i++) {
    advance(s, t / n, one)
    one.jump = false // a press counts once
  }
  // The camera leads the player a little and never shows past the ends.
  const target = s.player.x - s.width * 0.38
  s.camera = Math.max(0, Math.min(levelWidth(s.level) - s.width, target))
  return s
}

/** The day the player is standing in, or -1 on the runway. */
export function dayAt(s: WorldState): number {
  const col = Math.floor((s.player.x + PLAYER_W / 2) / TILE)
  const i = Math.floor((col - START_TILES) / DAY_TILES)
  return i < 0 || i >= s.level.days.length ? -1 : i
}

/** Which of the companion's poses the renderer should draw. */
export function worldPose(s: WorldState): 'idle' | 'walk1' | 'walk2' | 'happy' | 'petted' | 'flatline' {
  if (s.status === 'over') return 'flatline'
  if (s.status === 'cleared') return 'petted'
  if (s.deathAt >= 0 && s.elapsed - s.deathAt < 0.4) return 'flatline'
  if (!s.player.onGround) return 'happy'
  if (Math.abs(s.player.vx) > 20) return Math.floor(s.player.walked / STRIDE_PX) % 2 === 0 ? 'walk1' : 'walk2'
  return 'idle'
}

/**
 * A scripted runner for the tests: runs right, jumps when the ground ahead drops away or rises
 * (a pit or a stair) and holds the jump over a pit. It never aims at the capsules; the proof is
 * that the castle can be reached, which the generator promises.
 */
export function autoRun(s: WorldState): WorldInput {
  if (s.status === 'ready') {
    start(s)
    return { left: false, right: true, jump: false, jumpHeld: false }
  }
  if (s.status !== 'running') return NO_INPUT
  const p = s.player
  const col = Math.floor((p.x + PLAYER_W) / TILE)
  const here = groundRowAt(s.level, col)
  const ahead1 = groundRowAt(s.level, col + 1)
  const ahead2 = groundRowAt(s.level, col + 2)
  const pit = ahead1 === ROWS || ahead2 === ROWS
  const stair = ahead1 < here || ahead2 < here
  const jump = p.onGround && (pit || stair)
  return { left: false, right: true, jump, jumpHeld: !p.onGround && p.vy < 0 && (pit || here === ROWS) }
}
