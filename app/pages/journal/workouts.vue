<template>
  <div>
    <JournalHeader
      section="WORKOUTS"
      :meta="`${workouts.length.toLocaleString('en-US')} sessions`"
    >
      <template #actions>
        <span class="text-[11px] text-muted">source: apple + whoop · auto-merged</span>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      :empty="!workouts.length"
      empty-title="No workouts synced"
      empty-description="Sessions arrive from Apple Health and Whoop automatically."
      @retry="refresh"
    />

    <!-- Stat cells + type mix -->
    <div class="grid grid-cols-2 lg:grid-cols-[repeat(4,1fr)_1.6fr] gap-px bg-line border-b border-line">
      <div
        v-for="cell in statCells"
        :key="cell.label"
        class="bg-bg px-4 py-2.5"
      >
        <p class="text-[9.5px] text-faint uppercase tracking-widest">
          {{ cell.label }}
        </p>
        <p class="num-display text-[21px] leading-none mt-1">
          {{ cell.value }}
        </p>
        <p
          class="text-[9.5px] mt-0.5"
          :class="cell.captionClass ?? 'text-muted'"
        >
          {{ cell.caption }}
        </p>
      </div>

      <div class="bg-bg px-4 py-2.5 col-span-2 lg:col-span-1">
        <p class="text-[9.5px] text-faint uppercase tracking-widest">
          Type mix · 90d
        </p>
        <div
          v-for="mix in typeMix"
          :key="mix.label"
          class="flex items-center gap-2 mt-1.5 text-[10px]"
        >
          <span class="w-22 shrink-0 text-dim uppercase">{{ mix.label }}</span>
          <span class="flex-1 h-1.75 bg-line-soft min-w-0">
            <span
              class="block h-full"
              :style="{ width: `${mix.pct}%`, background: mix.color }"
            />
          </span>
          <span class="w-8 shrink-0 text-right text-muted">{{ mix.pct }}%</span>
        </div>
        <p
          v-if="!typeMix.length"
          class="mt-1.5 text-[10px] text-muted"
        >
          No sessions in the last 90 days.
        </p>
      </div>
    </div>

    <!-- Session log, grouped by week -->
    <div class="px-4 sm:px-6">
      <template
        v-for="group in weekGroups"
        :key="group.weekStart"
      >
        <p class="pt-2.5 pb-1 text-[10px] text-faint uppercase tracking-[0.14em]">
          ── week of {{ group.label }} · {{ group.count }} sessions · {{ group.minutes }} min
        </p>
        <div
          v-for="w in group.rows"
          :key="w.id"
          class="grid grid-cols-[auto_1fr] lg:grid-cols-[90px_minmax(0,1fr)_54px_90px_80px_88px_70px] gap-x-2.5 gap-y-1 items-baseline py-1.5 border-b border-line-row last:border-0 text-[11.5px]"
        >
          <span class="text-muted uppercase">{{ formatDate(w.date, 'monthDay') }}</span>
          <span class="text-hi truncate">
            {{ w.workout_type ?? 'Workout' }}
            <span
              v-if="w.sources.length"
              class="text-[10px] text-ghost"
            >{{ w.sources.join('+') }}</span>
          </span>
          <!-- Below lg the five stats share one wrapped row spanning both columns. Dealt into
               the 2-column grid they alternated between the date and type columns, so a
               right-aligned "142 kcal" landed under the date — unreadable on a phone.
               `lg:contents` dissolves this wrapper again so the 7-column grid gets its cells. -->
          <span class="col-span-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 lg:contents">
            <span class="num-display text-muted text-right whitespace-nowrap">{{ workoutTime(w.start_time) ?? '' }}</span>
            <span class="text-dim text-right whitespace-nowrap">{{ w.duration_min != null ? `${w.duration_min} min` : '' }}</span>
            <span class="text-dim text-right whitespace-nowrap">{{ w.calories != null ? `${w.calories} kcal` : '' }}</span>
            <!-- Coloured by avg, not max: max spikes on nearly every session and would light the
               whole column up. The max reads dimmer so the pair stays scannable as avg-first. -->
            <span
              class="text-right whitespace-nowrap"
              :class="hrClass(w.avg_hr)"
              :title="hrZone(w.avg_hr) ?? undefined"
            >{{ w.avg_hr != null ? `♥ ${w.avg_hr}` : w.max_hr != null ? '♥ —' : ''
            }}<span
              v-if="hrZone(w.avg_hr)"
              class="sr-only"
            > ({{ hrZone(w.avg_hr) }})</span><span
              v-if="w.max_hr != null"
              class="text-muted"
            >/{{ w.max_hr }}</span></span>
            <span class="text-muted text-right whitespace-nowrap">{{ w.distance_mi != null ? `${w.distance_mi} mi` : '' }}</span>
          </span>
        </div>
      </template>

      <p
        v-if="!workouts.length"
        class="py-5 text-[12px] text-muted"
      >
        No workouts synced yet.
      </p>
    </div>

    <TuiPager
      v-model:page="page"
      :total-pages="totalPages"
      class="mt-1"
    />
  </div>
