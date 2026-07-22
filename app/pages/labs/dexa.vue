<template>
  <UContainer>
  <div class="py-8 space-y-10">
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-1">
          <UButton variant="ghost" icon="i-lucide-arrow-left" size="xs" @click="goToLabs">Labs</UButton>
        </div>
        <h1 class="text-3xl font-bold">Body Composition</h1>
        <p v-if="latest" class="text-muted mt-1">
          Latest scan: {{ formatDate(latest.date) }}
          <UBadge color="neutral" variant="subtle" size="xs" class="ml-2">{{ latest.weight_lbs }} lbs weighed</UBadge>
        </p>
      </div>
      <div class="flex gap-2 flex-wrap items-center">
        <UPopover v-if="allSources.length" :content="{ side: 'bottom', align: 'end' }">
          <UButton variant="outline" size="xs" icon="i-lucide-file-text" trailing-icon="i-lucide-chevron-down">
            Source PDFs ({{ allSources.length }})
          </UButton>
          <template #content>
            <div class="p-2 max-h-80 overflow-y-auto min-w-56 space-y-0.5">
              <a
                v-for="src in sortedSources"
                :key="src"
                :href="src"
                target="_blank"
                class="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-elevated hover:text-primary transition-colors"
              >
                <UIcon name="i-lucide-file-text" class="w-3.5 h-3.5 shrink-0 text-muted" />
                <span class="truncate">{{ pdfLabel(src) }}</span>
              </a>
            </div>
          </template>
        </UPopover>
        <UButton to="/labs/upload" variant="solid" size="xs" icon="i-lucide-upload">
          Upload Scan
        </UButton>
      </div>
    </div>

    <!-- Key metrics -->
    <section>
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Key Metrics</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <UCard
          v-for="[key, meta] in totalMetricEntries"
          :key="key"
          class="cursor-pointer hover:ring-1 hover:ring-primary/50 transition-shadow"
          @click="openModal(key)"
        >
          <div class="space-y-2">
            <p class="text-xs text-muted leading-tight">{{ meta.label }}</p>
            <div class="flex items-end gap-1">
              <span class="text-2xl font-bold tabular-nums">{{ formatTotalValue(key) }}</span>
              <span class="text-xs text-muted mb-0.5">{{ meta.unit }}</span>
            </div>
            <div v-if="prevLatest" class="flex items-center gap-1 text-xs text-muted">
              <UIcon :name="deltaIcon(key)" :class="deltaColor(key)" class="w-3.5 h-3.5 shrink-0" />
              <span :class="deltaColor(key)">{{ deltaText(key) }}</span>
              <span>vs prev</span>
            </div>
          </div>
        </UCard>
      </div>
    </section>

    <!-- Trends -->
    <section v-if="entries.length >= 2">
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Trends</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <UCard v-for="[key, meta] in trendMetrics" :key="key">
          <template #header>
            <p class="text-sm font-medium">{{ meta.label }}</p>
            <p class="text-xs text-muted">{{ meta.unit }}</p>
          </template>
          <AreaChart
            :data="trendData(key)"
            :categories="{ value: { name: meta.label, color: '#22c55e' } }"
            :height="120"
          />
        </UCard>
      </div>
    </section>

    <!-- Regional breakdown -->
    <section>
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Regional Breakdown</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" v-if="latest">
        <UCard v-for="[region, rdata] in regionEntries" :key="region">
          <div class="space-y-3">
            <p class="text-sm font-medium">{{ REGION_LABELS[region] }}</p>
            <div class="flex justify-between text-sm">
              <span class="text-muted">Fat %</span>
              <span class="font-semibold">{{ rdata.fat_pct }}%</span>
            </div>
            <div class="h-1.5 rounded-full bg-neutral-700 overflow-hidden">
              <div class="h-full bg-primary rounded-full" :style="{ width: `${Math.min(rdata.fat_pct * 2, 100)}%` }" />
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs text-muted">
              <div>
                <p>Fat</p>
                <p class="text-foreground font-medium">{{ rdata.fat_lbs }} lbs</p>
              </div>
              <div v-if="'lean_lbs' in rdata">
                <p>Lean</p>
                <p class="text-foreground font-medium">{{ (rdata as { fat_pct: number, fat_lbs: number, lean_lbs: number }).lean_lbs }} lbs</p>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </section>

    <!-- VAT + AG + Bone density -->
    <section v-if="latest">
      <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Additional Metrics</h2>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <UCard v-if="latest.vat">
          <div class="space-y-1">
            <p class="text-xs text-muted">VAT Volume</p>
            <div class="flex items-end gap-1">
              <span class="text-2xl font-bold">{{ latest.vat.volume_in3 }}</span>
              <span class="text-xs text-muted mb-0.5">in³</span>
            </div>
            <UBadge :color="latest.vat.volume_in3 < 52 ? 'success' : latest.vat.volume_in3 < 112 ? 'warning' : 'error'" variant="subtle" size="xs">
              {{ latest.vat.volume_in3 < 52 ? 'Ideal' : latest.vat.volume_in3 < 112 ? 'Elevated' : 'High Risk' }}
            </UBadge>
          </div>
        </UCard>

        <UCard v-if="latest.ag_ratio !== undefined">
          <div class="space-y-1">
            <p class="text-xs text-muted">A/G Ratio</p>
            <div class="flex items-end gap-1">
              <span class="text-2xl font-bold">{{ latest.ag_ratio }}</span>
            </div>
            <UBadge :color="latest.ag_ratio < 1.0 ? 'success' : 'error'" variant="subtle" size="xs">
              {{ latest.ag_ratio < 1.0 ? 'Optimal' : 'Elevated' }}
            </UBadge>
          </div>
        </UCard>

        <UCard v-if="latest.bone_density">
          <div class="space-y-1">
            <p class="text-xs text-muted">Bone Density</p>
            <div class="flex items-end gap-1">
              <span class="text-2xl font-bold">{{ latest.bone_density.total_bmd }}</span>
              <span class="text-xs text-muted mb-0.5">g/cm²</span>
            </div>
            <p class="text-xs text-muted">T-score {{ latest.bone_density.t_score }}</p>
          </div>
        </UCard>

        <UCard v-if="latest.symmetry">
          <div class="space-y-2">
            <p class="text-xs text-muted">Arm Lean Balance</p>
            <div class="flex justify-between text-xs">
              <span>R: {{ latest.symmetry.right_arm_lean }} lbs</span>
              <span>L: {{ latest.symmetry.left_arm_lean }} lbs</span>
            </div>
            <p class="text-xs text-muted">Leg Lean Balance</p>
            <div class="flex justify-between text-xs">
              <span>R: {{ latest.symmetry.right_leg_lean }} lbs</span>
              <span>L: {{ latest.symmetry.left_leg_lean }} lbs</span>
            </div>
          </div>
        </UCard>
      </div>
    </section>

    <!-- History modal -->
    <UModal v-model:open="modalOpen" :title="modalMeta?.label ?? ''">
      <template #body>
        <div class="space-y-4">
          <p v-if="modalMeta?.description" class="text-sm text-muted leading-relaxed">
            {{ modalMeta.description }}
          </p>
          <USeparator />
          <p class="text-xs font-semibold text-muted uppercase tracking-wider">All Scans</p>
          <div
            v-for="e in [...entries].sort((a, b) => b.date.localeCompare(a.date))"
            :key="e.date"
            class="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0"
          >
            <span class="text-sm text-muted">{{ formatDate(e.date) }}</span>
            <span class="font-semibold tabular-nums">{{ getModalValue(e) }} {{ modalMeta?.unit }}</span>
          </div>
        </div>
      </template>
    </UModal>
  </div>
  </UContainer>
