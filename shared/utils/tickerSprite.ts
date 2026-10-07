// TICKER's sprites (design canvas, 2026-09-28): the heart on a 17×15 grid with brows, a mouth and
// cheeks. The 'full' figure (direction C, "rubber-hose") adds gloves, sneakers and a prop per pose
// on a 28×16 canvas; the 'face' figure (direction A, "hi-bit") is the heart alone, for tight spots.
// Pure data: the component turns each cell's ink into a colour.

// From 'eating' on they are the /ticker pet page's: eating (FEED replays the day's doses), the
// two walk-cycle frames the page alternates while it trots, the blissful petted face, sitting
// down to wait (a minute with nothing pressed), asleep (after bedtime), feverish (resting HR
// well over its own two-week average), hungry (due doses still unlogged after dusk), nervous
// (draw day), impatient (a planned draw overdue — checking its watch) and salute (a clean week
// of doses).
export const TICKER_POSES = ['idle', 'thinking', 'talking', 'happy', 'worried', 'sleepy', 'flatline', 'eating', 'walk1', 'walk2', 'petted', 'sit', 'asleep', 'feverish', 'hungry', 'nervous', 'impatient', 'salute'] as const
export type TickerPose = typeof TICKER_POSES[number]

/**
 * The figure's build — the body under the pose, read from the data. The tier is how much has
 * been logged: a hatchling has no limbs yet, the grown figure is the one every pose describes,
 * an elder leans on a cane in the poses whose left arm hangs. 'built' arms are drawn two cells
 * thick (lean mass up since the first DEXA scan). The belly is the body-fat read: a soft
 * highlight when it is high, lines of definition when it is low, nothing in between.
 */
export type TickerTier = 'hatchling' | 'grown' | 'elder'
export type TickerBelly = 'soft' | 'lean' | 'cut'
export interface TickerBuild {
  tier?: TickerTier
  arms?: 'lean' | 'built'
  belly?: TickerBelly
}

export type TickerInk
  = 'rim' | 'red' | 'shade' | 'hi' | 'spec' | 'eye' | 'glint' | 'blush' | 'tongue' | 'drop'
    | 'limb' | 'glove' | 'shoe' | 'clip' | 'line' | 'flag' | 'mug' | 'coffee' | 'bowl' | 'hat'

/**
 * Accessories the /ticker page composes over any pose — the props layer. Each is a set of cells
 * painted after the limbs (full figure only); the canvas grows to fit one that reaches past it
 * (a hat above the head), so the figure's feet stay put. Most props stay off the heart; the
 * WEARABLES (a sweatband, shades, a medal, a lab coat) are the ones allowed to paint over it.
 *
 * Walk props (carried for the lap, by workout type): dumbbell, helmet, disc, cap. Earned
 * (milestones): crown, sweatband, shades, medal. The vet visit: calendar, lab-coat.
 */
export type TickerProp
  = 'bowl-empty' | 'bowl-full' | 'party-hat'
    | 'dumbbell' | 'helmet' | 'disc' | 'cap'
    | 'crown' | 'sweatband' | 'shades' | 'medal' | 'gold-star'
    | 'calendar' | 'lab-coat'

/** `lid`/`lid-glint` blink shut, `jaw`/`jaw-tongue` open and close while talking, `flicker` pulses. */
export type TickerCellMotion = '' | 'lid' | 'lid-glint' | 'jaw' | 'jaw-tongue' | 'flicker'

export interface TickerCell {
  ink: TickerInk | null
  motion: TickerCellMotion
}

export type TickerFigure = 'full' | 'face'

export interface TickerSprite {
  cols: number
  rows: number
  /** Row-major, cols × rows; `ink: null` is transparent. */
  cells: TickerCell[]
}

// The full canvas spans body columns −4…23 and rows 0…15 (limbs reach past the heart's box).
const CANVAS: Record<TickerFigure, { colMin: number, cols: number, rows: number }> = {
  full: { colMin: -4, cols: 28, rows: 16 },
  face: { colMin: 0, cols: 17, rows: 15 }
}

// The silhouette as filled column ranges per row: [start, end, start, end…].
const SILHOUETTE = [
  [3, 6, 10, 13], [2, 7, 9, 14], [1, 15], [0, 16], [0, 16], [0, 16], [0, 16],
  [1, 15], [2, 14], [3, 13], [4, 12], [5, 11], [6, 10], [7, 9], [8, 8]
]

