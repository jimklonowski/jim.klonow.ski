<template>
  <div
    class="ticker select-none cursor-pointer"
    :class="[activeEvent ? `ev-${activeEvent}` : mood ? `mood-${mood}` : '', `size-${size}`, { sluggish: dozing, blink: blinking, full: isFull }]"
    :style="{ '--beat': `${beatSeconds}s` }"
    role="button"
    tabindex="0"
    :aria-label="ariaLabel"
    @click="emit('open')"
    @keydown.enter.prevent="emit('open')"
    @mouseenter="trigger('bigbeat')"
  >
    <div class="heart-wrap">
      <!-- One pose per mood/event: the rubber-hose figure when full, else the face alone. -->
      <div
        class="heart"
        :style="{ '--cols': sprite.cols, '--rows': sprite.rows }"
        aria-hidden="true"
      >
        <span
          v-for="(cell, i) in sprite.cells"
          :key="i"
          :class="cell.ink ? [`ink-${cell.ink}`, cell.motion && `mo-${cell.motion}`] : undefined"
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
// TICKER — the pixel-heart digest companion (design_handoff_ticker, redrawn 2026-09-28). A
// pixel sprite from shared/utils/tickerSprite.ts that beats at the live RHR, with an EKG sweep
// below and JS-triggered event one-shots (double-beat, celebration, thump, flatline gag) that
// each strike a pose. Pure CSS/SVG, no assets.
import { TICKER_POSES, tickerSprite } from '#shared/utils/tickerSprite'
import type { TickerFigure, TickerPose, TickerProp, TickerSprite } from '#shared/utils/tickerSprite'

const props = withDefaults(defineProps<{
  /**
   * Heart rate the beat runs at, clamped 40–170 bpm. Hosts pass the latest resting reading; the
   * /ticker walk hands over a workout's average for the length of the lap.
   */
  rhr?: number | null
  /** Short-sleep state: visual beat slows to 45 bpm, heavy lids (and the coffee when full), zzz. */
  sluggish?: boolean
  /**
   * Replaces the "♥ N bpm live" caption where there is no live reading to show (error page), or
   * where the beat isn't the live one (the /ticker walk says whose heart rate it is).
   */
  caption?: string | null
  /** Accessible name — says what clicking the heart does in this context. */
  ariaLabel?: string
  /**
   * A held state, unlike the one-shot events: 'thinking' while an answer is being worked out
   * (a slow rock and a trail of dots), 'talking' while it streams (quicker beat, busy EKG).
   * A one-shot event plays over it and it resumes after.
   */
  mood?: 'thinking' | 'talking' | null
  /** 'lg' doubles the pixels for pages TICKER hosts (/ask); it always draws the full figure. */
  size?: 'md' | 'lg'
  /**
   * The rubber-hose figure (gloves, sneakers, a prop per pose) instead of the heart's face alone.
   * Off by default at 'md', where the heart has to fit tight spots like the phone header on /ask.
   */
  full?: boolean
  /**
   * Hold an exact pose — the /ticker pet page drives eating, the walk frames, the petted bliss,
   * sitting and sleeping through this. A one-shot event's pose still plays over it, then it
   * resumes. 'asleep' also slows the beat and floats the zzz, like the short-sleep state.
   */
  poseOverride?: TickerPose | null
  /** Props composed over whatever pose is showing (full figure only): the /ticker food bowl, the birthday hat. */
  accessories?: TickerProp[]
}>(), { rhr: null, sluggish: false, caption: null, ariaLabel: 'TICKER — open all digests', mood: null, size: 'md', full: false, poseOverride: null, accessories: () => [] })

const isFull = computed(() => props.full || props.size === 'lg')
const dozing = computed(() => props.sluggish || props.poseOverride === 'asleep')

const emit = defineEmits<{ open: [] }>()

