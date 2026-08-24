<template>
  <div class="bg-raised border border-line-soft">
    <div class="flex items-start justify-between gap-3 px-3.5 py-2.5 border-b border-line-soft">
      <div class="min-w-0">
        <p class="text-[12.5px] text-hi truncate">
          {{ label }}
        </p>
        <p
          v-if="unit"
          class="text-[10.5px] text-muted"
        >
          {{ unit }}
        </p>
      </div>
      <div
        v-if="$slots.meta"
        class="text-[10.5px] text-muted text-right shrink-0"
      >
        <slot name="meta" />
      </div>
    </div>
    <div class="px-2 py-2.5">
      <ClientOnly>
        <AreaChart
          :data="data"
          :categories="resolvedCategories"
          :height="height"
          :show-legend="showLegend"
          :mark-lines="markLines"
          :step="step"
        />
        <template #fallback>
          <div :style="{ height: `${height}px` }" />
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CHART_ACCENT } from '~/utils/chartTheme'

// The one chart-in-card shell (label/unit header + ClientOnly AreaChart) that was previously
// copy-pasted across the labs, dexa, journal, and compound pages with drifting heights/colors.
const props = withDefaults(defineProps<{
  label: string
  unit?: string
  data: Array<Record<string, string | number>>
  /** Single-series color; ignored when `categories` is given. */
  color?: string
  /** Multi-series override; defaults to one `value` series named after the label. */
  categories?: Record<string, { name: string, color: string }>
  height?: number
  showLegend?: boolean
  /** Dashed vertical guides at these x-axis values. */
  markLines?: string[]
  /** Render as a step line — right for values that hold flat between changes, like a dose. */
  step?: boolean
}>(), { color: CHART_ACCENT, height: 128, showLegend: false, markLines: () => [], step: false })

const resolvedCategories = computed(() =>
  props.categories ?? { value: { name: props.label, color: props.color } }
)
</script>
