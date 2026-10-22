// TICKER WORLD — a platformer whose level is the month. Each day is a stretch of ground, left
// to right in calendar order, and the castle at the far right is today. The ground rises and
// falls with recovery; an unlogged day is a pit; a workout is a floating platform as long as the
// session, with that day's doses lined up on it as capsules to collect; doses without a workout
// lie along the ground; a blood draw is a question block; a week boundary is a checkpoint flag.
//
// Session two, the things that fight back. The sodas logged on a day patrol it as cans — a
// stomp crushes one, a tall boy (20 oz and up) takes two: the first leaves a dented can lying
// there that a touch kicks sliding, crushing everything in its path until a stomp stops it or a
// pit swallows it. Germs keep a clean month honest: hopping blobs that walk off ledges, none on
// a green-recovery day, one on an ordinary one, three on a rough one, and one on any day that
// would otherwise have nothing in it. A touch from the side shrinks a grown heart to a hatchling
// (and buys a moment of immunity); a touch while small costs a life. Stomps without landing in
// between climb 100, 200, 400, 800, then an extra life.
//
// Session three, the things in the way. Two or more sodas also stack a wall of cans across the
// path (two high, three from three sodas; two on a workout day, under the platform) — hop it,
// or send a kicked can into it. A draw day fires needles from off the right of the screen at
// chest height while you're in it, until you bump its question block from below. A cardio
// day's platform slides back and forth and carries you, its capsules strung along its run. A
// short night (under six hours) makes its day's ground slippery. And every pit has a popper —
// a question mark that rises for a beat and sinks — so crossing an unlogged day is timed.
//
// Session four, the things to grab. A question block, bumped from below, says what its day did
// (the draw's lab and marker count; "every dose · moved" on a gold-star day, which gets a block
// of its own, so a good month has more of them) and lets something out: the plate when you're
// small, which grows you back; the shaker when you're grown, which lets you throw scoops that
// bounce along and crush what they hit, until a hit takes it away. One green-recovery day a
// month hides a block with a star: eight seconds untouchable, everything you brush crushed.
// And one day a month hides a block with a tiny heart: an extra life. Hidden blocks aren't
// there until a head finds them.
//
// Pure and deterministic, like the runner and the crusher: buildLevel() turns a `days[]` array
// into tiles and entities, stepWorld() advances the world by dt with the player's input, and the
// component (app/components/ticker/World.vue) draws it. The plain-node tests run whole months
// with a scripted runner — the proof that every month the log can produce is finishable, which
// the generator guarantees by construction (no pit wider than a jump, no step taller than a tile,
// no wall taller than a held jump, a popper down longer than a crossing, and nothing an enemy
// can do that a jump doesn't answer).
//
// Units: canvas pixels and seconds. x grows right, y grows DOWN from the top of the playfield.
// The grown figure is drawn at 3px cells (84×48), the hatchling at 2px; tiles are 24px.
//
// Every export here is auto-imported alongside the runner's and the crusher's (Nuxt scans
// shared/utils), so the names that both games have — gravity, jump, stride — carry a WORLD_
// prefix, and what is the same is imported from the runner rather than declared twice.
import { MAX_DT, makeRng } from './tickerRunner.ts'
import { RECOVERY_GREEN_MIN, RECOVERY_PEAK_MIN, RECOVERY_RED_MAX } from './recovery.ts'

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

export const WORLD_GRAVITY = 1800
/** Holding jump while rising weakens gravity: a tap clears a step, a hold reaches a platform three rows up. */
export const HOLD_GRAVITY = 990
export const WORLD_JUMP_V = 470
export const RUN_SPEED = 200
export const ACCEL = 1400
export const FRICTION = 1800
/** On a short night's ground: slow to get going, slower to stop. */
export const SLIP_ACCEL = 700
export const SLIP_FRICTION = 450
/** A night under this is a short one. */
export const SHORT_SLEEP_MIN = 360
/** The grown player's box: the heart's trunk, not the arms. */
export const PLAYER_W = 44
export const PLAYER_H = 44
/** The hatchling's box: the heart alone at 2px cells. */
export const HATCHLING_W = 30
export const HATCHLING_H = 30
export const WORLD_STRIDE_PX = 26
/** Fallen this far below the last row: a life. */
export const FALL_LIMIT = ROWS * TILE + 60

/** After a hit (or a respawn): flickering and untouchable for this long. */
export const HURT_SECONDS = 1.5
export const RESPAWN_IMMUNITY = 1
/** The bounce off a stomp; holding jump turns it into a full jump. */
export const STOMP_BOUNCE = 300
/** Coming down with the feet above this fraction of an enemy's height is a stomp; lower is a hit. */
export const STOMP_LINE = 0.65
/** A side hit needs this much less of the box each side: a graze at the corner of a ledge doesn't count. */
export const HIT_INSET = 7
export const CAN_SPEED = 40
export const GERM_SPEED = 55
export const GERM_HOP_V = 170
export const GERM_HOP_EVERY = 1.1
export const SHELL_SPEED = 320
/** A kicked shell can't hurt its kicker on the way out. */
export const KICK_GRACE = 0.25
/** A crushed thing lies flat this long before it is gone. */
export const CRUSH_SECONDS = 0.5
/** Stomps without landing in between; past the table, an extra life. */
export const COMBO_POINTS = [100, 200, 400, 800]
/** What a sliding shell scores per thing it crushes, climbing; it caps at the last. */
export const CHAIN_POINTS = [200, 400, 800]
/** What a star's touch scores, climbing; it caps at the last. */
export const STAR_POINTS = [100, 200, 400, 800]
export const MAX_LIVES = 5
/** A soda this big is a tall boy: two stomps. */
export const TALL_OZ = 20
export const MAX_CANS_PER_DAY = 4
/** A wall of cans is at most this many high; a workout day's stays under its platform. */
export const STACK_MAX = 3
/** Each can knocked out of a wall. */
export const STACK_POINTS = 100
/** The needle: off the right of the screen (and never nearer than NEEDLE_RANGE), chest height, flying left. */
export const NEEDLE_SPEED = 180
export const NEEDLE_RANGE = 420
export const NEEDLE_FIRST = 0.8
export const NEEDLE_EVERY = 2.5
/** Bumping a question block. */
export const BLOCK_POINTS = 100
export const MOVER_SPEED = 50
/** The popper's cycle: up for POPPER_UP of every POPPER_PERIOD seconds, rising and sinking over POPPER_EDGE each. */
export const POPPER_PERIOD = 3.2
export const POPPER_UP = 1.3
export const POPPER_EDGE = 0.3
export const POPPER_H = 40
export const POPPER_W = 20
/** What comes out of a block rises out of it over this long. */
export const ITEM_RISE = 0.5
export const ITEM_POINTS = 500
export const PLATE_SPEED = 60
export const STAR_SPEED = 90
export const STAR_HOP_V = 300
export const STAR_SECONDS = 8
/** A scoop from the shaker: thrown level, bounces along, dies on a wall or after a while. */
export const SCOOP_SPEED = 280
export const SCOOP_BOUNCE = 220
export const SCOOP_LIFE = 2.5
export const SCOOP_POINTS = 100
export const MAX_SCOOPS = 2
/** How long a block's line stays up in the HUD. */
export const REVEAL_SECONDS = 3.5
/** Cans and germs walk this much faster for every week into the month. */
export const WEEK_PACE = 0.1
/** A kicked can that crushes this many is a chain worth remembering. */
export const CHAIN_FEAT = 3