const beatSeconds = computed(() => {
  if (dozing.value) return 60 / 45
  const base = 60 / Math.min(170, Math.max(40, props.rhr ?? 63))
  // Talking gets the heart going a little — a quarter faster than resting.
  return props.mood === 'talking' ? base * 0.75 : base
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

// A double blink on demand (the /ticker fidgets). Kept apart from the events so it never knocks
// a held mood's class off; and because it replaces the slow lid animation for half a second, the
// idle blink cycle restarts afterwards — which is the point: the blinking stops being a metronome.
const blinking = ref(false)
let blinkTimer: ReturnType<typeof setTimeout> | undefined

function blink() {
  if (blinking.value) return
  blinking.value = true
  blinkTimer = setTimeout(() => {
    blinking.value = false
  }, 440)
}

onUnmounted(() => {
  clearTimeout(eventTimer)
  clearTimeout(blinkTimer)
})

defineExpose({ trigger, blink })

// --- Poses -----------------------------------------------------------------
// Events that have a pose win over the held mood, and the mood over the short-sleep slump;
// digest and bigbeat are pure animation and keep whatever pose is showing.

const SPRITES = Object.fromEntries((['full', 'face'] as const).map(figure => [
  figure,
  Object.fromEntries(TICKER_POSES.map(p => [p, tickerSprite(p, figure)]))
])) as Record<TickerFigure, Record<TickerPose, TickerSprite>>

const pose = computed<TickerPose>(() => {
  if (activeEvent.value === 'celebrate') return 'happy'
  if (activeEvent.value === 'thump') return 'worried'
  if (activeEvent.value === 'flatline') return 'flatline'
  if (props.poseOverride) return props.poseOverride
  if (props.mood) return props.mood
  return props.sluggish ? 'sleepy' : 'idle'
})

// Bare poses come from the cache; with props the sprite is composed on the fly (a few hundred cells).
const sprite = computed(() => {
  const figure: TickerFigure = isFull.value ? 'full' : 'face'
  return figure === 'full' && props.accessories.length
    ? tickerSprite(pose.value, figure, props.accessories)
    : SPRITES[figure][pose.value]
})

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
/* Pixel size per figure: the face alone at md is 3px pixels with no gap (51×45, about the old 7×6
   heart's footprint; 2px with a 1px gap read as a dot matrix at that size), the full figure 3px
   on md and 6px at lg (the /ask host), both with a 1px gap. --cols/--rows come from the sprite. */
.heart {
  --px: 3px;
  --px-gap: 0px;
  display: inline-grid;
  grid-template-columns: repeat(var(--cols), var(--px));
  grid-template-rows: repeat(var(--rows), var(--px));
  gap: var(--px-gap);
  transform-origin: center bottom;
  animation:
    ticker-beat var(--beat) ease-in-out infinite,
    ticker-glow var(--beat) ease-in-out infinite;
}
.full .heart { --px: 3px; --px-gap: 1px; }
.size-lg .heart { --px: 6px; --px-gap: 1px; }

/* Inks: theme tokens where one fits, sprite-only shades otherwise. */
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
.ink-bowl { background: #6f8aa0; }
.ink-hat { background: #c084fc; }

/* Blinks close the top rows of each eye onto the bottom one. */
.mo-lid { animation: ticker-lid 4.7s linear infinite; }
.mo-lid-glint { animation: ticker-lid-glint 4.7s linear infinite; }
@keyframes ticker-lid {
  0%, 92%, 100% { background: var(--ticker-eye); }
  94%, 98% { background: var(--heart); }
}
@keyframes ticker-lid-glint {
  0%, 92%, 100% { background: var(--color-hi); }
  94%, 98% { background: var(--heart); }
}
/* blink(): shut–open–shut–open on a step cycle; the regular lid cycle resumes from zero after. */
.blink .mo-lid { animation: ticker-blink-twice 0.44s steps(1); }
.blink .mo-lid-glint { animation: ticker-blink-twice-glint 0.44s steps(1); }
@keyframes ticker-blink-twice {
  0%, 40% { background: var(--heart); }
  20%, 60%, 100% { background: var(--ticker-eye); }
}
@keyframes ticker-blink-twice-glint {
  0%, 40% { background: var(--heart); }
  20%, 60%, 100% { background: var(--color-hi); }
}
/* Talking: the lower lip and tongue flap shut on a fast cycle. */
.mo-jaw { animation: ticker-jaw 0.42s steps(1) infinite; }
.mo-jaw-tongue { animation: ticker-jaw-tongue 0.42s steps(1) infinite; }
@keyframes ticker-jaw {
  0% { background: var(--ticker-eye); }
  50% { background: var(--heart); }
}
@keyframes ticker-jaw-tongue {
  0% { background: #ff9aa5; }
  50% { background: var(--heart); }
}
/* Wave lines and coffee steam. */
.mo-flicker { animation: ticker-flicker 1.6s ease-in-out infinite; }
@keyframes ticker-flicker {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
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

/* ── Short-sleep state (persists until a ≥7h night) ─────────────────────── */
/* The sleepy pose draws the heavy lids; this is the floating zzz. */
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

/* NEW LAB FLAG — beat pauses 400ms, then one hard thump; worried pose; EKG spike ×2. */
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
.ev-thump .ekg-line {
  transform: scaleY(2);
}

/* SODA #3 — the gag: EKG flatlines with a faint beeeep, heart tips over with
   X eyes (the flatline pose) and its colour drains, then shakes it off and resumes. */
.ev-flatline .heart {
  animation: ticker-keel 2s ease-in-out;
  filter: saturate(0.45);
}
@keyframes ticker-keel {
  0% { transform: rotate(0deg); }
  12%, 70% { transform: rotate(15deg); }
  78% { transform: rotate(-4deg); }
  86% { transform: rotate(3deg); }
  93% { transform: rotate(-2deg); }
  100% { transform: rotate(0deg); }
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

/* ── Size: 'lg' is the host on /ask ─────────────────────────────────────── */
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
