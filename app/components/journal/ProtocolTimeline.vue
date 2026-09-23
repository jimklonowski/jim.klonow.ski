<script setup lang="ts">
// The protocol-timeline gantt: a header with a week/month zoom, one row per compound (standing
// meds first, then logged compounds by first use), and a lab-draw + "now" row underneath.
// The compounds page shows it compact with a collapsed preview; the calendar shows it roomier
// and in full. The slot math lives in shared/utils/timeline.ts.
import { buildTimeline, type TimelineZoom } from '#shared/utils/timeline'
import { STANDING_COMPOUNDS } from '~/data/journal'

const props = withDefaults(defineProps<{
  label: string
  entries: Array<{ date: string, peptides?: Array<{ compound: string }> | null }>
  labDates: string[]
  /** First day on the axis; null when there's nothing logged yet. */
  from: string | null
  today: string
  size?: 'sm' | 'md'
  /** Collapse to the standing rows plus this many logged ones, with a "+ N more" toggle. */
  preview?: number
  emptyText?: string
}>(), {
  size: 'sm',
  preview: undefined,
  emptyText: 'No compound data yet.'
})

const zoom = defineModel<TimelineZoom>('zoom', { default: 'month' })
const ZOOM_OPTS: TimelineZoom[] = ['week', 'month']
const md = computed(() => props.size === 'md')

const timeline = computed(() => props.from
  ? buildTimeline({
      entries: props.entries,
      standing: STANDING_COMPOUNDS,
      labDates: props.labDates,
      from: props.from,
      today: props.today,
      zoom: zoom.value
    })
  : null)

const rows = computed(() => timeline.value?.rows ?? [])

// The collapsed preview keeps every standing row plus the first few logged ones, so adding a
// standing med never pushes a logged compound out of the default view.
const showAll = ref(false)
const previewCount = computed(() =>
  props.preview == null ? Infinity : (timeline.value?.standingCount ?? 0) + props.preview
)
const visibleRows = computed(() => showAll.value ? rows.value : rows.value.slice(0, previewCount.value))
const hiddenCount = computed(() => Math.max(0, rows.value.length - previewCount.value))

const unitSuffix = computed(() => zoom.value === 'week' ? 'w' : 'mo')
</script>

<template>
  <div>
    <TuiHeader :label="label">
      <span
        class="flex gap-2.5"
        :class="md ? 'text-[11px]' : 'text-[10px]'"
      >
        <button
          v-for="opt in ZOOM_OPTS"
          :key="opt"
          type="button"
          class="cursor-pointer"
          :class="[md ? 'uppercase tracking-[0.12em]' : 'normal-case', zoom === opt ? 'text-accent' : 'text-faint hover:text-accent']"
          :aria-pressed="zoom === opt"
          @click="zoom = opt"
        >{{ zoom === opt ? `[${opt}]` : opt }}</button>
      </span>
    </TuiHeader>

    <p
      v-if="!rows.length"
      class="mt-2.5 text-[12px] text-muted"
    >
      {{ emptyText }}
    </p>

    <div
      v-else
      :class="md ? 'mt-3 space-y-1' : 'flex flex-col gap-1 mt-2.5'"
    >
      <JournalGanttRow
        v-for="row in visibleRows"
        :key="row.name"
        :name="row.name"
        :runs="row.runs"
        :trailing="`${row.count}${unitSuffix}`"
        :size="size"
      />

      <!-- Lab draw markers + now line -->
      <div
        class="flex items-center"
        :class="md ? 'gap-3 pt-1.5' : 'gap-2.5 text-[10px]'"
      >
        <button
          v-if="hiddenCount || showAll"
          type="button"
          class="shrink-0 text-right text-faint hover:text-accent cursor-pointer truncate"
          :class="md ? 'w-30 sm:w-38 text-[11px]' : 'w-24 sm:w-30'"
          @click="showAll = !showAll"
        >
          {{ showAll ? '− fewer rows' : `+ ${hiddenCount} more rows` }}
        </button>
        <span
          v-else
          class="shrink-0 text-right text-muted"
          :class="md ? 'w-30 sm:w-38 text-[11px]' : 'w-24 sm:w-30'"
        >lab draws</span>

        <div
          class="relative flex-1 min-w-0"
          :class="md ? 'h-2.75' : 'h-2.25'"
        >
          <NuxtLink
            v-for="mark in timeline?.labMarks ?? []"
            :key="mark.slot"
            to="/labs"
            class="absolute top-0 -translate-x-1/2 text-accent leading-none hover:text-accent-hover"
            :class="md ? 'text-[10px]' : 'text-[8px]'"
            :style="{ left: `${mark.left}%` }"
            :title="mark.title"
          >▲</NuxtLink>
          <span
            v-if="timeline?.nowLeft != null"
            class="absolute inset-y-0 w-px bg-accent"
            :style="{ left: `${timeline.nowLeft}%` }"
            title="now"
          />
        </div>
        <span
          class="shrink-0"
          :class="md ? 'w-9' : 'w-7'"
        />
      </div>
    </div>
  </div>
</template>