export type Tile = 0 | 1 | 2 | 3 | 4
export const EMPTY: Tile = 0
export const GROUND: Tile = 1
/** One-way: solid from above only, so a jump passes up through it. */
export const PLATFORM: Tile = 2
/** A can in a wall of cans: solid every way, knocked out by a sliding shell. */
export const STACK: Tile = 3
/** A question block: solid every way, bumped from below. */
export const BLOCK: Tile = 4

export interface DayInput {
  date: string
  logged: boolean
  doses: number
  sodas: Array<{ oz: number | null }>
  workoutMin: number
  /** The day's workout was the running kind: its platform moves. */
  cardio: boolean
  recovery: number | null
  /** The night before, in minutes; a short one makes the ground slippery. */
  sleepMin: number | null
  /** A blood draw on file that day. */
  draw: boolean
  /** What the draw's block says: the lab and how many markers. */
  drawLabel: string | null
  /** Every due dose logged and a workout: the day gets a block of its own. */
  goldStar: boolean
}

export interface Capsule { x: number, y: number, taken: boolean, day: number }
export interface Flag { x: number, week: number, day: number }
export type BlockKind = 'draw' | 'gold' | 'star' | 'heart'
/** A question block: visible ones are in the tile grid from the start; a hidden one joins it when a head finds it. */
export interface Block { x: number, y: number, day: number, hit: boolean, kind: BlockKind, hidden: boolean }
export interface Sign { x: number, label: string }
/** A sliding platform: its bar's top-left, its run, and which way it's going. */
export interface Mover { x: number, y: number, w: number, minX: number, maxX: number, vx: number, day: number }
/** The question mark in a pit: where, the ground level it rises from, and its timing. */
export interface Popper { x: number, base: number, phase: number, day: number }

export type EnemyKind = 'can' | 'tall' | 'germ' | 'needle'
/** walk: on patrol (a needle: in flight). shell: a dented tall boy — still until kicked, then sliding (vx ≠ 0). */
export type EnemyMode = 'walk' | 'shell' | 'crushed' | 'gone'
export interface Enemy {
  kind: EnemyKind
  day: number
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  dir: 1 | -1
  mode: EnemyMode
  /** Cans keep to their day; germs have the whole level and walk off ledges. */
  minX: number
  maxX: number
  /** Enemies hold still until the camera is about to show them, so they're alive when met. */
  awake: boolean
  onGround: boolean
  /** When the mode last changed: the crushed frames, a fresh kick's grace. */
  at: number
  /** Germs: hop timing. */
  phase: number
  beat: number
  /** A sliding shell: how many it has crushed since the kick. */
  chain: number
}

export type ItemKind = 'plate' | 'shaker' | 'star' | 'heart'
/** What a block let out: rising out of it first, then (plate, heart) walking, (star) bouncing, (shaker) sitting on top. */
export interface Item {
  kind: ItemKind
  x: number
  y: number
  w: number
  h: number
  vx: number
  vy: number
  dir: 1 | -1
  onGround: boolean
  /** Where it rises to. */
  restY: number
  at: number
  taken: boolean
  gone: boolean
}

export interface Scoop { x: number, y: number, vx: number, vy: number, at: number, alive: boolean }

/** A score that floats up where it was earned; the renderer draws the recent ones. */
export interface Pop { x: number, y: number, text: string, at: number }

export interface Level {
  cols: number
  tiles: Uint8Array
  days: DayInput[]
  /** Ground row per day, after the hills. */
  groundRows: number[]
  capsules: Capsule[]
  flags: Flag[]
  blocks: Block[]
  enemies: Enemy[]
  movers: Mover[]
  poppers: Popper[]
  items: Item[]
  scoops: Scoop[]
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
  /** Throw pressed this frame (with the shaker). */
  fire?: boolean
}

export type WorldStatus = 'ready' | 'running' | 'over' | 'cleared'
export type PlayerSize = 'grown' | 'hatchling'
export type Power = 'none' | 'shaker'
/** What got you: a side touch's kind, the pit's question mark, or the pit itself. */
export type HitBy = EnemyKind | 'popper' | 'pit'
export interface Hit { day: number, by: HitBy }
/** The feats a finished month can earn, besides finishing it. */
export type WorldFeat = 'clean-month' | 'no-hit-week' | 'chain-3'
export const WORLD_FEATS: readonly WorldFeat[] = ['clean-month', 'no-hit-week', 'chain-3']
/** The month in a few figures, for the page's remark and its records. */
export interface WorldSummary {
  cleared: boolean
  crushed: number
  cansCrushed: number
  cansTotal: number
  hits: Hit[]
  losses: number
  bestChain: number
  /** The day with the most hits (the later one on a tie), and what did it, most common first. */
  worstDay: { day: number, date: string, hits: number, by: HitBy[] } | null
}

export interface WorldState {
  status: WorldStatus
  level: Level
  width: number
  height: number
  player: { x: number, y: number, w: number, h: number, vx: number, vy: number, onGround: boolean, facing: 1 | -1, walked: number, ride: number }
  size: PlayerSize
  power: Power
  /** Untouchable and crushing until this elapsed time. */
  starUntil: number
  starChain: number
  /** Untouchable (and flickering) until this elapsed time. */
  hurtUntil: number
  hurtAt: number
  /** Stomps since the last landing. */
  combo: number
  crushed: number
  /** The month's cans and tall boys, and how many went down (by any means). */
  cansTotal: number
  cansCrushed: number
  /** Every hit that cost something, by day; every life lost; the longest shell chain. */
  hits: Hit[]
  losses: number
  bestChain: number
  /** The draw day being crossed and when its next needle comes. */
  needleDay: number
  nextNeedleAt: number
  /** The last block's line for the HUD. */
  reveal: { text: string, at: number } | null
  camera: number
  lives: number
  score: number
  collected: number
  /** Respawn x: the last flag passed, else the spawn. */
  checkpoint: number
  checkpointWeek: number
  elapsed: number
  deathAt: number
  pops: Pop[]
  source: { days: DayInput[], lives: number, seed: number }
  rng: () => number
}

export const NO_INPUT: WorldInput = { left: false, right: false, jump: false, jumpHeld: false, fire: false }

// --- the generator ------------------------------------------------------------------------------

/**
 * Hills: a peak recovery lifts the ground two rows, a green one a row; a yellow, red or unknown
 * day is flat. Whoop's bands (shared/utils/recovery.ts), the same lines the pet and the digest
 * read — this file drew its own at 60 and 40 until audit #42 item 41.
 */
export function groundRowFor(recovery: number | null): number {
  if (recovery == null) return BASE_ROW
  if (recovery >= RECOVERY_PEAK_MIN) return BASE_ROW - 2
  if (recovery >= RECOVERY_GREEN_MIN) return BASE_ROW - 1
  return BASE_ROW
}

/** Platform length in tiles for a workout: three for a short one, up to ten for a long one. */
export function platformLength(workoutMin: number): number {
  return Math.max(3, Math.min(10, 3 + Math.floor(workoutMin / 20)))
}

