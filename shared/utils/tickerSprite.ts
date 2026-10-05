// TICKER's sprites (design canvas, 2026-09-28): the heart on a 17×15 grid with brows, a mouth and
// cheeks. The 'full' figure (direction C, "rubber-hose") adds gloves, sneakers and a prop per pose
// on a 28×16 canvas; the 'face' figure (direction A, "hi-bit") is the heart alone, for tight spots.
// Pure data: the component turns each cell's ink into a colour.

// The last four are the /ticker pet page's: eating (FEED replays the day's doses), the two
// walk-cycle frames the page alternates while it trots, and the blissful petted face.
export const TICKER_POSES = ['idle', 'thinking', 'talking', 'happy', 'worried', 'sleepy', 'flatline', 'eating', 'walk1', 'walk2', 'petted'] as const
export type TickerPose = typeof TICKER_POSES[number]

export type TickerInk
  = 'rim' | 'red' | 'shade' | 'hi' | 'spec' | 'eye' | 'glint' | 'blush' | 'tongue' | 'drop'
    | 'limb' | 'glove' | 'shoe' | 'clip' | 'line' | 'flag' | 'mug' | 'coffee'

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
    default: // waving hello
      paint(grid, [[7, 0], [8, -1], [9, -1], [10, -1]], 'limb')
      paint(grid, [[11, -2], [11, -1]], 'glove')
      paint(grid, [[6, 17], [5, 18], [4, 18], [3, 18]], 'limb')
      paint(grid, block([1, 2], [18, 19]), 'glove')
      paint(grid, [[1, 21], [3, 21]], 'line', 'flicker')
      legs(grid, false)
  }
}

export function tickerSprite(pose: TickerPose, figure: TickerFigure = 'full'): TickerSprite {
  const grid = body()
  face(grid, pose, figure)
  if (figure === 'full') limbs(grid, pose)
  const { colMin, cols, rows } = CANVAS[figure]
  const cells: TickerCell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = colMin; c < colMin + cols; c++) {
      cells.push(grid.get(at(r, c)) ?? { ink: null, motion: '' })
    }
  }
  return { cols, rows, cells }
}
