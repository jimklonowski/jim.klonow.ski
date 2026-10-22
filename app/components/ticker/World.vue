<template>
  <div class="absolute inset-0">
    <canvas
      ref="canvas"
      class="block w-full h-full outline-none touch-none select-none"
      tabindex="0"
      role="img"
      :aria-label="`TICKER World. ${announce}`"
      @pointerdown.prevent="onTap"
    />
    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ announce }}
    </p>
    <!-- On-stage pads for touch: a d-pad (◀ ▶) on the left, jump (and the throw, with the
         shaker) on the right. Held, not tapped. They sit above the page's remark line and over
         the figure's start, where thumbs rest; translucent so the ground still reads through.
         Each finger is tracked from touch-down to lift and mapped to whichever pad it's over
         now, so a thumb rocks ◀ to ▶ without lifting and a drift off the edge doesn't drop
         the run. Plain divs, not buttons, and touchstart is cancelled: iOS otherwise reads a
         long press as one on the text underneath and selects it. -->
    <div
      v-if="touch"
      class="pads absolute inset-x-0 bottom-11 flex items-end justify-between px-3 pointer-events-none"
      aria-hidden="true"
    >
      <div
        ref="dpad"
        class="flex gap-2 pointer-events-auto"
        @touchstart.prevent
        @pointerdown="padDown"
        @pointermove="padMove"
        @pointerup="padUp"
        @pointercancel="padUp"
        @lostpointercapture="padUp"
      >
        <div
          class="pad"
          :class="{ on: padsOn.left }"
        >
          ◀
        </div>
        <div
          class="pad"
          :class="{ on: padsOn.right }"
        >
          ▶
        </div>
      </div>
      <div
        class="flex gap-2 pointer-events-auto"
        @touchstart.prevent
        @pointerdown="padDown"
        @pointermove="padMove"
        @pointerup="padUp"
        @pointercancel="padUp"
        @lostpointercapture="padUp"
      >
        <div
          v-if="hasShaker"
          data-zone="fire"
          class="pad"
          :class="{ on: padsOn.fire }"
        >
          ●
        </div>
        <div
          data-zone="jump"
          class="pad"
          :class="{ on: padsOn.jump }"
        >
          ▲
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// TICKER World on a canvas, over the /ticker stage. The level comes from
// shared/utils/tickerWorld.ts (buildLevel from the month's days, stepWorld with the player's
// input); this file draws it, keeps time and feeds it input, the way Runner.vue and Breakout.vue
// do for theirs. The figure is the companion's sprite at 3px cells; the tiles are TUI blocks in
// the theme's colours; each day is labelled at the top of the playfield, so the level reads as
// the calendar it is.
//
// Session one: ground, hills, pits, platforms, capsules, week flags, the castle. Session two:
// the soda cans and the germs on patrol (the can art is the crusher's; a germ is a hopping blob
// in the accent ink), the hatchling the figure shrinks to on a hit (the same sprite at 2px
// cells, flickering while it's untouchable), the dented can sliding as a shell, and the scores
// that float up where they were earned. Session three: walls of cans (the same art, stacked
// in their tiles), needles as little syringes flying left, sliding platforms, "zz" on a short
// night's day tick, and the question mark that rises out of a pit. Session four: what the
// blocks let out (the plate, the shaker, the star, the tiny heart — the face sprite at 1px),
// the scoops the shaker throws (X, F or Shift; a fourth pad on touch while it's held), the
// figure cycling its hues under a star, hidden blocks that aren't drawn until found, and the
// block's line in the HUD. Session five, the feel: a squash on every stomp, a flash and a
// small shake on a hit (the big one stays for a lost life), a title card as each week begins,
// far hills at a third of the camera, a tick on a day whose capsules are all taken, and the
// month's feats and figures handed to the page with the score.
import { tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerBuild, TickerInk, TickerProp } from '#shared/utils/tickerSprite'
import {
  BASE_ROW, DAY_TILES, GROUND, PLATFORM, REVEAL_SECONDS, ROWS, STACK, START_TILES, TILE,
  autoRun, createWorld, dayAt, isShortSleep, isStarred, levelWidth, popperBox, startWorld, stepWorld, tileAt, worldFeats, worldPose, worldSummary
} from '#shared/utils/tickerWorld'
import type { DayInput, Enemy, Item, PlayerSize, WorldFeat, WorldInput, WorldState, WorldSummary } from '#shared/utils/tickerWorld'
import { CAN, CAN_CRUMPLED, CAN_DENTED, FLAG, renderCells } from '~/utils/tickerArt'
import type { Cells } from '~/utils/tickerArt'

const props = defineProps<{
  build: TickerBuild
  accessories: TickerProp[]
  night: boolean
  /** The high score to show beside the live one; the page owns it and updates it on `over`. */
  hi: number
  /** The month, oldest first; the castle is the last day. */
  days: DayInput[]
  /** Seeds where the platforms sit, so everyone plays the same month on a day. */
  seed: number
  lives: number
}>()

const emit = defineEmits<{
  /** The game ended with this score; `cleared` when the castle was reached; the feats it earned and its figures. */
  over: [score: number, cleared: boolean, feats: WorldFeat[], summary: WorldSummary]
  /** The player left (Escape or the page's QUIT); the score is the last game's. */
  quit: [score: number]
  /** The stage height the playfield needs, in px. */
  fit: [height: number]
}>()

