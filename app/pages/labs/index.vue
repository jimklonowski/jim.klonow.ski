<template>
  <UContainer>
    <div class="py-8 space-y-10">
      <!-- Header -->
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold">Bloodwork Tracker</h1>
          <p v-if="latest" class="text-muted mt-1">
            Latest draw: {{ formatDate(latest.date) }}
            <UBadge v-if="latest.fasting" variant="subtle" color="neutral" size="xs" class="ml-2">Fasting</UBadge>
          </p>
          <UPopover v-if="allSources.length" :content="{ side: 'bottom', align: 'start' }" class="mt-2">
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
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton variant="outline" size="xs" icon="i-lucide-scan" @click="goToDexa">
            Body Composition
          </UButton>
          <UButton to="/labs/upload" variant="solid" size="xs" icon="i-lucide-upload">
            Upload Results
          </UButton>
        </div>
      </div>

      <!-- Pinned / key markers -->
      <section>
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Key Markers</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <LabsMarkerCard
            v-for="key in PINNED_MARKERS"
            :key="key"
            :biomarker-key="key"
            :entries="entries"
          />
        </div>
      </section>

      <!-- Genetic & qualitative results -->
      <section v-if="geneticResults.length">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-1">Genetic &amp; Qualitative Results</h2>
        <p class="text-xs text-muted mb-4">One-time results — not tracked as trends.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <UCard v-for="item in geneticResults" :key="`${item.date}-${item.name}`">
            <div class="space-y-2">
              <div>
                <p class="text-sm font-medium">{{ item.name }}</p>
                <p class="text-xs text-muted mt-0.5">{{ formatDate(item.date) }}</p>
              </div>
              <UBadge :color="qualitativeColor(item.result)" variant="subtle" class="w-fit">{{ item.result }}</UBadge>
            </div>
          </UCard>
        </div>
      </section>

      <!-- Echocardiogram findings -->
      <section v-if="echoResults.length">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-1">Echocardiogram</h2>
        <p class="text-xs text-muted mb-4">Findings from your most recent echo report.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <UCard v-for="item in echoResults" :key="`${item.date}-${item.name}`">
            <div class="space-y-2">
              <div>
                <p class="text-sm font-medium">{{ item.name }}</p>
                <p class="text-xs text-muted mt-0.5">{{ formatDate(item.date) }}</p>
              </div>
              <UBadge :color="qualitativeColor(item.result)" variant="subtle" class="w-fit">{{ item.result }}</UBadge>
            </div>
          </UCard>
        </div>
      </section>

      <!-- Trend charts for key markers -->
      <section v-if="entries.length >= 2">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Trends</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <UCard v-for="key in CHART_MARKERS" :key="key">
            <template #header>
              <p class="text-sm font-medium">{{ BIOMARKERS[key]?.label }}</p>
              <p class="text-xs text-muted">{{ BIOMARKERS[key]?.unit }}</p>
            </template>
            <ClientOnly>
              <AreaChart
                :data="chartData(key)"
                :categories="{ value: { name: BIOMARKERS[key]?.label ?? key, color: '#22c55e' } }"
                :height="128"
                :show-legend="false"
              />
            </ClientOnly>
          </UCard>
        </div>
      </section>

      <!-- Full panel by category -->
      <section>
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Full Panel</h2>
        <UTabs :items="tabItems" class="w-full">
          <template #hormones>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-4">
              <LabsMarkerCard v-for="key in byCategory('hormones')" :key="key" :biomarker-key="key" :entries="entries" />
            </div>
          </template>
          <template #metabolic>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-4">
              <LabsMarkerCard v-for="key in byCategory('metabolic')" :key="key" :biomarker-key="key" :entries="entries" />
            </div>
          </template>
          <template #lipids>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-4">
              <LabsMarkerCard v-for="key in byCategory('lipids')" :key="key" :biomarker-key="key" :entries="entries" />
            </div>
          </template>
          <template #cbc>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-4">
              <LabsMarkerCard v-for="key in byCategory('cbc')" :key="key" :biomarker-key="key" :entries="entries" />
            </div>
          </template>
          <template #inflammation>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-4">
              <LabsMarkerCard v-for="key in byCategory('inflammation')" :key="key" :biomarker-key="key" :entries="entries" />
            </div>
          </template>
          <template #cardiac>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-4">
              <LabsMarkerCard v-for="key in byCategory('cardiac')" :key="key" :biomarker-key="key" :entries="entries" />
            </div>
          </template>
        </UTabs>
      </section>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { BIOMARKERS, CATEGORY_LABELS, PINNED_MARKERS } from '~/data/biomarkers'
