<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="bg-raised border border-line-soft px-3.5 py-3 text-left w-full"
    :class="clickable ? 'cursor-pointer hover:bg-[#101a15] transition-colors' : ''"
    @click="clickable && emit('click')"
  >
    <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
      {{ label }}
    </p>

    <div class="flex items-baseline gap-1.5 mt-1.5">
      <span class="num-display text-[26px] leading-none">{{ value ?? '—' }}</span>
      <span
        v-if="unit"
        class="text-[10.5px] text-muted"
      >{{ unit }}</span>
    </div>

    <p
      v-if="delta != null"
      class="mt-1.5 text-[11px]"
      :class="deltaClass"
    >
      {{ arrow }} {{ deltaText || fallbackDeltaText }}<span class="text-muted"> {{ deltaLabel }}</span>
    </p>
    <p
      v-else-if="subtext"
      class="mt-1.5 text-[11px] text-muted"
    >
      {{ subtext }}
    </p>

    <p
      v-if="asOf"
      class="mt-1 text-[10.5px] text-faint"
    >
      as of {{ asOf }}
    </p>
  </component>
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
  /** Raw numeric delta — drives the trend arrow and good/bad coloring. */
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

const arrow = computed(() => {
  const d = props.delta
  if (d == null || Math.abs(d) < 0.01) return '●'
  return d > 0 ? '▲' : '▼'
})

const deltaClass = computed(() => {
  const d = props.delta
  if (d == null || Math.abs(d) < 0.01 || props.lowerIsBetter === undefined) return 'text-muted'
  const good = props.lowerIsBetter ? d < 0 : d > 0
  return good ? 'text-accent' : 'text-warn'
})

const fallbackDeltaText = computed(() => {
  const d = props.delta
  if (d == null) return ''
  const sign = d >= 0 ? '+' : ''
  return `${sign}${Math.abs(d) >= 10 ? Math.round(d) : d.toFixed(1)}`
})
</script>