/** Germs on a day: none at a peak recovery, one on an ordinary or unknown day, three in the red. */
export function germCount(recovery: number | null): number {
  if (recovery == null) return 1
  if (recovery >= RECOVERY_PEAK_MIN) return 0
  if (recovery < RECOVERY_RED_MAX) return 3
  return 1
}

/** How many cans high a day's wall is: none under two sodas, capped, and two on a workout day so it sits under the platform. */
export function stackHeight(d: DayInput): number {
  if (!d.logged || d.sodas.length < 2) return 0
  return Math.min(STACK_MAX, d.sodas.length, d.workoutMin > 0 ? 2 : STACK_MAX)
}

export function isShortSleep(d: DayInput): boolean {
  return d.sleepMin != null && d.sleepMin < SHORT_SLEEP_MIN
}

const ENEMY_BOX: Record<EnemyKind, { w: number, h: number }> = {
  can: { w: 12, h: 21 }, // 4×7 cells at 3px
  tall: { w: 16, h: 28 }, // the same can at 4px
  germ: { w: 18, h: 18 },
  needle: { w: 28, h: 10 }
}

const ITEM_BOX: Record<ItemKind, { w: number, h: number }> = {
  plate: { w: 20, h: 10 },
  shaker: { w: 14, h: 22 },
  star: { w: 18, h: 18 },
  heart: { w: 17, h: 15 } // the face sprite at 1px cells
}

/** The column within a day where each kind of block sits (past the capsules; the wall is at 17). */
const BLOCK_COL: Record<BlockKind, number> = { draw: 14, gold: 14, star: 9, heart: 11 }

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
  const enemies: Enemy[] = []
  const movers: Mover[] = []
  const poppers: Popper[] = []
  const pits = new Set<number>()

  days.forEach((d, i) => {
    const c0 = START_TILES + i * DAY_TILES
    // An unlogged day is a pit in the middle of the day, with flat ground on both sides, and a
    // popper in it.
    if (!d.logged) {
      const start = c0 + 8
      for (let c = start; c < start + MAX_PIT; c++) pits.add(c)
      const edge = rowAt[start - 1]!
      for (let c = start - 2; c < start + MAX_PIT + 2; c++) rowAt[c] = edge
      poppers.push({ x: (start + MAX_PIT / 2) * TILE, base: edge * TILE, phase: rng() * POPPER_PERIOD, day: i })
    }
    if (i > 0 && i % 7 === 0) flags.push({ x: c0 * TILE + TILE / 2, week: Math.floor(i / 7), day: i })
  })

  for (let c = 0; c < cols; c++) {
    if (pits.has(c)) continue
    fill(c, rowAt[c]!)
  }

  const spawn = (kind: EnemyKind, col: number, day: number) => {
    const { w, h } = ENEMY_BOX[kind]
    const c0 = START_TILES + day * DAY_TILES
    enemies.push({
      kind,
      day,
      x: col * TILE + (TILE - w) / 2,
      y: rowAt[col]! * TILE - h,
      w,
      h,
      vx: 0,
      vy: 0,
      dir: enemies.length % 2 ? 1 : -1,
      mode: 'walk',
      minX: c0 * TILE + 1,
      maxX: (c0 + DAY_TILES) * TILE - 1,
      awake: false,
      onGround: true,
      at: 0,
      phase: kind === 'germ' ? rng() * GERM_HOP_EVERY : 0,
      beat: -1,
      chain: 0
    })
  }
  const block = (kind: BlockKind, day: number, hidden: boolean) => {
    const c0 = START_TILES + day * DAY_TILES
    const col = c0 + BLOCK_COL[kind]
    const row = rowAt[c0 + 4]! - 4
    blocks.push({ x: col * TILE, y: row * TILE, day, hit: false, kind, hidden })
    if (!hidden) set(col, row, BLOCK)
  }

  days.forEach((d, i) => {
    const c0 = START_TILES + i * DAY_TILES
    const ground = rowAt[c0 + 4]!
    if (d.workoutMin > 0) {
      const len = platformLength(d.workoutMin)
      const row = ground - 3
      const n = Math.min(d.doses, len)
      if (d.cardio) {
        // A sliding platform over the day's middle, the capsules strung along its run.
        const minX = (c0 + 3) * TILE
        const maxX = (c0 + DAY_TILES - 3 - len) * TILE
        const x = minX + Math.floor(rng() * Math.max(1, (maxX - minX) / TILE)) * TILE
        movers.push({ x, y: row * TILE, w: len * TILE, minX, maxX, vx: rng() < 0.5 ? MOVER_SPEED : -MOVER_SPEED, day: i })
        const span = maxX + len * TILE - minX
        for (let k = 0; k < n; k++) capsules.push({ x: minX + ((k + 0.5) * span) / n, y: (row - 1) * TILE + TILE / 2, taken: false, day: i })
      }
      else {
        // A platform three rows up, the day's capsules along it.
        const from = c0 + 3 + Math.floor(rng() * Math.max(1, DAY_TILES - 6 - len))
        for (let c = from; c < from + len; c++) set(c, row, PLATFORM)
        for (let k = 0; k < n; k++) capsules.push({ x: (from + k + 0.5) * TILE, y: (row - 1) * TILE + TILE / 2, taken: false, day: i })
      }
    }
    else if (d.doses > 0) {
      const n = Math.min(d.doses, 6)
      for (let k = 0; k < n; k++) {
        const c = c0 + 3 + k * 2
        if (pits.has(c)) continue
        capsules.push({ x: (c + 0.5) * TILE, y: (rowAt[c]! - 2) * TILE + TILE / 2, taken: false, day: i })
      }
    }
    // A draw day's block, or a gold-star day's.
    if (d.draw) block('draw', i, false)
    else if (d.goldStar && d.logged) block('gold', i, false)

    // The day's sodas patrol it; the pit is an unlogged day's whole hazard.
    if (!d.logged) return
    const sodas = d.sodas.slice(0, MAX_CANS_PER_DAY)
    sodas.forEach((soda, k) => {
      const col = c0 + 5 + k * 3
      if (!pits.has(col)) spawn((soda.oz ?? 0) >= TALL_OZ ? 'tall' : 'can', col, i)
    })
    // Two sodas or more also stack a wall late in the day, past the capsules and the block.
    const wall = stackHeight(d)
    for (let k = 1; k <= wall; k++) set(c0 + 17, rowAt[c0 + 17]! - k, STACK)
    let germs = germCount(d.recovery)
    if (germs === 0 && sodas.length === 0) germs = 1 // the floor: no empty days
    for (let k = 0; k < germs; k++) {
      const col = c0 + 2 + Math.floor(rng() * (DAY_TILES - 4))
      if (!pits.has(col) && col !== c0 + 17) spawn('germ', col, i)
    }
  })

  // One green day hides a star, one logged day hides a heart.
  const logged = days.map((d, i) => (d.logged ? i : -1)).filter(i => i >= 0)
  const green = logged.filter(i => (days[i]!.recovery ?? 0) >= RECOVERY_PEAK_MIN)
  if (green.length) block('star', green[Math.floor(rng() * green.length)]!, true)
  if (logged.length) block('heart', logged[Math.floor(rng() * logged.length)]!, true)

  return {
    cols,
    tiles,
    days,
    groundRows,
    capsules,
    flags,
    blocks,
    enemies,
    movers,
    poppers,
    items: [],
    scoops: [],
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

/** Solid from every side: ground, a wall of cans, a question block. */
export function isSolid(t: Tile): boolean {
  return t === GROUND || t === STACK || t === BLOCK
}

/** The row of the first thing to stand on under a column (ground or a wall of cans), or ROWS when it's a pit. */
export function groundRowAt(level: Level, col: number): number {
  for (let r = 0; r < ROWS; r++) {
    const t = tileAt(level, col, r)
    if (t === GROUND || t === STACK) return r
  }
  return ROWS
}

export function levelWidth(level: Level): number {
  return level.cols * TILE
}

/** How far up a popper is right now, 0 (in the pit) to 1 (fully out). */
export function popperRise(p: Popper, elapsed: number): number {
  const t = (((elapsed + p.phase) % POPPER_PERIOD) + POPPER_PERIOD) % POPPER_PERIOD
  if (t >= POPPER_UP) return 0
  if (t < POPPER_EDGE) return t / POPPER_EDGE
  if (t > POPPER_UP - POPPER_EDGE) return (POPPER_UP - t) / POPPER_EDGE
  return 1
}

/** Whether a popper stays down for the next `seconds`. */
export function popperSafeFor(p: Popper, elapsed: number, seconds: number): boolean {
  const t = (((elapsed + p.phase) % POPPER_PERIOD) + POPPER_PERIOD) % POPPER_PERIOD
  return t >= POPPER_UP && t + seconds <= POPPER_PERIOD
}

/** The box a popper occupies right now, or null while it's down. */
export function popperBox(pop: Popper, elapsed: number): { x: number, y: number, w: number, h: number } | null {
  const h = Math.round(POPPER_H * popperRise(pop, elapsed))
  if (h <= 0) return null
  return { x: pop.x - POPPER_W / 2, y: pop.base - h, w: POPPER_W, h }
}

/** What a block says when it's bumped. */
export function blockLine(b: Block, d: DayInput | undefined): string {
  if (b.kind === 'draw') return d?.drawLabel ?? 'a draw day'
  if (b.kind === 'gold') return 'every dose · moved'
  if (b.kind === 'star') return 'a green day'
  return 'an extra heart'
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
    player: { x: level.spawnX, y: 0, w: PLAYER_W, h: PLAYER_H, vx: 0, vy: 0, onGround: false, facing: 1, walked: 0, ride: -1 },
    size: 'grown',
    power: 'none',
    starUntil: 0,
    starChain: 0,
    hurtUntil: 0,
    hurtAt: -1,
    combo: 0,
    crushed: 0,
    cansTotal: level.enemies.filter(e => e.kind === 'can' || e.kind === 'tall').length,
    cansCrushed: 0,
    hits: [],
    losses: 0,
    bestChain: 0,
    needleDay: -2,
    nextNeedleAt: 0,
    reveal: null,
    camera: 0,
    lives,
    score: 0,
    collected: 0,
    checkpoint: level.spawnX,
    checkpointWeek: 0,
    elapsed: 0,
    deathAt: -1,
    pops: [],
    source: { days: o.days, lives, seed },
    rng
  }
  placeOnGround(s, level.spawnX)
  return s
}

