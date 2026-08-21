<template>
  <UContainer>
    <div class="py-8 space-y-10">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold">
            Peptide Journal
          </h1>
          <div
            v-if="latest"
            class="flex flex-wrap items-center gap-2 mt-1"
          >
            <p class="text-muted">
              {{ entries.length }} entries &mdash; latest: {{ formatDate(latest.date) }}
            </p>
            <span
              v-if="peptideStreak > 0"
              class="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium"
            >
              {{ peptideStreak }}-day streak
            </span>
          </div>
        </div>
        <div class="flex flex-wrap gap-2">
          <JournalWhoopMenu v-if="isOwner" />
          <UButton
            :to="`/journal/calendar`"
            variant="outline"
            size="xs"
            icon="i-lucide-calendar"
          >
            Calendar
          </UButton>
          <UButton
            v-if="role !== 'doctor'"
            to="/journal/photos"
            variant="outline"
            size="xs"
            icon="i-lucide-camera"
          >
            Photos
          </UButton>
          <UButton
            v-if="isOwner"
            to="/journal/import"
            variant="outline"
            size="xs"
            icon="i-lucide-upload"
          >
            Import
          </UButton>
          <UButton
            v-if="isOwner"
            :to="`/journal/${todayDate}`"
            size="xs"
            icon="i-lucide-plus"
          >
            New Entry
          </UButton>
        </div>
      </div>

      <!-- Section jump nav -->
      <nav class="sticky top-16 z-30 -my-4 py-2 bg-default/85 backdrop-blur flex gap-1 overflow-x-auto">
        <UButton
          v-for="s in sections"
          :key="s.id"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="jumpTo(s.id)"
        >
          {{ s.label }}
        </UButton>
      </nav>

      <!-- Latest vitals -->
      <section
        v-if="latest"
        id="vitals"
        class="scroll-mt-28"
      >
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Latest Vitals
        </h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile
            label="Weight"
            :value="latest.weight_lbs ?? null"
            unit="lbs"
            :delta="weightDelta"
            :lower-is-better="true"
            delta-label="from prev"
          />
          <StatTile
            label="Blood Pressure"
            :value="latest.bp_systolic != null && latest.bp_diastolic != null ? `${latest.bp_systolic}/${latest.bp_diastolic}` : null"
            subtext="mmHg"
          />
          <StatTile
            label="RHR"
            :value="latest.rhr ?? null"
            unit="bpm"
            :delta="rhrDelta"
            :delta-text="intDelta(rhrDelta)"
            :lower-is-better="true"
            delta-label="from prev"
          />
          <StatTile
            label="HRV"
            :value="latest.hrv ?? null"
            unit="ms"
            :delta="hrvDelta"
            :delta-text="intDelta(hrvDelta)"
            :lower-is-better="false"
            delta-label="from prev"
          />
        </div>
      </section>

      <!-- Trend charts -->
      <section
        v-if="entries.length >= 2"
        id="trends"
        class="scroll-mt-28"
      >
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">
            Trends
          </h2>
          <div class="flex items-center gap-3">
            <UButton
              size="xs"
              :variant="smoothCharts ? 'solid' : 'ghost'"
              icon="i-lucide-activity"
              @click="smoothCharts = !smoothCharts"
            >
              7d avg
            </UButton>
            <div class="flex gap-1">
              <UButton
                v-for="opt in CHART_RANGES"
                :key="opt.days"
                size="xs"
                :variant="chartDays === opt.days ? 'solid' : 'ghost'"
                @click="chartDays = opt.days"
              >
                {{ opt.label }}
              </UButton>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono">
          <TrendCard
            label="Weight"
            unit="lbs"
            :data="weightChart"
            color="#14b8a6"
          />
          <TrendCard
            label="Blood Pressure"
            unit="mmHg"
            :data="bpChart"
            :categories="{
              systolic: { name: 'Systolic', color: '#ef4444' },
              diastolic: { name: 'Diastolic', color: '#3b82f6' }
            }"
            show-legend
          />
          <TrendCard
            label="Resting Heart Rate"
            unit="bpm"
            :data="rhrChart"
            color="#f97316"
          />
          <TrendCard
            label="HRV"
            unit="ms"
            :data="hrvChart"
            color="#8b5cf6"
          />
        </div>

        <!-- Lab draw markers -->
        <div
          v-if="labDrawsInRange.length"
          class="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted"
        >
          <UIcon
            name="i-lucide-flask-conical"
            class="w-3.5 h-3.5 shrink-0"
          />
          <span>Lab draws:</span>
          <NuxtLink
            v-for="draw in labDrawsInRange"
            :key="draw.date"
            to="/labs"
            class="px-2 py-0.5 rounded-full bg-elevated border border-default hover:border-primary transition-colors font-mono"
          >
            {{ formatDate(draw.date) }}
          </NuxtLink>
        </div>
      </section>

      <!-- Health metrics (Apple Health + Whoop) -->
      <section
        id="metrics"
        class="scroll-mt-28"
      >
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Health Metrics
        </h2>
        <JournalHealthMetrics />
      </section>

      <!-- Soda tracker (owner/friend — the doctor view gets sodas stripped server-side anyway) -->
      <section
        v-if="role !== 'doctor'"
        id="soda"
        class="scroll-mt-28"
      >
        <JournalSodaTracker :readonly="!isOwner" />
      </section>

      <!-- Compound usage summary -->
      <section
        id="compounds"
        class="scroll-mt-28"
      >
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Compound Usage
        </h2>
        <div class="space-y-5">
          <div
            v-for="group in compoundUsage"
            :key="group.label"
          >
            <p class="text-xs font-medium text-muted uppercase tracking-wider mb-2">
              {{ group.label }}
            </p>
            <div class="flex flex-wrap gap-2">
              <NuxtLink
                v-for="[compound, count] in group.compounds"
                :key="compound"
                :to="`/journal/compound/${encodeURIComponent(compound)}`"
                class="flex items-center rounded-lg border hover:ring-1 hover:ring-primary transition-all cursor-pointer no-underline"
                :class="count ? 'gap-2 px-3 py-2' : 'gap-1.5 px-2 py-1 opacity-50 hover:opacity-100'"
              >
                <span
                  class="rounded-full shrink-0"
                  :class="count ? 'w-2.5 h-2.5' : 'w-2 h-2'"
                  :style="{ background: getCompoundColor(compound) }"
                />
                <span :class="count ? 'text-sm font-medium' : 'text-xs'">{{ compound }}</span>
                <span
                  v-if="count"
                  class="text-xs text-muted"
                >{{ count }}d</span>
              </NuxtLink>
            </div>
          </div>
        </div>
      </section>

      <!-- Workouts (Apple Health / Whoop) -->
      <div
        id="workouts"
        class="scroll-mt-28"
      >
        <JournalWorkoutsList />
      </div>

      <!-- Recent entries (daily pages are owner/friend-only) -->
      <div
        v-if="role !== 'doctor'"
        id="entries"
        class="scroll-mt-28"
      >
        <JournalEntriesList />
      </div>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { getCompoundColor, COMPOUND_GROUPS, KNOWN_COMPOUNDS } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const { data, refresh } = await useJournalEntries()
