<template>
  <div>
    <!-- Title row -->
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-3 px-4 sm:px-6 pt-4">
      <h1 class="num-display text-hi text-[26px] leading-none">
        BLOODWORK
      </h1>
      <p
        v-if="latest"
        class="text-[11px] text-muted tracking-[0.06em] uppercase"
      >
        last draw <span class="text-hi font-medium">{{ formatDateTerse(latest.date) }}</span>
        <template v-if="latest.fasting">
          · fasting
        </template>
        <template v-if="pdfCount">
          · {{ pdfCount }} source pdfs
        </template>
      </p>

      <div class="flex flex-wrap items-center gap-2 ml-auto">
        <SourcePdfsPopover
          v-if="allSources.length"
          :sources="allSources"
        />
        <NuxtLink
          to="/labs/dexa"
          class="tui-btn"
        >
          BODY COMP →
        </NuxtLink>
        <NuxtLink
          v-if="isOwner"
          to="/labs/upload"
          class="tui-btn tui-btn-accent"
        >
          ↑ UPLOAD RESULTS
        </NuxtLink>
      </div>
    </div>

    <TuiDataState
      :error="error"
      :empty="!latest"
      empty-title="No bloodwork yet"
      empty-description="Upload a lab PDF and the markers land here."
      @retry="refresh"
    />

    <!-- AI summary readout -->
    <div
      v-if="latest"
      class="mx-4 sm:mx-6 mt-4 px-3.5 py-3 border border-line-input bg-inset"
    >
      <div class="flex items-baseline gap-3">
        <span class="text-[10.5px] tracking-[0.14em] uppercase text-accent">✦ AI SUMMARY</span>
        <span
          v-if="latestSummary"
          class="text-[10.5px] text-muted tracking-[0.06em] uppercase"
        >{{ formatDate(latestSummary.date, 'monthDay').toUpperCase() }}</span>
        <span class="ml-auto flex items-center gap-2.5 text-[11px]">
          <button
            type="button"
            class="text-accent hover:text-accent-hover cursor-pointer"
            @click="summaryOpen = !summaryOpen"
          >{{ summaryOpen ? 'collapse ▴' : 'expand ▾' }}</button>
          <template v-if="isOwner">
            <span class="text-faint">·</span>
            <button
              type="button"
              class="text-accent hover:text-accent-hover cursor-pointer disabled:opacity-50"
              :disabled="regenerating"
              @click="regenerateSummary"
            >{{ regenerating ? 'working ⟳' : 'regen ⟳' }}</button>
          </template>
        </span>
      </div>

      <p
        v-if="regenerating"
        class="mt-2 text-[12.5px] text-muted"
      >
        Comparing the {{ formatDate(latest.date) }} draw against your history…
      </p>
      <p
        v-else-if="latestSummary"
        class="mt-2 text-[12.5px] leading-[1.7] text-dim whitespace-pre-line"
        :class="summaryOpen ? '' : 'line-clamp-1'"
      >
        {{ latestSummary.text }}
      </p>
      <p
        v-else
        class="mt-2 text-[12.5px] text-muted"
      >
        No AI summary for this draw yet{{ isOwner ? ' — hit regen to generate one.' : '.' }}
      </p>
    </div>

    <div class="px-4 sm:px-6 py-4 space-y-2.5">
      <!-- Category tabs: equal-width segmented row with per-category counts -->
      <div class="grid grid-cols-3 md:grid-cols-6 gap-px bg-line border border-line">
        <button
          v-for="cat in categories"
          :key="cat.key"
          type="button"
          class="px-3 py-2.5 text-[11px] tracking-widest uppercase cursor-pointer transition-colors"
          :class="activeCategory === cat.key
            ? 'bg-nav-active text-accent'
            : 'bg-bg text-[#6b8578] hover:text-accent'"
          @click="activeCategory = cat.key"
        >
          {{ cat.short }} <span class="text-faint">{{ cat.count }}</span>
        </button>
      </div>

      <!-- Marker cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
        <LabsMarkerCard
          v-for="key in activeMarkers"
          :key="key"
          :biomarker-key="key"
          :entries="entries"
          :auto-open="key === linkedMarker"
        />
      </div>
      <p
        v-if="!activeMarkers.length"
        class="py-4 text-[12px] text-muted"
      >
        No markers recorded in this category yet.
      </p>
    </div>

    <!-- Bottom split: echo | genetic, each taking half the row -->
    <div
      class="grid gap-px bg-line border-t border-line"
      :class="geneticResults.length ? 'lg:grid-cols-2' : ''"
    >
      <section class="bg-bg px-4 sm:px-6 py-4">
        <TuiHeader
          :label="echoDate ? `ECHO · ${formatDateTerse(echoDate)}` : 'ECHO'"
          :dashes="6"
        >
          <button
            v-if="echoResults.length"
            type="button"
            class="text-[10.5px] text-accent hover:text-accent-hover cursor-pointer normal-case"
            @click="echoOpen = true"
          >
            view all {{ echoResults.length }} →
          </button>
        </TuiHeader>

        <div
          v-if="echoResults.length"
          class="mt-2.5 text-[12px] leading-[1.7]"
        >
          <div class="flex flex-wrap gap-x-5 gap-y-1">
            <span
              v-for="item in echoHighlights"
              :key="item.name"
              class="text-muted"
            >
              {{ item.name }} <span :class="colorClass(item.result)">{{ item.result }}</span>
            </span>
          </div>
          <p class="mt-2 text-muted">
            {{ normalCount }} findings normal
          </p>
        </div>
        <p
          v-else
          class="mt-2.5 text-[12px] text-muted"
        >
          No echocardiogram on file.
        </p>
      </section>

      <section
        v-if="geneticResults.length"
        class="bg-bg px-4 sm:px-6 py-4"
      >
        <TuiHeader
          label="GENETIC · QUALITATIVE"
          :dashes="4"
        >
          <span class="text-[10.5px] text-muted normal-case">one-time results · not trended</span>
        </TuiHeader>
        <div class="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-[12px]">
          <span
            v-for="item in geneticResults"
            :key="`${item.date}-${item.name}`"
            class="text-muted"
          >
            {{ item.name }} <span :class="colorClass(item.result)">{{ item.result }}</span>
          </span>
        </div>
      </section>
    </div>

    <!-- Trend charts for the key markers -->
    <section
      v-if="entries.length >= 2"
      class="px-4 sm:px-6 py-4 border-t border-line"
    >
      <TuiHeader label="TRENDS" />
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-2.5">
        <TrendCard
          v-for="key in CHART_MARKERS"
          :key="key"
          :label="BIOMARKERS[key]?.label ?? key"
          :unit="BIOMARKERS[key]?.unit"
          :data="chartData(key)"
        />
      </div>
    </section>

    <!-- Full echo findings -->
    <UModal
      v-model:open="echoOpen"
      title="Echocardiogram"
      description="Findings from your most recent echo report"
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
    >
      <template #body>
        <div class="text-[12px]">
          <div
            v-for="(item, i) in echoResults"
            :key="`${item.date}-${item.name}`"
            class="flex items-baseline justify-between gap-4 px-2 py-2"
            :class="i % 2 ? 'bg-inset' : ''"
          >
            <span class="text-muted shrink-0">{{ item.name }}</span>
            <span
              class="text-right"
              :class="colorClass(item.result)"
            >{{ item.result }}</span>
          </div>
        </div>
      </template>
    </UModal>

    <!-- PIN gate for summary regeneration — same second factor as the upload page -->
    <UModal
      v-model:open="pinModalOpen"
      title="Upload PIN required"
      description="Regenerating the AI summary is a write, so it needs your 9-digit upload PIN."
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
    >
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
          <UButton
            class="w-full justify-center"
            :loading="pinLoading"
            :disabled="pin.length !== 9"
            @click="submitPin"
          >
            Unlock &amp; regenerate
          </UButton>
          <p
            v-if="pinError"
            class="text-[12px] text-danger text-center"
          >
            {{ pinError }}
          </p>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { BIOMARKERS } from '~/data/biomarkers'
