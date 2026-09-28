<template>
  <div
    class="ticker select-none cursor-pointer"
    :class="[activeEvent ? `ev-${activeEvent}` : mood ? `mood-${mood}` : '', `size-${size}`, { sluggish }]"
    :style="{ '--beat': `${beatSeconds}s` }"
    role="button"
    tabindex="0"
    :aria-label="ariaLabel"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @mouseenter="trigger('bigbeat')"
  >
    <div class="heart-wrap">
      <!-- lg: the full-size rubber-hose sprite, one pose per mood/event. -->
      <div
        v-if="size === 'lg'"
        class="heart hose"
        :style="{ '--cols': TICKER_COLS, '--rows': TICKER_ROWS }"
        aria-hidden="true"
      >
        <span
          v-for="(cell, i) in poseCells"
          :key="i"
          :class="cell.ink ? [`ink-${cell.ink}`, cell.motion && `mo-${cell.motion}`] : undefined"
        />
      </div>
      <div
        v-else
        class="heart"
        aria-hidden="true"
      >
        <span
          v-for="(cell, i) in CELLS"
          :key="i"
          :class="CELL_CLASS[cell]"
        />
      </div>
      <span
        v-for="n in 4"
        :key="n"
        class="sparkle"
        :class="`sparkle-${n}`"
        aria-hidden="true"
      >✦</span>
      <span
        class="zzz"
        aria-hidden="true"
      >z z z</span>
      <span
        class="dots"
        aria-hidden="true"
      >· · ·</span>
    </div>

    <div class="ekg-wrap">
      <svg
        class="ekg"
        width="54"
        height="14"
        viewBox="0 0 46 12"
        overflow="visible"
        aria-hidden="true"
      >
        <polyline
          class="ekg-line"
          :points="ekgPoints"
          fill="none"
          stroke="currentColor"
          stroke-width="1"
        />
      </svg>
      <span
        class="beeep"
        aria-hidden="true"
      >beeeep</span>
    </div>

    <div class="cap">
      TICKER
    </div>
    <div class="bpm">
      {{ bpmLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
// TICKER — the pixel-heart digest companion (design_handoff_ticker). A 7×6 pixel
// sprite that beats at the live RHR, with an EKG sweep below and JS-triggered event
// one-shots (double-beat, celebration, thump, flatline gag). Pure CSS/SVG, no assets.
// size 'lg' swaps in the full-size rubber-hose sprite from shared/utils/tickerSprite.ts.
import { TICKER_COLS, TICKER_POSES, TICKER_ROWS, tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerCell, TickerPose } from '#shared/utils/tickerSprite'

const props = withDefaults(defineProps<{
  /** Latest resting HR reading — drives the beat (clamped 40–100 bpm). */
  rhr?: number | null
  /** Short-sleep state: visual beat slows to 45 bpm, eyes half-lidded, zzz. */
  sluggish?: boolean
  /** Replaces the "♥ N bpm live" caption where there is no live reading to show (error page). */
  caption?: string | null
  /** Accessible name — says what clicking the heart does in this context. */
  ariaLabel?: string
  /**
   * A held state, unlike the one-shot events: 'thinking' while an answer is being worked out
   * (a slow rock and a trail of dots), 'talking' while it streams (quicker beat, busy EKG).
   * A one-shot event plays over it and it resumes after.
   */
  mood?: 'thinking' | 'talking' | null
  /** 'lg' is the full-size rubber-hose TICKER (gloves, sneakers, a pose per mood) for pages it hosts (/ask). */
  size?: 'md' | 'lg'
}>(), { rhr: null, sluggish: false, caption: null, ariaLabel: 'TICKER — open all digests', mood: null, size: 'md' })

const emit = defineEmits<{ open: [] }>()

// 7×6 grid map from the handoff: . empty · R red · H highlight · E eye (bg-colored,
// fills red for a frame to blink).
const GRID = [
  '.RR.RR.',
  'RHRRRRR',
  'RERRERR',
  'RRRRRRR',
  '.RRRRR.',
  '..RRR..'
]
const CELLS = GRID.join('').split('') as Array<'.' | 'R' | 'H' | 'E'>
const CELL_CLASS = { '.': '', 'R': 'px-r', 'H': 'px-h', 'E': 'px-e' } as const

const beatSeconds = computed(() => {
  if (props.sluggish) return 60 / 45
  const resting = 60 / Math.min(100, Math.max(40, props.rhr ?? 63))
  // Talking gets the heart going a little — a quarter faster than resting.
  return props.mood === 'talking' ? resting * 0.75 : resting
})

const bpmLabel = computed(() => {
  if (props.caption) return props.caption
  return props.rhr != null ? `♥ ${props.rhr} bpm live` : '♥ —— bpm'
})

// --- Event one-shots -------------------------------------------------------
// One active at a time, never queued; every event returns to idle within 2s.

type TickerEvent = 'digest' | 'celebrate' | 'thump' | 'flatline' | 'bigbeat'

const DURATION: Record<TickerEvent, number> = {
  digest: 1600,
  celebrate: 1400,
  thump: 1600,
  flatline: 2000,
  bigbeat: 700
}

const activeEvent = ref<TickerEvent | null>(null)
let eventTimer: ReturnType<typeof setTimeout> | undefined

function trigger(event: TickerEvent) {
  if (activeEvent.value) return
  activeEvent.value = event
  eventTimer = setTimeout(() => {
    activeEvent.value = null
  }, DURATION[event])
}

onUnmounted(() => clearTimeout(eventTimer))

defineExpose({ trigger })

// --- Full-size poses (size 'lg') ------------------------------------------
// Events that have a pose win over the held mood, and the mood over the short-sleep slump;
// digest and bigbeat are pure animation and keep whatever pose is showing.

const POSE_CELLS = Object.fromEntries(TICKER_POSES.map(p => [p, tickerSprite(p)])) as Record<TickerPose, TickerCell[]>

const pose = computed<TickerPose>(() => {
  if (activeEvent.value === 'celebrate') return 'happy'
  if (activeEvent.value === 'thump') return 'worried'
  if (activeEvent.value === 'flatline') return 'flatline'
  if (props.mood) return props.mood
  return props.sluggish ? 'sleepy' : 'idle'
})

const poseCells = computed(() => POSE_CELLS[pose.value])

// EKG polyline per state. The dash sweep uses a fixed dasharray (~92, matching the
// reference demo) so all variants share one animation.
const EKG_IDLE = '0,6 12,6 16,2 20,10 24,4 28,6 46,6'
const EKG_BURST = '0,6 5,6 8,2 11,10 14,6 18,6 21,2 24,10 27,6 31,6 34,2 37,10 40,6 46,6'
const EKG_FLAT = '0,6 46,6'

const ekgPoints = computed(() => {
  if (activeEvent.value === 'flatline') return EKG_FLAT
  if (activeEvent.value === 'digest' || (!activeEvent.value && props.mood === 'talking')) return EKG_BURST
  return EKG_IDLE
})
</script>

<style scoped>
.ticker {
  --heart: var(--color-danger);      /* #e86a5e */
  --heart-hi: #ff8a7d;               /* top-left lobe highlight — sprite-only shade */
  --ticker-eye: var(--color-bg);     /* eyes are punched out to the panel background */
  width: max-content;
  text-align: center;
}

/* ── Sprite ─────────────────────────────────────────────────────────────── */
.heart-wrap {
  position: relative;
  width: max-content;
  margin: 0 auto;
}
.heart {
  --px: 6px;
  --px-gap: 1px;
  display: inline-grid;
  grid-template-columns: repeat(7, var(--px));
  grid-template-rows: repeat(6, var(--px));
  gap: var(--px-gap);
  transform-origin: center bottom;
  animation:
    ticker-beat var(--beat) ease-in-out infinite,
    ticker-glow var(--beat) ease-in-out infinite;
}
.px-r { background: var(--heart); }
.px-h { background: var(--heart-hi); }
.px-e {
  background: var(--ticker-eye);
  position: relative;
  animation: ticker-blink 4.7s linear infinite;
}

/* ── EKG ────────────────────────────────────────────────────────────────── */
.ekg-wrap {
  position: relative;
  margin-top: 8px;
}
.ekg {
  display: block;
  margin: 0 auto;
  color: var(--color-accent);
}
.ekg-line {
  stroke-dasharray: 92;
  animation: ekg-sweep var(--beat) linear infinite;
  transform-origin: 50% 50%;
}
.beeep {
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 4px;
  font-size: 8px;
  letter-spacing: 0.08em;
  color: var(--color-ghost);
  opacity: 0;
  pointer-events: none;
}

/* ── Captions ───────────────────────────────────────────────────────────── */
.cap {
  margin-top: 7px;
  font-size: 9px;
  letter-spacing: 0.12em;
  color: var(--color-faint);
}
.bpm {
  margin-top: 1px;
  font-size: 8.5px;
  color: var(--color-ghost);
}

/* ── Idle keyframes (all synced to --beat = 60/RHR seconds) ─────────────── */
@keyframes ticker-beat {
  0%, 48%, 100% { transform: scale(1); }
  12% { transform: scale(1.14, 0.9); }
  24% { transform: scale(0.94, 1.06); }
  36% { transform: scale(1.05, 0.97); }
}
@keyframes ticker-glow {
  0%, 100% { filter: drop-shadow(0 0 5px rgba(232, 106, 94, 0.35)); }
  12% { filter: drop-shadow(0 0 11px rgba(232, 106, 94, 0.75)); }
}
@keyframes ekg-sweep {
  0% { stroke-dashoffset: 92; }
  100% { stroke-dashoffset: 0; }
}
@keyframes ticker-blink {
  0%, 92%, 100% { background: var(--ticker-eye); }
  94%, 98% { background: var(--heart); }
}

/* ── Short-sleep state (persists until a ≥7h night) ─────────────────────── */
/* Half-lidded: the top of each eye fills with the lid (heart red). */
.sluggish .px-e {
  background: linear-gradient(to bottom, var(--heart) 0 55%, var(--ticker-eye) 55% 100%);
  animation: none;
}
.zzz {
  position: absolute;
  left: 100%;
  top: -4px;
  margin-left: 3px;
  font-size: 8px;
  letter-spacing: 0.14em;
  color: var(--color-faint);
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
}
.sluggish .zzz {
  animation: ticker-zzz 3.2s ease-in-out infinite;
}
@keyframes ticker-zzz {
  0% { opacity: 0; transform: translateY(2px); }
  25%, 65% { opacity: 0.9; }
  100% { opacity: 0; transform: translateY(-7px); }
}

/* ── Event one-shots (class swaps the idle animation; ≤2s, never queued) ── */

/* DIGEST ARRIVES — one double-beat; the EKG shows the 3-spike burst points. */
.ev-digest .heart {
  animation:
    ticker-double-beat 0.9s ease-in-out,
    ticker-glow var(--beat) ease-in-out infinite;
}
@keyframes ticker-double-beat {
  0%, 100% { transform: scale(1); }
  15% { transform: scale(1.16, 0.88); }
  30% { transform: scale(0.96, 1.04); }
  50% { transform: scale(1.16, 0.88); }
  70% { transform: scale(0.96, 1.04); }
}

/* RECOVERY >80% — glow to max, two hops, sparkles pop at the corners. */
.ev-celebrate .heart {
  animation: ticker-hop 1.1s ease-in-out;
  filter: drop-shadow(0 0 12px rgba(232, 106, 94, 0.85));
}
@keyframes ticker-hop {
  0%, 45%, 90%, 100% { transform: translateY(0); }
  20% { transform: translateY(-7px); }
  65% { transform: translateY(-5px); }
}
.sparkle {
  position: absolute;
  font-size: 8px;
  color: var(--color-accent);
  opacity: 0;
  pointer-events: none;
}
.sparkle-1 { top: -7px; left: -8px; }
.sparkle-2 { top: -9px; right: -8px; }
.sparkle-3 { bottom: -2px; left: -10px; }
.sparkle-4 { bottom: -4px; right: -10px; }
.ev-celebrate .sparkle {
  animation: ticker-sparkle 1s ease-out;
}
.ev-celebrate .sparkle-2 { animation-delay: 0.12s; }
.ev-celebrate .sparkle-3 { animation-delay: 0.2s; }
.ev-celebrate .sparkle-4 { animation-delay: 0.3s; }
@keyframes ticker-sparkle {
  0% { opacity: 0; transform: scale(0.4); }
  30% { opacity: 1; transform: scale(1.25); }
  100% { opacity: 0; transform: scale(0.7); }
}

/* NEW LAB FLAG — beat pauses 400ms, then one hard thump; eyes widen; EKG spike ×2. */
.ev-thump .heart {
  animation:
    ticker-thump 1.6s ease-in-out,
    ticker-glow var(--beat) ease-in-out infinite;
}
@keyframes ticker-thump {
  /* 0–25% of 1.6s = the 400ms held pause */
  0%, 25% { transform: scale(1); }
  38% { transform: scale(1.22); }
  55% { transform: scale(0.97, 1.02); }
  70%, 100% { transform: scale(1); }
}
.ev-thump .px-e {
  animation: none;
  transform: scaleY(1.5);
}
.ev-thump .ekg-line {
  transform: scaleY(2);
}

/* SODA #3 — the gag: EKG flatlines with a faint beeeep, heart tips over with
   X eyes, then shakes it off and resumes. */
.ev-flatline .heart {
  animation: ticker-keel 2s ease-in-out;
}
@keyframes ticker-keel {
  0% { transform: rotate(0deg); }
  12%, 70% { transform: rotate(15deg); }
  78% { transform: rotate(-4deg); }
  86% { transform: rotate(3deg); }
  93% { transform: rotate(-2deg); }
  100% { transform: rotate(0deg); }
}
.ev-flatline .px-e {
  background: var(--ticker-eye);
  animation: none;
}
.ev-flatline .px-e::after {
  content: '×';
  position: absolute;
  inset: 0;
  font-size: 7px;
  line-height: 6px;
  text-align: center;
  color: var(--heart);
}
.ev-flatline .ekg-line {
  animation: none;
  stroke-dashoffset: 0;
}
.ev-flatline .beeep {
  animation: ticker-beeep 1.5s linear;
}
@keyframes ticker-beeep {
  0%, 80% { opacity: 0.8; }
  100% { opacity: 0; }
}

/* HOVER — one extra-large beat + glow. */
.ev-bigbeat .heart {
  animation:
    ticker-big-beat 0.6s ease-in-out,
    ticker-glow var(--beat) ease-in-out infinite;
  filter: drop-shadow(0 0 12px rgba(232, 106, 94, 0.8));
}
@keyframes ticker-big-beat {
  0%, 100% { transform: scale(1); }
  30% { transform: scale(1.28, 0.86); }
  60% { transform: scale(0.93, 1.08); }
}

/* ── Size: 'lg' is the host on /ask — the full-size rubber-hose sprite ──── */
.size-lg .heart { --px: 6px; --px-gap: 1px; }
.heart.hose {
  grid-template-columns: repeat(var(--cols), var(--px));
  grid-template-rows: repeat(var(--rows), var(--px));
}
/* Sprite-only shades beside the theme tokens (canvas direction C). */
.ink-rim { background: #6e1f2c; }
.ink-red { background: var(--heart); }
.ink-shade { background: #c2493f; }
.ink-hi { background: var(--heart-hi); }
.ink-spec { background: #ffd5cc; }
.ink-eye { background: var(--ticker-eye); }
.ink-glint { background: var(--color-hi); }
.ink-blush { background: #f5a0a6; }
.ink-tongue { background: #ff9aa5; }
.ink-drop { background: #8fd3ff; }
.ink-limb { background: var(--color-dim); }
.ink-glove { background: var(--color-hi); }
.ink-shoe { background: var(--color-accent); }
.ink-clip { background: var(--color-warn); }
.ink-line { background: var(--color-faint); }
.ink-flag { background: var(--heart); }
.ink-mug { background: var(--color-ember); }
.ink-coffee { background: #5a3424; }
/* Blinks close the top rows of each eye onto the bottom one. */
.mo-lid { animation: hose-blink 4.7s linear infinite; }
.mo-lid-glint { animation: hose-blink-glint 4.7s linear infinite; }
@keyframes hose-blink {
  0%, 92%, 100% { background: var(--ticker-eye); }
  94%, 98% { background: var(--heart); }
}
@keyframes hose-blink-glint {
  0%, 92%, 100% { background: var(--color-hi); }
  94%, 98% { background: var(--heart); }
}
/* Talking: the lower lip and tongue flap shut every other beat of a fast cycle. */
.mo-jaw { animation: hose-jaw 0.42s steps(1) infinite; }
.mo-jaw-tongue { animation: hose-jaw-tongue 0.42s steps(1) infinite; }
@keyframes hose-jaw {
  0% { background: var(--ticker-eye); }
  50% { background: var(--heart); }
}
@keyframes hose-jaw-tongue {
  0% { background: #ff9aa5; }
  50% { background: var(--heart); }
}
/* Wave lines and coffee steam. */
.mo-flicker { animation: hose-flicker 1.6s ease-in-out infinite; }
@keyframes hose-flicker {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}
/* Flatline: the colour drains while it's down. */
.size-lg.ev-flatline .heart { filter: saturate(0.45); }
.size-lg .ekg { width: 108px; height: 28px; }
.size-lg .cap { font-size: 11px; margin-top: 10px; }
.size-lg .bpm { font-size: 10px; }
.size-lg .zzz,
.size-lg .dots { font-size: 12px; }

/* ── Held moods ─────────────────────────────────────────────────────────── */
/* THINKING — a slow side-to-side rock over the beat, with a trail of dots. */
.mood-thinking .heart {
  animation:
    ticker-ponder 2.4s ease-in-out infinite,
    ticker-glow var(--beat) ease-in-out infinite;
}
@keyframes ticker-ponder {
  0%, 100% { transform: rotate(-5deg); }
  50% { transform: rotate(5deg); }
}
.dots {
  position: absolute;
  left: 100%;
  top: -6px;
  margin-left: 3px;
  font-size: 9px;
  letter-spacing: 0.1em;
  color: var(--color-accent);
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
}
.mood-thinking .dots {
  animation: ticker-dots 1.4s steps(4) infinite;
}
@keyframes ticker-dots {
  0% { opacity: 0.25; clip-path: inset(0 100% 0 0); }
  33% { opacity: 0.9; clip-path: inset(0 66% 0 0); }
  66% { opacity: 0.9; clip-path: inset(0 33% 0 0); }
  100% { opacity: 0.9; clip-path: inset(0 0 0 0); }
}
/* TALKING — the beat quickens (see beatSeconds) and the EKG runs the busy burst trace. */

/* ── Reduced motion: static sprite, glow pulse only ─────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .heart,
  .ev-digest .heart,
  .ev-celebrate .heart,
  .ev-thump .heart,
  .ev-flatline .heart,
  .ev-bigbeat .heart,
  .mood-thinking .heart {
    animation: ticker-glow var(--beat) ease-in-out infinite;
  }
  .ekg-line,
  .px-e,
  .mo-lid,
  .mo-lid-glint,
  .mo-jaw,
  .mo-jaw-tongue,
  .mo-flicker,
  .sparkle,
  .zzz,
  .dots,
  .beeep {
    animation: none !important;
  }
  /* The dots still say "thinking" without moving. */
  .mood-thinking .dots { opacity: 0.8; }
}
</style>