const { data: labsData } = await useLabsEntries()
const { refresh: refreshHealth } = await useHealthMetricsEntries()
const { refresh: refreshWorkouts } = await useWorkoutsEntries()
const { role, isOwner } = await useAuth()

onMounted(refresh)
onMounted(refreshHealth)
onMounted(refreshWorkouts)

const entries = computed(() => data.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)
const previous = computed(() => entries.value.at(-2) ?? null)

const todayDate: string = new Date().toISOString().slice(0, 10)

// --- Section nav ---
const sections = computed(() => [
  { id: 'vitals', label: 'Vitals' },
  { id: 'trends', label: 'Trends' },
  { id: 'metrics', label: 'Health' },
  ...(role.value !== 'doctor' ? [{ id: 'soda', label: 'Soda' }] : []),
  { id: 'compounds', label: 'Compounds' },
  { id: 'workouts', label: 'Workouts' },
  ...(role.value !== 'doctor' ? [{ id: 'entries', label: 'Entries' }] : [])
])

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// --- Peptide streak ---
const peptideStreak = computed(() => {
  const datesWithPeptides = new Set(
    entries.value.filter(e => (e.peptides ?? []).length > 0).map(e => e.date)
  )
  let streak = 0
  let skippedToday = false
  const d = new Date(todayDate + 'T12:00:00')
  while (true) {
    const dateStr = d.toISOString().slice(0, 10)
    if (datesWithPeptides.has(dateStr)) {
      streak++
    }
    else if (!skippedToday && dateStr === todayDate) {
      skippedToday = true
    }
    else {
      break
    }
    d.setDate(d.getDate() - 1)
  }
  return streak
})