/** Stands the player on the ground under x (feet on the tile top). */
function placeOnGround(s: WorldState, x: number) {
  const p = s.player
  const col = Math.floor((x + p.w / 2) / TILE)
  const row = groundRowAt(s.level, col)
  p.x = x
  p.y = row * TILE - p.h
  p.vx = 0
  p.vy = 0
  p.onGround = true
  p.ride = -1
}

/** Grown or hatchling: the box changes around the feet and the centre, so the figure doesn't jump. */
function setSize(s: WorldState, size: PlayerSize) {
  const p = s.player
  const w = size === 'grown' ? PLAYER_W : HATCHLING_W
  const h = size === 'grown' ? PLAYER_H : HATCHLING_H
  p.x += (p.w - w) / 2
  p.y += p.h - h
  p.w = w
  p.h = h
  s.size = size
}

/** The one-shot button: ready → running; over or cleared → a fresh world on the same month. */
export function startWorld(s: WorldState): WorldState {
  if (s.status === 'over' || s.status === 'cleared') {
    Object.assign(s, createWorld({ width: s.width, height: s.height, days: s.source.days, lives: s.source.lives, seed: s.source.seed }))
  }
  if (s.status === 'ready') s.status = 'running'
  return s
}

export function isStarred(s: WorldState): boolean {
  return s.elapsed < s.starUntil
}

function solidBelow(level: Level, x0: number, x1: number, footY: number, wasAbove: boolean): number | null {
  // The row the feet are entering; a platform only counts when the feet were above it.
  const row = Math.floor(footY / TILE)
  const c0 = Math.floor(x0 / TILE)
  const c1 = Math.floor((x1 - 1) / TILE)
  for (let c = c0; c <= c1; c++) {
    const t = tileAt(level, c, row)
    if (isSolid(t) || (t === PLATFORM && wasAbove)) return row * TILE
  }
  return null
}

/** The first solid tile a side edge runs into between two heights, or EMPTY. */
function sideTile(level: Level, x: number, y0: number, y1: number): Tile {
  const col = Math.floor(x / TILE)
  const r0 = Math.floor(y0 / TILE)
  const r1 = Math.floor((y1 - 1) / TILE)
  for (let r = r0; r <= r1; r++) {
    const t = tileAt(level, col, r)
    if (isSolid(t)) return t
  }
  return EMPTY
}

function blockedSide(level: Level, x: number, y0: number, y1: number): boolean {
  return sideTile(level, x, y0, y1) !== EMPTY
}

/** Something to stand on right under a point at foot level (the tile the feet rest on). */
function solidUnder(level: Level, x: number, footY: number): boolean {
  const t = tileAt(level, Math.floor(x / TILE), Math.floor(footY / TILE))
  return isSolid(t) || t === PLATFORM
}

function overlaps(ax: number, ay: number, aw: number, ah: number, e: { x: number, y: number, w: number, h: number }): boolean {
  return ax < e.x + e.w && ax + aw > e.x && ay < e.y + e.h && ay + ah > e.y
}

function pop(s: WorldState, x: number, y: number, text: string) {
  s.pops.push({ x, y, text, at: s.elapsed })
  if (s.pops.length > 16) s.pops.shift()
}

function die(s: WorldState, by: HitBy) {
  s.hits.push({ day: dayAt(s), by })
  s.losses += 1
  s.lives -= 1
  s.deathAt = s.elapsed
  s.combo = 0
  if (s.lives <= 0) {
    s.status = 'over'
    return
  }
  setSize(s, 'grown')
  s.power = 'none'
  s.starUntil = 0
  placeOnGround(s, s.checkpoint)
  s.player.facing = 1
  s.hurtUntil = s.elapsed + RESPAWN_IMMUNITY
}

