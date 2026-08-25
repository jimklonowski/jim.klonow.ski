<template>
  <div>
    <JournalHeader
      section="CALENDAR"
      :meta="`${monthEntryCount} ${monthEntryCount === 1 ? 'entry' : 'entries'}`"
    >
      <template #actions>
        <span class="flex items-center gap-2.5">
          <button
            type="button"
            class="text-[13px] text-faint hover:text-accent cursor-pointer"
            aria-label="Previous month"
            @click="prevMonth"
          >‹</button>
          <span class="num-display text-hi text-[15px] w-38 text-center">{{ monthLabel }}</span>
          <button
            type="button"
            class="text-[13px] text-faint hover:text-accent cursor-pointer"
            aria-label="Next month"
            @click="nextMonth"
          >›</button>
        </span>
        <NuxtLink
          :to="`/journal/${todayDate}`"
          class="tui-btn tui-btn-accent"
        >
          + NEW ENTRY
        </NuxtLink>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <!-- Compound colour legend for the dose dots in the grid below -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-6 py-2 border-b border-line-soft text-[11px]">
      <span
        v-for="compound in legendCompounds"
        :key="compound"
        class="flex items-center gap-1.5 text-muted"
      >
        <span
          class="w-1.5 h-1.5 rounded-full"
          :style="{ background: getCompoundColor(compound) }"
        />
        {{ shortCompound(compound) }}
      </span>
      <span class="flex items-center gap-1 text-muted">⚗ recon</span>
    </div>

    <!-- Month grid -->
    <div class="grid grid-cols-7 gap-px bg-line border-b border-line">
      <div
        v-for="d in DAY_LABELS"
        :key="d"
        class="bg-bg px-2 py-2 text-[10.5px] text-muted uppercase tracking-[0.12em]"
      >
        {{ d }}
      </div>

      <component
        :is="cell.date ? 'button' : 'div'"
        v-for="(cell, i) in calendarCells"
        :key="i"
        :type="cell.date ? 'button' : undefined"
        class="bg-bg px-2 py-2 min-h-22 text-left align-top"
        :class="[
          cell.date ? 'cursor-pointer hover:bg-[#101a15] transition-colors' : '',
          cell.isToday ? 'outline outline-accent -outline-offset-1' : '',
          cell.isFuture ? 'opacity-40' : ''
        ]"
        :title="cell.title || undefined"
        @click="cell.date && navigateTo(`/journal/${cell.date}`)"
      >
        <template v-if="cell.date">
          <div class="flex items-baseline gap-1.5">
            <span
              class="text-[12px]"
              :class="cell.isToday ? 'text-accent' : 'text-muted'"
            >{{ cell.day }}</span>
            <span
              v-if="cell.isToday"
              class="text-[10.5px] text-accent tracking-[0.12em]"
            >· TODAY</span>
          </div>

          <div
            v-if="cell.compounds.length || cell.marks"
            class="flex flex-wrap items-center gap-1 mt-1.5"
          >
            <span
              v-for="compound in cell.compounds"
              :key="compound"
              class="w-1.75 h-1.75 rounded-full shrink-0"
              :style="{ background: getCompoundColor(compound) }"
              :title="compound"
            />
            <span
              v-if="cell.marks"
              class="text-[10.5px] text-muted"
            >{{ cell.marks }}</span>
          </div>

          <div
            v-if="cell.isDraw"
            class="mt-1 text-[10.5px] text-accent"
          >
            ▲ lab draw
          </div>

          <div
            v-if="cell.weight"
            class="mt-1 text-[12px] text-muted"
          >
            {{ cell.weight }}
          </div>
        </template>
      </component>
    </div>

    <!-- Protocol timeline -->
    <section class="px-4 sm:px-6 py-4">
      <TuiHeader :label="timelineLabel">
        <span class="flex gap-2.5 text-[11px]">
          <button
            v-for="opt in ZOOM_OPTS"
            :key="opt.value"
            type="button"
            class="cursor-pointer uppercase tracking-[0.12em]"
            :class="zoom === opt.value ? 'text-accent' : 'text-faint hover:text-accent'"
            @click="zoom = opt.value"
          >{{ zoom === opt.value ? `[${opt.label}]` : opt.label }}</button>
        </span>
      </TuiHeader>

      <p
        v-if="!timelineCompounds.length"
        class="mt-2.5 text-[12px] text-muted"
      >
        No compound data yet.
      </p>

      <div
        v-else
        class="mt-3 space-y-1"
      >
        <div
          v-for="compound in timelineCompounds"
          :key="compound.name"
          class="flex items-center gap-3"
        >
          <NuxtLink
            :to="`/journal/compound/${encodeURIComponent(compound.name)}`"
            class="shrink-0 w-30 sm:w-38 text-[11px] text-right truncate hover:opacity-70 transition-opacity"
            :style="{ color: getCompoundColor(compound.name) }"
          >
            {{ compound.name }}
          </NuxtLink>

          <div class="relative flex-1 h-2.75 bg-raised min-w-0">
            <div
              v-for="(run, i) in compound.runs"
              :key="i"
              class="absolute inset-y-0"
              :style="{
                left: `${run.left}%`,
                width: `${run.width}%`,
                background: getCompoundColor(compound.name),
                opacity: 0.75
              }"
              :title="run.title"
            />
          </div>

          <span class="shrink-0 w-9 text-[11px] text-muted text-right">
            {{ compound.activeSlots.size }}{{ zoom === 'week' ? 'w' : 'mo' }}
          </span>
        </div>

        <!-- Lab draws + now line -->
        <div class="flex items-center gap-3 pt-1.5">
          <span class="shrink-0 w-30 sm:w-38 text-[11px] text-muted text-right">lab draws</span>
          <div class="relative flex-1 h-2.75 min-w-0">
            <NuxtLink
              v-for="mark in labMarks"
              :key="mark.slot"
              to="/labs"
              class="absolute top-0 -translate-x-1/2 text-[10px] text-accent leading-none hover:text-accent-hover"
              :style="{ left: `${mark.left}%` }"
              :title="mark.title"
            >▲</NuxtLink>
            <span
              v-if="nowLeft != null"
              class="absolute inset-y-0 w-px bg-accent"
              :style="{ left: `${nowLeft}%` }"
              title="now"
            />
          </div>
          <span class="shrink-0 w-9" />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const { data, refresh, error } = await useJournalEntries()