function inHeart(r: number, c: number): boolean {
  const spans = SILHOUETTE[r]
  if (!spans) return false
  for (let i = 0; i < spans.length; i += 2) {
    if (c >= spans[i]! && c <= spans[i + 1]!) return true
  }
  return false
}

const SPEC = new Set(['2,3', '2,4', '3,2'])
const HIGHLIGHT = new Set(['1,4', '1,5', '1,6', '2,2', '2,5', '3,1', '3,3', '4,1'])

type Grid = Map<string, TickerCell>
type Point = [number, number]

const at = (r: number, c: number) => `${r},${c}`

function paint(grid: Grid, points: Point[], ink: TickerInk, motion: TickerCellMotion = '') {
  for (const [r, c] of points) grid.set(at(r, c), { ink, motion })
}

function body(): Grid {
  const grid: Grid = new Map()
  for (let r = 0; r < SILHOUETTE.length; r++) {
    for (let c = 0; c <= 16; c++) {
      if (!inHeart(r, c)) continue
      let ink: TickerInk = 'red'
      if (!inHeart(r - 1, c) || !inHeart(r + 1, c) || !inHeart(r, c - 1) || !inHeart(r, c + 1)) ink = 'rim'
      else if (SPEC.has(at(r, c))) ink = 'spec'
      else if (HIGHLIGHT.has(at(r, c))) ink = 'hi'
      // A diagonal shadow band along the lower-right edge.
      else if ((c >= 8 && r >= 3 && !inHeart(r + 1, c + 1)) || (c >= 9 && r >= 5 && !inHeart(r + 2, c + 2))) ink = 'shade'
      grid.set(at(r, c), { ink, motion: '' })
    }
  }
  return grid
}

/** Two 2-wide eyes; every row but the last blinks shut, leaving a closed-eye line. */
function eyes(grid: Grid, leftCol: number, rightCol: number, top: number, height: number, glintOffset: number) {
  for (const c0 of [leftCol, rightCol]) {
    for (let r = top; r < top + height; r++) {
      for (let c = c0; c < c0 + 2; c++) {
        const glint = r === top && c === c0 + glintOffset
        const lid = r < top + height - 1
        grid.set(at(r, c), {
          ink: glint ? 'glint' : 'eye',
          motion: lid ? (glint ? 'lid-glint' : 'lid') : ''
        })
      }
    }
  }
}

const BLUSH: Point[] = [[7, 3], [7, 4], [7, 12], [7, 13]]