/** A touch from the side: the shaker goes first, then a grown heart shrinks (with a moment's grace), then a hatchling loses a life. */
function hurt(s: WorldState, by: HitBy) {
  if (isStarred(s) || s.elapsed < s.hurtUntil) return
  if (s.power === 'shaker') {
    s.hits.push({ day: dayAt(s), by })
    s.power = 'none'
    s.hurtUntil = s.elapsed + HURT_SECONDS
    s.hurtAt = s.elapsed
    return
  }
  if (s.size === 'grown') {
    s.hits.push({ day: dayAt(s), by })
    setSize(s, 'hatchling')
    s.hurtUntil = s.elapsed + HURT_SECONDS
    s.hurtAt = s.elapsed
    return
  }
  die(s, by)
}

function crush(s: WorldState, e: Enemy, points: number) {
  e.mode = 'crushed'
  e.at = s.elapsed
  e.vx = 0
  s.crushed += 1
  if (e.kind === 'can' || e.kind === 'tall') s.cansCrushed += 1
  if (points > 0) {
    s.score += points
    pop(s, e.x + e.w / 2, e.y, String(points))
  }
}

/** A stomp's reward: the combo table, then an extra life. */
function reward(s: WorldState, e: Enemy) {
  s.combo += 1
  if (s.combo > COMBO_POINTS.length) {
    if (s.lives < MAX_LIVES) s.lives += 1
    pop(s, e.x + e.w / 2, e.y, '1UP')
    return
  }
  const points = COMBO_POINTS[s.combo - 1]!
  s.score += points
  pop(s, e.x + e.w / 2, e.y, String(points))
}

/** A sliding shell into a wall of cans: the whole column comes down. */
function knockStack(s: WorldState, col: number, x: number) {
  const level = s.level
  let cans = 0
  let top = ROWS * TILE
  for (let r = 0; r < ROWS; r++) {
    if (tileAt(level, col, r) !== STACK) continue
    level.tiles[r * level.cols + col] = EMPTY
    cans += 1
    top = Math.min(top, r * TILE)
  }
  if (!cans) return
  s.score += cans * STACK_POINTS
  pop(s, x, top, String(cans * STACK_POINTS))
}

/** What a block lets out, rising from inside it. */
function release(s: WorldState, b: Block, kind: ItemKind) {
  const { w, h } = ITEM_BOX[kind]
  s.level.items.push({
    kind,
    x: b.x + (TILE - w) / 2,
    y: b.y + TILE - h,
    w,
    h,
    vx: 0,
    vy: 0,
    dir: 1,
    onGround: false,
    restY: b.y - h,
    at: s.elapsed,
    taken: false,
    gone: false
  })
}

/** A bump from below on a question block: it's spent, it says its line, and something comes out. */
function hitBlock(s: WorldState, b: Block) {
  const level = s.level
  b.hit = true
  if (b.hidden) level.tiles[Math.floor(b.y / TILE) * level.cols + Math.floor(b.x / TILE)] = BLOCK
  s.score += BLOCK_POINTS
  pop(s, b.x + TILE / 2, b.y, String(BLOCK_POINTS))
  s.reveal = { text: blockLine(b, level.days[b.day]), at: s.elapsed }
  if (b.kind === 'star') release(s, b, 'star')
  else if (b.kind === 'heart') release(s, b, 'heart')
  else release(s, b, s.size === 'hatchling' ? 'plate' : 'shaker')
}

function take(s: WorldState, it: Item) {
  it.taken = true
  const cx = it.x + it.w / 2
  if (it.kind === 'heart') {
    if (s.lives < MAX_LIVES) s.lives += 1
    pop(s, cx, it.y, '1UP')
    return
  }
  s.score += ITEM_POINTS
  pop(s, cx, it.y, String(ITEM_POINTS))
  if (it.kind === 'plate') {
    if (s.size === 'hatchling') setSize(s, 'grown')
  }
  else if (it.kind === 'shaker') {
    if (s.size === 'hatchling') setSize(s, 'grown')
    s.power = 'shaker'
  }
  else {
    s.starUntil = s.elapsed + STAR_SECONDS
    s.starChain = 0
  }
}

function moveItem(s: WorldState, it: Item, t: number) {
  if (it.taken || it.gone) return
  const level = s.level
  const age = s.elapsed - it.at
  if (age < ITEM_RISE) {
    // Out of the block: from inside it to sitting on top.
    const from = it.restY + TILE
    it.y = from - (from - it.restY) * (age / ITEM_RISE)
    return
  }
  if (it.kind === 'shaker') {
    it.y = it.restY
    return
  }
  if (it.kind === 'star' && it.onGround) {
    it.vy = -STAR_HOP_V
    it.onGround = false
  }
  it.vx = it.dir * (it.kind === 'star' ? STAR_SPEED : PLATE_SPEED)
  const dx = it.vx * t
  const nx = it.x + dx
  const edge = dx > 0 ? nx + it.w : nx
  if (blockedSide(level, edge, it.y + 2, it.y + it.h - 2)) it.dir = it.dir === 1 ? -1 : 1
  else it.x = nx
  it.vy = Math.min(900, it.vy + WORLD_GRAVITY * t)
  const dy = it.vy * t
  const footBefore = it.y + it.h
  const ny = it.y + dy
  if (dy >= 0) {
    const land = solidBelow(level, it.x + 2, it.x + it.w - 2, ny + it.h, footBefore <= Math.floor((ny + it.h) / TILE) * TILE + 0.5)
    if (land != null) {
      it.y = land - it.h
      it.vy = 0
      it.onGround = true
    }
    else {
      it.y = ny
      it.onGround = false
    }
  }
  else {
    it.y = ny
    it.onGround = false
  }
  if (it.y > FALL_LIMIT) it.gone = true
}

function throwScoop(s: WorldState) {
  const level = s.level
  if (s.power !== 'shaker') return
  if (level.scoops.filter(sc => sc.alive).length >= MAX_SCOOPS) return
  const p = s.player
  level.scoops.push({
    x: p.facing > 0 ? p.x + p.w : p.x - 6,
    y: p.y + p.h * 0.4,
    vx: p.facing * SCOOP_SPEED,
    vy: 120,
    at: s.elapsed,
    alive: true
  })
  if (level.scoops.length > 8) level.scoops = level.scoops.filter(sc => sc.alive)
}

function moveScoop(s: WorldState, sc: Scoop, t: number) {
  if (!sc.alive) return
  const level = s.level
  if (s.elapsed - sc.at > SCOOP_LIFE || sc.x < s.camera - 40 || sc.x > s.camera + s.width + 40) {
    sc.alive = false
    return
  }
  const nx = sc.x + sc.vx * t
  const edge = sc.vx > 0 ? nx + 6 : nx
  if (blockedSide(level, edge, sc.y + 1, sc.y + 5)) {
    sc.alive = false
    return
  }
  sc.x = nx
  sc.vy = Math.min(900, sc.vy + WORLD_GRAVITY * t)
  const ny = sc.y + sc.vy * t
  if (sc.vy > 0) {
    const land = solidBelow(level, sc.x, sc.x + 6, ny + 6, sc.y + 6 <= Math.floor((ny + 6) / TILE) * TILE + 0.5)
    if (land != null) {
      sc.y = land - 6
      sc.vy = -SCOOP_BOUNCE
    }
    else {
      sc.y = ny
    }
  }
  else {
    sc.y = ny
  }
  if (sc.y > FALL_LIMIT) {
    sc.alive = false
    return
  }
  for (const e of level.enemies) {
    if (e.mode !== 'walk' && e.mode !== 'shell') continue
    if (!overlaps(sc.x, sc.y, 6, 6, e)) continue
    crush(s, e, SCOOP_POINTS)
    sc.alive = false
    return
  }
}

