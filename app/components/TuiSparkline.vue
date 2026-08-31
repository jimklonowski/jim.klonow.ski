<template>
  <svg
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    width="100%"
    :height="height"
    class="block"
    aria-hidden="true"
  >
    <line
      v-if="markX != null"
      :x1="markX"
      :x2="markX"
      y1="0"
      :y2="height"
      stroke="currentColor"
      stroke-width="1"
      stroke-dasharray="2 2"
      opacity="0.35"
      vector-effect="non-scaling-stroke"
    />
    <polyline
      v-if="points"
      :points="points"
      fill="none"
      :stroke="color"
      :stroke-width="strokeWidth"
      opacity="0.9"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>

<script setup lang="ts">
// Inline SVG sparkline — echarts is overkill at this size, and the polyline keeps the stroke
// crisp against the 1px panel borders.
const props = withDefaults(defineProps<{
  values: number[]
  color?: string
  height?: number
  strokeWidth?: number
  /** Index of a value to mark with a dashed vertical guide (a boundary, e.g. a cycle start). */
  markIndex?: number | null
}>(), {
  color: '#2ce8a4',
  height: 34,
  strokeWidth: 1.5,
  markIndex: null
})

const W = 120

/** Inset the line so a peak or trough isn't clipped by the viewBox edge. */
const PAD = 3

const points = computed(() => {
  const vals = props.values.filter(v => Number.isFinite(v))
  if (vals.length < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const usable = Math.max(1, props.height - PAD * 2)
  return vals
    .map((v, i) => `${(i / (vals.length - 1)) * W},${props.height - PAD - ((v - min) / range) * usable}`)
    .join(' ')
})

// The guide shares the polyline's index space, so it only makes sense when the caller's
// values are already all finite (filtering would shift indices out from under it).
const markX = computed(() => {
  const n = props.values.length
  if (props.markIndex == null || props.markIndex < 0 || props.markIndex >= n || n < 2) return null
  return (props.markIndex / (n - 1)) * W
})
</script>
