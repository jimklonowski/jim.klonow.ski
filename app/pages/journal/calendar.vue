<template>
  <UContainer>
    <div class="py-8 space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
          <h1 class="text-2xl font-bold">Calendar</h1>
        </div>
        <UButton :to="`/journal/${todayDate}`" size="xs" icon="i-lucide-plus">New Entry</UButton>
      </div>

      <!-- Compound legend -->
      <div v-if="allCompounds.length" class="flex flex-wrap gap-3">
        <div v-for="compound in allCompounds" :key="compound" class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full" :style="{ background: getCompoundColor(compound) }" />
          <span class="text-xs text-muted">{{ compound }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <UIcon name="i-lucide-flask-conical" class="w-3 h-3 text-teal-500" />
          <span class="text-xs text-muted">Reconstitution</span>
        </div>
      </div>

      <!-- Month navigation -->
      <div class="flex items-center justify-between">
        <UButton variant="ghost" icon="i-lucide-chevron-left" @click="prevMonth" />
        <h2 class="text-lg font-semibold">{{ monthLabel }}</h2>
        <UButton variant="ghost" icon="i-lucide-chevron-right" @click="nextMonth" />
      </div>

      <!-- Calendar grid -->
      <div>
        <!-- Day headers -->
        <div class="grid grid-cols-7 mb-1">
          <div v-for="d in DAY_LABELS" :key="d" class="text-xs text-muted text-center py-1 font-medium">
            {{ d }}
          </div>
        </div>

        <!-- Weeks -->
        <div class="grid grid-cols-7 gap-1">
          <div
            v-for="(cell, i) in calendarCells"
            :key="i"
            class="min-h-14 rounded-lg p-1.5 text-sm transition-colors"
            :class="[
              cell.date ? 'border' : '',
              cell.isToday ? 'border-primary ring-1 ring-primary' : 'border-default',
              (cell.hasEntry || cell.workoutCount > 0) ? 'cursor-pointer hover:bg-elevated' : '',
              !cell.date ? 'opacity-0 pointer-events-none' : '',
              cell.isFuture ? 'opacity-40' : ''
            ]"
            @click="cell.date && navigateTo(`/journal/${cell.date}`)"
          >
            <template v-if="cell.date">
              <div class="flex items-start justify-between">
                <span
                  class="text-xs font-mono leading-none"
                  :class="cell.isToday ? 'text-primary font-bold' : 'text-muted'"
                >
                  {{ cell.day }}
                </span>
                <span v-if="!cell.hasEntry && !cell.workoutCount && !cell.isFuture" class="text-muted opacity-40 text-xs leading-none">+</span>
              </div>

              <!-- Compound dots -->
              <div v-if="cell.compounds.length" class="flex flex-wrap gap-0.5 mt-1.5">
                <span
                  v-for="compound in cell.compounds"
                  :key="compound"
                  class="w-2 h-2 rounded-full"
                  :style="{ background: getCompoundColor(compound) }"
                  :title="compound"
                />
              </div>

              <!-- Reconstitution indicator -->
              <div v-if="cell.hasRecon" class="mt-1" title="Vial reconstituted">
                <UIcon name="i-lucide-flask-conical" class="w-3 h-3 text-teal-500" />
              </div>

              <!-- Workout indicator -->
              <div
                v-if="cell.workoutCount"
                class="flex items-center gap-0.5 mt-1"
                :title="`${cell.workoutCount} workout${cell.workoutCount > 1 ? 's' : ''}`"
              >
                <UIcon name="i-lucide-dumbbell" class="w-3 h-3 text-cyan-500" />
                <span v-if="cell.workoutCount > 1" class="text-xs text-muted leading-none">×{{ cell.workoutCount }}</span>
              </div>

              <!-- Weight if available -->
              <div v-if="cell.weight" class="mt-1">
                <span class="text-xs font-mono text-muted">{{ cell.weight }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Entry count for month -->
      <p class="text-xs text-muted text-center">
        {{ monthEntryCount }} {{ monthEntryCount === 1 ? 'entry' : 'entries' }} in {{ monthLabel }}
      </p>

      <!-- Timeline -->
      <div class="pt-4 border-t border-default space-y-6">
        <div class="flex items-baseline justify-between gap-4">
          <div>
            <h2 class="text-lg font-semibold">Protocol Timeline</h2>
            <p v-if="timelineCompounds.length" class="text-sm text-muted">{{ dateRangeLabel }}</p>
          </div>
          <div v-if="timelineCompounds.length" class="flex gap-1">
            <UButton
              v-for="opt in ZOOM_OPTS"
              :key="opt.value"
              size="xs"
              :variant="zoom === opt.value ? 'solid' : 'ghost'"
              @click="zoom = opt.value"
            >
              {{ opt.label }}
            </UButton>
          </div>
        </div>

        <div v-if="!timelineCompounds.length" class="text-sm text-muted">No compound data yet.</div>

        <template v-else>
          <!-- Timeline grid -->
          <div class="overflow-x-auto pb-3">
            <div
              class="relative select-none"
              :style="{ minWidth: `${LABEL_W + slots.length * cellWidth}px` }"
            >

              <!-- Top axis: month labels (week zoom) or year labels (month zoom) -->
              <div class="flex mb-0.5" :style="{ paddingLeft: `${LABEL_W}px` }">
                <div
                  v-for="group in axisGroups"
                  :key="group.key"
                  :style="{ width: `${group.count * cellWidth}px` }"
                  class="text-xs text-muted truncate pl-1 border-l border-default/50"
                >
                  {{ group.label }}
                </div>
              </div>

              <!-- Sub-axis: month abbreviations (month zoom only) -->
              <div v-if="zoom === 'month'" class="flex mb-1.5" :style="{ paddingLeft: `${LABEL_W}px` }">
                <div
                  v-for="slot in slots"
                  :key="slot"
                  :style="{ width: `${cellWidth}px` }"
                  class="text-center text-muted border-l border-default/20"
                  style="font-size: 10px; line-height: 1.4;"
                >
                  {{ monthAbbr(slot) }}
                </div>
              </div>

              <!-- Compound rows -->
              <div
                v-for="compound in timelineCompounds"
                :key="compound.name"
                class="flex items-center mb-1"
              >
                <NuxtLink
                  :to="`/journal/compound/${encodeURIComponent(compound.name)}`"
                  class="shrink-0 text-xs font-medium truncate pr-3 text-right hover:opacity-70 transition-opacity"
                  :style="{ width: `${LABEL_W}px`, color: getCompoundColor(compound.name) }"
                >
                  {{ compound.name }}
                </NuxtLink>

                <div class="flex gap-px">
                  <div
                    v-for="slot in slots"
                    :key="slot"
                    class="rounded-sm transition-opacity hover:opacity-70"
                    :style="{
                      width: `${cellWidth - 1}px`,
                      height: `${ROW_H}px`,
                      background: compound.activeSlots.has(slot)
                        ? getCompoundColor(compound.name)
                        : 'rgba(128,128,128,0.07)',
                    }"
                    :title="compound.activeSlots.has(slot)
                      ? `${compound.name} · ${slotLabel(slot)}`
                      : undefined"
                  />
                </div>
              </div>

              <!-- Labs row -->
              <div v-if="labSlots.size" class="flex items-center mt-3 pt-3 border-t border-default/40">
                <div
                  class="shrink-0 text-xs text-muted text-right pr-3"
                  :style="{ width: `${LABEL_W}px` }"
                >
                  Lab draws
                </div>
                <div class="flex gap-px">
                  <div
                    v-for="slot in slots"
                    :key="slot"
                    class="flex items-center justify-center"
                    :style="{ width: `${cellWidth - 1}px`, height: `${ROW_H}px` }"
                  >
                    <UPopover v-if="labSlots.has(slot)" :content="{ side: 'top', align: 'center' }">
                      <div
                        class="w-3 h-3 rounded-full border-2 border-amber-400 bg-amber-400/30 cursor-pointer hover:bg-amber-400/70 transition-colors"
                        :title="`Lab draw · ${labSlotLabel(slot)}`"
                      />
                      <template #content>
                        <div class="p-3 space-y-2 min-w-48">
                          <p class="text-xs font-semibold text-muted uppercase tracking-wider">{{ labSlotLabel(slot) }}</p>
                          <template v-if="labSourcesMap[slot]?.flatMap(l => l.sources).length">
                            <a
                              v-for="src in labSourcesMap[slot].flatMap(l => l.sources)"
                              :key="src"
                              :href="src"
                              target="_blank"
                              class="flex items-center gap-2 text-sm hover:text-primary transition-colors py-0.5"
                            >
                              <UIcon name="i-lucide-file-text" class="w-3.5 h-3.5 shrink-0 text-amber-400" />
                              {{ pdfLabel(src) }}
                            </a>
                          </template>
                          <p v-else class="text-xs text-muted">No PDFs attached</p>
                        </div>
                      </template>
                    </UPopover>
                  </div>
                </div>
              </div>

              <!-- Today marker -->
              <div
                v-if="todaySlotIdx >= 0"
                class="absolute top-0 bottom-0 pointer-events-none"
                :style="{
                  left: `${LABEL_W + (todaySlotIdx + 1) * cellWidth - 1}px`,
                  width: '2px',
                  background: 'var(--ui-primary)',
                  opacity: 0.55,
                }"
              />

            </div>
          </div>

          <!-- Legend / compound list -->
          <div class="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-default">
            <NuxtLink
              v-for="compound in timelineCompounds"
              :key="compound.name"
              :to="`/journal/compound/${encodeURIComponent(compound.name)}`"
              class="flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity"
            >
              <span class="w-3 h-2.5 rounded-sm shrink-0" :style="{ background: getCompoundColor(compound.name) }" />
              <span class="font-medium">{{ compound.name }}</span>
              <span class="text-muted">{{ compound.activeSlots.size }}{{ zoom === 'week' ? 'w' : 'mo' }}</span>
            </NuxtLink>
            <span class="flex items-center gap-1.5 text-xs text-muted ml-auto">
              <span class="inline-block w-3 h-2.5 rounded-sm border border-primary/50" style="background: var(--ui-primary); opacity: 0.55;" />
              Today
            </span>
          </div>
        </template>
      </div>

    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const { data, refresh } = await useJournalEntries()
