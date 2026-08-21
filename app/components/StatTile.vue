<template>
  <UCard
    :class="clickable ? 'cursor-pointer hover:ring-1 hover:ring-primary/50 transition-shadow' : ''"
    @click="clickable && emit('click')"
  >
    <div class="space-y-2 font-mono">
      <p class="text-xs text-muted uppercase tracking-wider leading-tight">
        {{ label }}
      </p>
      <div class="flex items-end gap-1">
        <span class="text-2xl font-bold tabular-nums">{{ value ?? '—' }}</span>
        <span
          v-if="unit"
          class="text-xs text-muted mb-0.5"
        >{{ unit }}</span>
      </div>
      <div
        v-if="delta != null"
        class="flex items-center gap-1 text-xs text-muted"
      >
        <UIcon
          :name="deltaIcon"
          :class="deltaColorClass"
          class="w-3.5 h-3.5 shrink-0"
        />
        <span :class="deltaColorClass">{{ deltaText || fallbackDeltaText }}</span>
        <span>{{ deltaLabel }}</span>
      </div>
      <p
        v-else-if="subtext"
        class="text-xs text-muted"
      >
        {{ subtext }}
      </p>
      <p
        v-if="asOf"
        class="text-xs text-muted/70"
      >
        as of {{ asOf }}
      </p>
    </div>
  </UCard>
</template>

<script setup lang="ts">
// The one stat-tile: value + optional "±x vs prev" delta line. Replaces three near-identical
// page-local implementations (dexa key metrics, journal health metrics, journal latest vitals)
// that had drifted apart, including opposite polarity conventions.
const props = withDefaults(defineProps<{
  label: string
  /** Pre-formatted display value; null renders an em dash. */
  value: string | number | null
  unit?: string
  /** Raw numeric delta — drives the trend icon and good/bad coloring. */
  delta?: number | null
  /** Pre-formatted delta text; defaults to the signed rounded delta. */
  deltaText?: string
  deltaLabel?: string
  /** Coloring polarity. Omit for neutral gray (no judgment). */
  lowerIsBetter?: boolean
  /** Small muted line shown when there is no delta (e.g. a unit note). */
  subtext?: string
  /** "as of <date>" line for stale readings. */
  asOf?: string
  clickable?: boolean
}>(), { deltaLabel: 'vs prev' })

const emit = defineEmits<{ click: [] }>()

const deltaIcon = computed(() => {
  const d = props.delta
  if (d == null || Math.abs(d) < 0.01) return 'i-lucide-minus'
  return d > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'
})

const deltaColorClass = computed(() => {
  const d = props.delta
  if (d == null || Math.abs(d) < 0.01 || props.lowerIsBetter === undefined) return 'text-muted'
  return (props.lowerIsBetter && d < 0) || (!props.lowerIsBetter && d > 0) ? 'text-success' : 'text-error'
})

const fallbackDeltaText = computed(() => {
  const d = props.delta
  if (d == null) return ''
  const sign = d >= 0 ? '+' : ''
  return `${sign}${Math.abs(d) >= 10 ? Math.round(d) : d.toFixed(1)}`
})
</script>
