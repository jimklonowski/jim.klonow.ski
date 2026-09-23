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
          v-if="canEdit"
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
      <span
        v-if="showSchedule"
        class="flex items-center gap-1.5 text-muted"
      >
        <span class="w-1.5 h-1.5 rounded-full border border-line-accent" />
        scheduled · not logged
      </span>
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

      <!-- Days are buttons only for roles that can open /journal/<date>; the doctor's view has
           no daily entries (shared/utils/access.ts), so its cells are plain read-only tiles
           instead of taps that bounce to /labs. -->
      <component
        :is="cell.date && canOpenDays ? 'button' : 'div'"
        v-for="(cell, i) in calendarCells"
        :key="i"
        :type="cell.date && canOpenDays ? 'button' : undefined"
        class="bg-bg px-2 py-2 min-h-22 text-left align-top"
        :class="[
          cell.date && canOpenDays ? 'cursor-pointer hover:bg-row-hover transition-colors' : '',
          cell.isToday ? 'outline outline-accent -outline-offset-1' : '',
          cell.isFuture ? 'opacity-40' : ''
        ]"
        :title="cell.title || undefined"
        @click="cell.date && canOpenDays && navigateTo(`/journal/${cell.date}`)"
      >
        <template v-if="cell.date">
          <div class="flex items-baseline gap-1.5">
            <span
              class="text-[12px]"
              :class="cell.isToday ? 'text-accent' : 'text-muted'"
            >{{ cell.day }}</span>
            <!-- "· TODAY" needs ~52px and a mobile cell is only ~47px wide, so it wraps out of
                 the box — dropped below md, where the accent outline and day number already mark it. -->
            <span
              v-if="cell.isToday"
              class="hidden md:inline text-[10.5px] text-accent tracking-[0.12em]"
            >· TODAY</span>
          </div>

          <div
            v-if="cell.compounds.length || cell.scheduled.length || cell.marks"
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
              v-for="compound in cell.scheduled"
              :key="`s-${compound}`"
              class="w-1.75 h-1.75 rounded-full shrink-0 border"
              :style="{ borderColor: getCompoundColor(compound) }"
              :title="`${compound} — scheduled, not logged`"
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
      <JournalProtocolTimeline
        v-model:zoom="zoom"
        :label="timelineLabel"
        :entries="entries"
        :lab-dates="labDates"
        :from="firstPeptideDate"
        :today="todayDate"
        size="md"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'

useSeoMeta({ title: 'Journal · Calendar' })

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const { data, refresh, error } = await useJournalEntries()
const { data: workoutsData } = await useWorkoutsEntries()
const { data: labsData } = await useLabsEntries()
const { data: photosData } = await usePhotoEntries()
const { data: cyclesData } = await useCycles()
const { role, canEdit } = await useAuth()

// Daily entries are a full-access surface (owner / friend / demo); the doctor is bounced from
// /journal/<date> by the route policy, so the grid must not offer the jump in the first place.
const canOpenDays = computed(() => isFullAccessRole(role.value))

// Scheduled-dose rings come from PROTOCOL_RULES plus any planned cycles (effectiveRules) —
// so an upcoming cycle previews its rings on future days before a single dose is logged.
// The demo persona's dose dates re-anchor nightly and drift across weekdays by design, so
// the rings would flag misses that aren't real — hidden for demo sessions.
const showSchedule = computed(() => role.value !== 'demo')
const scheduleRules = computed(() => effectiveRules(cyclesData.value ?? []))

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
  /** Scheduled by PROTOCOL_RULES but not logged — a miss in the past, the plan ahead. */
  scheduled: string[]
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
    hasEntry: false, compounds: [], scheduled: [], marks: '', weight: null, title: ''
  })

  const cells: CalendarCell[] = Array.from({ length: firstDay }, blank)

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const entry = entryMap.value[dateStr]
    const workouts = workoutCountByDate.value[dateStr] ?? 0
    const photos = photoCountByDate.value[dateStr] ?? 0

    // Rings for cadence days without a logged dose: a plan preview on future days, a visible
    // miss on past ones. Days the compound WAS logged need no ring — the dot already shows.
    const scheduled = showSchedule.value
      ? scheduledFor(dateStr, scheduleRules.value)
          .map(r => r.compound)
          .filter(c => !(entry?.compounds ?? []).includes(c))
      : []

    const marks: string[] = []
    // Only show a ×N when there were more injections than distinct compounds, otherwise
    // the dots already tell the whole story.
    if (entry && entry.doseCount > entry.compounds.length) marks.push(`×${entry.doseCount}`)
    if (entry?.reconCount) marks.push(entry.reconCount > 1 ? `⚗×${entry.reconCount}` : '⚗')
    if (photos) marks.push(photos > 1 ? `📷×${photos}` : '📷')
    if (workouts) marks.push(workouts > 1 ? `♥×${workouts}` : '♥')

    const titleParts: string[] = []
    if (entry?.compounds.length) titleParts.push(entry.compounds.join(', '))
    if (scheduled.length) {
      const tense = dateStr > todayDate ? 'scheduled' : dateStr === todayDate ? 'due' : 'not logged'
      titleParts.push(`${tense}: ${scheduled.join(', ')}`)
    }
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
      scheduled: scheduled.slice(0, MAX_DOTS),
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

// Timeline gantt (engine: shared/utils/timeline.ts); week zoom here, month on the compounds page.
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

const labDates = computed(() => (labsData.value ?? []).map(l => l.date))
</script>
