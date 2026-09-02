<template>
  <div>
    <JournalHeader
      section="ENTRIES"
      :meta="`${entries.length.toLocaleString('en-US')} rows`"
    >
      <!-- Row count stays on `meta` because the ledger below lists every row; the logged count
           is the subset that was hand-entered rather than synced from the watch. -->
      <template #meta>
        · {{ loggedEntries.length.toLocaleString('en-US') }} logged
        <template v-if="streak">
          · <span class="text-accent font-medium">streak {{ streak }}d</span>
        </template>
      </template>
      <template #actions>
        <NuxtLink
          v-if="canEdit"
          :to="`/journal/${today}`"
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

    <!-- 60-day streak strip -->
    <div class="flex items-center gap-3.5 px-4 sm:px-6 py-2.5 border-b border-line-soft">
      <span class="tui-label shrink-0">Last 60d</span>
      <div class="flex-1 flex gap-px h-3.5 min-w-0">
        <NuxtLink
          v-for="cell in streakStrip"
          :key="cell.date"
          :to="cell.logged && canOpenDays ? `/journal/${cell.date}` : ''"
          class="flex-1"
          :class="[cell.class, cell.logged && canOpenDays ? 'hover:opacity-70 transition-opacity' : 'pointer-events-none']"
          :title="cell.title"
        />
      </div>
      <span class="shrink-0 text-[10px] text-muted">
        <span class="text-[#1e3a2e]">▪</span> logged · <span class="text-accent">▪</span> +photos/recon
      </span>
    </div>

    <!-- Ledger -->
    <div class="px-4 sm:px-6">
      <div
        class="hidden lg:grid gap-2.5 py-1.5 text-[10px] text-faint uppercase tracking-[0.06em]"
        :class="gridCols"
      >
        <span>Date</span>
        <span>Vitals</span>
        <span>Doses</span>
        <span v-if="showSoda">Soda</span>
        <span>Wk</span>
        <span class="text-right">Flags</span>
      </div>

      <NuxtLink
        v-for="row in pageRows"
        :key="row.date"
        :to="canOpenDays ? `/journal/${row.date}` : ''"
        class="grid gap-x-2.5 gap-y-1 items-baseline py-2 border-b border-[#10160f] last:border-0 text-[11.5px]"
        :class="[gridCols, row.isToday ? 'bg-inset' : '', canOpenDays ? 'hover:bg-[#101a15] transition-colors' : 'pointer-events-none']"
      >
        <span class="text-hi uppercase">{{ formatDate(row.date, 'monthDay') }}</span>
        <span class="text-dim truncate">{{ row.vitals }}</span>

        <span class="flex items-center gap-1 flex-wrap">
          <span
            v-for="c in row.compounds"
            :key="c"
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :style="{ background: getCompoundColor(c) }"
            :title="c"
          />
          <span
            v-if="row.photos"
            class="text-[10px] text-faint"
            :title="`${row.photos} progress photo${row.photos > 1 ? 's' : ''}`"
          >📷</span>
          <span
            v-if="row.recon"
            class="text-[10px] text-faint"
            :title="`${row.recon} reconstitution${row.recon > 1 ? 's' : ''}`"
          >⚗</span>
          <span
            v-if="row.isDraw"
            class="text-[10px] text-accent whitespace-nowrap"
          >▲ lab draw</span>
        </span>

        <span
          v-if="showSoda"
          class="text-muted"
        >{{ row.sodas || '' }}</span>

        <span
          class="text-accent"
          :title="row.workouts ? `${row.workouts} workout${row.workouts > 1 ? 's' : ''}` : undefined"
        >{{ row.workouts ? '✓' : '' }}</span>

        <span class="text-right">
          <span
            v-for="flag in row.flags"
            :key="flag.text"
            :class="flag.class"
            class="ml-2"
          >{{ flag.text }}</span>
        </span>
      </NuxtLink>

      <p
        v-if="!entries.length"
        class="py-5 text-[12px] text-muted"
      >
        No entries logged yet.
      </p>
    </div>

    <!-- Pagination -->
    <div
      v-if="totalPages > 1"
      class="flex items-center px-4 sm:px-6 py-2.5 border-t border-line text-[11px]"
    >
      <button
        type="button"
        class="cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        :class="page > 1 ? 'text-accent hover:text-accent-hover' : 'text-faint'"
        :disabled="page <= 1"
        @click="page--"
      >
        ‹ PREV
      </button>
      <span class="mx-auto text-muted">
        <span class="uppercase tracking-[0.06em]">page {{ page }} / {{ totalPages }}</span>
        <button
          type="button"
          class="ml-2 text-accent hover:text-accent-hover cursor-pointer"
          @click="paletteOpen = true"
        >· jump to date ⌘K</button>
      </span>
      <button
        type="button"
        class="cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
        :class="page < totalPages ? 'text-accent hover:text-accent-hover' : 'text-faint'"
        :disabled="page >= totalPages"
        @click="page++"
      >
        NEXT ›
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })
useSeoMeta({ title: 'Journal · Entries' })

