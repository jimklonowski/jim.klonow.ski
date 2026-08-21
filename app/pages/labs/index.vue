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
          <SourcePdfsPopover :sources="allSources" class="mt-2" />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton variant="outline" size="xs" icon="i-lucide-scan" @click="goToDexa">
            Body Composition
          </UButton>
          <UButton v-if="isOwner" to="/labs/sharing" variant="outline" size="xs" icon="i-lucide-users">
            Sharing
          </UButton>
          <UButton v-if="isOwner" to="/labs/upload" variant="solid" size="xs" icon="i-lucide-upload">
            Upload Results
          </UButton>
        </div>
      </div>

      <!-- AI trend summary. The regenerate button can't live inside the collapsible trigger
           (UCollapsible's default slot IS the trigger button — nesting buttons is invalid),
           so the header is a plain row with the toggle and the button as siblings. -->
      <section v-if="latest">
        <div class="rounded-lg overflow-hidden bg-default ring ring-default">
          <div class="flex items-center gap-1 p-4 sm:px-6 sm:py-4">
            <button type="button" class="flex-1 flex items-center justify-between gap-2 text-left" @click="summaryOpen = !summaryOpen">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-primary" />
                <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">AI Summary</h2>
                <p v-if="latestSummary" class="text-xs text-muted">{{ formatDate(latestSummary.date) }}</p>
              </div>
              <UIcon name="i-lucide-chevron-down" class="w-4 h-4 text-muted transition-transform" :class="{ 'rotate-180': summaryOpen }" />
            </button>
            <UTooltip v-if="isOwner" :text="latestSummary ? 'Regenerate summary for the latest draw' : 'Generate summary for the latest draw'">
              <UButton
                variant="ghost"
                color="neutral"
                size="xs"
                icon="i-lucide-refresh-cw"
                :loading="regenerating"
                :aria-label="latestSummary ? 'Regenerate AI summary' : 'Generate AI summary'"
                @click="regenerateSummary"
              />
            </UTooltip>
          </div>
          <UCollapsible v-model:open="summaryOpen">
            <template #content>
              <div v-if="regenerating" class="flex items-center gap-3 text-sm text-muted px-4 pb-4 sm:px-6 sm:pb-6">
                <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
                Comparing the {{ formatDate(latest.date) }} draw against your history...
              </div>
              <p v-else-if="latestSummary" class="text-sm leading-relaxed whitespace-pre-line px-4 pb-4 sm:px-6 sm:pb-6">{{ latestSummary.text }}</p>
              <p v-else class="text-sm text-muted px-4 pb-4 sm:px-6 sm:pb-6">No AI summary for this draw yet — hit refresh to generate one.</p>
            </template>
          </UCollapsible>
        </div>
      </section>

      <!-- PIN gate for summary regeneration — same second factor as the upload page -->
      <UModal v-model:open="pinModalOpen" title="Upload PIN required" description="Regenerating the AI summary is a write, so it needs your 9-digit upload PIN.">
        <template #body>
          <div class="space-y-3">
            <UInput
              v-model="pin"
              type="password"
              inputmode="numeric"
              maxlength="9"
              placeholder="9-digit PIN"
              autofocus
              class="w-full text-center tracking-widest"
              @keydown.enter="submitPin"
            />
            <UButton class="w-full" :loading="pinLoading" :disabled="pin.length !== 9" @click="submitPin">
              Unlock &amp; regenerate
            </UButton>
            <p v-if="pinError" class="text-sm text-error text-center">{{ pinError }}</p>
          </div>
        </template>
      </UModal>

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
          <TrendCard
            v-for="key in CHART_MARKERS"
            :key="key"
            :label="BIOMARKERS[key]?.label ?? key"
            :unit="BIOMARKERS[key]?.unit"
            :data="chartData(key)"
          />
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

      <!-- Protocol context: what was running when each draw happened -->
      <LabsProtocolContext
        v-if="entries.length && journalEntries.length"
        :labs-entries="entries"
        :journal-entries="journalEntries"
      />
    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { BIOMARKERS, CATEGORY_LABELS, PINNED_MARKERS } from '~/data/biomarkers'
import type { Category } from '~/data/biomarkers'
import { useBreakpoints, breakpointsTailwind } from '@vueuse/core'

definePageMeta({ middleware: 'labs-auth' })

const { data, refresh } = await useLabsEntries()
const { data: journalData, refresh: refreshJournal } = await useJournalEntries()
const { isOwner } = await useAuth()

// Re-fetch on every mount so back-navigation doesn't show stale/empty data
if (import.meta.client) {
  onMounted(refresh)
  onMounted(refreshJournal)
}

const entries = computed(() => data.value ?? [])
const journalEntries = computed(() => journalData.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)

// Most recent draw that has a generated summary — older draws predate the feature.
const latestSummary = computed(() => {
  const entry = [...entries.value].reverse().find(e => e.ai_summary)
  return entry ? { date: entry.date, text: entry.ai_summary as string } : null
})

const isRecentDraw = computed(() => {
  if (!latestSummary.value) return false
  const days = (Date.now() - new Date(latestSummary.value.date + 'T00:00:00').getTime()) / 86400000
  return days <= 7
})

// AI summary regeneration. The generate endpoint is PIN-gated like uploads (403 when the
// labs-upload-auth session cookie is missing), so a 403 opens the PIN modal and the retry
// happens after unlock. Always regenerates for the latest draw.
const summaryOpen = ref(isRecentDraw.value)
const regenerating = ref(false)
const pinModalOpen = ref(false)
const pin = ref('')
const pinLoading = ref(false)
const pinError = ref('')
const toast = useToast()

async function regenerateSummary() {
  if (!latest.value || regenerating.value) return
  regenerating.value = true
  summaryOpen.value = true
  try {
    await $fetch('/api/labs/generate-summary', { method: 'POST', body: { date: latest.value.date } })
    await refresh()
    toast.add({ title: 'AI summary regenerated', description: `Draw from ${formatDate(latest.value.date)}`, color: 'success' })
  }
  catch (err) {
    const e = err as { statusCode?: number, data?: { message?: string } }
    if (e.statusCode === 403) {
      pinModalOpen.value = true
    }
    else {
      toast.add({ title: 'Summary generation failed', description: e.data?.message ?? 'Try again in a moment.', color: 'error' })
    }
  }
  finally {
    regenerating.value = false
  }
}

async function submitPin() {
  if (pin.value.length !== 9) return
  pinLoading.value = true
  pinError.value = ''
  try {
    await $fetch('/api/labs/upload-auth', { method: 'POST', body: { pin: pin.value } })
    pinModalOpen.value = false
    pin.value = ''
    await regenerateSummary()
  }
  catch {
    pinError.value = 'Incorrect PIN. Try again.'
    pin.value = ''
  }
  finally {
    pinLoading.value = false
  }
}

const allSources = computed(() =>
  entries.value.flatMap(e => (e.sources ?? []).map((src: string) => src)).filter(Boolean)
)

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

function goToDexa() { navigateTo('/labs/dexa') }
</script>