import type { Category } from '~/data/biomarkers'
import { useBreakpoints, breakpointsTailwind } from '@vueuse/core'

definePageMeta({ middleware: 'labs-auth' })

const { data, refresh } = await useLabsEntries()

// Re-fetch on every mount so back-navigation doesn't show stale/empty data
if (import.meta.client) {
  onMounted(refresh)
}

const entries = computed(() => data.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)

const allSources = computed(() =>
  entries.value.flatMap(e => (e.sources ?? []).map((src: string) => src)).filter(Boolean)
)
const sortedSources = computed(() => [...allSources.value].reverse())

// Echo reports were saved before results carried a `category` tag, so entries written
// prior to that still need to be recognized by their known anatomical section names.
const ECHO_SECTION_NAMES = new Set([
  'Left Ventricle', 'Right Ventricle', 'Left Atrium', 'Right Atrium', 'Ventricular Septum',
  'Mitral Valve', 'Aortic Valve', 'Tricuspid Valve', 'Pulmonic Valve', 'Aorta',
  'Pericardium', 'Inferior Vena Cava', 'Overall Impression'
])

function isEcho(item: { name: string, category?: string }) {
  return item.category === 'echo' || (!item.category && ECHO_SECTION_NAMES.has(item.name))
}

const allQualitativeResults = computed(() =>
  [...entries.value]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap(e => (e.qualitative ?? []).map((q: { name: string, result: string, category?: string }) => ({ ...q, date: e.date })))
)
const geneticResults = computed(() => allQualitativeResults.value.filter(item => !isEcho(item)))
const echoResults = computed(() => allQualitativeResults.value.filter(isEcho))

// Free-text narrative findings can't be reliably graded word-for-word, so this only flags
// results that name an actual severity/finding — everything else (including full descriptive
// sentences that merely mention "normal"/"no stenosis"/etc.) reads as reassuring, not alarming.
function qualitativeColor(result: string) {
  const text = result.toLowerCase()
  const concerning = /\b(mild|moderate|severe|abnormal|elevated|thicken|dilat|enlarg|reduced|decreased|positive|heterozygous|homozygous)\b/.test(text)
    || /(?<!not )\bdetected\b/.test(text)
  if (concerning) {
    return 'warning'
  }
  if (/\b(normal|no evidence|no significant|no stenosis|no regurgitation|not detected|negative|absent|unremarkable)\b/.test(text)) {
    return 'success'
  }
  return 'neutral'
}

const CHART_MARKERS = ['testosterone_total', 'igf1', 'apob', 'hs_crp', 'vitamin_d', 'ferritin', 'la_volume_index']

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')

const tabItems = computed(() => [
  { label: isMobile.value ? undefined : 'Hormones', icon: 'i-lucide-activity', slot: 'hormones' as const },
  { label: isMobile.value ? undefined : 'Metabolic', icon: 'i-lucide-flask-conical', slot: 'metabolic' as const },
  { label: isMobile.value ? undefined : 'Lipids', icon: 'i-lucide-heart', slot: 'lipids' as const },
  { label: isMobile.value ? undefined : 'CBC', icon: 'i-lucide-test-tube', slot: 'cbc' as const },
  { label: isMobile.value ? undefined : CATEGORY_LABELS.inflammation, icon: 'i-lucide-leaf', slot: 'inflammation' as const },
  { label: isMobile.value ? undefined : CATEGORY_LABELS.cardiac, icon: 'i-lucide-heart-pulse', slot: 'cardiac' as const }
])

function byCategory(cat: Category) {
  return Object.entries(BIOMARKERS)
    .filter(([, m]) => m.category === cat)
    .map(([key]) => key)
}

function chartData(markerKey: string) {
  return entries.value
    .filter((e: { date: string, markers: Record<string, number | null> }) => e.markers[markerKey] != null)
    .map((e: { date: string, markers: Record<string, number | null> }) => ({
      date: formatDate(e.date),
      value: e.markers[markerKey] as number
    }))
}

function goToDexa() { window.location.href = '/labs/dexa' }

function pdfLabel(src: string) {
  const filename = src.split('/').pop() ?? src
  return decodeURIComponent(filename).replace(/\.pdf$/i, '')
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