</template>

<script setup lang="ts">
import { diffDays, weekStartOf } from '#shared/utils/dates'
import type { WorkoutEntry } from '#shared/types/journal'
import { CHART_ACCENT, CHART_INDIGO } from '~/utils/chartTheme'

useSeoMeta({ title: 'Journal · Workouts' })

const { data, refresh, error } = await useWorkoutsEntries()

// Newest first — the log reads backwards from today. Sorting on date alone left a day's
// sessions in whatever order the API returned, so a morning lift could sit above an evening
// stretch; start_time breaks the tie (nulls last, since '' loses every descending compare).
const workouts = computed(() =>
  [...(data.value ?? [])].sort((a, b) =>
    b.date.localeCompare(a.date)
    || (b.start_time ?? '').localeCompare(a.start_time ?? '')
  )
)

const today = localToday()

function daysAgo(date: string) {
  return diffDays(date, today)
}

// --- stat cells (trailing 7 days vs the 7 before it) ---
const thisWeek = computed(() => workouts.value.filter(w => daysAgo(w.date) < 7))
const prevWeek = computed(() => workouts.value.filter(w => daysAgo(w.date) >= 7 && daysAgo(w.date) < 14))

function sum(rows: WorkoutEntry[], field: 'duration_min' | 'calories') {
  return rows.reduce((t, w) => t + (w[field] ?? 0), 0)
}

const statCells = computed(() => {
  const count = thisWeek.value.length
  const delta = count - prevWeek.value.length
  const hrs = thisWeek.value.map(w => w.avg_hr).filter((v): v is number => v != null)
  const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null

  return [
    {
      label: 'This week',
      value: count.toString(),
      caption: delta === 0
        ? `● same as ${prevWeek.value.length} prev`
        : `${delta > 0 ? '▲' : '▼'} vs ${prevWeek.value.length} prev`,
      captionClass: delta === 0 ? 'text-muted' : delta > 0 ? 'text-accent' : 'text-warn'
    },
    { label: 'Minutes', value: Math.round(sum(thisWeek.value, 'duration_min')).toLocaleString('en-US'), caption: '7d total' },
    { label: 'Kcal', value: Math.round(sum(thisWeek.value, 'calories')).toLocaleString('en-US'), caption: '7d total' },
    { label: 'Avg ♥', value: avgHr?.toString() ?? '—', caption: 'bpm' }
  ]
})

// --- type mix over the last 90 days ---
// Apple and Whoop between them emit ~18 distinct type strings, so bucket them into the three
// families the mock shows rather than listing every one.
const TYPE_BUCKETS = [
  { label: 'Strength', color: CHART_ACCENT, match: /strength|weightlift|functional/i },
  { label: 'Cycling', color: '#38b6d9', match: /cycling|spin/i },
  { label: 'Walk/other', color: CHART_INDIGO, match: /./ }
]

const typeMix = computed(() => {
  const recent = workouts.value.filter(w => daysAgo(w.date) <= 90)
  if (!recent.length) return []
  const counts = TYPE_BUCKETS.map(() => 0)
  for (const w of recent) {
    const i = TYPE_BUCKETS.findIndex(b => b.match.test(w.workout_type ?? ''))
    counts[i < 0 ? TYPE_BUCKETS.length - 1 : i]!++
  }
  return TYPE_BUCKETS.map((b, i) => ({
    label: b.label,
    color: b.color,
    pct: Math.round((counts[i]! / recent.length) * 100)
  })).filter(b => b.pct > 0)
})

// --- paginated log, grouped by week ---
const { page, totalPages, pageRows } = usePagination(workouts, 40)

const weekGroups = computed(() => {
  const groups: Array<{ weekStart: string, label: string, count: number, minutes: number, rows: WorkoutEntry[] }> = []
  for (const w of pageRows.value) {
    const weekStart = weekStartOf(w.date)
    let group = groups.at(-1)
    if (group?.weekStart !== weekStart) {
      group = {
        weekStart,
        label: formatDate(weekStart, 'monthDay').toUpperCase(),
        count: 0,
        minutes: 0,
        rows: []
      }
      groups.push(group)
    }
    group.rows.push(w)
    group.count++
    group.minutes += Math.round(w.duration_min ?? 0)
  }
  return groups
})

/** Ember (orange) over 150 bpm, danger red over 180: the effort bands from the mock. */
function hrClass(hr: number | null) {
  if (hr == null) return 'text-dim'
  if (hr > 180) return 'text-danger'
  if (hr > 150) return 'text-ember'
  return 'text-dim'
}

/**
 * The word form of hrClass's colour. The zone was carried by colour alone, which is nothing to a
 * screen reader and little to a red/green-deficient eye — this rides along as a tooltip and as
 * sr-only text, so the dense row keeps its look.
 */
function hrZone(hr: number | null): string | null {
  if (hr == null) return null
  if (hr > 180) return 'peak zone'
  if (hr > 150) return 'hard zone'
  return null
}
</script>