import type { Category } from '~/data/biomarkers'

definePageMeta({ middleware: 'labs-auth' })
useSeoMeta({ title: 'Labs' })

const { data, refresh, error } = await useLabsEntries()
const { isOwner } = await useAuth()

// Re-fetch on every mount so back-navigation doesn't show stale/empty data
if (import.meta.client) {
  onMounted(refresh)
}

const entries = computed(() => data.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)

// --- category tabs ---
const CATEGORY_SHORT: Record<Category, string> = {
  hormones: 'Hormones',
  metabolic: 'Metabolic',
  lipids: 'Lipids',
  cbc: 'CBC',
  inflammation: 'Inflam',
  cardiac: 'Cardiac'
}

function byCategory(cat: Category) {
  return Object.entries(BIOMARKERS)
    .filter(([, m]) => m.category === cat)
    // Only markers this draw history actually has readings for — an empty card is noise.
    .filter(([key]) => entries.value.some(e => e.markers[key] != null))
    .map(([key]) => key)
}

const categories = computed(() =>
  (Object.keys(CATEGORY_SHORT) as Category[]).map(key => ({
    key,
    short: CATEGORY_SHORT[key],
    count: byCategory(key).length
  }))
)

// Deep link from the homepage's flagged rows and the command palette: /labs?marker=alt
// lands on the marker's category tab with its detail modal open. Reactive rather than
// read-once because the palette can retarget the query while already on this page —
// a query-only change doesn't remount the page.
const route = useRoute()
const linkedMarker = computed(() => {
  const key = route.query.marker
  return typeof key === 'string' && BIOMARKERS[key] ? key : null
})

