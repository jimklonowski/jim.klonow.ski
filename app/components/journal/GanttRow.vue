<script setup lang="ts">
// One gantt row: compound name (linking to its page), a track of bars in the compound's
// colour, and a short trailing figure. The protocol timeline (compounds page, calendar) and the
// cycle dossier's plan bars all draw this row. `md` is the calendar's roomier sizing.
import type { GanttRun } from '#shared/utils/timeline'
import { getCompoundColor } from '~/data/journal'

const props = withDefaults(defineProps<{
  name: string
  runs: GanttRun[]
  trailing?: string
  size?: 'sm' | 'md'
  /** Draw the "now" line inside this row's track (the plan bars do; the timeline has its own row). */
  nowLeft?: number | null
  /** Override the trailing column's width/truncation, e.g. for the plan bars' dose labels. */
  trailingClass?: string
}>(), {
  trailing: '',
  size: 'sm',
  nowLeft: null,
  trailingClass: undefined
})

const color = computed(() => getCompoundColor(props.name))
const md = computed(() => props.size === 'md')
</script>

<template>
  <div
    class="flex items-center"
    :class="md ? 'gap-3' : 'gap-2.5 text-[10px]'"
  >
    <NuxtLink
      :to="`/journal/compound/${encodeURIComponent(name)}`"
      class="shrink-0 text-right truncate hover:opacity-70 transition-opacity"
      :class="md ? 'w-30 sm:w-38 text-[11px]' : 'w-24 sm:w-30'"
      :style="{ color }"
    >{{ name }}</NuxtLink>

    <div
      class="relative flex-1 bg-raised min-w-0"
      :class="md ? 'h-2.75' : 'h-2.25'"
    >
      <div
        v-for="(run, i) in runs"
        :key="i"
        class="absolute inset-y-0"
        :style="{ left: `${run.left}%`, width: `${run.width}%`, background: color, opacity: md ? 0.75 : 0.6 }"
        :title="run.title"
      />
      <span
        v-if="nowLeft != null"
        class="absolute inset-y-0 w-px bg-accent"
        :style="{ left: `${nowLeft}%` }"
        title="now"
      />
    </div>

    <span
      class="shrink-0 text-muted"
      :class="trailingClass ?? (md ? 'w-9 text-[11px] text-right' : 'w-7')"
    >{{ trailing }}</span>
  </div>
</template>