const canvas = ref<HTMLCanvasElement | null>(null)
const announce = ref('press space or tap to start; arrows run, space jumps; escape quits')
/** Coarse pointer: show the on-stage buttons. */
const touch = ref(false)
/** Holding the shaker: the throw pad is up. */
const hasShaker = ref(false)
/** The left cluster, whose halves are ◀ and ▶. */
const dpad = ref<HTMLElement | null>(null)
/** Which pads a finger is on right now, for their lit state. */
const padsOn = reactive({ left: false, right: false, jump: false, fire: false })

/** The figure's cell size here: smaller than the companion's md, so it fits a two-tile gap. */
const PX = 3
/** The hatchling's: the same sprite, two thirds the size. */
const PX_SMALL = 2
const POSES = ['idle', 'walk1', 'walk2', 'happy', 'petted', 'flatline', 'worried'] as const
const POP_SECONDS = 0.9
/** Space above the playfield for the HUD. */
const HUD_H = 36
const RESTART_LOCKOUT = 0.6
const SHAKE_SECONDS = 0.3
const HURT_SHAKE_SECONDS = 0.15
const SQUASH_SECONDS = 0.12
const FLASH_SECONDS = 0.1
const CARD_SECONDS = 1.8
const PAD = (n: number) => String(Math.min(99999, n)).padStart(5, '0')
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

const dayLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]

// --- state that is not reactive on purpose (touched every frame) ------------------------------

let ctx: CanvasRenderingContext2D | null = null
let W = 0
let H = 0
let state: WorldState | null = null
let raf = 0
let last = 0
let now = 0
let paused = false
let reducedMotion = false
let reportedEnd = false
let endedAt = -1
let lostAt = -1
let livesSeen = 0
let sizeSeen: PlayerSize = 'grown'
let bestAt = -1
let bestShown = false
let inks: Record<TickerInk, string>
let font = 'monospace'
let colors = { ground: '#333', fill: '#111', text: '#888', faint: '#666', star: '#444', accent: '#4c6', life: '#c33', platform: '#6f8aa0', raised: '#101410', warn: '#e8b34b' }
/** `${size}:${pose}` → the baked sprite and where its feet are (the hatchling has no legs, so its bottom inked row sits above the canvas edge). */
const sprites = new Map<string, { image: HTMLCanvasElement, bottom: number }>()
let flagArt: HTMLCanvasElement | null = null
let heartArt: HTMLCanvasElement | null = null
type CanArt = { walk: HTMLCanvasElement, shell: HTMLCanvasElement, crushed: HTMLCanvasElement }
let canArt: Record<'can' | 'tall', CanArt> | null = null
const held = { left: false, right: false, jump: false }
let jumpPressed = false
let firePressed = false
let powerSeen: WorldState['power'] = 'none'
let starSeen = false
let comboSeen = 0
let stompAt = -1
let hurtSeen = -1
let hurtShakeAt = -1
let weekSeen = -1
let cardAt = -1
let cardText = ''
let ro: ResizeObserver | undefined
let stopTheme: (() => void) | undefined

function prepare() {
  inks = resolveInks()
  colors = {
    ground: themeColor('--color-line-accent'),
    fill: themeColor('--color-inset'),
    text: themeColor('--color-dim'),
    faint: themeColor('--color-faint'),
    star: themeColor('--color-ghost'),
    accent: themeColor('--color-accent'),
    life: themeColor('--color-danger'),
    platform: inks.bowl,
    raised: themeColor('--color-raised'),
    warn: themeColor('--color-warn')
  }
  font = canvas.value ? getComputedStyle(canvas.value).fontFamily : font
  sprites.clear()
  for (const size of ['grown', 'hatchling'] as const) {
    const px = size === 'grown' ? PX : PX_SMALL
    const build: TickerBuild = size === 'grown' ? props.build : { ...props.build, tier: 'hatchling' }
    for (const pose of POSES) {
      const worn = pose === 'flatline' ? props.accessories.filter(a => a !== 'shades') : props.accessories
      const s = tickerSprite(pose, 'full', worn, build)
      const cells: Cells = []
      let bottom = 0
      s.cells.forEach((cell, i) => {
        if (!cell.ink) return
        const r = Math.floor(i / s.cols)
        cells.push([r, i % s.cols, cell.ink])
        bottom = Math.max(bottom, r + 1)
      })
      sprites.set(`${size}:${pose}`, { image: renderCells(cells, s.cols, s.rows, inks, px, 0), bottom: bottom * px })
    }
  }
  flagArt = renderCells(FLAG, 5, 5, inks, 4, 1)
  {
    // The extra life: the heart's face at 1px cells, 17×15.
    const face = tickerSprite('idle', 'face')
    const cells: Cells = []
    face.cells.forEach((cell, i) => {
      if (cell.ink) cells.push([Math.floor(i / face.cols), i % face.cols, cell.ink])
    })
    heartArt = renderCells(cells, face.cols, face.rows, inks, 1, 0)
  }
  const can = (px: number): CanArt => ({
    walk: renderCells(CAN, 4, 7, inks, px, 0),
    shell: renderCells(CAN_DENTED, 4, 7, inks, px, 0),
    crushed: renderCells(CAN_CRUMPLED, 4, 7, inks, px, 0)
  })
  canArt = { can: can(3), tall: can(4) }
}

