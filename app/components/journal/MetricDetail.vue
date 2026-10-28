<template>
  <UModal
    v-model:open="open"
    :title="label"
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- The latest reading, big, and the page's own range picker: one range + smoothing state
             governs every trend chart, so a switch made here is the one the tiles follow too. -->
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <span
            class="num-display text-figure leading-none whitespace-nowrap"
            :class="accent ? 'text-accent' : 'text-hi'"
          >{{ value }}<span
            v-if="unit"
            class="text-label text-muted ml-1.5 tracking-normal"
          >{{ unit }}</span></span>
          <JournalRangePicker :show-notes="showNotes" />
        </div>

        <div class="border border-line-soft bg-inset px-1 py-2">
          <ClientOnly>
            <AreaChart
              v-if="data.length"
              :data="data"
              :categories="categories"
              :height="CHART_HEIGHT"
              :x-axis-key="xAxisKey"
              :mark-lines="markLines"
              :annotations="annotations"
              :connect-nulls="connect"
              :show-legend="series.length > 1"
              :format-value="format"
              fit-y
            />
            <p
              v-else
              class="text-small text-muted px-2"
              :style="{ height: `${CHART_HEIGHT}px` }"
            >
              Fewer than two readings in this range.
            </p>
            <template #fallback>
              <div :style="{ height: `${CHART_HEIGHT}px` }" />
            </template>
          </ClientOnly>
        </div>

        <!-- Per series: the figures a reader squints at the big line for. From the raw readings,
             never the smoothed line, so LOW and HIGH name a day something was actually measured. -->
        <div
          v-for="s in stats"
          :key="s.key"
          class="space-y-1.5"
        >
          <TuiHeader
            :label="s.name.toUpperCase()"
            fill
          >
            <span class="text-micro text-muted">{{ s.summary }}</span>
          </TuiHeader>
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div
              v-for="(cell, i) in s.cells"
              :key="cell.label"
              class="border border-line-soft px-2.5 py-2 min-w-0"
              :class="i === s.cells.length - 1 && s.cells.length % 2 ? 'col-span-2 sm:col-span-1' : ''"
            >
              <p class="text-label text-muted uppercase tracking-[0.12em]">
                {{ cell.label }}
              </p>
              <p
                class="num-display text-stat leading-none mt-1 whitespace-nowrap"
                :class="cell.tone === 'accent' ? 'text-accent' : cell.tone === 'muted' ? 'text-muted' : 'text-hi'"
              >
                {{ cell.value }}
              </p>
              <p
                v-if="cell.hint"
                class="text-micro text-faint mt-1 truncate"
              >
                {{ cell.hint }}
              </p>
            </div>
          </div>
        </div>

        <p class="text-label text-muted leading-[1.6]">
          {{ legend }}
        </p>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import type { PlacedAnnotation } from '#shared/utils/chartAnnotations'
import { mean } from '#shared/utils/stats'
import { CHART_ACCENT } from '~/utils/chartTheme'

// The expanded view of one JournalMetricTile: the same series at full size with axes and grid,
// the y-axis fitted to the readings, the range picker in reach, and a stats strip per series.
// Receives the tile's already-trimmed chart rows (`data`, `xAxisKey`, placed `annotations`) so the
// two views can never disagree about what is on the line.
type Row = Record<string, string | number | null>

const props = withDefaults(defineProps<{
  label: string
  unit?: string
  /** Pre-formatted latest reading, the tile's own. */
  value: string
  accent?: boolean
  series: Array<{ key: string, name: string, color?: string }>
  /** The tile's chart rows: trimmed to its first and last reading, smoothed when 7d avg is on. */
  data: Row[]
  xAxisKey: string
  /** The same rows before smoothing, for the stats. Falls back to `data`. */
  rawRows?: Row[]
  markLines?: string[]
  annotations?: PlacedAnnotation[]
  connect?: boolean
  /** Offer the protocol-notes toggle in the picker (the page draws annotations). */
  showNotes?: boolean
  /** How a reading prints in the stats strip; defaults to integer-or-one-decimal. */
  format?: (v: number) => string
}>(), {
  unit: '',
  accent: false,
  rawRows: undefined,
  markLines: () => [],
  annotations: () => [],
  connect: false,
  showNotes: false,
  format: undefined
})

const open = defineModel<boolean>('open', { default: false })

const CHART_HEIGHT = 280

const { smooth } = useTrendRange()

/** What the marks on the big chart mean, only the ones it carries. */
const legend = computed(() => [
  smooth.value ? 'Line: trailing 7-reading average · figures below it: the raw readings.' : null,
  props.markLines.length ? 'Dashed verticals: lab draws.' : null,
  props.annotations.length ? 'Ember lines: dose changes · bands: events and cycles.' : null,
  'Hover the line for the day\'s values.'
].filter(Boolean).join(' '))

const categories = computed(() =>
  Object.fromEntries(props.series.map(s => [s.key, { name: s.name, color: s.color ?? CHART_ACCENT }]))
)

const fmt = (v: number) => (props.format ? props.format(v) : Number.isInteger(v) ? String(v) : v.toFixed(1))

/** "Oct 17" for a row, from its ISO `day` when it has one, else its axis label. */
function dayOf(row: Row): string {
  const d = row.day
  return typeof d === 'string' ? formatDate(d, 'monthDay') : String(row.date ?? '')
}

interface Cell { label: string, value: string, hint?: string, tone?: 'accent' | 'muted' }

const stats = computed(() => {
  const source = props.rawRows ?? props.data
  return props.series.map((s) => {
    const readings = source.flatMap(r => (typeof r[s.key] === 'number' ? [{ row: r, v: r[s.key] as number }] : []))
    const n = readings.length
    if (!n) return { key: s.key, name: s.name, summary: 'no readings in range', cells: [] as Cell[] }
    const first = readings[0]!
    const last = readings[n - 1]!
    let low = first
    let high = first
    for (const r of readings) {
      if (r.v < low.v) low = r
      if (r.v > high.v) high = r
    }
    const avg = mean(readings.map(r => r.v))!
    const delta = last.v - first.v
    const cells: Cell[] = [
      { label: 'latest', value: fmt(last.v), hint: dayOf(last.row) },
      { label: 'mean', value: fmt(avg), hint: `${n} reading${n === 1 ? '' : 's'}` },
      { label: 'low', value: fmt(low.v), hint: dayOf(low.row) },
      { label: 'high', value: fmt(high.v), hint: dayOf(high.row) },
      {
        label: 'change',
        value: n > 1 ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${fmt(Math.abs(delta))}` : '—',
        hint: n > 1 ? `${dayOf(first.row)} → ${dayOf(last.row)}` : undefined,
        tone: n > 1 && delta === 0 ? 'muted' : undefined
      }
    ]
    return {
      key: s.key,
      name: s.name,
      summary: `${dayOf(first.row)} – ${dayOf(last.row)}`,
      cells
    }
  })
})
</script>
