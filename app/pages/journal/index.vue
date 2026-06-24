<template>
  <UContainer>
    <div class="py-8 space-y-10">

      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold">Peptide Journal</h1>
          <div v-if="latest" class="flex flex-wrap items-center gap-2 mt-1">
            <p class="text-muted">{{ entries.length }} entries &mdash; latest: {{ formatDate(latest.date) }}</p>
            <span
              v-if="peptideStreak > 0"
              class="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium"
            >
              {{ peptideStreak }}-day streak
            </span>
          </div>
        </div>
        <div class="flex gap-2">
          <UButton :to="`/journal/calendar`" variant="outline" size="xs" icon="i-lucide-calendar">
            Calendar
          </UButton>
          <UButton to="/journal/timeline" variant="outline" size="xs" icon="i-lucide-gantt-chart">
            Timeline
          </UButton>
          <UButton to="/journal/import" variant="outline" size="xs" icon="i-lucide-upload">
            Import
          </UButton>
          <UButton :to="`/journal/${todayDate}`" size="xs" icon="i-lucide-plus">
            New Entry
          </UButton>
        </div>
      </div>

      <!-- Latest vitals -->
      <section v-if="latest">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Latest Vitals</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider mb-1">Weight</p>
            <p class="text-2xl font-bold font-mono">{{ latest.weight_lbs ?? '—' }}<span class="text-sm font-normal text-muted ml-1">lbs</span></p>
            <p v-if="weightDelta !== null" class="text-xs mt-1" :class="weightDelta > 0 ? 'text-warning' : 'text-success'">
              {{ weightDelta > 0 ? '+' : '' }}{{ weightDelta.toFixed(1) }} from prev
            </p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider mb-1">Blood Pressure</p>
            <p class="text-2xl font-bold font-mono">
              {{ latest.bp_systolic ?? '—' }}<span class="text-sm font-normal text-muted">/</span>{{ latest.bp_diastolic ?? '—' }}
            </p>
            <p class="text-xs text-muted mt-1">mmHg</p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider mb-1">RHR</p>
            <p class="text-2xl font-bold font-mono">{{ latest.rhr ?? '—' }}<span class="text-sm font-normal text-muted ml-1">bpm</span></p>
            <p v-if="rhrDelta !== null" class="text-xs mt-1" :class="rhrDelta > 0 ? 'text-warning' : 'text-success'">
              {{ rhrDelta > 0 ? '+' : '' }}{{ rhrDelta }} from prev
            </p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider mb-1">HRV</p>
            <p class="text-2xl font-bold font-mono">{{ latest.hrv ?? '—' }}<span class="text-sm font-normal text-muted ml-1">ms</span></p>
            <p v-if="hrvDelta !== null" class="text-xs mt-1" :class="hrvDelta > 0 ? 'text-success' : 'text-warning'">
              {{ hrvDelta > 0 ? '+' : '' }}{{ hrvDelta }} from prev
            </p>
          </UCard>
        </div>
      </section>

      <!-- Trend charts -->
      <section v-if="entries.length >= 2">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">Trends</h2>
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
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UCard>
            <template #header>
              <p class="text-sm font-medium">Weight</p>
              <p class="text-xs text-muted">lbs</p>
            </template>
            <ClientOnly>
              <AreaChart
                :data="weightChart"
                :categories="{ value: { name: 'Weight', color: '#14b8a6' } }"
                :height="128"
                :show-legend="false"
              />
            </ClientOnly>
          </UCard>
          <UCard>
            <template #header>
              <p class="text-sm font-medium">Blood Pressure</p>
              <p class="text-xs text-muted">mmHg</p>
            </template>
            <ClientOnly>
              <AreaChart
                :data="bpChart"
                :categories="{
                  systolic: { name: 'Systolic', color: '#ef4444' },
                  diastolic: { name: 'Diastolic', color: '#3b82f6' }
                }"
                :height="128"
                :show-legend="true"
              />
            </ClientOnly>
          </UCard>
          <UCard>
            <template #header>
              <p class="text-sm font-medium">Resting Heart Rate</p>
              <p class="text-xs text-muted">bpm</p>
            </template>
            <ClientOnly>
              <AreaChart
                :data="rhrChart"
                :categories="{ value: { name: 'RHR', color: '#f97316' } }"
                :height="128"
                :show-legend="false"
              />
            </ClientOnly>
          </UCard>
          <UCard>
            <template #header>
              <p class="text-sm font-medium">HRV</p>
              <p class="text-xs text-muted">ms</p>
            </template>
            <ClientOnly>
              <AreaChart
                :data="hrvChart"
                :categories="{ value: { name: 'HRV', color: '#8b5cf6' } }"
                :height="128"
                :show-legend="false"
              />
            </ClientOnly>
          </UCard>
        </div>

        <!-- Lab draw markers -->
        <div v-if="labDrawsInRange.length" class="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
          <UIcon name="i-lucide-flask-conical" class="w-3.5 h-3.5 shrink-0" />
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

      <!-- Peptide usage summary -->
      <section v-if="peptideUsage.length">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Peptide Usage</h2>
        <div class="flex flex-wrap gap-2">
          <NuxtLink
            v-for="[compound, count] in peptideUsage"
            :key="compound"
            :to="`/journal/compound/${encodeURIComponent(compound)}`"
            class="flex items-center gap-2 px-3 py-2 rounded-lg border hover:ring-1 hover:ring-primary transition-all cursor-pointer no-underline"
          >
            <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: getCompoundColor(compound) }" />
            <span class="text-sm font-medium">{{ compound }}</span>
            <span class="text-xs text-muted">{{ count }}d</span>
          </NuxtLink>
        </div>
      </section>

      <!-- Recent entries -->
      <section>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">Entries</h2>
          <span class="text-xs text-muted">{{ entries.length }} total</span>
        </div>
        <div class="space-y-2">
          <UCard
            v-for="entry in pageEntries"
            :key="entry.date"
            class="cursor-pointer hover:ring-1 hover:ring-primary transition-all"
            @click="navigateTo(`/journal/${entry.date}`)"
          >
            <div class="flex items-center justify-between flex-wrap gap-3">
              <div class="flex items-center gap-3">
                <div class="text-xs text-muted font-mono min-w-24">{{ formatDate(entry.date) }}</div>
                <div v-if="entry.day" class="text-xs text-muted">Day {{ entry.day }}</div>
              </div>
              <div class="flex items-center gap-4 text-xs font-mono text-muted">
                <span v-if="entry.weight_lbs">{{ entry.weight_lbs }}lb</span>
                <span v-if="entry.bp_systolic">{{ entry.bp_systolic }}/{{ entry.bp_diastolic }}</span>
                <span v-if="entry.rhr">♥ {{ entry.rhr }}</span>
                <span v-if="entry.hrv">HRV {{ entry.hrv }}</span>
              </div>
              <div class="flex gap-1">
                <span
                  v-for="compound in uniqueCompounds(entry)"
                  :key="compound"
                  class="w-2 h-2 rounded-full"
                  :style="{ background: getCompoundColor(compound) }"
                  :title="compound"
                />
              </div>
            </div>
          </UCard>
          <p v-if="!entries.length" class="text-muted text-sm">No entries yet. <NuxtLink :to="`/journal/${todayDate}`" class="text-primary underline">Add today's entry.</NuxtLink></p>
        </div>
        <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
          <UButton size="xs" variant="ghost" icon="i-lucide-chevron-left" :disabled="currentPage === 1" @click="currentPage--">Prev</UButton>
          <span class="text-xs text-muted">Page {{ currentPage }} of {{ totalPages }}</span>
          <UButton size="xs" variant="ghost" trailing-icon="i-lucide-chevron-right" :disabled="currentPage === totalPages" @click="currentPage++">Next</UButton>
        </div>
      </section>

    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const route = useRoute()