const { data, refresh, error } = await useJournalEntries()
const { data: workoutsData, refresh: refreshWorkouts } = await useWorkoutsEntries()
const { data: photosData, refresh: refreshPhotos } = await usePhotoEntries()
const { data: labsData } = await useLabsEntries()
const { role, canEdit } = await useAuth()

onMounted(refresh)
onMounted(refreshWorkouts)
onMounted(refreshPhotos)

const paletteOpen = useState('command-palette-open', () => false)
const today = localToday()

/** Newest first — a ledger reads backwards from today. */
const entries = computed(() =>
  [...(data.value ?? [])].sort((a, b) => b.date.localeCompare(a.date))
)

// The doctor role never reaches this page, but sodas are stripped server-side for it anyway;
// hiding the column keeps the grid honest if that ever changes.
const showSoda = computed(() => role.value !== 'doctor')
const canOpenDays = computed(() => role.value !== 'doctor')

const gridCols = computed(() =>
  showSoda.value
    ? 'lg:grid-cols-[90px_minmax(0,1fr)_130px_60px_40px_110px] grid-cols-[auto_1fr]'
    : 'lg:grid-cols-[90px_minmax(0,1fr)_130px_40px_110px] grid-cols-[auto_1fr]'
)

function countByDate(list: { date: string }[] | null | undefined) {
  const map: Record<string, number> = {}
  for (const row of list ?? []) map[row.date] = (map[row.date] ?? 0) + 1
  return map
}
const workoutCounts = computed(() => countByDate(workoutsData.value))
const photoCounts = computed(() => countByDate(photosData.value))
const drawDates = computed(() => new Set((labsData.value ?? []).map(l => l.date)))

// Logged days only, here and in the strip below: the ledger lists every row (vitals-only ones
// included), but "logged" has to mean hand-entered or the strip is solid green for any day the
// watch synced. See app/utils/journalLog.ts.
const loggedEntries = computed(() => entries.value.filter(isLoggedDay))
const streak = computed(() => loggedStreak(entries.value, today))

// --- 60-day streak strip ---
const streakStrip = computed(() => {
  const byDate = new Map(loggedEntries.value.map(e => [e.date, e]))
  const cells: Array<{ date: string, logged: boolean, class: string, title: string }> = []
  const d = new Date(today + 'T12:00:00')
  d.setDate(d.getDate() - 59)
  for (let i = 0; i < 60; i++) {
    const date = d.toLocaleDateString('en-CA')
    const entry = byDate.get(date)
    const extra = !!entry && ((photoCounts.value[date] ?? 0) > 0 || (entry.reconstitutions ?? []).length > 0)
    cells.push({
      date,
      logged: !!entry,
      class: !entry ? 'bg-[#0d1310]' : extra ? 'bg-accent' : 'bg-[#1e3a2e]',
      title: !entry ? `${date} · not logged` : extra ? `${date} · logged + photos/recon` : `${date} · logged`
    })
    d.setDate(d.getDate() + 1)
  }
  return cells
})

// --- ledger rows ---
const PAGE_SIZE = 15
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(entries.value.length / PAGE_SIZE)))

/** "167.8lb · 125/74 · ♥60 · HRV 52", skipping whatever wasn't recorded. */
function vitalsLine(e: typeof entries.value[number]) {
  return [
    e.weight_lbs != null ? `${e.weight_lbs}lb` : null,
    e.bp_systolic != null && e.bp_diastolic != null ? `${e.bp_systolic}/${e.bp_diastolic}` : null,
    e.rhr != null ? `♥ ${e.rhr}` : null,
    e.hrv != null ? `HRV ${e.hrv}` : null
  ].filter(Boolean).join(' · ')
}

/** Row-level callouts: an out-of-band reading, a fasting draw day, or a written note. */
function flagsFor(e: typeof entries.value[number], isDraw: boolean) {
  const flags: Array<{ text: string, class: string }> = []
  if (e.hrv != null && e.hrv < 35) flags.push({ text: 'HRV low', class: 'text-warn' })
  if (e.bp_systolic != null && e.bp_systolic >= 130) flags.push({ text: 'BP high', class: 'text-warn' })
  if (isDraw) flags.push({ text: 'fasting', class: 'text-muted' })
  if (e.notes?.trim()) flags.push({ text: 'notes', class: 'text-muted' })
  return flags
}

const pageRows = computed(() =>
  entries.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE).map((e) => {
    const isDraw = drawDates.value.has(e.date)
    return {
      date: e.date,
      isToday: e.date === today,
      isDraw,
      vitals: vitalsLine(e),
      compounds: [...new Set((e.peptides ?? []).map(p => p.compound))].filter(Boolean).slice(0, 6),
      recon: (e.reconstitutions ?? []).length,
      photos: photoCounts.value[e.date] ?? 0,
      sodas: (e.sodas ?? []).length,
      workouts: workoutCounts.value[e.date] ?? 0,
      flags: flagsFor(e, isDraw)
    }
  })
)
</script>
