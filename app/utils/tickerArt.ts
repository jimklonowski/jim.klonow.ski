import type { TickerInk } from '#shared/utils/tickerSprite'
import { CELL } from '#shared/utils/tickerRunner'

// Pixel art the mini-games share, in the companion's inks and cell pitch: the soda can (the
// runner's obstacle, the crusher's wall) and the lab flag, plus the one way to bake a cell list
// into a canvas so the games draw sprites with the same crisp cells as the companion's CSS grid.

export type Cells = Array<[number, number, TickerInk]>

/** A can is 4×7 with a red band. */
export const CAN: Cells = [
  [0, 1, 'bowl'], [0, 2, 'bowl'],
  [1, 0, 'bowl'], [1, 1, 'glove'], [1, 2, 'bowl'], [1, 3, 'bowl'],
  [2, 0, 'bowl'], [2, 1, 'flag'], [2, 2, 'flag'], [2, 3, 'bowl'],
  [3, 0, 'bowl'], [3, 1, 'flag'], [3, 2, 'flag'], [3, 3, 'bowl'],
  [4, 0, 'bowl'], [4, 1, 'glove'], [4, 2, 'bowl'], [4, 3, 'bowl'],
  [5, 0, 'bowl'], [5, 1, 'bowl'], [5, 2, 'bowl'], [5, 3, 'bowl'],
  [6, 1, 'bowl'], [6, 2, 'bowl']
]

/** The same can with a couple of dents, then crumpled: the crusher's two-hit and three-hit cans on their way down. */
export const CAN_DENTED: Cells = CAN.map(([r, c, ink]) => ((r === 3 && c === 0) || (r === 4 && c === 3) || (r === 1 && c === 3) ? [r, c, 'line'] : [r, c, ink]))
export const CAN_CRUMPLED: Cells = CAN
  .filter(([r]) => r > 0)
  .map(([r, c, ink]) => ((r === 2 && c === 0) || (r === 3 && c === 3) || (r === 4 && c === 0) || (r === 5 && c === 2) || (r === 1 && c === 1) ? [r, c, 'line'] : [r, c, ink]))

/** A flag is a pole with a pennant, 5×5. */
export const FLAG: Cells = [
  [0, 0, 'line'], [1, 0, 'line'], [2, 0, 'line'], [3, 0, 'line'], [4, 0, 'line'],
  [0, 1, 'flag'], [0, 2, 'flag'], [0, 3, 'flag'], [0, 4, 'flag'],
  [1, 1, 'flag'], [1, 2, 'flag'], [1, 3, 'flag'],
  [2, 1, 'flag'], [2, 2, 'flag']
]

/** `n` cans in a row, a cell apart. */
export const cansRow = (n: number): Cells => Array.from({ length: n }, (_, i) => CAN.map(([r, c, ink]) => [r, c + i * 5, ink] as [number, number, TickerInk])).flat()

/**
 * A cell list to a 1× canvas; the game's context scales it with smoothing off, so pixels stay
 * pixels. The runner and the crusher draw at the companion's md pitch (4px cells with a 1px gap);
 * the world draws its figure smaller, at 3px cells with no gap.
 */
export function renderCells(cells: Cells, cols: number, rows: number, inks: Record<TickerInk, string>, px = CELL, gap = 1): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = cols * px
  c.height = rows * px
  const g = c.getContext('2d')!
  for (const [r, col, ink] of cells) {
    g.fillStyle = inks[ink]
    g.fillRect(col * px, r * px, px - gap, px - gap)
  }
  return c
}