function fresh(): WorldState {
  return createWorld({ days: props.days, width: W, height: ROWS * TILE, seed: props.seed, lives: props.lives })
}

function resize() {
  const el = canvas.value
  const host = el?.parentElement
  if (!el || !host) return
  const dpr = window.devicePixelRatio || 1
  W = host.clientWidth
  H = host.clientHeight
  el.width = Math.round(W * dpr)
  el.height = Math.round(H * dpr)
  ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  if (!state) {
    state = fresh()
    livesSeen = state.lives
  }
  else {
    state.width = W
  }
}

// --- drawing ----------------------------------------------------------------------------------

function draw() {
  if (!ctx || !state) return
  const g = ctx
  const s = state
  g.setTransform(g.getTransform().a, 0, 0, g.getTransform().d, 0, 0)
  g.clearRect(0, 0, W, H)

  // A lost life shakes hard; a hit, a little.
  if (!reducedMotion) {
    const k = lostAt >= 0 && now - lostAt < SHAKE_SECONDS
      ? 5 * (1 - (now - lostAt) / SHAKE_SECONDS)
      : hurtShakeAt >= 0 && now - hurtShakeAt < HURT_SHAKE_SECONDS ? 3 * (1 - (now - hurtShakeAt) / HURT_SHAKE_SECONDS) : 0
    if (k > 0) g.translate(Math.round((Math.random() - 0.5) * 2 * k), Math.round((Math.random() - 0.5) * 2 * k))
  }

  const top = H - ROWS * TILE
  const cam = Math.round(s.camera)
  const level = s.level

  // Far hills at a third of the camera: each hump's size comes from its number, so the range
  // never changes shape as it drifts.
  {
    const base = top + BASE_ROW * TILE
    const step = 180
    const off = cam * 0.3
    g.fillStyle = colors.fill
    g.globalAlpha = 0.8
    for (let i = Math.floor(off / step) - 1; i <= Math.floor((off + W) / step) + 1; i++) {
      const w = 140 + ((((i * 104729) % 4) + 4) % 4) * 20
      const h = 22 + ((((i * 7919) % 5) + 5) % 5) * 9
      const x = i * step - off
      g.beginPath()
      g.ellipse(x + w / 2, base, w / 2, h, 0, Math.PI, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }

  // Stars drift at a tenth of the camera: the far distance.
  if (props.night) {
    for (const [i, [x, y]] of ([[0.12, 22], [0.31, 48], [0.57, 30], [0.78, 56], [0.91, 24], [0.45, 70], [0.68, 40]] as const).entries()) {
      g.globalAlpha = reducedMotion ? 0.8 : 0.45 + 0.4 * Math.sin(now * 1.3 + i * 1.7)
      g.fillStyle = colors.star
      g.fillRect((((Math.round(W * x) - cam * 0.1) % W) + W) % W, top + y, 2, 2)
    }
    g.globalAlpha = 1
  }

  // The day ticks along the top of the playfield: a faint rule and the date at each day's start.
  g.font = `9px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'left'
  const firstCol = Math.max(0, Math.floor(cam / TILE) - 1)
  const lastCol = Math.min(level.cols - 1, Math.ceil((cam + W) / TILE) + 1)
  for (let i = 0; i < level.days.length; i++) {
    const col = START_TILES + i * DAY_TILES
    if (col < firstCol - DAY_TILES || col > lastCol) continue
    const x = col * TILE - cam
    g.fillStyle = colors.faint
    g.globalAlpha = 0.5
    g.fillRect(x, top, 1, 8)
    g.globalAlpha = 1
    const d = level.days[i]!
    // A day whose capsules are all taken gets its tick.
    const caps = level.capsules.filter(c => c.day === i)
    const done = caps.length > 0 && caps.every(c => c.taken)
    if (done) g.fillStyle = colors.accent
    g.fillText(`${dayLabel(d.date)} · ${weekdayOf(d.date)}${isShortSleep(d) ? ' · zz' : ''}${done ? ' ✓' : ''}`, x + 4, top + 2)
  }

  // Tiles: ground as filled blocks with a bright top edge, platforms as thin bars, a wall of
  // cans as the can in each of its tiles.
  for (let c = firstCol; c <= lastCol; c++) {
    for (let r = 0; r < ROWS; r++) {
      const t = tileAt(level, c, r)
      if (t === GROUND) {
        const x = c * TILE - cam
        const y = top + r * TILE
        g.fillStyle = colors.fill
        g.fillRect(x, y, TILE, TILE)
        g.fillStyle = colors.ground
        if (tileAt(level, c, r - 1) !== GROUND) g.fillRect(x, y, TILE, 2)
        g.globalAlpha = 0.35
        g.fillRect(x + TILE - 1, y, 1, TILE)
        g.globalAlpha = 1
      }
      else if (t === PLATFORM) {
        g.fillStyle = colors.platform
        g.fillRect(c * TILE - cam, top + r * TILE + 2, TILE, 5)
      }
      else if (t === STACK && canArt) {
        g.drawImage(canArt.can.walk, c * TILE - cam + 6, top + r * TILE + 3)
      }
    }
  }

  // Sliding platforms.
  for (const m of level.movers) {
    const x = Math.round(m.x - cam)
    if (x + m.w < -20 || x > W + 20) continue
    g.fillStyle = colors.platform
    g.fillRect(x, top + m.y + 2, m.w, 5)
  }

  // Poppers: the question mark out of a pit, on its stalk.
  for (const pp of level.poppers) {
    const box = popperBox(pp, s.elapsed)
    if (!box) continue
    const x = Math.round(pp.x - cam)
    if (x < -30 || x > W + 30) continue
    g.fillStyle = colors.faint
    g.fillRect(x - 2, top + box.y + 10, 4, box.h - 10)
    g.fillStyle = colors.raised
    g.fillRect(x - 9, top + box.y, 18, 16)
    g.strokeStyle = colors.warn
    g.lineWidth = 1
    g.strokeRect(x - 8.5, top + box.y + 0.5, 17, 15)
    g.fillStyle = colors.warn
    g.font = `bold 12px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('?', x, top + box.y + 9)
    g.textBaseline = 'top'
    g.textAlign = 'left'
  }

  // Capsules: a two-tone pill, bobbing a little.
  for (const cap of level.capsules) {
    if (cap.taken) continue
    const x = Math.round(cap.x - cam)
    if (x < -20 || x > W + 20) continue
    const bob = reducedMotion ? 0 : Math.round(Math.sin(now * 3 + cap.x * 0.05) * 2)
    const y = top + Math.round(cap.y) + bob
    g.fillStyle = inks.glove
    g.fillRect(x - 4, y - 7, 8, 7)
    g.fillStyle = inks.red
    g.fillRect(x - 4, y, 8, 7)
    g.fillStyle = inks.spec
    g.fillRect(x - 3, y - 6, 2, 2)
  }

  // Week flags, with their world label.
  for (const f of level.flags) {
    const x = Math.round(f.x - cam)
    if (x < -40 || x > W + 40) continue
    const ground = groundY(s, f.x)
    g.fillStyle = colors.faint
    g.fillRect(x, top + ground - 64, 2, 64)
    if (flagArt) g.drawImage(flagArt, x + 2, top + ground - 64)
    g.fillStyle = f.week <= s.checkpointWeek ? colors.accent : colors.faint
    g.font = `10px ${font}`
    g.textAlign = 'center'
    g.fillText(`1-${f.week + 1}`, x + 1, top + ground - 78)
  }

  // Question blocks: lit until they're hit; a hidden one isn't there until a head finds it.
  for (const b of level.blocks) {
    if (b.hidden && !b.hit) continue
    const x = Math.round(b.x - cam)
    if (x < -30 || x > W + 30) continue
    const y = top + b.y
    g.fillStyle = b.hit ? colors.fill : colors.raised
    g.fillRect(x, y, TILE, TILE)
    g.strokeStyle = b.hit ? colors.faint : colors.warn
    g.lineWidth = 1
    g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1)
    g.fillStyle = b.hit ? colors.faint : colors.warn
    g.font = `bold 13px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('?', x + TILE / 2, y + TILE / 2 + 1)
    g.textBaseline = 'top'
  }

  // The castle: a house with a door and a roof, on the ground at the end.
  {
    const x = Math.round(level.castleX - cam)
    if (x > -120 && x < W + 40) {
      const ground = groundY(s, level.castleX)
      const w = TILE * 3
      const h = TILE * 3
      const y = top + ground - h
      g.fillStyle = colors.raised
      g.fillRect(x, y, w, h)
      g.strokeStyle = colors.ground
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
      g.fillStyle = colors.ground
      g.beginPath()
      g.moveTo(x - 6, y)
      g.lineTo(x + w / 2, y - 22)
      g.lineTo(x + w + 6, y)
      g.closePath()
      g.fill()
      g.fillStyle = colors.fill
      g.fillRect(x + w / 2 - 8, y + h - 26, 16, 26)
      g.fillStyle = colors.accent
      g.fillRect(x + w / 2 + 3, y + h - 14, 2, 2)
      g.fillStyle = colors.faint
      g.font = `9px ${font}`
      g.textAlign = 'center'
      g.fillText('HOME', x + w / 2, y - 34)
    }
  }

  // What the blocks let out, and the scoops.
  for (const it of level.items) {
    if (it.taken || it.gone) continue
    const x = Math.round(it.x - cam)
    if (x < -30 || x > W + 30) continue
    drawItem(g, it, x, top + Math.round(it.y))
  }
  for (const sc of level.scoops) {
    if (!sc.alive) continue
    const x = Math.round(sc.x - cam)
    if (x < -10 || x > W + 10) continue
    g.fillStyle = inks.glove
    g.fillRect(x, top + Math.round(sc.y), 6, 6)
    g.fillStyle = inks.spec
    g.fillRect(x + 1, top + Math.round(sc.y) + 1, 2, 2)
  }

  // The enemies: cans in the crusher's art (dented as a shell, crumpled and flattened once
  // crushed, spinning while a shell slides), germs as hopping blobs.
  for (const e of level.enemies) {
    if (e.mode === 'gone') continue
    const x = Math.round(e.x - cam)
    if (x < -40 || x > W + 40) continue
    const y = top + Math.round(e.y)
    if (e.kind === 'germ') {
      drawGerm(g, e, x, y)
      continue
    }
    if (e.kind === 'needle') {
      drawNeedle(g, e, x, y)
      continue
    }
    const art = canArt?.[e.kind]
    if (!art) continue
    if (e.mode === 'crushed') {
      const h = Math.round(art.crushed.height * 0.45)
      g.drawImage(art.crushed, x, y + e.h - h, art.crushed.width, h)
    }
    else {
      const img = e.mode === 'shell' ? art.shell : art.walk
      const spin = e.mode === 'shell' && e.vx !== 0 && !reducedMotion && Math.floor(now * 12) % 2 === 1
      if (spin) {
        g.save()
        g.translate(x + img.width, y)
        g.scale(-1, 1)
        g.drawImage(img, 0, 0)
        g.restore()
      }
      else {
        g.drawImage(img, x, y)
      }
    }
  }

  // The figure: grown at 3px cells, the hatchling at 2px, flickering while it's untouchable.
  const sprite = sprites.get(`${s.size}:${worldPose(s)}`)
  if (sprite) {
    const p = s.player
    const x = Math.round(p.x - cam + (p.w - sprite.image.width) / 2)
    const y = top + Math.round(p.y + p.h - sprite.bottom)
    const hurt = s.status === 'running' && s.elapsed < s.hurtUntil
    const starred = s.status === 'running' && isStarred(s)
    if (hurt) g.globalAlpha = reducedMotion ? 0.55 : Math.floor(now * 14) % 2 ? 0.3 : 1
    // Under a star the inks cycle round the wheel (still motion gets one fixed turn); a hit
    // flashes white for a frame or two.
    const filters: string[] = []
    if (starred) filters.push(`hue-rotate(${reducedMotion ? 120 : Math.round((now * 540) % 360)}deg)`)
    if (s.hurtAt >= 0 && s.elapsed - s.hurtAt < FLASH_SECONDS) filters.push('brightness(2.5)')
    if (filters.length) g.filter = filters.join(' ')
    // A stomp squashes the figure for a moment, around its feet.
    const squash = !reducedMotion && stompAt >= 0 && now - stompAt < SQUASH_SECONDS
    if (squash) {
      const cx = x + sprite.image.width / 2
      const feet = y + sprite.bottom
      g.save()
      g.translate(cx, feet)
      g.scale(1.2, 0.78)
      g.translate(-cx, -feet)
    }
    if (p.facing < 0) {
      g.save()
      g.translate(x + sprite.image.width, y)
      g.scale(-1, 1)
      g.drawImage(sprite.image, 0, 0)
      g.restore()
    }
    else {
      g.drawImage(sprite.image, x, y)
    }
    if (squash) g.restore()
    g.filter = 'none'
    g.globalAlpha = 1
  }

  // Scores float up from where they were earned.
  g.font = `bold 10px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'bottom'
  for (const pp of s.pops) {
    const age = s.elapsed - pp.at
    if (age < 0 || age > POP_SECONDS) continue
    const x = Math.round(pp.x - cam)
    if (x < -30 || x > W + 30) continue
    g.globalAlpha = Math.max(0, 1 - age / POP_SECONDS)
    g.fillStyle = pp.text === '1UP' ? colors.warn : colors.accent
    g.fillText(pp.text, x, top + Math.round(pp.y - 4 - (reducedMotion ? 0 : age * 28)))
  }
  g.globalAlpha = 1
  g.textBaseline = 'top'

  // HUD: the day on the left, the scores and lives on the right.
  g.font = `11px ${font}`
  g.textBaseline = 'top'
  g.textAlign = 'left'
  g.fillStyle = colors.faint
  const d = dayAt(s)
  const dayText = d >= 0 ? `1-${Math.floor(d / 7) + 1}  ${dayLabel(level.days[d]!.date)} · ${weekdayOf(level.days[d]!.date)}` : d < 0 && s.player.x >= level.castleX - TILE * 2 ? 'HOME' : `1-1  ${dayLabel(level.days[0]!.date)}`
  g.fillText(dayText, 12, 10)
  // The second line: the tally — or, for a few seconds after a block is bumped, what it said.
  const reveal = s.reveal && s.status === 'running' && s.elapsed - s.reveal.at < REVEAL_SECONDS ? s.reveal : null
  if (reveal) {
    const age = s.elapsed - reveal.at
    g.globalAlpha = age > REVEAL_SECONDS - 0.6 ? Math.max(0.2, (REVEAL_SECONDS - age) / 0.6) : 1
    g.fillStyle = colors.warn
    g.fillText(`? ${reveal.text}`, 12, 24)
    g.globalAlpha = 1
  }
  else {
    g.fillStyle = colors.accent
    g.fillText(`${s.collected}/${level.capsules.length} capsules${s.crushed ? ` · ${s.crushed} crushed` : ''}${s.power === 'shaker' ? (touch.value ? ' · shaker' : ' · shaker (x throws)') : ''}`, 12, 24)
  }
  g.textAlign = 'right'
  g.fillStyle = colors.faint
  g.fillText(`HI ${PAD(props.hi)}  ${PAD(s.score)}`, W - 12, 10)
  for (let i = 0; i < s.lives; i++) {
    g.fillStyle = colors.life
    g.fillRect(W - 18 - i * 10, 27, 6, 6)
  }
  // The shaker in hand: a little bottle beside the lives.
  if (s.power === 'shaker') {
    const x = W - 22 - s.lives * 10 - 8
    g.fillStyle = inks.bowl
    g.fillRect(x, 26, 5, 8)
    g.fillStyle = inks.line
    g.fillRect(x + 1, 23, 3, 3)
  }
  if (bestAt >= 0 && now - bestAt < 1.6 && s.status === 'running') {
    g.fillStyle = colors.accent
    g.fillText('NEW BEST', W - 12, 40)
  }

  // The week's title card, as it begins.
  if (cardAt >= 0 && now - cardAt < CARD_SECONDS && s.status === 'running') {
    const age = now - cardAt
    g.globalAlpha = reducedMotion ? 1 : age < 0.2 ? age / 0.2 : age > CARD_SECONDS - 0.4 ? Math.max(0, (CARD_SECONDS - age) / 0.4) : 1
    g.fillStyle = colors.text
    g.font = `bold 15px ${font}`
    g.textAlign = 'center'
    g.textBaseline = 'top'
    g.fillText(cardText, W / 2, top + 60)
    g.fillStyle = colors.faint
    g.fillRect(W / 2 - 56, top + 82, 112, 1)
    g.globalAlpha = 1
  }

  // Prompts, centred on the stage.
  g.textAlign = 'center'
  const promptY = top + 90
  const pulse = reducedMotion ? 1 : 0.65 + 0.35 * Math.sin(now * 3)
  const first = level.days[0]?.date
  const lastDay = level.days.at(-1)?.date
  if (s.status === 'ready') {
    const cans = level.enemies.filter(e => e.kind !== 'germ').length
    g.fillStyle = colors.faint
    g.fillText(`${first ? dayLabel(first) : ''} – ${lastDay ? dayLabel(lastDay) : ''} · ${level.days.length} DAYS · ${level.capsules.length} CAPSULES${cans ? ` · ${cans} CAN${cans === 1 ? '' : 'S'}` : ''}`, W / 2, promptY - 18)
    g.globalAlpha = pulse
    g.fillStyle = colors.text
    g.fillText('space · tap to start', W / 2, promptY + 4)
    g.globalAlpha = 1
    g.fillStyle = colors.faint
    g.fillText(touch.value ? '◀ ▶ run · ▲ jump (hold for height) · esc quits' : '← → run · space jumps (hold for height) · esc quits', W / 2, promptY + 20)
    g.fillText(W < 520 ? 'stomp the cans · a side touch shrinks you' : 'land on a can to crush it · a touch from the side shrinks you', W / 2, promptY + 34)
  }
  else if (s.status === 'over' || s.status === 'cleared') {
    g.fillStyle = s.status === 'cleared' ? colors.accent : colors.text
    const best = s.score > 0 && s.score >= props.hi ? ' · NEW BEST' : ''
    g.fillText(s.status === 'cleared' ? `MADE IT HOME · ${s.score}${best}` : `GAME OVER · ${s.score}${best}`, W / 2, promptY)
    if (now - endedAt >= RESTART_LOCKOUT) {
      g.fillStyle = colors.faint
      g.fillText('space · tap for another go   esc quits', W / 2, promptY + 16)
    }
  }
}

/** A germ: a stepped blob in the accent ink, stretched mid-hop, flattened when crushed, with two eyes looking where it walks. */
function drawGerm(g: CanvasRenderingContext2D, e: Enemy, x: number, y: number) {
  const crushed = e.mode === 'crushed'
  const h = crushed ? e.h * 0.3 : e.onGround ? e.h : e.h * 1.15
  const w = crushed ? e.w * 1.3 : e.onGround ? e.w : e.w * 0.9
  const cx = x + e.w / 2
  const bottom = y + e.h
  const widths = [0.5, 0.8, 1, 1, 0.8, 0.55]
  const rowH = h / widths.length
  g.fillStyle = colors.accent
  g.globalAlpha = crushed ? 0.5 : 0.85
  widths.forEach((k, i) => {
    const rw = Math.round(w * k)
    g.fillRect(Math.round(cx - rw / 2), Math.round(bottom - h + i * rowH), rw, Math.ceil(rowH))
  })
  g.globalAlpha = 1
  if (crushed) return
  g.fillStyle = colors.fill
  const look = e.dir > 0 ? 2 : -2
  g.fillRect(Math.round(cx - 5 + look), Math.round(bottom - h * 0.62), 2, 3)
  g.fillRect(Math.round(cx + 3 + look), Math.round(bottom - h * 0.62), 2, 3)
}

/** What a block let out: a plate with something on it, the shaker bottle, a star, the tiny heart. */
function drawItem(g: CanvasRenderingContext2D, it: Item, x: number, y: number) {
  if (it.kind === 'plate') {
    g.fillStyle = inks.glove
    g.fillRect(x, y + it.h - 4, it.w, 3)
    g.fillRect(x + 2, y + it.h - 1, it.w - 4, 1)
    g.fillStyle = inks.red
    g.fillRect(x + 4, y + 2, 5, 4)
    g.fillStyle = colors.accent
    g.fillRect(x + 11, y + 1, 5, 5)
    return
  }
  if (it.kind === 'shaker') {
    g.fillStyle = inks.bowl
    g.fillRect(x + 1, y + 6, it.w - 2, it.h - 6)
    g.fillStyle = inks.glove
    g.fillRect(x + 3, y + 10, it.w - 6, it.h - 12)
    g.fillStyle = inks.line
    g.fillRect(x + 3, y, it.w - 6, 6)
    g.fillRect(x + 5, y - 2, it.w - 10, 2)
    return
  }
  if (it.kind === 'star') {
    const pulse = reducedMotion ? 1 : 0.8 + 0.2 * Math.sin(now * 10)
    const cx = x + it.w / 2
    const cy = y + it.h / 2
    g.fillStyle = colors.accent
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 4 : 9) * pulse
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    }
    g.closePath()
    g.fill()
    return
  }
  if (heartArt) g.drawImage(heartArt, x, y)
}

