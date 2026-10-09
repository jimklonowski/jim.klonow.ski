// The Open Graph card for /ticker: TICKER as it is today — its outfit and tier, asleep after
// bedtime — on the stage's dark ground with its EKG and a few pixel-font lines. Drawn into a
// raster (pixelCanvas.ts) so the Worker can serve it as a PNG with no image library. The card is
// public, so the route hands it the PUBLIC outfit (tickerWardrobe.ts publicWardrobeOf: earned
// wearables and tier only, no mane, no DEXA build) and two figures, its age and the logged streak.
import { createRaster, drawCells, drawLine, drawText, fillRect, hexToRgb, textWidth } from './pixelCanvas.ts'
import type { Raster } from './pixelCanvas.ts'
import { INK_HEX, TOKEN_HEX } from './tickerInks.ts'
import { tickerSprite } from './tickerSprite.ts'
import type { TickerBuild, TickerPose, TickerProp } from './tickerSprite.ts'

export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

export interface TickerCardInput {
  accessories: TickerProp[]
  build: TickerBuild
  /** After bedtime it is drawn asleep (and without its shades). */
  asleep: boolean
  ageDays: number | null
  streak: number
  /** Printed small in the corner — the site's name. */
  site: string
}

/** Sprite cells at 16px with a 2px gap, like the stage at lg, scaled up. */
const PX = 16
const GAP = 2
const FLOOR_Y = 478

export function renderTickerCard(input: TickerCardInput): Raster {
  const r = createRaster(CARD_WIDTH, CARD_HEIGHT, hexToRgb(TOKEN_HEX.bg))
  const pose: TickerPose = input.asleep ? 'asleep' : 'idle'
  const worn = input.asleep ? input.accessories.filter(a => a !== 'shades') : input.accessories

  // The stage: a raised panel with a dashed floor line.
  fillRect(r, 48, 48, CARD_WIDTH - 96, CARD_HEIGHT - 96, hexToRgb(TOKEN_HEX.raised))
  const floor = hexToRgb(TOKEN_HEX.lineAccent)
  for (let x = 72; x < CARD_WIDTH - 72; x += 22) fillRect(r, x, FLOOR_Y, 12, 2, floor)

  // The figure, feet on the floor, left of centre.
  const sprite = tickerSprite(pose, 'full', worn, input.build)
  const pitch = PX + GAP
  const figureX = 110
  drawCells(r, sprite.cells, sprite.cols, figureX, FLOOR_Y - sprite.rows * pitch + GAP, PX, GAP, INK_HEX)

  // Its EKG under the floor: flat, a spike, flat — the companion's idle trace.
  const accent = hexToRgb(TOKEN_HEX.accent)
  const ex = figureX + 8 * pitch
  const ey = FLOOR_Y + 44
  const trace: Array<[number, number]> = [[0, 0], [60, 0], [78, -22], [96, 22], [114, -10], [132, 0], [220, 0]]
  for (let i = 1; i < trace.length; i++) {
    drawLine(r, ex + trace[i - 1]![0], ey + trace[i - 1]![1], ex + trace[i]![0], ey + trace[i]![1], 4, accent)
  }

  // The words, right of the figure.
  const textX = 650
  drawText(r, 'TICKER', textX, 150, 8, hexToRgb(TOKEN_HEX.hi))
  drawText(r, 'RESIDENT COMPANION', textX, 230, 3, hexToRgb(TOKEN_HEX.dim))
  const figures = [
    input.ageDays != null ? `DAY ${input.ageDays.toLocaleString('en-US')}` : null,
    input.streak ? `${input.streak}-DAY STREAK` : null,
    input.asleep ? 'ASLEEP' : null
  ].filter((s): s is string => !!s)
  drawText(r, figures.join(' · '), textX, 300, 3, hexToRgb(TOKEN_HEX.faint))
  const site = input.site.toUpperCase()
  drawText(r, site, CARD_WIDTH - 72 - textWidth(site, 3), CARD_HEIGHT - 72 - 7 * 3, 3, hexToRgb(TOKEN_HEX.ghost))
  return r
}