function face(grid: Grid, pose: TickerPose, figure: TickerFigure) {
  switch (pose) {
    case 'thinking':
      eyes(grid, 5, 12, 4, 2, 1) // glancing up and to the side
      paint(grid, [[3, 5], [3, 6], [2, 12], [2, 13]], 'rim') // one brow raised
      paint(grid, [[9, 9], [9, 10]], 'eye')
      break
    case 'talking':
      eyes(grid, 4, 11, 4, 3, 0)
      paint(grid, BLUSH, 'blush')
      paint(grid, [[8, 7], [8, 8], [8, 9]], 'eye')
      paint(grid, [[9, 7], [9, 9], [10, 8]], 'eye', 'jaw')
      paint(grid, [[9, 8]], 'tongue', 'jaw-tongue')
      break
    case 'happy':
      paint(grid, [[4, 4], [5, 3], [5, 5], [4, 12], [5, 11], [5, 13]], 'eye') // ^ ^
      paint(grid, BLUSH, 'blush')
      paint(grid, [[8, 6], [8, 7], [8, 8], [8, 9], [8, 10], [9, 7], [9, 9]], 'eye')
      paint(grid, [[9, 8]], 'tongue')
      break
    case 'worried':
      eyes(grid, 4, 11, 4, 3, 0)
      paint(grid, [[3, 4], [2, 5], [2, 11], [3, 12]], 'rim') // brows up in the middle
      paint(grid, [[9, 6], [8, 7], [9, 8], [8, 9], [9, 10]], 'eye')
      // The full figure flicks its sweat drop off the scratching glove instead.
      if (figure === 'face') paint(grid, [[1, 16], [2, 16]], 'drop')
      break
    case 'sleepy':
      paint(grid, [[5, 4], [5, 5], [5, 11], [5, 12]], 'rim') // heavy lids
      paint(grid, [[6, 4], [6, 5], [6, 11], [6, 12], [9, 8]], 'eye')
      break
    case 'flatline':
      paint(grid, [[4, 3], [4, 5], [5, 4], [6, 3], [6, 5], [4, 11], [4, 13], [5, 12], [6, 11], [6, 13]], 'eye')
      paint(grid, [[8, 6], [8, 7], [8, 8], [8, 9], [8, 10]], 'eye')
      paint(grid, [[9, 9], [10, 9]], 'tongue')
      break
    case 'eating': // happy carets, mouth wide — the lower lip chews on the jaw cycle
      paint(grid, [[4, 4], [5, 3], [5, 5], [4, 12], [5, 11], [5, 13]], 'eye')
      paint(grid, BLUSH, 'blush')
      paint(grid, [[8, 6], [8, 7], [8, 8], [8, 9], [8, 10], [9, 6], [9, 10]], 'eye')
      paint(grid, [[10, 7], [10, 8], [10, 9]], 'eye', 'jaw')
      paint(grid, [[9, 8]], 'tongue', 'jaw-tongue')
      break
    case 'walk1': // determined trot; the two frames swap which eye carries the glint
      eyes(grid, 4, 11, 4, 3, 0)
      paint(grid, [[9, 7], [9, 8], [9, 9]], 'eye')
      break
    case 'walk2':
      eyes(grid, 4, 11, 4, 3, 1)
      paint(grid, [[9, 7], [9, 8], [9, 9]], 'eye')
      break
    case 'petted': // eyes shut in upward bliss arcs, wide smile, double blush
      paint(grid, [[5, 3], [4, 4], [4, 5], [5, 6], [5, 10], [4, 11], [4, 12], [5, 13]], 'eye')
      paint(grid, [...BLUSH, [6, 2], [6, 14]], 'blush')
      paint(grid, [[8, 5], [9, 6], [9, 7], [9, 9], [9, 10], [8, 11]], 'eye')
      paint(grid, [[9, 8]], 'tongue')
      break
    case 'sit': // content: ordinary eyes and a small cat mouth
      eyes(grid, 4, 11, 4, 3, 0)
      paint(grid, BLUSH, 'blush')
      paint(grid, [[8, 6], [9, 7], [8, 8], [9, 9], [8, 10]], 'eye')
      break
    case 'asleep': // eyes shut in soft downward arcs, a tiny open mouth, no blush
      paint(grid, [[5, 3], [6, 4], [6, 5], [5, 6], [5, 10], [6, 11], [6, 12], [5, 13]], 'eye')
      paint(grid, [[9, 8]], 'eye')
      break
    case 'feverish': // half-lidded, flushed, a flat mouth; the full figure adds the sweat
      eyes(grid, 4, 11, 5, 2, 0)
      paint(grid, BLUSH, 'blush')
      paint(grid, [[9, 7], [9, 8], [9, 9]], 'eye')
      break
    case 'hungry': // pale (no blush), a small frown
      eyes(grid, 4, 11, 4, 3, 0)
      paint(grid, [[9, 6], [8, 7], [8, 8], [8, 9], [9, 10]], 'eye')
      break
    case 'nervous': // brows up, a small o of a mouth; the full figure adds sweat and clasped hands
      eyes(grid, 4, 11, 4, 3, 0)
      paint(grid, [[3, 4], [2, 5], [2, 11], [3, 12]], 'rim')
      paint(grid, [[9, 8]], 'eye')
      break
    case 'impatient': // eyes down and to the left, at the watch; a flat mouth
      eyes(grid, 3, 10, 5, 2, 0)
      paint(grid, [[9, 7], [9, 8], [9, 9]], 'eye')
      break
    case 'salute': // attentive: straight brows, a flat determined mouth
      eyes(grid, 4, 11, 4, 3, 0)
      paint(grid, [[3, 4], [3, 5], [3, 11], [3, 12]], 'rim')
      paint(grid, [[9, 7], [9, 8], [9, 9]], 'eye')
      break
    default:
      eyes(grid, 4, 11, 4, 3, 0)
      paint(grid, BLUSH, 'blush')
      paint(grid, [[8, 6], [9, 7], [9, 8], [9, 9], [8, 10]], 'eye')
  }
}

