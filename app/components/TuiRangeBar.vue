<template>
  <div
    class="relative w-full bg-line-soft"
    :style="{ height: `${height}px` }"
  >
    <!-- Lab reference range (broad, population). Doubles as the only band when
         the marker has no tighter optimal target to nest inside it. -->
    <div
      v-if="refStyle"
      class="absolute h-full"
      :style="{ ...refStyle, background: optimalStyle ? '#152b21' : '#1e3a2e' }"
    />
    <!-- Optimal target, nested inside the reference band -->
    <div
      v-if="optimalStyle"
      class="absolute h-full bg-[#1e3a2e]"
      :style="optimalStyle"
    />
    <!-- Value marker -->
    <div
      v-if="dotStyle"
      class="absolute rounded-full -translate-x-1/2"
      :style="dotStyle"
    />
  </div>
</template>

<script setup lang="ts">
import { getStatus } from '~/data/biomarkers'
import type { BiomarkerMeta } from '~/data/biomarkers'

const props = withDefaults(defineProps<{
  value: number | null
  meta: BiomarkerMeta
  /** Track height in px — 4 on the home flagged rows, 5 on the labs marker cards. */
  height?: number
  /** Dot diameter in px. */
  dotSize?: number
}>(), {
  height: 4,
  dotSize: 8
})

const STATUS_COLORS = {
  optimal: '#2ce8a4',
  low: '#e8b34b',
  high: '#e86a5e',
  unknown: '#5d7a6d'
} as const

// Pad the visible track 25% of the reference span beyond each end, so an
// out-of-range value still lands inside the bar instead of clamping to the edge.
const PADDING = 0.25

const displayMin = computed(() => {
  const { refMin, refMax } = props.meta
  if (refMin !== undefined && refMax !== undefined) return refMin - (refMax - refMin) * PADDING
  if (refMax !== undefined) return 0
  if (refMin !== undefined) return refMin * 0.5
  return 0
})

const displayMax = computed(() => {
  const { refMin, refMax } = props.meta
  if (refMin !== undefined && refMax !== undefined) return refMax + (refMax - refMin) * PADDING
  if (refMax !== undefined) return refMax * 1.5
  if (refMin !== undefined) return refMin * 2
  return 100
})

function toPercent(v: number) {
  const span = displayMax.value - displayMin.value
  if (!span) return 0
  return Math.min(100, Math.max(0, ((v - displayMin.value) / span) * 100))
}

function band(min: number | undefined, max: number | undefined) {
  if (min === undefined && max === undefined) return null
  const left = min !== undefined ? toPercent(min) : 0
  const right = max !== undefined ? toPercent(max) : 100
  return { left: `${left}%`, width: `${Math.max(0, right - left)}%` }
}

const refStyle = computed(() => band(props.meta.refMin, props.meta.refMax))
const optimalStyle = computed(() => band(props.meta.optimalMin, props.meta.optimalMax))

const dotStyle = computed(() => {
  if (props.value == null) return null
  const status = getStatus(props.value, props.meta)
  return {
    left: `${toPercent(props.value)}%`,
    top: `${(props.height - props.dotSize) / 2}px`,
    width: `${props.dotSize}px`,
    height: `${props.dotSize}px`,
    background: STATUS_COLORS[status]
  }
})
</script>