const { data, refresh } = await useAsyncData(route.path, () =>
  queryCollection('journal').order('date', 'ASC').all(),
  { getCachedData: (key, app) => { const d = app.payload.data[key]; return d?.length ? d : undefined } }
)
const { data: labsData } = await useAsyncData('labs-draws', () =>
  queryCollection('labs').order('date', 'ASC').all()
)

onMounted(refresh)

const entries = computed(() => data.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)
const previous = computed(() => entries.value.at(-2) ?? null)

const todayDate: string = new Date().toISOString().slice(0, 10)

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
    } else if (!skippedToday && dateStr === todayDate) {
      skippedToday = true
    } else {
      break
    }
    d.setDate(d.getDate() - 1)
  }
  return streak
})

// --- Pagination ---
const PAGE_SIZE = 20
const currentPage = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(entries.value.length / PAGE_SIZE)))
const pageEntries = computed(() => {
  const reversed = [...entries.value].reverse()
  const start = (currentPage.value - 1) * PAGE_SIZE
  return reversed.slice(start, start + PAGE_SIZE)
})

// --- Rolling average ---
const smoothCharts = ref(false)

function applyRolling(data: { date: string; value: number }[], window = 7) {
  return data.map((point, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1)
    const avg = Math.round(slice.reduce((a, b) => a + b.value, 0) / slice.length * 10) / 10
    return { ...point, value: avg }
  })
}

function applyRollingBP(data: { date: string; systolic: number; diastolic: number }[], window = 7) {
  return data.map((point, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1)
    return {
      ...point,
      systolic: Math.round(slice.reduce((a, b) => a + b.systolic, 0) / slice.length),
      diastolic: Math.round(slice.reduce((a, b) => a + b.diastolic, 0) / slice.length),
    }
  })
}

// --- Chart range ---
const CHART_RANGES = [
  { label: '30d', days: 30 },
  { label: '60d', days: 60 },
  { label: '90d', days: 90 },
  { label: 'All', days: 0 },
]
const chartDays = ref(90)

const chartEntries = computed(() => {
  if (!chartDays.value) return entries.value
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - chartDays.value)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  return entries.value.filter(e => e.date >= cutoffStr)
})

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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

const peptideUsage = computed(() => {
  const counts: Record<string, number> = {}
  for (const entry of entries.value) {
    const compounds = new Set((entry.peptides ?? []).map((p: { compound: string }) => p.compound))
    for (const compound of compounds) {
      counts[compound] = (counts[compound] ?? 0) + 1
    }
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)
})

function uniqueCompounds(entry: typeof latest.value) {
  if (!entry?.peptides) return []
  return [...new Set(entry.peptides.map((p: { compound: string }) => p.compound))]
}
</script>
