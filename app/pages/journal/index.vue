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
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="!whoopConnected"
            variant="outline"
            size="xs"
            icon="i-lucide-link"
            to="/api/whoop/authorize"
            external
          >
            Connect Whoop
          </UButton>
          <UDropdownMenu v-else :items="whoopMenuItems" :content="{ align: 'start' }" size="xs">
            <UButton variant="outline" size="xs" icon="i-lucide-check" trailing-icon="i-lucide-chevron-down">
              Whoop
            </UButton>
          </UDropdownMenu>
          <UButton :to="`/journal/calendar`" variant="outline" size="xs" icon="i-lucide-calendar">
            Calendar
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

      <!-- Health metrics (Apple Health + Whoop) -->
      <section v-if="latestHealth">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Health Metrics</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <UCard
            v-for="[key, meta] in healthMetricEntries"
            :key="key"
            class="cursor-pointer hover:ring-1 hover:ring-primary/50 transition-shadow"
            @click="openHealthModal(key)"
          >
            <div class="space-y-2">
              <p class="text-xs text-muted leading-tight">{{ meta.label }}</p>
              <div class="flex items-end gap-1">
                <span class="text-2xl font-bold tabular-nums">{{ formatHealthValue(key, latestHealth) }}</span>
                <span v-if="key !== 'sleep_total_min'" class="text-xs text-muted mb-0.5">{{ meta.unit }}</span>
              </div>
              <div v-if="prevHealth && healthDeltaValue(key) !== null" class="flex items-center gap-1 text-xs text-muted">
                <UIcon :name="healthDeltaIcon(key)" :class="healthDeltaColor(key)" class="w-3.5 h-3.5 shrink-0" />
                <span :class="healthDeltaColor(key)">{{ healthDeltaText(key) }}</span>
                <span>vs prev</span>
              </div>
            </div>
          </UCard>
        </div>

        <div v-if="healthEntries.length >= 2" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
          <UCard v-for="[key, meta] in healthTrendEntries" :key="key">
            <template #header>
              <p class="text-sm font-medium">{{ meta.label }}</p>
              <p class="text-xs text-muted">{{ meta.unit }}</p>
            </template>
            <ClientOnly>
              <AreaChart
                :data="healthTrendData(key)"
                :categories="{ value: { name: meta.label, color: '#06b6d4' } }"
                :height="120"
                :show-legend="false"
              />
            </ClientOnly>
          </UCard>
        </div>

        <!-- Sleep stages -->
        <UCard v-if="sleepStageChart.length" class="mt-4">
          <template #header>
            <p class="text-sm font-medium">Sleep Stages</p>
            <p class="text-xs text-muted">minutes per night</p>
          </template>
          <ClientOnly>
            <BarChart
              :data="sleepStageChart"
              :categories="SLEEP_STAGE_META"
              :y-axis="['rem', 'deep', 'core', 'awake']"
              x-axis="date"
              :stacked="true"
              :height="200"
            >
              <template #tooltip="{ values }">
                <div v-if="values" class="bg-elevated border border-default rounded-lg shadow-lg p-3 text-xs min-w-44">
                  <p class="font-semibold text-sm mb-2">{{ values.date }}</p>
                  <div class="space-y-1">
                    <div
                      v-for="key in (['rem', 'deep', 'core', 'awake'] as const)"
                      :key="key"
                      class="flex items-center justify-between gap-4"
                    >
                      <span class="flex items-center gap-1.5 text-muted">
                        <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: SLEEP_STAGE_META[key].color }" />
                        {{ SLEEP_STAGE_META[key].name }}
                      </span>
                      <span class="font-mono font-medium">{{ formatDuration(values[key] ?? 0) }}</span>
                    </div>
                  </div>
                  <div class="flex items-center justify-between gap-4 pt-1.5 mt-1.5 border-t border-default">
                    <span class="text-muted">Asleep</span>
                    <span class="font-mono font-semibold">{{ formatDuration((values.rem ?? 0) + (values.deep ?? 0) + (values.core ?? 0)) }}</span>
                  </div>
                </div>
              </template>
            </BarChart>
          </ClientOnly>
        </UCard>
      </section>

      <!-- History modal -->
      <UModal v-model:open="healthModalOpen" :title="healthModalMeta?.label ?? ''">
        <template #body>
          <div class="space-y-4">
            <p v-if="healthModalMeta?.description" class="text-sm text-muted leading-relaxed">
              {{ healthModalMeta.description }}
            </p>
            <USeparator />
            <p class="text-xs font-semibold text-muted uppercase tracking-wider">History</p>
            <div
              v-for="e in [...healthEntries].sort((a, b) => b.date.localeCompare(a.date))"
              :key="e.date"
              class="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0"
            >
              <span class="text-sm text-muted">{{ formatDate(e.date) }}</span>
              <span class="font-semibold tabular-nums">{{ formatHealthValue(healthModalKey, e) }}</span>
            </div>
          </div>
        </template>
      </UModal>

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

      <!-- Workouts (Apple Health / Whoop) -->
      <section v-if="workoutEntries.length">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">Workouts</h2>
          <span class="text-xs text-muted">{{ workoutEntries.length }} total</span>
        </div>
        <div class="space-y-2">
          <UCard
            v-for="w in pageWorkouts"
            :key="w.id"
            class="cursor-pointer hover:ring-1 hover:ring-primary transition-all"
            @click="navigateTo(`/journal/${w.date}`)"
          >
            <div class="flex items-center justify-between flex-wrap gap-3">
              <div class="flex items-center gap-3">
                <UIcon :name="workoutIcon(w.workout_type)" class="w-4 h-4 shrink-0 text-muted" />
                <div class="text-xs text-muted font-mono min-w-24">{{ formatDate(w.date) }}</div>
                <div class="text-sm font-medium">{{ w.workout_type ?? 'Workout' }}</div>
              </div>
              <div class="flex items-center gap-4 text-xs font-mono text-muted">
                <span v-if="w.duration_min != null">{{ w.duration_min }} min</span>
                <span v-if="w.calories != null">{{ w.calories }} kcal</span>
                <span v-if="w.avg_hr != null">♥ {{ w.avg_hr }}</span>
                <span v-if="w.distance_mi != null">{{ w.distance_mi }} mi</span>
              </div>
            </div>
          </UCard>
        </div>
        <div v-if="workoutTotalPages > 1" class="flex items-center justify-between mt-4">
          <UButton size="xs" variant="ghost" icon="i-lucide-chevron-left" :disabled="workoutPage === 1" @click="workoutPage--">Prev</UButton>
          <span class="text-xs text-muted">Page {{ workoutPage }} of {{ workoutTotalPages }}</span>
          <UButton size="xs" variant="ghost" trailing-icon="i-lucide-chevron-right" :disabled="workoutPage === workoutTotalPages" @click="workoutPage++">Next</UButton>
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
import { HEALTH_METRICS_META, formatDuration } from '~/data/health-metrics'
import { workoutIcon } from '~/data/workouts'