const { data: workoutsData, refresh: refreshWorkouts } = await useWorkoutsEntries()
const { data: labsData } = await useLabsEntries()

onMounted(refresh)
onMounted(refreshWorkouts)

const entries = computed(() => data.value ?? [])
const workoutCountByDate = computed(() => {
  const map: Record<string, number> = {}
  for (const w of (workoutsData.value ?? [])) {
    map[w.date] = (map[w.date] ?? 0) + 1
  }
  return map
})
const todayDate = new Date().toISOString().split('T')[0]
const today = new Date()

const currentYear = ref(today.getFullYear())
const currentMonth = ref(today.getMonth())

const monthLabel = computed(() =>
  new Date(currentYear.value, currentMonth.value, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
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
  const map: Record<string, { compounds: string[], weight: number | null, hasRecon: boolean }> = {}
  for (const entry of entries.value) {
    const compounds = [...new Set((entry.peptides ?? []).map((p: { compound: string }) => p.compound))]
    map[entry.date] = {
      compounds,
      weight: entry.weight_lbs ?? null,
      hasRecon: (entry.reconstitutions ?? []).length > 0
    }
  }
  return map
})

interface CalendarCell {
  date: string | null
  day: number | null
  isToday: boolean
  isFuture: boolean
  hasEntry: boolean
  compounds: string[]
  weight: string | null
  hasRecon: boolean
  workoutCount: number
}

