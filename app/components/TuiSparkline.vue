<template>
  <svg
    :viewBox="`0 0 ${W} ${height}`"
    preserveAspectRatio="none"
    width="100%"
    :height="height"
    class="block"
    aria-hidden="true"
  >
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
}>(), {
  color: '#2ce8a4',
  height: 34,
  strokeWidth: 1.5
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
</script>