/** A needle: a little syringe flying left — barrel, plunger at the back, the needle in front; bent flat once stomped. */
function drawNeedle(g: CanvasRenderingContext2D, e: Enemy, x: number, y: number) {
  const mid = y + e.h / 2
  if (e.mode === 'crushed') {
    g.fillStyle = colors.faint
    g.fillRect(x + 4, y + e.h - 3, e.w - 8, 2)
    return
  }
  g.fillStyle = colors.text
  g.fillRect(x + 8, y + 1, 14, e.h - 2) // barrel
  g.fillStyle = colors.faint
  g.fillRect(x + 22, mid - 2, 5, 4) // plunger
  g.fillRect(x + 25, y, 3, e.h)
  g.fillStyle = inks.line
  g.fillRect(x, mid - 1, 8, 2) // the needle
  g.fillStyle = inks.red
  g.fillRect(x + 10, y + 3, 4, e.h - 6) // what's in it
}

/** The ground's y (playfield px) under a level x, for standing things on it. */
function groundY(s: WorldState, x: number): number {
  const col = Math.floor(x / TILE)
  for (let r = 0; r < ROWS; r++) if (tileAt(s.level, col, r) === GROUND) return r * TILE
  return ROWS * TILE
}

// --- time and input ---------------------------------------------------------------------------