function legs(grid: Grid, splayed: boolean) {
  if (splayed) {
    paint(grid, [[13, 6], [14, 5], [13, 10], [14, 11]], 'limb')
    paint(grid, [[15, 4], [15, 5], [15, 11], [15, 12]], 'shoe')
  }
  else {
    paint(grid, [[13, 6], [14, 6], [13, 10], [14, 10]], 'limb')
    paint(grid, [[15, 5], [15, 6], [15, 10], [15, 11]], 'shoe')
  }
}

/** Legs straight out along the floor: the seat of the sit and asleep poses. */
function sitLegs(grid: Grid) {
  paint(grid, [[13, 6], [14, 5], [15, 4], [15, 3], [13, 10], [14, 11], [15, 12], [15, 13]], 'limb')
  paint(grid, [[15, 1], [15, 2], [15, 14], [15, 15]], 'shoe')
}

function block(rows: [number, number], cols: [number, number]): Point[] {
  const points: Point[] = []
  for (let r = rows[0]; r <= rows[1]; r++) {
    for (let c = cols[0]; c <= cols[1]; c++) points.push([r, c])
  }
  return points
}

function limbs(grid: Grid, pose: TickerPose) {
  switch (pose) {
    case 'thinking': // chin scratch
      paint(grid, [[7, 0], [8, -1], [9, -1]], 'limb')
      paint(grid, [[10, -1], [10, -2]], 'glove')
      paint(grid, [[7, 16], [8, 17], [9, 17], [10, 16], [10, 15]], 'limb')
      paint(grid, [[10, 13], [10, 14], [9, 14]], 'glove')
      legs(grid, false)
      break
    case 'talking': // hand on hip, pointing at the number it's quoting
      paint(grid, [[7, 0], [8, -1], [9, 0]], 'limb')
      paint(grid, [[9, 1], [9, 2]], 'glove')
      paint(grid, [[7, 16], [7, 17], [7, 18], [7, 19], [7, 20]], 'limb')
      paint(grid, [[6, 21], [7, 21], [7, 22], [7, 23]], 'glove')
      legs(grid, false)
      break
    case 'happy': // both arms up, feet off the ground
      paint(grid, [[5, -1], [4, -2], [3, -2], [2, -2]], 'limb')
      paint(grid, block([0, 1], [-3, -2]), 'glove')
      paint(grid, [[5, 17], [4, 18], [3, 18], [2, 18]], 'limb')
      paint(grid, block([0, 1], [18, 19]), 'glove')
      legs(grid, true)
      break
    case 'worried': // reading the lab report (one flagged line), scratching its head
      paint(grid, block([8, 13], [-4, -1]), 'glove')
      paint(grid, [[9, -3], [9, -2], [11, -3], [12, -3], [12, -2]], 'line')
      paint(grid, [[10, -3], [10, -2]], 'flag')
      paint(grid, [[7, -3], [7, -2]], 'clip')
      paint(grid, [[7, 0], [8, 0]], 'limb')
      paint(grid, [[6, 17], [5, 18], [4, 18], [3, 17]], 'limb')
      paint(grid, [[2, 16], [2, 17]], 'glove')
      paint(grid, [[2, 20], [3, 20]], 'drop')
      legs(grid, false)
      break
    case 'sleepy': // slumped, nursing a coffee
      paint(grid, [[7, 0], [8, -1], [9, -1], [10, -1], [11, -1]], 'limb')
      paint(grid, [[12, -1], [12, -2]], 'glove')
      paint(grid, [[7, 16], [8, 17], [9, 18]], 'limb')
      paint(grid, [[9, 19], [10, 19]], 'glove')
      paint(grid, [...block([8, 10], [20, 22]), [9, 23]], 'mug')
      paint(grid, [[8, 21]], 'coffee')
      paint(grid, [[6, 21], [5, 20], [4, 21]], 'line', 'flicker')
      legs(grid, false)
      break
    case 'flatline': // arms flung out flat
      paint(grid, [[8, 1], [8, 0], [8, -1]], 'limb')
      paint(grid, [[8, -2], [9, -2]], 'glove')
      paint(grid, [[8, 15], [8, 16], [8, 17]], 'limb')
      paint(grid, [[8, 18], [9, 18]], 'glove')
      legs(grid, false)
      break
    case 'eating': // one hand on the belly, the other lifting a capsule (clip ink) to the mouth
      paint(grid, [[8, 1], [9, 2]], 'limb')
      paint(grid, [[10, 2], [10, 3]], 'glove')
      paint(grid, [[7, 16], [8, 16]], 'limb')
      paint(grid, [[9, 14], [9, 15]], 'glove')
      paint(grid, [[8, 15]], 'clip')
      legs(grid, false)
      break
    case 'walk1': // left leg forward, right arm swinging ahead
      paint(grid, [[7, 0], [8, -1]], 'limb')
      paint(grid, [[9, -1], [9, -2]], 'glove')
      paint(grid, [[7, 16], [7, 17]], 'limb')
      paint(grid, [[6, 18], [7, 18]], 'glove')
      paint(grid, [[13, 6], [14, 5]], 'limb')
      paint(grid, [[15, 3], [15, 4]], 'shoe')
      paint(grid, [[13, 10], [14, 11]], 'limb')
      paint(grid, [[15, 12], [15, 13]], 'shoe')
      break
    case 'walk2': // the stride swapped
      paint(grid, [[7, 0], [7, -1]], 'limb')
      paint(grid, [[6, -2], [7, -2]], 'glove')
      paint(grid, [[7, 16], [8, 17]], 'limb')
      paint(grid, [[9, 17], [9, 18]], 'glove')
      paint(grid, [[13, 6], [14, 6]], 'limb')
      paint(grid, [[15, 6], [15, 7]], 'shoe')
      paint(grid, [[13, 10], [14, 9]], 'limb')
      paint(grid, [[15, 8], [15, 9]], 'shoe')
      break
    case 'petted': // hands to its cheeks, feet splayed in delight
      paint(grid, [[7, 0], [6, -1]], 'limb')
      paint(grid, [[5, -1], [5, -2]], 'glove')
      paint(grid, [[7, 16], [6, 17]], 'limb')
      paint(grid, [[5, 17], [5, 18]], 'glove')
      legs(grid, true)
      break
    case 'sit': // on the floor, hands on its knees
      paint(grid, [[8, 1], [9, 2], [10, 3], [11, 4], [12, 4]], 'limb')
      paint(grid, [[13, 4], [13, 5]], 'glove')
      paint(grid, [[8, 15], [9, 14], [10, 13], [11, 12], [12, 12]], 'limb')
      paint(grid, [[13, 11], [13, 12]], 'glove')
      sitLegs(grid)
      break
    case 'asleep': // the same seat, arms hanging
      paint(grid, [[8, 1], [9, 1], [10, 1], [11, 1]], 'limb')
      paint(grid, [[12, 1], [12, 2]], 'glove')
      paint(grid, [[8, 15], [9, 15], [10, 15], [11, 15]], 'limb')
      paint(grid, [[12, 14], [12, 15]], 'glove')
      sitLegs(grid)
      break
    case 'feverish': // one hand to its forehead, the other hanging, sweat beading on the left temple
      paint(grid, [[7, 0], [8, -1], [9, -1], [10, -1]], 'limb')
      paint(grid, [[11, -2], [11, -1]], 'glove')
      paint(grid, [[6, 17], [5, 18], [4, 18], [3, 17], [2, 17]], 'limb')
      paint(grid, [[1, 15], [1, 16]], 'glove')
      paint(grid, [[1, 0], [2, 0], [3, -1], [4, -1]], 'drop')
      legs(grid, false)
      break
    case 'hungry': // one hand on its empty belly, the other hanging
      paint(grid, [[8, 1], [9, 2]], 'limb')
      paint(grid, [[10, 2], [10, 3]], 'glove')
      paint(grid, [[8, 15], [9, 15], [10, 15], [11, 15]], 'limb')
      paint(grid, [[12, 14], [12, 15]], 'glove')
      legs(grid, false)
      break
    case 'nervous': // both hands clasped at its belly, sweat at the right temple
      paint(grid, [[8, 1], [9, 2]], 'limb')
      paint(grid, [[10, 2], [10, 3]], 'glove')
      paint(grid, [[8, 15], [9, 14]], 'limb')
      paint(grid, [[10, 13], [10, 14]], 'glove')
      paint(grid, [[1, 17], [2, 17]], 'drop')
      legs(grid, false)
      break
    case 'impatient': // checking the watch on its left wrist, the other hand on its hip
      paint(grid, [[7, 0], [8, -1], [9, -1]], 'limb')
      paint(grid, [[10, -1]], 'bowl')
      paint(grid, [[10, 0], [10, 1]], 'glove')
      paint(grid, [[7, 16], [8, 17], [9, 16]], 'limb')
      paint(grid, [[9, 14], [9, 15]], 'glove')
      legs(grid, false)
      break
    case 'salute': // right hand to the brow, the left arm straight down at its side
      paint(grid, [[7, 0], [8, 0], [9, 0], [10, 0]], 'limb')
      paint(grid, [[11, -1], [11, 0]], 'glove')
      paint(grid, [[6, 17], [5, 18], [4, 18]], 'limb')
      paint(grid, [[3, 17], [2, 16]], 'glove')
      legs(grid, false)
      break
    default: // waving hello
      paint(grid, [[7, 0], [8, -1], [9, -1], [10, -1]], 'limb')
      paint(grid, [[11, -2], [11, -1]], 'glove')
      paint(grid, [[6, 17], [5, 18], [4, 18], [3, 18]], 'limb')
      paint(grid, block([1, 2], [18, 19]), 'glove')
      paint(grid, [[1, 21], [3, 21]], 'line', 'flicker')
      legs(grid, false)
  }
}