const { data: workoutsData, refresh: refreshWorkouts } = await useWorkoutsEntries()
const { data: labsData } = await useLabsEntries()
const { data: photosData, refresh: refreshPhotos } = await usePhotoEntries()

onMounted(refresh)
onMounted(refreshWorkouts)
onMounted(refreshPhotos)

const entries = computed(() => data.value ?? [])

function countByDate(list: { date: string }[] | null | undefined) {
  const map: Record<string, number> = {}
  for (const row of list ?? []) map[row.date] = (map[row.date] ?? 0) + 1
  return map
}
const workoutCountByDate = computed(() => countByDate(workoutsData.value))
const photoCountByDate = computed(() => countByDate(photosData.value))
const drawDates = computed(() => new Set((labsData.value ?? []).map(l => l.date)))

const todayDate = localToday()
const today = new Date(todayDate + 'T12:00:00')

const currentYear = ref(today.getFullYear())
const currentMonth = ref(today.getMonth())

const monthLabel = computed(() =>
  new Date(currentYear.value, currentMonth.value, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase()
)

function prevMonth() {
  if (currentMonth.value === 0) {
    currentMonth.value = 11
    currentYear.value--
  }
  else {
    currentMonth.value--
  }
}

function nextMonth() {
  if (currentMonth.value === 11) {
    currentMonth.value = 0
    currentYear.value++
  }
  else {
    currentMonth.value++
  }
}

const entryMap = computed(() => {
  const map: Record<string, { compounds: string[], doseCount: number, weight: number | null, reconCount: number }> = {}
  for (const entry of entries.value) {
    const doses = entry.peptides ?? []
    map[entry.date] = {
      compounds: [...new Set(doses.map(p => p.compound))],
      doseCount: doses.length,
      weight: entry.weight_lbs ?? null,
      reconCount: (entry.reconstitutions ?? []).length
    }
  }
  return map
})

interface CalendarCell {
  date: string | null
  day: number | null
  isToday: boolean
  isFuture: boolean
  isDraw: boolean
  hasEntry: boolean
  compounds: string[]
  /** Compact glyph run: extra doses, reconstitutions, photos, workouts. */
  marks: string
  weight: string | null
  title: string
}

const MAX_DOTS = 5

const calendarCells = computed((): CalendarCell[] => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const blank = (): CalendarCell => ({
    date: null, day: null, isToday: false, isFuture: false, isDraw: false,
    hasEntry: false, compounds: [], marks: '', weight: null, title: ''
  })

  const cells: CalendarCell[] = Array.from({ length: firstDay }, blank)

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const entry = entryMap.value[dateStr]
    const workouts = workoutCountByDate.value[dateStr] ?? 0
    const photos = photoCountByDate.value[dateStr] ?? 0

    const marks: string[] = []
    // Only show a ×N when there were more injections than distinct compounds, otherwise
    // the dots already tell the whole story.
    if (entry && entry.doseCount > entry.compounds.length) marks.push(`×${entry.doseCount}`)
    if (entry?.reconCount) marks.push(entry.reconCount > 1 ? `⚗×${entry.reconCount}` : '⚗')
    if (photos) marks.push(photos > 1 ? `📷×${photos}` : '📷')
    if (workouts) marks.push(workouts > 1 ? `♥×${workouts}` : '♥')

    const titleParts: string[] = []
    if (entry?.compounds.length) titleParts.push(entry.compounds.join(', '))
    if (entry?.reconCount) titleParts.push(`${entry.reconCount} reconstitution${entry.reconCount > 1 ? 's' : ''}`)
    if (photos) titleParts.push(`${photos} photo${photos > 1 ? 's' : ''}`)
    if (workouts) titleParts.push(`${workouts} workout${workouts > 1 ? 's' : ''}`)

    cells.push({
      date: dateStr,
      day: d,
      isToday: dateStr === todayDate,
      isFuture: dateStr > todayDate,
      isDraw: drawDates.value.has(dateStr),
      hasEntry: !!entry,
      compounds: entry?.compounds.slice(0, MAX_DOTS) ?? [],
      marks: marks.join(' '),
      weight: entry?.weight != null ? `${entry.weight}` : null,
      title: titleParts.join(' · ')
    })
  }

  // Pad the trailing week so the 7-column grid keeps its 1px dividers square.
  const remainder = cells.length % 7
  if (remainder) cells.push(...Array.from({ length: 7 - remainder }, blank))

  return cells
})