function frame(ts: number) {
  const dt = (ts - last) / 1000
  last = ts
  now = ts / 1000
  const s = state
  if (s && !paused) {
    const input: WorldInput = { left: held.left, right: held.right, jump: jumpPressed, jumpHeld: held.jump, fire: firePressed }
    jumpPressed = false
    firePressed = false
    const wasLive = s.status === 'running'
    stepWorld(s, dt, input)
    hasShaker.value = s.power === 'shaker'
    if (s.power !== powerSeen) {
      powerSeen = s.power
      if (s.status === 'running') announce.value = s.power === 'shaker' ? 'got the shaker. x throws' : 'lost the shaker'
    }
    const starred = isStarred(s)
    if (starred !== starSeen) {
      starSeen = starred
      if (starred && s.status === 'running') announce.value = 'a star. untouchable for a bit'
    }
    // The feel: a stomp (the combo climbs), a hit (hurtAt moves), a new week (its card).
    if (s.combo > comboSeen) stompAt = now
    comboSeen = s.combo
    if (s.hurtAt !== hurtSeen) {
      hurtSeen = s.hurtAt
      if (s.hurtAt >= 0) hurtShakeAt = now
    }
    const today = dayAt(s)
    // The runway counts as the first week, so the card opens the game.
    const week = today >= 0 ? Math.floor(today / 7) : s.status === 'running' ? 0 : -1
    if (s.status === 'running' && week >= 0 && week !== weekSeen) {
      weekSeen = week
      cardAt = now
      const first = s.level.days[week * 7]!
      const last = s.level.days[Math.min(week * 7 + 6, s.level.days.length - 1)]!
      cardText = `WEEK ${week + 1} · ${dayLabel(first.date)} – ${dayLabel(last.date)}`
      if (week > 0) announce.value = `week ${week + 1}`
    }
    if (s.lives < livesSeen) {
      livesSeen = s.lives
      lostAt = now
      if (s.status === 'running') announce.value = `lost a life. ${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`
    }
    else if (s.lives > livesSeen) {
      livesSeen = s.lives
      announce.value = `extra life. ${s.lives} lives`
    }
    if (s.size !== sizeSeen) {
      sizeSeen = s.size
      if (s.status === 'running') announce.value = s.size === 'hatchling' ? 'hit. small now' : 'grown again'
    }
    if (!bestShown && props.hi > 0 && s.score > props.hi && s.status === 'running') {
      bestShown = true
      bestAt = now
    }
    if (wasLive && (s.status === 'over' || s.status === 'cleared')) endedAt = now
  }
  if (s && (s.status === 'over' || s.status === 'cleared') && !reportedEnd) {
    reportedEnd = true
    announce.value = s.status === 'cleared'
      ? `made it home at ${s.score}. space or tap for another go; escape quits`
      : `game over at ${s.score}. space or tap for another go; escape quits`
    emit('over', s.score, s.status === 'cleared', worldFeats(s), worldSummary(s))
  }
  draw()
  raf = requestAnimationFrame(frame)
}