// --- Vitals deltas ---
const weightDelta = computed(() => {
  if (!latest.value?.weight_lbs || !previous.value?.weight_lbs) return null
  return Math.round((latest.value.weight_lbs - previous.value.weight_lbs) * 10) / 10
})

const rhrDelta = computed(() => {
  if (!latest.value?.rhr || !previous.value?.rhr) return null
  return latest.value.rhr - previous.value.rhr
})

const hrvDelta = computed(() => {
  if (!latest.value?.hrv || !previous.value?.hrv) return null
  return latest.value.hrv - previous.value.hrv
})

function intDelta(d: number | null): string {
  if (d === null) return ''
  return `${d > 0 ? '+' : ''}${d}`
}

// --- Rolling average ---
const smoothCharts = ref(false)

function applyRolling(data: { date: string, value: number }[], window = 7) {
  return data.map((point, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1)
    const avg = Math.round(slice.reduce((a, b) => a + b.value, 0) / slice.length * 10) / 10
    return { ...point, value: avg }
  })
}

function applyRollingBP(data: { date: string, systolic: number, diastolic: number }[], window = 7) {
  return data.map((point, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1)
    return {
      ...point,
      systolic: Math.round(slice.reduce((a, b) => a + b.systolic, 0) / slice.length),
      diastolic: Math.round(slice.reduce((a, b) => a + b.diastolic, 0) / slice.length)
    }
  })
}

// --- Chart range ---
const CHART_RANGES = [
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
  { label: 'All', days: 0 }
]
const chartDays = ref(90)

const chartEntries = computed(() => {
  if (!chartDays.value) return entries.value
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - chartDays.value)
  const cutoffStr = cutoff.toISOString().split('T')[0] ?? ''
  return entries.value.filter(e => e.date >= cutoffStr)
})

const weightChart = computed(() => {
  const raw = chartEntries.value
    .filter(e => e.weight_lbs != null)
    .map(e => ({ date: formatDate(e.date), value: e.weight_lbs as number }))
  return smoothCharts.value ? applyRolling(raw) : raw
})

const bpChart = computed(() => {
  const raw = chartEntries.value
    .filter(e => e.bp_systolic != null && e.bp_diastolic != null)
    .map(e => ({ date: formatDate(e.date), systolic: e.bp_systolic as number, diastolic: e.bp_diastolic as number }))
  return smoothCharts.value ? applyRollingBP(raw) : raw
})

const rhrChart = computed(() => {
  const raw = chartEntries.value
    .filter(e => e.rhr != null)
    .map(e => ({ date: formatDate(e.date), value: e.rhr as number }))
  return smoothCharts.value ? applyRolling(raw) : raw
})

const hrvChart = computed(() => {
  const raw = chartEntries.value
    .filter(e => e.hrv != null)
    .map(e => ({ date: formatDate(e.date), value: e.hrv as number }))
  return smoothCharts.value ? applyRolling(raw) : raw
})

const labDrawsInRange = computed(() => {
  if (!labsData.value?.length || !chartEntries.value.length) return []
  const minDate = chartEntries.value[0]?.date ?? ''
  const maxDate = chartEntries.value.at(-1)?.date ?? ''
  return (labsData.value as Array<{ date: string }>).filter(l => l.date >= minDate && l.date <= maxDate)
})

// --- Compound usage ---
const compoundUsage = computed(() => {
  const counts: Record<string, number> = {}
  for (const entry of entries.value) {
    const compounds = new Set((entry.peptides ?? []).map((p: { compound: string }) => p.compound))
    for (const compound of compounds) {
      counts[compound] = (counts[compound] ?? 0) + 1
    }
  }
  // Within each group: used compounds first (by days used), then the rest
  // alphabetically so each info page stays reachable before it's ever logged.
  const grouped = Object.entries(COMPOUND_GROUPS).map(([label, list]) => {
    const used = list
      .filter(c => counts[c])
      .map(c => [c, counts[c]!] as [string, number])
      .sort(([, a], [, b]) => b - a)
    const unused = list
      .filter(c => !counts[c])
      .sort((a, b) => a.localeCompare(b))
      .map(c => [c, 0] as [string, number])
    return { label, compounds: [...used, ...unused] }
  })
  // Freeform compounds logged outside the known list land in Other
  const known = new Set(KNOWN_COMPOUNDS)
  const extras = Object.entries(counts)
    .filter(([c]) => !known.has(c))
    .sort(([, a], [, b]) => b - a)
  if (extras.length) grouped.find(g => g.label === 'Other')?.compounds.push(...extras)
  return grouped
})
</script>