const monthEntryCount = computed(() => calendarCells.value.filter(c => c.hasEntry).length)

/** Compounds dosed in the visible month — the legend tracks the grid, not all history. */
const legendCompounds = computed(() => {
  const set = new Set<string>()
  for (const cell of calendarCells.value) {
    for (const c of cell.compounds) set.add(c)
  }
  return [...set].sort()
})

// The legend has to fit one row next to the month pager, so drop the ester/salt suffix.
function shortCompound(name: string): string {
  return name
    .replace(/^Testosterone Cypionate$/, 'TestCyp')
    .replace(/^Finasteride$/, 'Fin')
    .replace(/ \/ .*$/, '')
}

// --- Timeline ---

const ZOOM_OPTS = [
  { label: 'week', value: 'week' as const },
  { label: 'month', value: 'month' as const }
]
const zoom = ref<'week' | 'month'>('week')

const firstPeptideDate = computed(() =>
  entries.value.find(e => (e.peptides ?? []).length > 0)?.date ?? null
)

const timelineLabel = computed(() => {
  if (!firstPeptideDate.value) return 'PROTOCOL TIMELINE'
  const from = formatDate(firstPeptideDate.value, 'monthDay').toUpperCase()
  const to = formatDate(todayDate, 'monthDay').toUpperCase()
  return `PROTOCOL TIMELINE · ${from} → ${to}`
})