/** The one-shot button: start, restart after the lockout, or (while running) a jump. */
function press() {
  canvas.value?.focus({ preventScroll: true })
  const s = state
  if (!s) return
  const ended = s.status === 'over' || s.status === 'cleared'
  if (ended && now - endedAt < RESTART_LOCKOUT) return
  if (s.status === 'running') {
    jumpPressed = true
    return
  }
  const started = startWorld(s)
  if (ended) {
    reportedEnd = false
    endedAt = -1
    lostAt = -1
    livesSeen = started.lives
    sizeSeen = started.size
    powerSeen = started.power
    starSeen = false
    comboSeen = 0
    stompAt = -1
    hurtSeen = -1
    hurtShakeAt = -1
    weekSeen = -1
    cardAt = -1
    bestAt = -1
    bestShown = false
  }
  if (started.status === 'running') announce.value = 'running'
}

function onTap() {
  press()
}

/** A throw, with the shaker (the engine ignores it otherwise). */
function fire() {
  if (state?.status === 'running') firePressed = true
}

// --- the touch pads: every finger tracked from down to up -------------------------------------

type PadZone = 'left' | 'right' | 'jump' | 'fire'
const fingers = new Map<number, PadZone | null>()
/** How far past the d-pad's edge a thumb can wander and still steer. */
const DPAD_SLOP = 28