// --- build -------------------------------------------------------------------------------------

/** The poses whose left arm is the plain hanging one — where an elder's cane goes. */
const CANE_POSES = new Set<TickerPose>(['idle', 'feverish'])

/** The hanging left hand grips a cane instead: the handle at the glove, the shaft to the floor. */
function cane(grid: Grid) {
  grid.delete(at(11, -1))
  paint(grid, [[10, -2], [10, -1]], 'glove')
  paint(grid, [[10, -3], [11, -2], [12, -2], [13, -2], [14, -2], [15, -2]], 'coffee')
}

/** Built arms: every arm cell gains a neighbour toward the body, so the limb reads two cells thick. */
function thicken(grid: Grid) {
  const extra: Point[] = []
  for (const [key, cell] of grid) {
    if (cell.ink !== 'limb') continue
    const [r, c] = key.split(',').map(Number) as [number, number]
    if (r >= 13) continue // legs stay as they are
    const n: Point = [r, c < 8 ? c + 1 : c - 1]
    if (inHeart(n[0], n[1]) || grid.has(at(n[0], n[1]))) continue
    extra.push(n)
  }
  paint(grid, extra, 'limb')
}

/** The lower heart by body fat: a lighter round patch when soft, one crease of definition down
 * the middle when cut (the heart is only five cells wide there — two creases read as a band). */
