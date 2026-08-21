<template>
  <UCard>
    <template #header>
      <p class="text-sm font-medium font-mono">
        {{ label }}
      </p>
      <p
        v-if="unit"
        class="text-xs text-muted font-mono"
      >
        {{ unit }}
      </p>
    </template>
    <ClientOnly>
      <AreaChart
        :data="data"
        :categories="resolvedCategories"
        :height="height"
        :show-legend="showLegend"
      />
    </ClientOnly>
  </UCard>
</template>

<script setup lang="ts">
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
}>(), { color: '#22c55e', height: 128, showLegend: false })

const resolvedCategories = computed(() =>
  props.categories ?? { value: { name: props.label, color: props.color } }
)
</script>