function moveEnemy(s: WorldState, e: Enemy, t: number) {
  const level = s.level
  if (e.mode === 'gone') return
  if (e.mode === 'crushed') {
    if (s.elapsed - e.at >= CRUSH_SECONDS) e.mode = 'gone'
    return
  }
  if (!e.awake) {
    if (e.x < s.camera + s.width + TILE * 2) e.awake = true
    else return
  }

  // A needle flies straight and level until it's off the left of the screen.
  if (e.kind === 'needle') {
    e.x += e.vx * t
    if (e.x + e.w < s.camera - 80) e.mode = 'gone'
    return
  }

  // Germs hop along; cans walk.
  if (e.kind === 'germ' && e.mode === 'walk' && e.onGround) {
    const beat = Math.floor((s.elapsed + e.phase) / GERM_HOP_EVERY)
    if (beat !== e.beat) {
      e.beat = beat
      e.vy = -GERM_HOP_V
      e.onGround = false
    }
  }

  const sliding = e.mode === 'shell' && e.vx !== 0
  if (e.mode === 'walk' || sliding) {
    // Walkers pick up the pace with every week into the month.
    if (e.mode === 'walk') e.vx = e.dir * (e.kind === 'germ' ? GERM_SPEED : CAN_SPEED) * (1 + WEEK_PACE * Math.floor(e.day / 7))
    const dx = e.vx * t
    const nx = e.x + dx
    const edge = dx > 0 ? nx + e.w : nx
    const wall = sideTile(level, edge, e.y + 2, e.y + e.h - 2)
    let turn = wall !== EMPTY
    if (sliding && wall === STACK) {
      // A sliding shell takes a wall of cans down and keeps going.
      knockStack(s, Math.floor(edge / TILE), edge)
      turn = false
    }
    if (!turn && e.mode === 'walk' && e.kind !== 'germ') {
      // Cans keep to their day and never step off a ledge; germs wander and fall.
      if (nx < e.minX || nx + e.w > e.maxX) turn = true
      else if (e.onGround && !solidUnder(level, edge, e.y + e.h)) turn = true
    }
    if (turn) {
      e.dir = e.dir === 1 ? -1 : 1
      e.vx = -e.vx
    }
    else {
      e.x = nx
    }
  }

  e.vy = Math.min(900, e.vy + WORLD_GRAVITY * t)
  const dy = e.vy * t
  const footBefore = e.y + e.h
  const ny = e.y + dy
  if (dy >= 0) {
    const land = solidBelow(level, e.x + 2, e.x + e.w - 2, ny + e.h, footBefore <= Math.floor((ny + e.h) / TILE) * TILE + 0.5)
    if (land != null) {
      e.y = land - e.h
      e.vy = 0
      e.onGround = true
    }
    else {
      e.y = ny
      e.onGround = false
    }
  }
  else {
    e.y = ny
    e.onGround = false
  }
  if (e.y > FALL_LIMIT) e.mode = 'gone'

  // A sliding shell crushes what it meets: walkers and shells lying still.
  if (sliding && e.mode === 'shell') {
    for (const o of level.enemies) {
      if (o === e || o.kind === 'needle') continue
      if (o.mode !== 'walk' && !(o.mode === 'shell' && o.vx === 0)) continue
      if (!overlaps(o.x, o.y, o.w, o.h, e)) continue
      crush(s, o, CHAIN_POINTS[Math.min(e.chain, CHAIN_POINTS.length - 1)]!)
      e.chain += 1
      s.bestChain = Math.max(s.bestChain, e.chain)
    }
  }
}

/** The player against one enemy: a star's touch, a stomp, a kick, or a hit. */
function contact(s: WorldState, e: Enemy, footBefore: number, input: WorldInput) {
  const p = s.player
  if (e.mode === 'crushed' || e.mode === 'gone') return
  if (!overlaps(p.x, p.y, p.w, p.h, e)) return
  if (isStarred(s)) {
    crush(s, e, STAR_POINTS[Math.min(s.starChain, STAR_POINTS.length - 1)]!)
    s.starChain += 1
    return
  }
  const stomp = p.vy > 0 && footBefore <= e.y + e.h * STOMP_LINE
  if (stomp) {
    if (e.kind === 'tall' && e.mode === 'walk') {
      // The first stomp leaves a dented can lying there.
      e.mode = 'shell'
      e.vx = 0
      e.at = s.elapsed
    }
    else if (e.mode === 'shell' && e.vx !== 0) {
      e.vx = 0
      e.at = s.elapsed
      e.chain = 0
    }
    else {
      crush(s, e, 0)
    }
    reward(s, e)
    p.y = e.y - p.h
    p.vy = -(input.jumpHeld ? WORLD_JUMP_V : STOMP_BOUNCE)
    p.onGround = false
    p.ride = -1
    return
  }
  // A side touch has to reach the body, not graze the box's corner.
  if (!overlaps(p.x + HIT_INSET, p.y, p.w - HIT_INSET * 2, p.h, e)) return
  if (e.mode === 'shell') {
    if (e.vx === 0) {
      // A touch kicks the dented can away from the player.
      e.dir = p.x + p.w / 2 < e.x + e.w / 2 ? 1 : -1
      e.vx = e.dir * SHELL_SPEED
      e.at = s.elapsed
      e.chain = 0
      return
    }
    if (s.elapsed - e.at < KICK_GRACE) return
  }
  hurt(s, e.kind)
}

/** A draw day fires needles from off the right of the screen while the player is in it and its block is unspent. */
function needles(s: WorldState) {
  const level = s.level
  const d = dayAt(s)
  if (d !== s.needleDay) {
    s.needleDay = d
    s.nextNeedleAt = s.elapsed + NEEDLE_FIRST
  }
  const day = d >= 0 ? level.days[d] : undefined
  if (!day || !day.draw || !day.logged) return
  if (level.blocks.some(b => b.day === d && b.kind === 'draw' && b.hit)) return
  if (s.elapsed < s.nextNeedleAt) return
  s.nextNeedleAt = s.elapsed + NEEDLE_EVERY
  const { w, h } = ENEMY_BOX.needle
  level.enemies.push({
    kind: 'needle',
    day: d,
    x: Math.max(s.camera + s.width, s.player.x + NEEDLE_RANGE) + 16,
    y: level.groundRows[d]! * TILE - 38 - h / 2,
    w,
    h,
    vx: -NEEDLE_SPEED,
    vy: 0,
    dir: -1,
    mode: 'walk',
    minX: 0,
    maxX: levelWidth(level),
    awake: true,
    onGround: false,
    at: s.elapsed,
    phase: 0,
    beat: -1,
    chain: 0
  })
}