definePageMeta({ middleware: 'journal-auth' })

const toast = useToast()

const { data, refresh } = await useJournalEntries()
const { data: labsData } = await useLabsEntries()
const { data: healthData, refresh: refreshHealth } = await useHealthMetricsEntries()
const { data: workoutsData, refresh: refreshWorkouts } = await useWorkoutsEntries()

onMounted(refresh)
onMounted(refreshHealth)
onMounted(refreshWorkouts)

const whoopConnected = ref(false)
onMounted(async () => {
  try {
    const status = await $fetch<{ connected: boolean }>('/api/whoop/status')
    whoopConnected.value = status.connected
  }
  catch {
    whoopConnected.value = false
  }
})

const syncingWhoop = ref(false)
async function syncWhoopNow() {
  syncingWhoop.value = true
  try {
    const { result } = await $fetch<{ result: { touched: number } }>('/api/whoop/sync', { method: 'POST' })
    await Promise.all([refresh(), refreshHealth(), refreshWorkouts()])
    toast.add({ title: 'Whoop synced', description: `${result.touched} day${result.touched === 1 ? '' : 's'} updated`, color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    toast.add({ title: 'Sync failed', description: msg, color: 'error' })
  }
  finally {
    syncingWhoop.value = false
  }
}

const whoopMenuItems = computed(() => [
  {
    label: 'Sync Now',
    icon: 'i-lucide-refresh-cw',
    loading: syncingWhoop.value,
    onSelect: (e: Event) => {
      e.preventDefault()
      syncWhoopNow()
    }
  },
  {
    label: 'Reconnect',
    icon: 'i-lucide-rotate-ccw',
    to: '/api/whoop/authorize?reconnect=true',
    external: true
  }
])

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

// --- Body composition & fitness (health_metrics) ---
const healthEntries = computed(() => healthData.value ?? [])
const latestHealth = computed(() => healthEntries.value.at(-1) ?? null)
const prevHealth = computed(() => healthEntries.value.length >= 2 ? (healthEntries.value.at(-2) ?? null) : null)

const healthMetricEntries = computed(() => Object.entries(HEALTH_METRICS_META))
const HEALTH_TREND_KEYS = ['vo2_max', 'body_fat_pct', 'sleep_total_min', 'recovery_score', 'strain', 'sleep_performance_pct']
const healthTrendEntries = computed(() =>
  HEALTH_TREND_KEYS.map(k => [k, HEALTH_METRICS_META[k]] as const)
    .filter((pair): pair is [string, NonNullable<(typeof HEALTH_METRICS_META)[string]>] => !!pair[1])
)

function getHealthValue(entry: typeof latestHealth.value, key: string): number | null {
  if (!entry) return null
  return (entry as unknown as Record<string, number | null>)[key] ?? null
}

function formatHealthValue(key: string, entry: typeof latestHealth.value) {
  const v = getHealthValue(entry, key)
  if (v === null) return '—'
  if (key === 'sleep_total_min') return formatDuration(v)
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
}

function healthDeltaValue(key: string) {
  const cur = getHealthValue(latestHealth.value, key)
  const prev = getHealthValue(prevHealth.value, key)
  if (cur === null || prev === null) return null
  return cur - prev
}

function healthDeltaText(key: string) {
  const d = healthDeltaValue(key)
  if (d === null) return ''
  const sign = d >= 0 ? '+' : ''
  if (key === 'sleep_total_min') return `${sign}${formatDuration(Math.abs(d))}`
  return `${sign}${Math.abs(d) >= 10 ? Math.round(d) : d.toFixed(1)}`
}

function healthDeltaIcon(key: string) {
  const d = healthDeltaValue(key)
  if (!d || Math.abs(d) < 0.01) return 'i-lucide-minus'
  return d > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'
}

function healthDeltaColor(key: string) {
  const d = healthDeltaValue(key)
  if (!d || Math.abs(d) < 0.01) return 'text-muted'
  const lower = HEALTH_METRICS_META[key]?.lowerIsBetter
  if (lower === undefined) return 'text-muted'
  return (lower && d < 0) || (!lower && d > 0) ? 'text-success' : 'text-error'
}

function healthTrendData(key: string) {
  return healthEntries.value
    .filter(e => getHealthValue(e, key) !== null)
    .map(e => ({ date: formatDate(e.date), value: getHealthValue(e, key) as number }))
}

const SLEEP_STAGE_META = {
  rem: { name: 'REM', color: '#8b5cf6' },
  deep: { name: 'Deep', color: '#3b82f6' },
  core: { name: 'Core', color: '#06b6d4' },
  awake: { name: 'Awake', color: '#f97316' }
} as const

const sleepStageChart = computed(() =>
  healthEntries.value
    .filter(e => e.sleep_rem_min != null || e.sleep_deep_min != null || e.sleep_core_min != null || e.sleep_awake_min != null)
    .map(e => ({
      date: formatDate(e.date),
      rem: e.sleep_rem_min ?? 0,
      deep: e.sleep_deep_min ?? 0,
      core: e.sleep_core_min ?? 0,
      awake: e.sleep_awake_min ?? 0
    }))
)

const healthModalOpen = ref(false)
const healthModalKey = ref('')
const healthModalMeta = computed(() => healthModalKey.value ? HEALTH_METRICS_META[healthModalKey.value] : null)

function openHealthModal(key: string) {
  healthModalKey.value = key
  healthModalOpen.value = true
}

// --- Workouts ---
const workoutEntries = computed(() => workoutsData.value ?? [])
const sortedWorkouts = computed(() => [...workoutEntries.value].sort((a, b) => b.date.localeCompare(a.date)))

const WORKOUT_PAGE_SIZE = 15
const workoutPage = ref(1)
const workoutTotalPages = computed(() => Math.max(1, Math.ceil(sortedWorkouts.value.length / WORKOUT_PAGE_SIZE)))
const pageWorkouts = computed(() => {
  const start = (workoutPage.value - 1) * WORKOUT_PAGE_SIZE
  return sortedWorkouts.value.slice(start, start + WORKOUT_PAGE_SIZE)
})
</script>