</template>

<script setup lang="ts">
import { DEXA_TOTAL_METRICS, REGION_LABELS } from '~/data/dexa'

definePageMeta({ middleware: 'labs-auth' })

const { data, refresh } = await useDexaEntries()

if (import.meta.client) {
  onMounted(refresh)
}

const entries = computed(() => data.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)
const prevLatest = computed(() => entries.value.length >= 2 ? entries.value.at(-2) : null)

const allSources = computed(() =>
  entries.value.flatMap(e => (e.sources ?? []).map((s: string) => s)).filter(Boolean)
)
const sortedSources = computed(() => [...allSources.value].reverse())

const totalMetricEntries = computed(() => Object.entries(DEXA_TOTAL_METRICS))

type RegionData = { fat_pct: number, fat_lbs: number, lean_lbs?: number }
const regionEntries = computed((): [string, RegionData][] =>
  Object.entries(latest.value?.regions ?? {}).filter((pair): pair is [string, RegionData] => !!pair[1])
)

function goToLabs() { window.location.href = '/labs' }

const TREND_KEYS = ['body_fat_pct', 'lean_mass_lbs', 'fat_mass_lbs']
const trendMetrics = computed(() =>
  TREND_KEYS.map(k => [k, DEXA_TOTAL_METRICS[k]] as const)
    .filter((pair): pair is [string, NonNullable<(typeof DEXA_TOTAL_METRICS)[string]>] => !!pair[1])
)

function getTotalValue(entry: typeof latest.value | undefined, key: string): number | null {
  if (!entry) return null
  return (entry.total as Record<string, number>)[key] ?? null
}

function formatTotalValue(key: string) {
  const v = getTotalValue(latest.value, key)
  if (v === null) return '—'
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
}

function deltaValue(key: string) {
  const cur = getTotalValue(latest.value, key)
  const prev = getTotalValue(prevLatest.value ?? null, key)
  if (cur === null || prev === null) return null
  return cur - prev
}

function deltaText(key: string) {
  const d = deltaValue(key)
  if (d === null) return ''
  const sign = d >= 0 ? '+' : ''
  return `${sign}${Math.abs(d) >= 10 ? Math.round(d) : d.toFixed(1)}`
}

function deltaIcon(key: string) {
  const d = deltaValue(key)
  if (!d || Math.abs(d) < 0.01) return 'i-lucide-minus'
  return d > 0 ? 'i-lucide-trending-up' : 'i-lucide-trending-down'
}

function deltaColor(key: string) {
  const d = deltaValue(key)
  if (!d || Math.abs(d) < 0.01) return 'text-muted'
  const lower = DEXA_TOTAL_METRICS[key]?.lowerIsBetter
  if (lower === undefined) return 'text-muted'
  return (lower && d < 0) || (!lower && d > 0) ? 'text-success' : 'text-error'
}

function trendData(key: string) {
  return entries.value
    .filter(e => getTotalValue(e, key) !== null)
    .map(e => ({ date: formatDate(e.date), value: getTotalValue(e, key) as number }))
}

// Modal
const modalOpen = ref(false)
const modalKey = ref('')
const modalMeta = computed(() => modalKey.value ? DEXA_TOTAL_METRICS[modalKey.value] : null)

function openModal(key: string) {
  modalKey.value = key
  modalOpen.value = true
}

function getModalValue(entry: typeof latest.value) {
  const v = getTotalValue(entry, modalKey.value)
  if (v === null) return '—'
  return Number.isInteger(v) ? v.toString() : v.toFixed(1)
}

function pdfLabel(src: string) {
  const filename = src.split('/').pop() ?? src
  return decodeURIComponent(filename).replace(/\.pdf$/i, '')
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