function advance(s: WorldState, t: number, input: WorldInput) {
  const p = s.player
  const level = s.level
  const here = dayAt(s)
  const slippery = p.onGround && here >= 0 && isShortSleep(level.days[here]!)

  // The platforms slide, and carry whoever stands on them.
  for (const m of level.movers) {
    m.x += m.vx * t
    if (m.x <= m.minX) {
      m.x = m.minX
      m.vx = Math.abs(m.vx)
    }
    else if (m.x >= m.maxX) {
      m.x = m.maxX
      m.vx = -Math.abs(m.vx)
    }
  }
  if (p.ride >= 0 && p.onGround) p.x += level.movers[p.ride]!.vx * t

  // Run.
  const want = (input.right ? 1 : 0) - (input.left ? 1 : 0)
  if (want) {
    p.vx += want * (slippery ? SLIP_ACCEL : ACCEL) * t
    p.vx = Math.max(-RUN_SPEED, Math.min(RUN_SPEED, p.vx))
    p.facing = want > 0 ? 1 : -1
  }
  else if (p.vx !== 0) {
    const f = (slippery ? SLIP_FRICTION : FRICTION) * t
    p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f
  }

  // Jump: on the ground only; a hold softens gravity on the way up.
  if (input.jump && p.onGround) {
    p.vy = -WORLD_JUMP_V
    p.onGround = false
    p.ride = -1
  }
  const g = p.vy < 0 && input.jumpHeld ? HOLD_GRAVITY : WORLD_GRAVITY
  p.vy = Math.min(900, p.vy + g * t)

  // Throw.
  if (input.fire) throwScoop(s)

  // Horizontal move and walls, with a one-tile step-up: a stair is walked, not jumped.
  const dx = p.vx * t
  if (dx !== 0) {
    const nx = p.x + dx
    const edge = dx > 0 ? nx + p.w : nx
    if (blockedSide(level, edge, p.y + 2, p.y + p.h - 2)) {
      const stepUp = !blockedSide(level, edge, p.y + 2 - TILE, p.y + p.h - 2 - TILE) && p.onGround
      if (stepUp) {
        p.y -= TILE
        p.x = nx
      }
      else {
        const col = Math.floor(edge / TILE)
        p.x = dx > 0 ? col * TILE - p.w - 0.01 : (col + 1) * TILE + 0.01
        p.vx = 0
      }
    }
    else {
      p.x = nx
    }
    p.x = Math.max(0, Math.min(levelWidth(level) - p.w, p.x))
    if (p.onGround) p.walked += Math.abs(dx)
  }

  // Vertical move: land on ground, (from above) platforms and sliding platforms; bump the head
  // on anything solid, and a question block from below (hidden ones included) is spent.
  const dy = p.vy * t
  const footBefore = p.y + p.h
  const wasAirborne = !p.onGround
  const ny = p.y + dy
  if (dy >= 0) {
    let land = solidBelow(level, p.x + 4, p.x + p.w - 4, ny + p.h, footBefore <= Math.floor((ny + p.h) / TILE) * TILE + 0.5)
    let ride = -1
    level.movers.forEach((m, i) => {
      if (p.x + p.w - 4 <= m.x || p.x + 4 >= m.x + m.w) return
      if (footBefore <= m.y + 0.5 && ny + p.h >= m.y && (land == null || m.y <= land)) {
        land = m.y
        ride = i
      }
    })
    if (land != null) {
      p.y = land - p.h
      p.vy = 0
      p.onGround = true
      p.ride = ride
      if (wasAirborne) s.combo = 0
    }
    else {
      p.y = ny
      p.onGround = false
      p.ride = -1
    }
  }
  else {
    const headRow = Math.floor(ny / TILE)
    const c0 = Math.floor((p.x + 4) / TILE)
    const c1 = Math.floor((p.x + p.w - 5) / TILE)
    let bumped = false
    for (let c = c0; c <= c1; c++) {
      if (isSolid(tileAt(level, c, headRow))) bumped = true
    }
    for (const b of level.blocks) {
      if (b.hit) continue
      const bc = Math.floor(b.x / TILE)
      if (Math.floor(b.y / TILE) !== headRow || bc < c0 || bc > c1) continue
      bumped = true
      hitBlock(s, b)
    }
    if (bumped) {
      p.y = (headRow + 1) * TILE
      p.vy = 0
    }
    else {
      p.y = ny
    }
    p.onGround = false
    p.ride = -1
  }

  // Capsules.
  for (const cap of level.capsules) {
    if (cap.taken) continue
    if (cap.x > p.x - 8 && cap.x < p.x + p.w + 8 && cap.y > p.y - 8 && cap.y < p.y + p.h + 8) {
      cap.taken = true
      s.collected += 1
      s.score += 10
    }
  }

  // Flags: a checkpoint the first time it is passed.
  for (const f of level.flags) {
    if (f.week > s.checkpointWeek && p.x + p.w / 2 >= f.x) {
      s.checkpointWeek = f.week
      s.checkpoint = f.x
      s.score += 50
    }
  }

  // The castle.
  if (p.x + p.w / 2 >= level.castleX) {
    s.status = 'cleared'
    s.score += 200 + s.lives * 50
    return
  }

  // What the blocks let out, and the scoops.
  for (const it of level.items) {
    moveItem(s, it, t)
    if (!it.taken && !it.gone && overlaps(p.x, p.y, p.w, p.h, it)) take(s, it)
  }
  for (const sc of level.scoops) moveScoop(s, sc, t)

  // The enemies move, then meet the player; the poppers rise into whoever is over them.
  needles(s)
  for (const e of level.enemies) moveEnemy(s, e, t)
  for (const e of level.enemies) {
    if (s.status !== 'running') break
    contact(s, e, footBefore, input)
  }
  for (const pp of level.poppers) {
    if (s.status !== 'running') break
    const box = popperBox(pp, s.elapsed)
    if (box && overlaps(p.x + HIT_INSET, p.y, p.w - HIT_INSET * 2, p.h, box)) hurt(s, 'popper')
  }

  // The pit.
  if (s.status === 'running' && p.y > FALL_LIMIT) die(s, 'pit')
}

/** Advance the world by dt seconds (clamped). Only a running world moves. */
export function stepWorld(s: WorldState, dt: number, input: WorldInput = NO_INPUT): WorldState {
  if (s.status !== 'running') return s
  const t = Math.min(MAX_DT, Math.max(0, dt))
  s.elapsed += t
  // Sub-steps of at most a few px, so a fast fall (or a sliding shell) can't pass through a tile.
  let fastest = Math.max(Math.abs(s.player.vx), Math.abs(s.player.vy))
  for (const e of s.level.enemies) {
    if (e.awake && e.mode !== 'gone') fastest = Math.max(fastest, Math.abs(e.vx), Math.abs(e.vy))
  }
  for (const sc of s.level.scoops) {
    if (sc.alive) fastest = Math.max(fastest, Math.abs(sc.vx), Math.abs(sc.vy))
  }
  const n = Math.max(1, Math.ceil((fastest * t) / 6))
  const one: WorldInput = { ...input }
  for (let i = 0; i < n && s.status === 'running'; i++) {
    advance(s, t / n, one)
    one.jump = false // a press counts once
    one.fire = false
  }
  // Spent needles pile up over a month; drop the gone ones now and then.
  if (s.level.enemies.length > 160) s.level.enemies = s.level.enemies.filter(e => e.mode !== 'gone' || e.kind !== 'needle')
  // The camera leads the player a little and never shows past the ends.
  const target = s.player.x - s.width * 0.38
  s.camera = Math.max(0, Math.min(levelWidth(s.level) - s.width, target))
  return s
}