const calendarCells = computed((): CalendarCell[] => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = todayDate

  const cells: CalendarCell[] = []

  for (let i = 0; i < firstDay; i++) {
    cells.push({ date: null, day: null, isToday: false, isFuture: false, hasEntry: false, compounds: [], weight: null, hasRecon: false, workoutCount: 0 })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const entry = entryMap.value[dateStr]
    cells.push({
      date: dateStr,
      day: d,
      isToday: dateStr === todayStr,
      isFuture: dateStr > todayStr,
      hasEntry: !!entry,
      compounds: entry?.compounds ?? [],
      weight: entry?.weight != null ? `${entry.weight}` : null,
      hasRecon: entry?.hasRecon ?? false,
      workoutCount: workoutCountByDate.value[dateStr] ?? 0
    })
  }

  const remainder = cells.length % 7
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      cells.push({ date: null, day: null, isToday: false, isFuture: false, hasEntry: false, compounds: [], weight: null, hasRecon: false, workoutCount: 0 })
    }
  }

  return cells
})

const monthEntryCount = computed(() =>
  calendarCells.value.filter(c => c.hasEntry).length
)

const allCompounds = computed(() => {
  const set = new Set<string>()
  for (const entry of entries.value) {
    for (const p of (entry.peptides ?? [])) {
      set.add((p as { compound: string }).compound)
    }
  }
  return [...set].sort()
})

// --- Timeline ---

const LABEL_W = 148
const CELL_W_WEEK = 26
const CELL_W_MONTH = 90
const ROW_H = 26

const ZOOM_OPTS = [
  { label: 'Week', value: 'week' as const },
  { label: 'Month', value: 'month' as const },
]
const zoom = ref<'week' | 'month'>('week')
const cellWidth = computed(() => zoom.value === 'week' ? CELL_W_WEEK : CELL_W_MONTH)

const firstPeptideDate = computed(() => {
  for (const e of entries.value) {
    if ((e.peptides ?? []).length > 0) return e.date
  }
  return null
})

const dateRangeLabel = computed(() => {
  if (!firstPeptideDate.value) return ''
  return `${fmtDate(firstPeptideDate.value)} → ${fmtDate(todayDate)}`
})

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay()) // Sunday start
  return d.toISOString().slice(0, 10)
}

