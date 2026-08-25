<template>
  <div>
    <TuiHeader :label="headerLabel">
      <span class="text-[11px] text-muted">
        <span class="text-danger">{{ flagCounts.high }} high</span>
        · <span class="text-warn">{{ flagCounts.low }} low</span>
        · {{ flagCounts.optimal }} optimal
      </span>
    </TuiHeader>

    <div class="flex flex-col gap-2.5 mt-3">
      <NuxtLink
        v-for="f in flagged"
        :key="f.key"
        to="/labs"
        class="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[190px_120px_1fr_110px] gap-x-3 gap-y-1.5 items-center px-3 py-2.5 bg-raised border-l-2 hover:bg-[#101a15] transition-colors"
        :style="{ borderLeftColor: color(f) }"
      >
        <span class="text-[12.5px] text-hi truncate">{{ f.meta.label }}</span>

        <span
          class="num-display text-[17px] leading-none whitespace-nowrap text-right lg:text-left"
          :style="{ color: color(f) }"
        >{{ format(f.value) }}<span
          v-if="f.meta.unit"
          class="text-[10px] text-muted"
        > {{ f.meta.unit }}</span></span>

        <TuiRangeBar
          :value="f.value"
          :meta="f.meta"
          class="col-span-2 lg:col-span-1"
        />

        <span
          class="text-[11px] text-right col-span-2 lg:col-span-1"
          :style="{ color: color(f) }"
        >{{ tag(f) }}</span>
      </NuxtLink>
    </div>

    <p
      v-if="!flagged.length"
      class="mt-3 text-[12px] text-muted"
    >
      {{ hasDraw ? 'Every marker on the latest draw is in range.' : 'No lab draws recorded yet.' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { FlaggedMarker } from '~/composables/useOverview'

const props = defineProps<{
  flagged: FlaggedMarker[]
  flagCounts: { high: number, low: number, optimal: number }
  drawDate: string | null
}>()

const hasDraw = computed(() => props.drawDate != null)

const headerLabel = computed(() =>
  props.drawDate
    ? `FLAGGED MARKERS · ${formatDate(props.drawDate, 'monthDay').toUpperCase()} DRAW`
    : 'FLAGGED MARKERS'
)

function color(f: FlaggedMarker) {
  return f.status === 'high' ? '#e86a5e' : '#e8b34b'
}

function format(v: number) {
  return Number.isInteger(v) ? v.toString() : v.toFixed(v < 10 ? 1 : 0)
}

/** e.g. "HIGH ▲ 1782", or "LOW · first" on a first-ever reading. */
function tag(f: FlaggedMarker) {
  const label = f.status.toUpperCase()
  if (f.delta == null) return `${label} · first`
  const arrow = f.delta >= 0 ? '▲' : '▼'
  const magnitude = Math.abs(f.delta)
  return `${label} ${arrow} ${magnitude >= 10 ? Math.round(magnitude) : magnitude.toFixed(1)}`
}
</script>