/** The day the player is standing in, or -1 on the runway. */
export function dayAt(s: WorldState): number {
  const col = Math.floor((s.player.x + s.player.w / 2) / TILE)
  const i = Math.floor((col - START_TILES) / DAY_TILES)
  return i < 0 || i >= s.level.days.length ? -1 : i
}

/** Which of the companion's poses the renderer should draw. */
export function worldPose(s: WorldState): 'idle' | 'walk1' | 'walk2' | 'happy' | 'petted' | 'flatline' | 'worried' {
  if (s.status === 'over') return 'flatline'
  if (s.status === 'cleared') return 'petted'
  if (s.deathAt >= 0 && s.elapsed - s.deathAt < 0.4) return 'flatline'
  if (s.hurtAt >= 0 && s.elapsed - s.hurtAt < 0.4) return 'worried'
  if (!s.player.onGround) return 'happy'
  if (Math.abs(s.player.vx) > 20) return Math.floor(s.player.walked / WORLD_STRIDE_PX) % 2 === 0 ? 'walk1' : 'walk2'
  return 'idle'
}

/** Enemies still in play (for the HUD and the tests). */
export function enemiesLeft(s: WorldState): number {
  return s.level.enemies.filter(e => e.mode === 'walk' || e.mode === 'shell').length
}

/** The feats a finished month earned: every can down, a whole week unscratched, a chain of three. */
export function worldFeats(s: WorldState): WorldFeat[] {
  const out: WorldFeat[] = []
  if (s.status !== 'cleared') return out
  if (s.cansTotal > 0 && s.cansCrushed >= s.cansTotal) out.push('clean-month')
  const weeks = Math.floor(s.level.days.length / 7)
  for (let w = 0; w < weeks; w++) {
    if (!s.hits.some(h => h.day >= w * 7 && h.day < w * 7 + 7)) {
      out.push('no-hit-week')
      break
    }
  }
  if (s.bestChain >= CHAIN_FEAT) out.push('chain-3')
  return out
}

/** The month in a few figures: what went down, what got you, and where it was worst. */
export function worldSummary(s: WorldState): WorldSummary {
  const byDay = new Map<number, HitBy[]>()
  for (const h of s.hits) {
    if (h.day < 0) continue
    byDay.set(h.day, [...(byDay.get(h.day) ?? []), h.by])
  }
  let worst: WorldSummary['worstDay'] = null
  for (const [day, by] of byDay) {
    if (worst && by.length < worst.hits) continue
    const counts = new Map<HitBy, number>()
    for (const b of by) counts.set(b, (counts.get(b) ?? 0) + 1)
    const order = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([b]) => b)
    worst = { day, date: s.level.days[day]!.date, hits: by.length, by: order }
  }
  return {
    cleared: s.status === 'cleared',
    crushed: s.crushed,
    cansCrushed: s.cansCrushed,
    cansTotal: s.cansTotal,
    hits: s.hits,
    losses: s.losses,
    bestChain: s.bestChain,
    worstDay: worst
  }
}

/**
 * A scripted runner for the tests: runs right, jumps when the ground ahead drops away or rises
 * (a pit, a stair, a wall of cans — holding over a pit or a tall wall) and holds the jump over
 * a pit; jumps an enemy in its path, holding for the height that clears a cluster; coming
 * down, steers onto whatever is underfoot so the landing is a stomp and not a brush; and waits
 * at a pit for its popper to sink. It never aims at the capsules or the blocks, and never
 * throws; the proof is that the castle can be reached, which the generator promises.
 */
export function autoRun(s: WorldState): WorldInput {
  if (s.status === 'ready') {
    startWorld(s)
    return { left: false, right: true, jump: false, jumpHeld: false }
  }
  if (s.status !== 'running') return NO_INPUT
  const p = s.player
  const level = s.level
  const col = Math.floor((p.x + p.w) / TILE)
  const here = groundRowAt(level, col)
  const ahead1 = groundRowAt(level, col + 1)
  const ahead2 = groundRowAt(level, col + 2)
  const pit = ahead1 === ROWS || ahead2 === ROWS
  const stair = ahead1 < here || ahead2 < here
  // A wall of cans in the next two columns wants the held arc.
  let wall = false
  for (let c = col; c <= col + 2 && !wall; c++) for (let r = 0; r < ROWS && !wall; r++) if (tileAt(level, c, r) === STACK) wall = true
  // The next pit has the right of way: within four tiles of one, no jumping at enemies (a brush
  // shrinks, a pit kills); within nine, only a tap (a held arc carries eight tiles); and no
  // steering about in the air near one.
  let pitDist = here === ROWS ? 0 : Infinity
  for (let c = col + 1; c <= col + 9 && pitDist === Infinity; c++) if (groundRowAt(level, c) === ROWS) pitDist = c - col
  // At the lip of a pit (a tile earlier on a slippery day, the stop is longer) with a popper
  // that won't stay down for the crossing: stand and wait; a standing held jump still clears it.
  const today = dayAt(s)
  const slippery = today >= 0 && isShortSleep(level.days[today]!)
  if (p.onGround && pitDist <= (slippery ? 3 : 2)) {
    const x0 = col * TILE
    const x1 = (col + 1 + pitDist + MAX_PIT) * TILE
    const popper = level.poppers.find(pp => pp.x > x0 && pp.x < x1)
    if (popper && !popperSafeFor(popper, s.elapsed, 1)) return NO_INPUT
  }
  const live = level.enemies.filter(e => e.awake && (e.mode === 'walk' || (e.mode === 'shell' && e.vx !== 0)))
  // A needle coming: stand still and hop it on the spot, rather than meet it mid-stride.
  const needle = live.find(e => e.kind === 'needle' && e.x + e.w > p.x && e.x < p.x + p.w + NEEDLE_RANGE * 0.75)
  if (needle && p.onGround) {
    const close = needle.x < p.x + p.w + TILE * 2.5
    const walker = live.some(e => e.kind !== 'needle' && e.x + e.w > p.x - TILE && e.x < p.x + p.w + TILE * 2.5 && e.y + e.h > p.y)
    return close || walker ? { left: false, right: false, jump: true, jumpHeld: false } : NO_INPUT
  }
  const cx = p.x + p.w / 2
  if (!p.onGround && p.vy > 0 && pitDist > 2) {
    const foot = p.y + p.h
    let target: Enemy | null = null
    let best = Infinity
    for (const e of live) {
      const gap = e.y - foot
      if (gap < -e.h * 0.4 || gap > 64) continue
      const d = Math.abs(e.x + e.w / 2 - cx)
      if (d < 56 && d < best) {
        best = d
        target = e
      }
    }
    if (target) {
      const ex = target.x + target.w / 2
      return { left: ex < cx - 2, right: ex > cx + 2, jump: false, jumpHeld: false }
    }
  }
  const threat = pitDist > 4 && live.some(e => e.x + e.w > p.x && e.x < p.x + p.w + TILE * 2.5 && e.y + e.h > p.y)
  const jump = p.onGround && (pit || stair || threat)
  return { left: false, right: true, jump, jumpHeld: !p.onGround && p.vy < 0 && (pit || here === ROWS || wall || (threat && pitDist > 9)) }
}