const labSlots = computed(() => {
  const set = new Set<string>()
  for (const lab of (labsData.value ?? [])) {
    const key = zoom.value === 'week'
      ? getWeekStart((lab as { date: string }).date)
      : (lab as { date: string }).date.substring(0, 7)
    set.add(key)
  }
  return set
})

const labSourcesMap = computed(() => {
  const map: Record<string, { date: string, sources: string[] }[]> = {}
  for (const lab of (labsData.value ?? [])) {
    const l = lab as { date: string, sources?: string[] }
    const key = zoom.value === 'week'
      ? getWeekStart(l.date)
      : l.date.substring(0, 7)
    if (!map[key]) map[key] = []
    map[key].push({ date: l.date, sources: l.sources ?? [] })
  }
  return map
})

function labSlotLabel(slot: string): string {
  const lab = (labsData.value ?? []).find((l) => {
    const key = zoom.value === 'week'
      ? getWeekStart((l as { date: string }).date)
      : (l as { date: string }).date.substring(0, 7)
    return key === slot
  })
  return lab ? (lab as { date: string }).date : slot
}

function pdfLabel(src: string): string {
  const filename = src.split('/').pop() ?? src
  return decodeURIComponent(filename).replace(/\.pdf$/i, '')
}

const weekSlots = computed((): string[] => {
  if (!firstPeptideDate.value) return []
  const start = getWeekStart(firstPeptideDate.value)
  const end = getWeekStart(todayDate)
  const result: string[] = []
  const cur = new Date(start + 'T12:00:00')
  const endDate = new Date(end + 'T12:00:00')
  while (cur <= endDate) {
    result.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 7)
  }
  return result
})

const monthSlots = computed((): string[] => {
  if (!firstPeptideDate.value) return []
  const startParts = firstPeptideDate.value.split('-')
  const endParts = todayDate.split('-')
  let y = Number(startParts[0]), m = Number(startParts[1])
  const ey = Number(endParts[0]), em = Number(endParts[1])
  const result: string[] = []
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return result
})

const slots = computed(() => zoom.value === 'week' ? weekSlots.value : monthSlots.value)

const todaySlotIdx = computed(() => {
  const key = zoom.value === 'week' ? getWeekStart(todayDate) : todayDate.substring(0, 7)
  return slots.value.indexOf(key)
})

const timelineCompounds = computed(() => {
  const usageMap: Record<string, Set<string>> = {}
  const firstUse: Record<string, string> = {}

  for (const entry of entries.value) {
    const slotKey = zoom.value === 'week'
      ? getWeekStart(entry.date)
      : entry.date.substring(0, 7)

    for (const p of (entry.peptides ?? [])) {
      const name = (p as { compound: string }).compound
      if (!name) continue
      if (!usageMap[name]) usageMap[name] = new Set()
      usageMap[name].add(slotKey)
      if (!firstUse[name]) firstUse[name] = entry.date
    }
  }

  return Object.entries(usageMap)
    .sort(([a], [b]) => (firstUse[a] ?? '').localeCompare(firstUse[b] ?? ''))
    .map(([name, activeSlots]) => ({ name, activeSlots }))
})

interface AxisGroup { key: string; label: string; count: number }

const axisGroups = computed((): AxisGroup[] => {
  const groups: AxisGroup[] = []

  if (zoom.value === 'week') {
    let curMonth = '', count = 0
    for (const week of slots.value) {
      const month = week.substring(0, 7)
      if (month !== curMonth) {
        if (curMonth) groups.push({ key: curMonth, label: fmtMonth(curMonth), count })
        curMonth = month; count = 1
      } else { count++ }
    }
    if (curMonth) groups.push({ key: curMonth, label: fmtMonth(curMonth), count })
  } else {
    let curYear = '', count = 0
    for (const month of slots.value) {
      const year = month.substring(0, 4)
      if (year !== curYear) {
        if (curYear) groups.push({ key: curYear, label: curYear, count })
        curYear = year; count = 1
      } else { count++ }
    }
    if (curYear) groups.push({ key: curYear, label: curYear, count })
  }

  return groups
})

function fmtMonth(yyyyMm: string) {
  const y = parseInt(yyyyMm.substring(0, 4))
  const m = parseInt(yyyyMm.substring(5, 7))
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function monthAbbr(yyyyMm: string) {
  const y = parseInt(yyyyMm.substring(0, 4))
  const m = parseInt(yyyyMm.substring(5, 7))
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' }).substring(0, 3)
}

function slotLabel(slot: string) {
  if (zoom.value === 'month') {
    return fmtMonth(slot)
  }
  return `week of ${new Date(slot + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
</script>