function belly(grid: Grid, read: TickerBelly) {
  if (read === 'soft') paint(grid, [[11, 6], [11, 7], [11, 8], [11, 9], [11, 10], [12, 7], [12, 8], [12, 9]], 'hi')
  else if (read === 'cut') paint(grid, [[11, 8], [12, 8]], 'rim')
}

// --- props ---------------------------------------------------------------------------------------
// Cells as [row, col, ink]. Rows above 0 and columns past the base canvas are allowed: the sprite
// grows to hold them. A prop paints over limbs where they overlap (last painter wins); only the
// WEARABLES may paint over the heart. Safe zones, free in every pose: above row 0 (hats), the
// right floor from col 17 (the bowl), the left floor rows 14–15 (the worried clipboard reaches
// row 13), and the right shoulder rows 2–4 cols 17–21 during the walk frames.

type PropCell = [number, number, TickerInk]

const fill = (rows: [number, number], cols: [number, number], ink: TickerInk): PropCell[] =>
  block(rows, cols).map(([r, c]) => [r, c, ink])

// A dish on the floor to the figure's right; the capsules in it are the same 'clip' ink FEED
// lifts to its mouth.
const BOWL: PropCell[] = [[14, 19, 'bowl'], [14, 23, 'bowl'], ...fill([15, 15], [19, 23], 'bowl')]

