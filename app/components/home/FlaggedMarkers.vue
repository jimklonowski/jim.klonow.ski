<template>
  <div>
    <TuiHeader
      :label="headerLabel"
      fill
    >
      <span class="text-meta text-muted">
        <span class="text-danger">{{ flagCounts.high }} high</span>
        · <span class="text-warn">{{ flagCounts.low }} low</span>
        · {{ flagCounts.optimal }} in range
      </span>
    </TuiHeader>

    <div class="flex flex-col gap-2.5 mt-3">
      <NuxtLink
        v-for="f in flagged"
        :key="f.key"
        :to="{ path: '/labs', query: { marker: f.key } }"
        class="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[190px_120px_1fr_110px] gap-x-3 gap-y-1.5 items-center px-3 py-2.5 bg-raised border-l-2 hover:bg-row-hover transition-colors"
        :style="{ borderLeftColor: color(f) }"
      >
        <span class="text-row text-hi truncate">{{ f.meta.label }}<span
          v-if="f.date !== drawDate"
          class="ml-1.5 text-micro text-muted"
          :title="`Not on the ${drawDate ? formatDate(drawDate, 'monthDay') : 'latest'} draw — the newest reading, from ${formatDate(f.date, 'monthDay')}`"
        >· {{ formatDate(f.date, 'monthDay') }}</span></span>

        <span
          class="num-display text-stat leading-none whitespace-nowrap text-right lg:text-left"
          :style="{ color: color(f) }"
        >{{ format(f.value) }}<span
          v-if="f.meta.unit"
          class="ml-1 text-micro text-muted"
        >{{ f.meta.unit }}</span></span>

        <TuiRangeBar
          :value="f.value"
          :meta="f.meta"
          class="col-span-2 lg:col-span-1"
        />

        <span
          class="text-meta text-right col-span-2 lg:col-span-1"
          :style="{ color: color(f) }"
        >{{ tag(f) }}</span>
      </NuxtLink>
    </div>

    <p
      v-if="!flagged.length"
      class="mt-3 text-small text-muted"
    >
      {{ hasDraw ? 'Every current reading is in range.' : 'No lab draws recorded yet.' }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { STATUS_COLORS } from '~/utils/chartTheme'
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
  return STATUS_COLORS[f.status]
}

/** The value as the lab reported it — 51.7, 1.28, 2070 — trimmed to two decimals only where a
 * computed marker carries more. It used to round anything from 10 up to a whole number, so a
 * hematocrit of 51.7 read "52" against a 51.1 limit. */
function format(v: number) {
  return Number.isInteger(v) ? v.toString() : String(Math.round(v * 100) / 100)
}

/** e.g. "HIGH ▲ 1782", "HIGH ▼ 172.9", or "LOW · first" on a first-ever reading. */
function tag(f: FlaggedMarker) {
  const label = f.status.toUpperCase()
  if (f.delta == null) return `${label} · first`
  const arrow = f.delta >= 0 ? '▲' : '▼'
  return `${label} ${arrow} ${format(Math.abs(f.delta))}`
}
</script>
