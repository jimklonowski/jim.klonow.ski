<template>
  <div class="space-y-1">
    <div class="relative h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-visible">
      <!-- Reference range highlight -->
      <div
        v-if="rangeStyle"
        class="absolute h-full rounded-full bg-green-200 dark:bg-green-900/50"
        :style="rangeStyle"
      />
      <!-- Value marker -->
      <div
        v-if="markerStyle"
        class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-neutral-900 shadow-sm -translate-x-1/2"
        :class="markerColor"
        :style="markerStyle"
      />
    </div>
    <div class="flex justify-between text-xs text-muted">
      <span>{{ formatLabel(displayMin) }}</span>
      <span>{{ formatLabel(displayMax) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getStatus } from '~/data/biomarkers'
import type { BiomarkerMeta } from '~/data/biomarkers'

const props = defineProps<{
  value: number | null
  meta: BiomarkerMeta
}>()

const PADDING = 0.25

const displayMin = computed(() => {
  const { refMin, refMax } = props.meta
  if (refMin !== undefined && refMax !== undefined) {
    const range = refMax - refMin
    return refMin - range * PADDING
  }
  if (refMax !== undefined) return 0
  if (refMin !== undefined) return refMin * 0.5
  return 0
})

const displayMax = computed(() => {
  const { refMin, refMax } = props.meta
  if (refMin !== undefined && refMax !== undefined) {
    const range = refMax - refMin
    return refMax + range * PADDING
  }
  if (refMax !== undefined) return refMax * 1.5
  if (refMin !== undefined) return refMin * 2
  return 100
})

function toPercent(v: number) {
  return Math.min(100, Math.max(0, ((v - displayMin.value) / (displayMax.value - displayMin.value)) * 100))
}

const rangeStyle = computed(() => {
  const { refMin, refMax } = props.meta
  if (refMin === undefined && refMax === undefined) return null

  const left = refMin !== undefined ? toPercent(refMin) : 0
  const right = refMax !== undefined ? toPercent(refMax) : 100

  return { left: `${left}%`, width: `${right - left}%` }
})

const markerStyle = computed(() => {
  if (props.value === null || props.value === undefined) return null
  return { left: `${toPercent(props.value)}%` }
})

const markerColor = computed(() => {
  if (props.value === null) return 'bg-neutral-400'
  const status = getStatus(props.value, props.meta)
  return status === 'optimal' ? 'bg-green-500' : status === 'low' ? 'bg-amber-500' : 'bg-red-500'
})

function formatLabel(v: number) {
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v % 1 === 0 ? v.toString() : v.toFixed(1)
}
</script>