const PROPS: Record<TickerProp, PropCell[]> = {
  'bowl-empty': BOWL,
  'bowl-full': [...BOWL, [14, 20, 'clip'], [14, 21, 'clip'], [14, 22, 'clip'], [13, 21, 'clip']],
  // Hats sit on the left lobe (one at a time — the page picks); the helmet on the right lobe.
  'party-hat': [[-3, 5, 'glove'], [-2, 4, 'hat'], [-2, 5, 'hat'], ...fill([-1, -1], [3, 6], 'hat')],
  'crown': [[-3, 4, 'glove'], [-2, 2, 'clip'], [-2, 4, 'clip'], [-2, 6, 'clip'], ...fill([-1, -1], [2, 6], 'clip')],
  'cap': [[-2, 4, 'shoe'], [-2, 5, 'shoe'], ...fill([-1, -1], [3, 8], 'shoe')], // the visor points the way it walks
  'helmet': [[-2, 11, 'bowl'], [-2, 12, 'bowl'], ...fill([-1, -1], [10, 13], 'bowl')],
  // Carried for the lap: a bar across the right shoulder, a disc in flight ahead.
  'dumbbell': [...fill([2, 4], [17, 17], 'bowl'), ...fill([2, 4], [21, 21], 'bowl'), ...fill([3, 3], [18, 20], 'limb')],
  'disc': [[4, 22, 'shoe'], ...fill([5, 5], [21, 23], 'shoe')],
  // Wearables: a white band across the brow, black lenses with a bridge, a medal on a ribbon
  // below the mouth, a coat's lapels and hem.
  'sweatband': fill([2, 2], [1, 15], 'glove'),
  'shades': [...fill([4, 6], [3, 6], 'eye'), ...fill([4, 6], [10, 13], 'eye'), [4, 7, 'rim'], [4, 8, 'rim'], [4, 9, 'rim']],
  'medal': [[11, 7, 'line'], [11, 9, 'line'], [12, 7, 'clip'], [12, 8, 'clip'], [12, 9, 'clip'], [13, 8, 'clip']],
  // A gold star stuck on the right cheek — the sticker-chart kind, for a clean week of doses.
  'gold-star': [[4, 14, 'clip'], [5, 13, 'clip'], [5, 14, 'clip'], [5, 15, 'clip'], [6, 14, 'clip']],
  'lab-coat': [[7, 2, 'glove'], [8, 3, 'glove'], [9, 4, 'glove'], [7, 14, 'glove'], [8, 13, 'glove'], [9, 12, 'glove'], [12, 6, 'glove'], [12, 10, 'glove'], [13, 7, 'glove'], [13, 9, 'glove']],
  // A page with a red header, standing on the left floor.
  'calendar': [...fill([14, 14], [-4, -2], 'flag'), ...fill([15, 15], [-4, -2], 'glove'), [15, -3, 'eye']]
}

const WEARABLES = new Set<TickerProp>(['sweatband', 'shades', 'medal', 'gold-star', 'lab-coat'])

export function tickerSprite(pose: TickerPose, figure: TickerFigure = 'full', props: TickerProp[] = [], build: TickerBuild = {}): TickerSprite {
  const grid = body()
  face(grid, pose, figure)
  belly(grid, build.belly ?? 'lean')
  if (figure === 'full' && build.tier !== 'hatchling') {
    limbs(grid, pose)
    if (build.tier === 'elder' && CANE_POSES.has(pose)) cane(grid)
    if (build.arms === 'built') thicken(grid)
  }

  const base = CANVAS[figure]
  const bounds = { rMin: 0, rMax: base.rows - 1, cMin: base.colMin, cMax: base.colMin + base.cols - 1 }
  if (figure === 'full') {
    for (const prop of props) {
      const wearable = WEARABLES.has(prop)
      for (const [r, c, ink] of PROPS[prop]) {
        if (!wearable && inHeart(r, c)) continue
        grid.set(at(r, c), { ink, motion: '' })
        bounds.rMin = Math.min(bounds.rMin, r)
        bounds.rMax = Math.max(bounds.rMax, r)
        bounds.cMin = Math.min(bounds.cMin, c)
        bounds.cMax = Math.max(bounds.cMax, c)
      }
    }
  }

  const cols = bounds.cMax - bounds.cMin + 1
  const rows = bounds.rMax - bounds.rMin + 1
  const cells: TickerCell[] = []
  for (let r = bounds.rMin; r <= bounds.rMax; r++) {
    for (let c = bounds.cMin; c <= bounds.cMax; c++) {
      cells.push(grid.get(at(r, c)) ?? { ink: null, motion: '' })
    }
  }
  return { cols, rows, cells }
}