/** The pad under a point: the d-pad split down its middle (with slop around it), else the pad element there. */
function zoneAt(x: number, y: number): PadZone | null {
  const r = dpad.value?.getBoundingClientRect()
  if (r && x >= r.left - DPAD_SLOP && x <= r.right + DPAD_SLOP && y >= r.top - DPAD_SLOP && y <= r.bottom + DPAD_SLOP) {
    return x < r.left + r.width / 2 ? 'left' : 'right'
  }
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-zone]')
  return (el?.dataset.zone as PadZone | undefined) ?? null
}

/** Folds every finger into the held state: a new finger on ▲ is a press, a new one on ● a throw. */
function syncPads() {
  const on = { left: false, right: false, jump: false, fire: false }
  for (const z of fingers.values()) if (z) on[z] = true
  if (on.jump && !held.jump) press()
  if (on.fire && !padsOn.fire) fire()
  held.left = on.left
  held.right = on.right
  held.jump = on.jump
  Object.assign(padsOn, on)
}

function padDown(e: PointerEvent) {
  e.preventDefault()
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  fingers.set(e.pointerId, zoneAt(e.clientX, e.clientY))
  syncPads()
}

function padMove(e: PointerEvent) {
  if (!fingers.has(e.pointerId)) return
  const z = zoneAt(e.clientX, e.clientY)
  if (z === fingers.get(e.pointerId)) return
  fingers.set(e.pointerId, z)
  syncPads()
}

