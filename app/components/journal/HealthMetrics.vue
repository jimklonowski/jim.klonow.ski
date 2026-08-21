<template>
  <div v-if="latestHealth">
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatTile
        v-for="[key, meta] in healthMetricEntries"
        :key="key"
        :label="meta.label"
        :value="readingValueText(key)"
        :unit="key === 'sleep_total_min' ? undefined : meta.unit"
        :delta="healthDeltaValue(key)"
        :delta-text="healthDeltaText(key)"
        :lower-is-better="meta.lowerIsBetter"
        :as-of="readingStaleDate(key) ?? undefined"
        clickable
        @click="openModal(key)"
      />
    </div>

    <div
      v-if="healthEntries.length >= 2"
      class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mt-4"
    >
      <TrendCard
        v-for="[key, meta] in healthTrendEntries"
        :key="key"
        :label="meta.label"
        :unit="meta.unit"
        :data="trendData(key)"
        color="#06b6d4"
        :height="120"
      />
    </div>

    <!-- Sleep stages -->
    <UCard
      v-if="sleepStageChart.length"
      class="mt-4"
    >
      <template #header>
        <p class="text-sm font-medium">
          Sleep Stages
        </p>
        <p class="text-xs text-muted">
          minutes per night
        </p>
      </template>
      <ClientOnly>
        <BarChart
          :data="sleepStageChart"
          :categories="SLEEP_STAGE_META"
          :y-axis-keys="['rem', 'deep', 'core', 'awake']"
          x-axis-key="date"
          :stacked="true"
          :height="200"
        >
          <template #tooltip="{ params }">
            <div
              class="rounded-lg p-3 text-xs min-w-44"
              style="background: #1e293b; border: 1px solid #334155; color: #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.4);"
            >
              <p
                class="font-semibold text-sm mb-2"
                style="color: #f8fafc;"
              >
                {{ params[0]?.axisValue }}
              </p>
              <div class="space-y-1">
                <div
                  v-for="p in params"
                  :key="p.seriesName"
                  class="flex items-center justify-between gap-4"
                >
                  <span
                    class="flex items-center gap-1.5"
                    style="color: #94a3b8;"
                  >
                    <span
                      class="w-2 h-2 rounded-full shrink-0"
                      :style="{ background: p.color }"
                    />
                    {{ p.seriesName }}
                  </span>
                  <span
                    class="font-mono font-medium"
                    style="color: #f8fafc;"
                  >{{ formatDuration(Number(p.value ?? 0)) }}</span>
                </div>
              </div>
              <div
                class="flex items-center justify-between gap-4 pt-1.5 mt-1.5"
                style="border-top: 1px solid #334155;"
              >
                <span style="color: #94a3b8;">Asleep</span>
                <span
                  class="font-mono font-semibold"
                  style="color: #f8fafc;"
                >{{ formatDuration(asleepMinutes(params)) }}</span>
              </div>
            </div>
          </template>
        </BarChart>
      </ClientOnly>
    </UCard>

    <!-- History modal -->
    <UModal
      v-model:open="modalOpen"
      :title="modalMeta?.label ?? ''"
    >
      <template #body>
        <div class="space-y-4">
          <p
            v-if="modalMeta?.description"
            class="text-sm text-muted leading-relaxed"
          >
            {{ modalMeta.description }}
          </p>
          <USeparator />
          <p class="text-xs font-semibold text-muted uppercase tracking-wider">
            History
          </p>
          <div
            v-for="e in [...healthEntries].sort((a, b) => b.date.localeCompare(a.date))"
            :key="e.date"
            class="flex items-center justify-between py-2 border-b border-default last:border-0"
          >
            <span class="text-sm text-muted">{{ formatDate(e.date) }}</span>
            <span class="font-semibold tabular-nums">{{ formatHealthValue(modalKey, e) }}</span>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
// Health metrics (Apple Health + Whoop): most-recent-reading tiles, trend charts, and the
// stacked sleep-stages bar. Extracted from the journal page along with its "latest actual
// reading" engine — metrics land on different cadences from different sources (Whoop daily,
// sleep each morning, VO2 max only on outdoor workouts, body comp on weigh-in days), so each
// tile shows its own most recent reading rather than whatever is on the newest date.
import { HEALTH_METRICS_META, formatDuration } from '~/data/health-metrics'

const { data: healthData } = await useHealthMetricsEntries()
const healthEntries = computed(() => healthData.value ?? [])
const latestHealth = computed(() => healthEntries.value.at(-1) ?? null)
const latestHealthDate = computed(() => latestHealth.value?.date ?? null)

interface HealthReading { value: number | null, date: string | null, prev: number | null }
const latestReadings = computed<Record<string, HealthReading>>(() => {
  const out: Record<string, HealthReading> = {}
  for (const key of Object.keys(HEALTH_METRICS_META)) {
    let value: number | null = null
    let date: string | null = null
    let prev: number | null = null
    for (let i = healthEntries.value.length - 1; i >= 0; i--) {
      const v = getHealthValue(healthEntries.value[i] ?? null, key)
      if (v === null) continue
      if (value === null) {
        value = v
        date = healthEntries.value[i]?.date ?? null
      }
      else {
        prev = v
        break
      }
    }
    out[key] = { value, date, prev }
  }
  return out
})

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

function formatHealthNumber(key: string, v: number | null) {
  if (v === null) return '—'
  if (key === 'sleep_total_min') return formatDuration(v)
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
}

// Used by the history modal, which formats a specific entry's value.
function formatHealthValue(key: string, entry: typeof latestHealth.value) {
  return formatHealthNumber(key, getHealthValue(entry, key))
}

function readingValueText(key: string) {
  return formatHealthNumber(key, latestReadings.value[key]?.value ?? null)
}

// "as of <date>" shown only when the reading isn't from the newest health-metrics day.
function readingStaleDate(key: string): string | null {
  const r = latestReadings.value[key]
  if (!r?.date || r.date === latestHealthDate.value) return null
  return formatDate(r.date)
}

function healthDeltaValue(key: string) {
  const r = latestReadings.value[key]
  if (!r || r.value === null || r.prev === null) return null
  return r.value - r.prev
}

function healthDeltaText(key: string) {
  const d = healthDeltaValue(key)
  if (d === null) return ''
  const sign = d >= 0 ? '+' : ''
  if (key === 'sleep_total_min') return `${sign}${formatDuration(Math.abs(d))}`
  return `${sign}${Math.abs(d) >= 10 ? Math.round(d) : d.toFixed(1)}`
}

function trendData(key: string) {
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

function asleepMinutes(params: Array<{ seriesName?: string, value?: number | string }>) {
  return params
    .filter(p => p.seriesName !== SLEEP_STAGE_META.awake.name)
    .reduce((sum, p) => sum + Number(p.value ?? 0), 0)
}

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

const modalOpen = ref(false)
const modalKey = ref('')
const modalMeta = computed(() => modalKey.value ? HEALTH_METRICS_META[modalKey.value] : null)

function openModal(key: string) {
  modalKey.value = key
  modalOpen.value = true
}
</script>