const activeCategory = ref<Category>(linkedMarker.value ? BIOMARKERS[linkedMarker.value]!.category : 'hormones')

// Once the deep link has landed (tab selected, modal opened), scrub ?marker= from the
// URL so a refresh or copied link doesn't re-open the modal. On first mount the cards
// have already opened by parent onMounted; on a palette retarget the card's autoOpen
// watcher fires during the update flushed by nextTick, so clearing after it is safe.
const router = useRouter()
function clearMarkerQuery() {
  if (!route.query.marker) return
  const { marker: _, ...query } = route.query
  router.replace({ query })
}
onMounted(clearMarkerQuery)

watch(linkedMarker, async (key) => {
  if (!key) return
  activeCategory.value = BIOMARKERS[key]!.category
  await nextTick()
  clearMarkerQuery()
})
const activeMarkers = computed(() => byCategory(activeCategory.value))

// --- AI summary ---
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

// The regenerate endpoint is PIN-gated like uploads (403 when the labs-upload-auth session
// cookie is missing), so a 403 opens the PIN modal and the retry happens after unlock.
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

// --- sources ---
const allSources = computed(() =>
  entries.value.flatMap(e => e.sources ?? []).filter(Boolean)
)
const pdfCount = computed(() => new Set(allSources.value).size)

// --- qualitative results ---
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
    .flatMap(e => (e.qualitative ?? []).map(q => ({ ...q, date: e.date })))
)
const geneticResults = computed(() => allQualitativeResults.value.filter(item => !isEcho(item)))
const echoResults = computed(() => allQualitativeResults.value.filter(isEcho))
const echoDate = computed(() => echoResults.value[0]?.date ?? null)
const echoOpen = ref(false)

/** The findings worth surfacing inline: anything that isn't plainly reassuring. */
const echoHighlights = computed(() =>
  echoResults.value.filter(r => qualitativeColor(r.result) !== 'success').slice(0, 4)
)
const normalCount = computed(() =>
  echoResults.value.filter(r => qualitativeColor(r.result) === 'success').length
)

function colorClass(result: string) {
  return {
    warning: 'text-warn',
    success: 'text-accent',
    neutral: 'text-body'
  }[qualitativeColor(result)]
}

const CHART_MARKERS = ['testosterone_total', 'igf1', 'apob', 'hs_crp', 'vitamin_d', 'ferritin', 'la_volume_index']

function chartData(markerKey: string) {
  return entries.value
    .filter(e => e.markers[markerKey] != null)
    .map(e => ({ date: formatDate(e.date, 'monthDay'), value: e.markers[markerKey] as number }))
}
</script>
