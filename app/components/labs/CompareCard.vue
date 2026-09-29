<template>
  <!-- Two markers on one chart, each on its own axis: hematocrit against total T, HDL against
       ALT — the pairs that move together (or should) around a protocol change. Kept in the URL
       as ?cmp=a,b so a comparison can be bookmarked or sent. -->
  <div class="bg-raised border border-line-soft">
    <div class="flex flex-col sm:flex-row sm:items-end gap-2.5 px-3.5 py-2.5 border-b border-line-soft">
      <UFormField
        label="Marker A"
        class="flex-1 min-w-0"
      >
        <USelectMenu
          v-model="markerA"
          :items="options"
          value-key="value"
          :search-input="{ placeholder: 'Find a marker…' }"
          class="w-full"
        >
          <template #leading>
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ background: COLOR_A }"
            />
          </template>
        </USelectMenu>
      </UFormField>
      <button
        type="button"
        class="tui-btn self-start sm:self-auto"
        aria-label="Swap the two markers"
        @click="swap"
      >
        ⇄
      </button>
      <UFormField
        label="Marker B"
        class="flex-1 min-w-0"
      >
        <USelectMenu
          v-model="markerB"
          :items="options"
          value-key="value"
          :search-input="{ placeholder: 'Find a marker…' }"
          class="w-full"
        >
          <template #leading>
            <span
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ background: COLOR_B }"
            />
          </template>
        </USelectMenu>
      </UFormField>
    </div>

    <div class="px-2 py-2.5">
      <p class="px-1.5 pb-1.5 text-[10.5px] text-muted">
        {{ metaLine }}
      </p>
      <ClientOnly>
        <AreaChart
          v-if="rows.length >= 2"
          :data="rows"
          :categories="categories"
          :height="200"
          :mark-lines="markLines"
          show-legend
          dual-axis
          connect-nulls
          :aria-label="ariaLabel"
        />
        <p
          v-else
          class="h-50 flex items-center justify-center text-[12px] text-muted"
        >
          Pick two markers with at least two draws between them.
        </p>
        <template #fallback>
          <div class="h-50" />
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LabsEntry } from '#shared/types/labs'
import { BIOMARKERS, CATEGORY_LABELS } from '~/data/biomarkers'
import type { Category } from '~/data/biomarkers'
import { CHART_ACCENT, CHART_INDIGO } from '~/utils/chartTheme'

const props = defineProps<{
  /** Every draw, any order. */
  entries: LabsEntry[]
  /** The draw being viewed while time-travelling, dashed on the chart. */
  viewedDate?: string | null
}>()

const COLOR_A = CHART_ACCENT
const COLOR_B = CHART_INDIGO
// The first pair worth seeing on this protocol: red-cell mass against the androgen driving it.
const DEFAULT_PAIR = ['hematocrit', 'testosterone_total'] as const

const route = useRoute()
const router = useRouter()

const sorted = computed(() => [...props.entries].sort((a, b) => a.date.localeCompare(b.date)))

/** Markers measured on at least two draws, grouped in the labs page's category order. */
const measured = computed(() => {
  const counts = new Map<string, number>()
  for (const e of sorted.value) {
    for (const [k, v] of Object.entries(e.markers)) if (v != null && BIOMARKERS[k]) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const order = Object.keys(CATEGORY_LABELS) as Category[]
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([key, n]) => ({ key, n, meta: BIOMARKERS[key]! }))
    .sort((a, b) => order.indexOf(a.meta.category) - order.indexOf(b.meta.category) || a.meta.label.localeCompare(b.meta.label))
})

const options = computed(() => measured.value.map(m => ({
  label: m.meta.label,
  value: m.key,
  description: `${m.meta.unit} · ${m.n} draws`
})))

function valid(key: unknown): key is string {
  return typeof key === 'string' && measured.value.some(m => m.key === key)
}

// ?cmp=a,b wins; otherwise the default pair, falling back to the first two measured markers.
const pair = computed<[string | null, string | null]>(() => {
  const [qa, qb] = String(route.query.cmp ?? '').split(',')
  const keys = measured.value.map(m => m.key)
  const a = valid(qa) ? qa : valid(DEFAULT_PAIR[0]) ? DEFAULT_PAIR[0] : keys[0] ?? null
  const b = valid(qb) && qb !== a ? qb : valid(DEFAULT_PAIR[1]) && DEFAULT_PAIR[1] !== a ? DEFAULT_PAIR[1] : keys.find(k => k !== a) ?? null
  return [a, b]
})

function setPair(a: string | null, b: string | null) {
  router.replace({ query: { ...route.query, cmp: a && b ? `${a},${b}` : undefined } })
}

const markerA = computed({
  get: () => pair.value[0] ?? undefined,
  // Picking the other side's marker swaps them rather than charting one marker twice.
  set: (v: string | undefined) => setPair(v ?? null, v === pair.value[1] ? pair.value[0] : pair.value[1])
})
const markerB = computed({
  get: () => pair.value[1] ?? undefined,
  set: (v: string | undefined) => setPair(v === pair.value[0] ? pair.value[1] : pair.value[0], v ?? null)
})

function swap() {
  setPair(pair.value[1], pair.value[0])
}

// Draws span years, so a bare "Jun 27" would name two different draws on one axis.
const spansYears = computed(() => new Set(sorted.value.map(e => e.date.slice(0, 4))).size > 1)
function axisLabel(date: string) {
  const md = formatDate(date, 'monthDay')
  return spansYears.value ? `${md} ’${date.slice(2, 4)}` : md
}

const rows = computed(() => {
  const [a, b] = pair.value
  if (!a || !b) return []
  return sorted.value
    .filter(e => e.markers[a] != null || e.markers[b] != null)
    .map(e => ({ date: axisLabel(e.date), a: e.markers[a] ?? null, b: e.markers[b] ?? null }))
})

const categories = computed(() => {
  const [a, b] = pair.value
  const name = (k: string | null) => (k ? `${BIOMARKERS[k]?.label ?? k} (${BIOMARKERS[k]?.unit ?? ''})` : '')
  return { a: { name: name(a), color: COLOR_A }, b: { name: name(b), color: COLOR_B } }
})

const markLines = computed(() =>
  props.viewedDate && rows.value.some(r => r.date === axisLabel(props.viewedDate!)) ? [axisLabel(props.viewedDate)] : []
)

const metaLine = computed(() => {
  const both = rows.value.filter(r => r.a != null && r.b != null).length
  return `${rows.value.length} draws · both measured on ${both} · left axis A, right axis B`
})

const ariaLabel = computed(() =>
  `Comparison chart: ${categories.value.a.name} against ${categories.value.b.name} across ${rows.value.length} draws`
)
</script>
