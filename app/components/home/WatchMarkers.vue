<template>
  <div v-if="tiles.length">
    <TuiHeader
      label="WATCH MARKERS · DRAW OVER DRAW"
      class="mt-5"
    >
      <span class="text-[10.5px] text-muted">{{ draws.length }} draws</span>
    </TuiHeader>

    <!-- Four across only in the xl three-column layout; the lg middle column can be ~640px. -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-2.5 mt-2.5">
      <NuxtLink
        v-for="t in tiles"
        :key="t.key"
        :to="{ path: '/labs', query: { marker: t.key } }"
        :aria-label="`${t.label} — open its history on the labs page`"
        class="block bg-raised border border-line-soft px-3 py-2.5 hover:bg-row-hover hover:border-line-input transition-colors min-w-0"
      >
        <div class="flex items-baseline justify-between gap-2 min-w-0">
          <span class="text-[10.5px] text-muted uppercase tracking-[0.12em] truncate">{{ t.label }}</span>
          <span
            class="num-display text-[17px] leading-none whitespace-nowrap"
            :style="{ color: t.color }"
          >{{ t.value }}<span
            v-if="t.censored"
            class="text-warn text-[11px] ml-0.5"
          >†</span><span class="text-[10px] text-muted ml-1 font-sans">{{ t.unit }}</span></span>
        </div>

        <!-- The series over every draw that has the marker. The line is an SVG stretched to the
             tile (preserveAspectRatio none, like TuiSparkline); the dots are HTML laid over it at
             percentage positions, since a circle inside that SVG would stretch into an ellipse. A
             censored reading (the Sep 9 immunoassay ceiling) is a hollow dot off the line, as its
             reading note asks. -->
        <div
          class="relative mt-2"
          :style="{ height: `${H}px` }"
        >
          <svg
            :viewBox="`0 0 ${W} ${H}`"
            preserveAspectRatio="none"
            width="100%"
            :height="H"
            class="block"
            aria-hidden="true"
          >
            <line
              v-if="t.guideY != null"
              x1="0"
              :x2="W"
              :y1="t.guideY"
              :y2="t.guideY"
              stroke="#5d7a6d"
              stroke-width="1"
              stroke-dasharray="3 3"
              vector-effect="non-scaling-stroke"
            />
            <polyline
              v-if="t.linePoints"
              :points="t.linePoints"
              fill="none"
              :stroke="CHART_ACCENT"
              stroke-width="1.5"
              opacity="0.9"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <span
            v-for="p in t.dots"
            :key="p.date"
            class="absolute w-1.75 h-1.75 rounded-full -translate-x-1/2 -translate-y-1/2 border-[1.5px]"
            :style="{ left: `${(p.x / W) * 100}%`, top: `${(p.y / H) * 100}%`, borderColor: p.color, background: p.hollow ? 'transparent' : p.color }"
          />
        </div>

        <div class="flex items-baseline justify-between gap-2 mt-1.5 text-[10px] text-muted min-w-0">
          <span class="truncate">{{ t.foot }}</span>
          <span class="whitespace-nowrap">{{ t.asOf }}</span>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LabsEntry } from '#shared/types/labs'
import { BIOMARKERS, getStatus } from '~/data/biomarkers'
import { readingNoteOn } from '~/data/markerCaveats'
import { CHART_ACCENT, STATUS_COLORS } from '~/utils/chartTheme'

// The four markers the protocol is steered by, each as its whole draw history in one small
// tile: hematocrit (the Hct 51.7 that followed the T dose cut), total testosterone (with the
// censored CHW ceiling drawn hollow), estradiol (tracks T) and ferritin (the iron story). The
// flagged rows above say what is out of range TODAY; these say which way it has been going.
const props = defineProps<{
  /** Every draw on file, oldest first. */
  draws: LabsEntry[]
}>()

const WATCH_MARKERS = ['hematocrit', 'testosterone_total', 'estradiol', 'ferritin'] as const

const W = 120
const H = 30
/** Inset so an end dot or a peak isn't clipped by the edge. */
const PAD = 4

interface Dot {
  date: string
  x: number
  y: number
  color: string
  hollow: boolean
}

function fmt(v: number) {
  return Number.isInteger(v) ? v.toString() : v.toFixed(v < 10 ? 1 : 0)
}

function refLabel(min?: number, max?: number) {
  if (min != null && max != null) return `ref ${fmt(min)}–${fmt(max)}`
  if (max != null) return `ref ≤${fmt(max)}`
  if (min != null) return `ref ≥${fmt(min)}`
  return ''
}

const tiles = computed(() => WATCH_MARKERS.flatMap((key) => {
  const meta = BIOMARKERS[key]
  if (!meta) return []
  const series = props.draws
    .filter(d => d.markers[key] != null)
    .map(d => ({ date: d.date, value: d.markers[key] as number, censored: !!readingNoteOn(key, d.date) }))
  if (series.length < 2) return []

  const latest = series.at(-1)!
  const status = getStatus(latest.value, meta)
  const color = STATUS_COLORS[status]

  // Domain: the readings, widened to take in the reference bound nearest the latest value when
  // it sits within reach — the dashed guide then says how far out of range the line runs.
  // Ferritin's 380 ceiling would flatten a 16–80 series, so a far bound is left off.
  const values = series.map(p => p.value)
  let min = Math.min(...values)
  let max = Math.max(...values)
  const bounds = [meta.refMax, meta.refMin].filter((b): b is number => b != null)
  const guide = bounds.sort((a, b) => Math.abs(a - latest.value) - Math.abs(b - latest.value))[0]
  const spread = (max - min) || Math.abs(max) || 1
  const guideShown = guide != null && guide >= min - spread * 0.6 && guide <= max + spread * 0.6
  if (guideShown) {
    min = Math.min(min, guide)
    max = Math.max(max, guide)
  }
  const range = (max - min) || 1
  const usable = H - PAD * 2
  const yOf = (v: number) => H - PAD - ((v - min) / range) * usable
  const xOf = (i: number) => (i / (series.length - 1)) * W

  // The line runs through the measured readings only; a censored reading floats as a hollow dot.
  const measured = series.map((p, i) => ({ ...p, i })).filter(p => !p.censored)
  const linePoints = measured.length >= 2 ? measured.map(p => `${xOf(p.i)},${yOf(p.value)}`).join(' ') : null
  const dots: Dot[] = series.flatMap((p, i) => {
    if (!p.censored && i !== series.length - 1) return []
    return [{ date: p.date, x: xOf(i), y: yOf(p.value), color: p.censored ? STATUS_COLORS.low : color, hollow: p.censored }]
  })

  return [{
    key,
    // "Testosterone (Total)" → "Testosterone": the parenthetical doesn't fit a quarter-width tile.
    label: meta.label.replace(/\s*\(.*\)$/, ''),
    unit: meta.unit,
    value: fmt(latest.value),
    censored: latest.censored,
    color,
    guideY: guideShown ? yOf(guide) : null,
    linePoints,
    dots,
    foot: latest.censored ? `† ${fmt(latest.value)} is a ceiling` : refLabel(meta.refMin, meta.refMax),
    asOf: `as of ${formatDate(latest.date, 'monthDay')}`
  }]
}))
</script>
