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
        </div>
        <div class="flex gap-2">
          <UButton variant="outline" size="xs" icon="i-lucide-scan" @click="goToDexa">
            Body Composition
          </UButton>
          <UButton to="/labs/upload" variant="outline" size="xs" icon="i-lucide-upload">
            Upload Results
          </UButton>
        </div>
        <div class="flex gap-2 flex-wrap items-center">
          <UButton
            v-for="src in allSources"
            :key="src"
            :to="src"
            target="_blank"
            variant="ghost"
            size="xs"
            icon="i-lucide-file-text"
            trailing
          >
            {{ pdfLabel(src) }}
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

const { data, refresh } = await useAsyncData('labs', () =>
  queryCollection('labs').order('date', 'ASC').all()
)

// Re-fetch on every mount so back-navigation doesn't show stale/empty data
if (import.meta.client) {
  onMounted(refresh)
}

const entries = computed(() => data.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)

const allSources = computed(() =>
  entries.value.flatMap(e => (e.sources ?? []).map((src: string) => src)).filter(Boolean)
)

const CHART_MARKERS = ['testosterone_total', 'igf1', 'apob', 'hs_crp', 'vitamin_d', 'ferritin']

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('sm')

const tabItems = computed(() => [
  { label: isMobile.value ? undefined : 'Hormones', icon: 'i-lucide-activity', slot: 'hormones' as const },
  { label: isMobile.value ? undefined : 'Metabolic', icon: 'i-lucide-flask-conical', slot: 'metabolic' as const },
  { label: isMobile.value ? undefined : 'Lipids', icon: 'i-lucide-heart', slot: 'lipids' as const },
  { label: isMobile.value ? undefined : 'CBC', icon: 'i-lucide-test-tube', slot: 'cbc' as const },
  { label: isMobile.value ? undefined : CATEGORY_LABELS.inflammation, icon: 'i-lucide-leaf', slot: 'inflammation' as const }
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
  return src.split('/').pop()?.replace(/\.pdf$/i, '') ?? src
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
