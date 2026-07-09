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
              cell.hasEntry ? 'cursor-pointer hover:bg-elevated' : '',
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
                <span v-if="!cell.hasEntry && !cell.isFuture" class="text-muted opacity-40 text-xs leading-none">+</span>
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

    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const { data, refresh } = await useJournalEntries()

onMounted(refresh)

const entries = computed(() => data.value ?? [])
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
}

const calendarCells = computed((): CalendarCell[] => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = todayDate

  const cells: CalendarCell[] = []

  for (let i = 0; i < firstDay; i++) {
    cells.push({ date: null, day: null, isToday: false, isFuture: false, hasEntry: false, compounds: [], weight: null, hasRecon: false })
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
      hasRecon: entry?.hasRecon ?? false
    })
  }

  const remainder = cells.length % 7
  if (remainder !== 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      cells.push({ date: null, day: null, isToday: false, isFuture: false, hasEntry: false, compounds: [], weight: null, hasRecon: false })
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
</script>