/** Sunday-start week key for a date. */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d.toLocaleDateString('en-CA')
}

function slotKey(dateStr: string): string {
  return zoom.value === 'week' ? getWeekStart(dateStr) : dateStr.slice(0, 7)
}

const slots = computed((): string[] => {
  const first = firstPeptideDate.value
  if (!first) return []
  const result: string[] = []
  if (zoom.value === 'week') {
    const cur = new Date(getWeekStart(first) + 'T12:00:00')
    const end = new Date(getWeekStart(todayDate) + 'T12:00:00')
    while (cur <= end) {
      result.push(cur.toLocaleDateString('en-CA'))
      cur.setDate(cur.getDate() + 7)
    }
  }
  else {
    let [y, m] = first.split('-').map(Number) as [number, number]
    const [ey, em] = todayDate.split('-').map(Number) as [number, number]
    while (y < ey || (y === ey && m <= em)) {
      result.push(`${y}-${String(m).padStart(2, '0')}`)
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
  }
  return result
})

function slotLabel(slot: string): string {
  if (zoom.value === 'month') {
    const [y, m] = slot.split('-').map(Number) as [number, number]
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return `week of ${formatDate(slot, 'monthDay')}`
}

interface Run { left: number, width: number, title: string }

// Contiguous stretches of active slots become one bar each, so a compound that ran Feb-Apr
// reads as a single duration rather than a row of disconnected ticks.
function toRuns(active: Set<string>, name: string): Run[] {
  const all = slots.value
  if (!all.length) return []
  const unit = 100 / all.length
  const runs: Run[] = []
  let start = -1
  for (let i = 0; i <= all.length; i++) {
    const on = i < all.length && active.has(all[i]!)
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      runs.push({
        left: start * unit,
        width: (i - start) * unit,
        title: `${name} · ${slotLabel(all[start]!)} → ${slotLabel(all[i - 1]!)}`
      })
      start = -1
    }
  }
  return runs
}

const timelineCompounds = computed(() => {
  const usage: Record<string, Set<string>> = {}
  const firstUse: Record<string, string> = {}

  for (const entry of entries.value) {
    const key = slotKey(entry.date)
    for (const p of entry.peptides ?? []) {
      if (!p.compound) continue
      ;(usage[p.compound] ??= new Set()).add(key)
      firstUse[p.compound] ??= entry.date
    }
  }

  return Object.entries(usage)
    .sort(([a], [b]) => (firstUse[a] ?? '').localeCompare(firstUse[b] ?? ''))
    .map(([name, activeSlots]) => ({ name, activeSlots, runs: toRuns(activeSlots, name) }))
})

const labMarks = computed(() => {
  const all = slots.value
  if (!all.length) return []
  const unit = 100 / all.length
  const byslot = new Map<string, string[]>()
  for (const lab of labsData.value ?? []) {
    const key = slotKey(lab.date)
    if (!all.includes(key)) continue
    byslot.set(key, [...(byslot.get(key) ?? []), lab.date])
  }
  return [...byslot.entries()].map(([slot, dates]) => ({
    slot,
    left: (all.indexOf(slot) + 0.5) * unit,
    title: `lab draw · ${dates.map(d => formatDate(d)).join(', ')}`
  }))
})

const nowLeft = computed(() => {
  const all = slots.value
  const idx = all.indexOf(slotKey(todayDate))
  return idx < 0 ? null : (idx + 1) * (100 / all.length)
})
</script>
