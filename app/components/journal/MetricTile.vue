<template>
  <component
    :is="to ? 'NuxtLink' : 'div'"
    :to="to"
    class="block bg-raised border border-line-soft px-3 py-2.5"
    :class="to ? 'hover:bg-[#101a15] transition-colors' : ''"
  >
    <div class="flex items-baseline gap-2 text-[10px] text-muted">
      <span class="uppercase tracking-[0.1em] truncate">{{ label }}</span>
      <span
        v-if="unit"
        class="text-faint shrink-0"
      >{{ unit }}</span>
      <span
        class="ml-auto shrink-0"
        :class="accent ? 'text-accent' : 'text-hi'"
      >{{ value }}</span>
    </div>

    <div
      :style="{ height: `${height}px` }"
      class="mt-1.5"
    >
      <ClientOnly>
        <AreaChart
          v-if="hasData"
          :data="chartData"
          :categories="categories"
          :height="height"
          :mark-lines="markLines"
          bare
        />
        <template #fallback>
          <div :style="{ height: `${height}px` }" />
        </template>
      </ClientOnly>
    </div>
  </component>
</template>

<script setup lang="ts">
import { CHART_ACCENT } from '~/utils/chartTheme'

// One bordered metric tile: label + unit on the left, latest value on the right, and a bare
// line beneath. Used for both chart groups on /journal/trends and the vital tiles on the hub.
const props = withDefaults(defineProps<{
  label: string
  unit?: string
  /** Pre-formatted latest reading, e.g. "167.8" or "125/74" or "6h55m". */
  value: string
  /** Render the value in accent (a reading that's in a good place). */
  accent?: boolean
  /** One entry per line. Multi-series tiles (BP) pass two. */
  series: Array<{ key: string, name: string, color?: string }>
  /** Rows keyed by `date` plus one field per series key. */
  rows: Array<Record<string, string | number | null>>
  height?: number
  /** x-axis labels to dash a vertical guide at (lab draw dates). */
  markLines?: string[]
  to?: string
}>(), {
  height: 46,
  markLines: () => []
})

const categories = computed(() =>
  Object.fromEntries(props.series.map(s => [s.key, { name: s.name, color: s.color ?? CHART_ACCENT }]))
)

// Drop rows where every series is blank so a sparse metric doesn't render a flat-line stub.
const chartData = computed(() =>
  props.rows.filter(r => props.series.some(s => r[s.key] != null))
)

const hasData = computed(() => chartData.value.length >= 2)
</script>