function padUp(e: PointerEvent) {
  if (!fingers.delete(e.pointerId)) return
  syncPads()
}

function releasePads() {
  fingers.clear()
  syncPads()
}

function quit() {
  emit('quit', state?.score ?? 0)
}

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
    e.preventDefault()
    held.left = true
  }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
    e.preventDefault()
    held.right = true
  }
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault()
    if (!e.repeat) press()
    held.jump = true
  }
  else if (e.code === 'KeyX' || e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    e.preventDefault()
    if (!e.repeat) fire()
  }
  else if (e.code === 'Escape') {
    e.preventDefault()
    quit()
  }
}

function onKeyUp(e: KeyboardEvent) {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') held.left = false
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') held.right = false
  else if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') held.jump = false
}

function onVisibility() {
  paused = document.hidden
  if (!paused) last = performance.now()
  if (paused) {
    releasePads()
    held.left = false
    held.right = false
    held.jump = false
  }
}

onMounted(() => {
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  touch.value = window.matchMedia('(pointer: coarse)').matches
  prepare()
  // A preset picked mid-game re-reads the palette and rebakes the sprites.
  stopTheme = onThemeChange(prepare)
  resize()
  emit('fit', ROWS * TILE + HUD_H)
  ro = new ResizeObserver(resize)
  if (canvas.value?.parentElement) ro.observe(canvas.value.parentElement)
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', onVisibility)
  canvas.value?.focus({ preventScroll: true })
  if (import.meta.dev) {
    // Lets a headless check drive the month with the engine's scripted runner and read the result.
    (window as unknown as Record<string, unknown>).__worldDebug = {
      state: () => state,
      status: () => state?.status ?? null,
      score: () => state?.score ?? 0,
      lives: () => state?.lives ?? 0,
      size: () => state?.size ?? null,
      power: () => state?.power ?? null,
      crushed: () => state?.crushed ?? 0,
      fire,
      day: () => (state ? dayAt(state) : -1),
      x: () => state?.player.x ?? 0,
      width: () => (state ? levelWidth(state.level) : 0),
      drive: (input: WorldInput) => {
        held.left = input.left
        held.right = input.right
        held.jump = input.jumpHeld
        if (input.jump) press()
      },
      /** One frame of the engine's scripted runner, through the same input path a thumb uses; returns its decision. */
      auto: () => {
        if (!state) return null
        const i = autoRun(state)
        held.left = i.left
        held.right = i.right
        held.jump = i.jumpHeld
        if (i.jump) press()
        return i
      }
    }
  }
  last = performance.now()
  raf = requestAnimationFrame(frame)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  stopTheme?.()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('visibilitychange', onVisibility)
  if (import.meta.dev) delete (window as unknown as Record<string, unknown>).__worldDebug
})

watch(() => [props.build, props.accessories], prepare, { deep: true })

defineExpose({ quit })
</script>

<style scoped>
/* The touch pads: big, translucent, and they must not scroll, zoom, select or call out a menu
   under a thumb. Lit by the finger tracking (`.on`), not :active, which a captured pointer
   that has slid onto the next pad would leave on the wrong one. */
.pads > div {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}
.pad {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border: 1px solid var(--color-line-input);
  background: color-mix(in srgb, var(--color-raised) 55%, transparent);
  color: var(--color-dim);
  font-size: 18px;
}
.pad.on {
  color: var(--color-accent);
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
}
</style>
