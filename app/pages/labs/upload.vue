<template>
  <div>
    <!-- Breadcrumb title row -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-3.5 border-b border-line">
      <span class="text-[11px] text-muted tracking-[0.06em] uppercase">
        <NuxtLink
          to="/labs"
          class="hover:text-accent"
        >labs</NuxtLink> /
      </span>
      <h1 class="num-display text-hi text-[24px] leading-none">
        UPLOAD
      </h1>
      <p class="text-[11px] text-muted tracking-[0.06em] uppercase truncate">
        {{ statusMeta }}
      </p>

      <div class="flex items-center gap-2 ml-auto">
        <button
          v-if="result || error"
          type="button"
          class="tui-btn"
          @click="reset"
        >
          ⟳ RESET
        </button>
        <NuxtLink
          to="/labs"
          class="tui-btn"
        >
          BLOODWORK →
        </NuxtLink>
      </div>
    </div>

    <!-- PIN gate -->
    <section
      v-if="!uploadAuthed"
      class="px-4 sm:px-6 py-4"
    >
      <div class="max-w-md bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="UPLOAD PIN REQUIRED"
          :dashes="4"
        />
        <p class="mt-2.5 text-[12px] text-muted leading-[1.7]">
          Saving results is a write, so it needs your 9-digit upload PIN.
        </p>
        <LabsPinForm @unlocked="uploadAuthed = true" />
      </div>
    </section>

    <!-- Drop zone -->
    <section
      v-else-if="!processing && !result && !error"
      class="px-4 sm:px-6 py-4"
    >
      <TuiHeader
        label="REPORT TYPE"
        :dashes="9"
      />
      <TuiTabs
        v-model="reportType"
        :items="REPORT_TYPES"
        class="mt-2"
      />

      <TuiHeader
        label="SOURCE PDF"
        :dashes="10"
        class="mt-4"
      />
      <UFileUpload
        v-model="pdf"
        accept=".pdf,application/pdf"
        :preview="false"
        reset
        class="mt-2 w-full"
        :ui="{
          base: 'group border border-dashed border-line-input bg-inset hover:border-line-accent transition-colors data-[dragging=true]:border-accent data-[dragging=true]:bg-nav-active',
          wrapper: 'gap-1.5'
        }"
      >
        <template #leading>
          <span class="num-display text-[28px] leading-none text-faint group-data-[dragging=true]:text-accent">↑</span>
        </template>
        <template #label>
          <span class="text-[12.5px] text-hi tracking-[0.06em] uppercase">drop your {{ dropZoneLabel }} pdf here</span>
        </template>
        <template #description>
          <span class="text-[11px] text-muted">or click to browse · Claude reads the PDF, values land in D1</span>
        </template>
      </UFileUpload>
    </section>

    <!-- Processing -->
    <section
      v-else-if="processing"
      class="px-4 sm:px-6 py-4"
    >
      <div class="bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="EXTRACTING"
          :dashes="8"
        >
          <span class="text-[10.5px] text-accent">⟳ working</span>
        </TuiHeader>
        <p class="flex items-center gap-2 mt-2.5 text-[12.5px] text-dim">
          <span class="text-accent">❯</span>
          <span class="truncate">reading {{ filename }}</span>
          <span class="w-1.75 h-3.5 bg-accent shrink-0 animate-[tui-blink_1.1s_step-end_infinite]" />
        </p>
        <p class="mt-1.5 text-[11px] text-muted">
          Pulling biomarker values out of the report — this takes a few seconds.
        </p>
      </div>
    </section>

    <!-- Error -->
    <section
      v-else-if="error"
      class="px-4 sm:px-6 py-4"
    >
      <div class="max-w-xl bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="EXTRACTION FAILED"
          :dashes="4"
        >
          <span class="text-[10.5px] text-danger">✕ error</span>
        </TuiHeader>
        <p class="mt-2.5 text-[12.5px] text-danger leading-[1.7]">
          {{ error }}
        </p>
        <button
          type="button"
          class="tui-btn mt-3"
          @click="reset"
        >
          ⟳ TRY AGAIN
        </button>
      </div>
    </section>

    <!-- Results -->
    <template v-if="result">
      <!-- Headline readouts -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border-b border-line">
        <div
          v-for="cell in resultCells"
          :key="cell.label"
          class="bg-bg px-4 py-3.5"
        >
          <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
            {{ cell.label }}
          </p>
          <button
            v-if="cell.onClick"
            type="button"
            class="num-display text-[24px] leading-none mt-1.5 whitespace-nowrap cursor-pointer hover:text-accent transition-colors"
            :title="cell.hint"
            @click="cell.onClick"
          >
            {{ cell.value }} <span class="text-[13px] text-muted align-middle">{{ cell.glyph ?? '⇄' }}</span>
          </button>
          <p
            v-else
            class="num-display text-[24px] leading-none mt-1.5 whitespace-nowrap"
            :class="cell.accent ? 'text-accent' : ''"
          >
            {{ cell.value }}
          </p>
          <p
            v-if="cell.hint"
            class="mt-1.5 text-[10.5px] text-muted"
          >
            {{ cell.hint }}
          </p>
        </div>
      </div>

      <!-- Extracted markers -->
      <section class="px-4 sm:px-6 py-4">
        <TuiHeader
          :label="`${figureNoun.toUpperCase()} · ${previewEntries.length}`"
          :dashes="8"
        >
          <span class="text-[10.5px] text-muted normal-case truncate">{{ filename }}</span>
        </TuiHeader>

        <div
          v-if="previewEntries.length"
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-px bg-line border border-line mt-2.5"
        >
          <div
            v-for="entry in previewEntries"
            :key="entry.key"
            class="bg-raised px-3 py-2.5"
          >
            <p
              class="text-[10.5px] text-muted uppercase tracking-[0.08em] leading-tight truncate"
              :title="entry.label"
            >
              {{ entry.label }}
            </p>
            <p class="num-display text-[22px] leading-none mt-1.5">
              {{ entry.value }}
            </p>
            <p
              class="mt-1.5 text-[10.5px]"
              :class="entry.known ? 'text-muted' : 'text-warn'"
            >
              {{ entry.unit }}
            </p>
          </div>
        </div>

        <p
          v-else
          class="mt-2.5 text-[12px] text-muted"
        >
          No numeric {{ figureNoun }} in this report.
        </p>
      </section>

      <!-- Qualitative findings -->
      <section
        v-if="result.qualitative?.length"
        class="px-4 sm:px-6 py-4 border-t border-line"
      >
        <TuiHeader
          label="GENETIC · QUALITATIVE"
          :dashes="4"
        />
        <div class="mt-2.5 text-[12px]">
          <div
            v-for="(item, i) in result.qualitative"
            :key="item.name"
            class="flex items-baseline justify-between gap-4 px-2 py-1.5"
            :class="i % 2 ? 'bg-inset' : ''"
          >
            <span class="text-muted shrink-0">{{ item.name }}</span>
            <span
              class="text-right"
              :class="colorClass(item.result)"
            >{{ item.result }}</span>
          </div>
        </div>
      </section>

      <!-- Actions -->
      <div class="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3.5 border-t border-line">
        <button
          type="button"
          class="tui-btn tui-btn-accent disabled:opacity-50"
          :disabled="saving"
          @click="saveToSite"
        >
          {{ saving ? 'SAVING…' : '↑ SAVE TO SITE' }}
        </button>
        <button
          type="button"
          class="tui-btn"
          @click="downloadJson"
        >
          ↓ DOWNLOAD JSON
        </button>
        <button
          type="button"
          class="tui-btn"
          @click="reset"
        >
          ⟳ UPLOAD ANOTHER
        </button>
      </div>

      <div
        v-if="saveResult"
        class="px-4 sm:px-6 pb-3.5"
      >
        <UAlert
          :color="saveResult.ok ? 'success' : 'error'"
          variant="subtle"
          :title="saveResult.ok ? 'Saved' : 'Could not save'"
          :description="saveMessage"
          :ui="{
            root: 'ring-0 border border-line-input bg-inset p-3',
            title: 'text-[12px]',
            description: 'text-[11.5px] text-muted'
          }"
        />
      </div>

      <!-- AI summary readout -->
      <div
        v-if="summarizing || summary || summaryError"
        class="mx-4 sm:mx-6 mb-4 px-3.5 py-3 border border-line-input bg-inset"
      >
        <div class="flex items-baseline gap-3">
          <span class="text-[10.5px] tracking-[0.14em] uppercase text-accent">✦ AI SUMMARY</span>
          <span
            v-if="summarizing"
            class="text-[10.5px] text-muted tracking-[0.06em] uppercase"
          >working ⟳</span>
        </div>
        <p
          v-if="summarizing"
          class="mt-2 text-[12.5px] text-muted"
        >
          Comparing this {{ reportType === 'dexa' ? 'scan' : 'draw' }} against your history…
        </p>
        <p
          v-else-if="summary"
          class="mt-2 text-[12.5px] leading-[1.7] text-dim whitespace-pre-line"
        >
          {{ summary }}
        </p>
        <p
          v-else
          class="mt-2 text-[12.5px] text-muted"
        >
          {{ summaryError }}
        </p>
      </div>

      <LabsDexaWeightModal
        v-if="reportType === 'dexa'"
        v-model:open="weightModalOpen"
        :current="result.weight_lbs ?? null"
        :reported="reportWeight"
        :total-mass="result.total?.total_mass_lbs ?? null"
        @apply="applyWeight"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import type { QualitativeResult } from '#shared/types/labs'
import { BIOMARKERS } from '~/data/biomarkers'
import { dexaFieldMeta } from '~/data/dexa'

useSeoMeta({ title: () => 'Labs · Upload' })

// What /api/labs/process-pdf returns. Bloodwork and echo are a flat marker map; a DEXA comes back
// already in the nested shape dexa_entries stores (total, regions, vat, …) and has no markers.
interface LabResult {
  date: string
  fasting?: boolean
  markers?: Record<string, number>
  qualitative?: QualitativeResult[]
  weight_lbs?: number
  total?: Record<string, number>
  regions?: Record<string, Record<string, number>>
  vat?: Record<string, number>
  ag_ratio?: number
  bone_density?: Record<string, number>
  symmetry?: Record<string, number>
}

// PIN gate — validated server-side (httpOnly cookie, not readable by JS)
const uploadAuthed = ref(false)

onMounted(async () => {
  try {
    await $fetch('/api/labs/validate-upload')
    uploadAuthed.value = true
  }
  catch {
    uploadAuthed.value = false
  }
})

// Report type
const REPORT_TYPES = [
  { value: 'bloodwork', label: 'Bloodwork' },
  { value: 'dexa', label: 'DEXA' },
  { value: 'echo', label: 'Echo' }
] as const
type ReportType = 'bloodwork' | 'dexa' | 'echo'
const reportType = ref<ReportType>('bloodwork')

const REPORT_LABELS: Record<ReportType, string> = {
  bloodwork: 'Bloodwork',
  dexa: 'DEXA scan',
  echo: 'Echocardiogram'
}
const DROP_ZONE_LABELS: Record<ReportType, string> = {
  bloodwork: 'lab',
  dexa: 'DEXA scan',
  echo: 'echocardiogram'
}
const dropZoneLabel = computed(() => DROP_ZONE_LABELS[reportType.value])

// Upload state
// The picked PDF; UFileUpload handles click, drag-and-drop and the dragging state.
const pdf = ref<File | null>(null)
watch(pdf, (file) => {
  if (file) upload(file)
})
const processing = ref(false)
const error = ref('')
const filename = ref('')
const result = ref<LabResult | null>(null)
const saving = ref(false)
const saveResult = ref<{ ok: boolean, date?: string, message?: string } | null>(null)
const summarizing = ref(false)
const summary = ref('')
const summaryError = ref('')

// A parsed extraction is a paid Opus call: leaving the page before SAVE used to discard it
// without a word. Dirty while a result exists and hasn't been saved; save and reset clear it
// by construction, so no markClean bookkeeping. Must come after saveResult: useDirtyGuard
// snapshots the source synchronously, and a `const` read before its line is a TDZ throw that
// kills setup (the page mounted blank with only the 403 from validate-upload to show for it).
useDirtyGuard(() => (saveResult.value?.ok ? null : result.value))

interface PreviewEntry {
  key: string
  label: string
  value: number
  unit: string
  /** False for a marker key the site can't store — shown in warning colour so it isn't silently dropped on save. */
  known: boolean
}

// The top-level DEXA groups in report order, flattened to dotted paths ('total.body_fat_pct').
const DEXA_GROUPS = ['weight_lbs', 'total', 'regions', 'vat', 'ag_ratio', 'bone_density', 'symmetry'] as const

function flattenDexa(res: LabResult): PreviewEntry[] {
  const out: PreviewEntry[] = []
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'number') out.push({ key: path, value: node, known: true, ...dexaFieldMeta(path) })
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`)
    }
  }
  for (const group of DEXA_GROUPS) walk(res[group], group)
  return out
}

// One labelled list whatever the report type, so the preview grid is the same for all three.
// It used to read `markers` alone, and a DEXA scan — which has none — previewed as "0 markers ·
// No numeric markers in this report" with thirty good figures sitting behind it.
const previewEntries = computed<PreviewEntry[]>(() => {
  const res = result.value
  if (!res) return []
  if (reportType.value === 'dexa') return flattenDexa(res)
  return Object.entries(res.markers ?? {})
    .sort(([a], [b]) => {
      const aKnown = !!BIOMARKERS[a]
      const bKnown = !!BIOMARKERS[b]
      if (aKnown !== bKnown) return aKnown ? -1 : 1
      return a.localeCompare(b)
    })
    .map(([key, value]) => {
      const meta = BIOMARKERS[key]
      return { key, value, label: meta?.label ?? key, unit: meta?.unit ?? 'unrecognized key', known: !!meta }
    })
})

// DEXA figures aren't lab markers; the headings and counts say so.
const figureNoun = computed(() => (reportType.value === 'dexa' ? 'figures' : 'markers'))

// Multi-part meta strings are assembled here — adjacent <template v-if> blocks in the markup
// lose the spaces between them once Vue condenses whitespace.
const statusMeta = computed(() => {
  if (!uploadAuthed.value) return 'pin locked'
  if (processing.value) return 'reading pdf'
  if (error.value) return 'extraction failed'
  if (result.value) {
    const parts = [`${previewEntries.value.length} ${figureNoun.value}`, formatDateTerse(result.value.date)]
    if (result.value.fasting) parts.push('fasting')
    return parts.join(' · ')
  }
  return `awaiting ${dropZoneLabel.value} pdf`
})

interface ResultCell {
  label: string
  value: string
  accent: boolean
  hint?: string
  onClick?: () => void
  /** Shown after a clickable cell's value: ⇄ for a toggle (the default), ✎ for an editor. */
  glyph?: string
}

// The scale weight as the report stated it (null when it had none), kept so the weight cell can
// say when the value about to be saved differs from the paper.
const reportWeight = ref<number | null>(null)
const weightModalOpen = ref(false)

const resultCells = computed<ResultCell[]>(() => {
  const res = result.value
  if (!res) return []
  const report: ResultCell = { label: 'report', value: REPORT_LABELS[reportType.value].toUpperCase(), accent: false }
  // A scan has no fasting state. The cell that earns the spot is scale weight: on these reports
  // it's a check-in figure typed in by the clinic, not a scan measurement, and it can lag badly
  // (the Sep 2026 header said 155 lbs against a 169.8 lb total mass) — so, like fasting, it's
  // editable here before it's saved. The save also refuses a scan without one.
  if (reportType.value === 'dexa') {
    const weight = res.weight_lbs
    const hint = reportWeight.value == null
      ? 'not in report · click to enter'
      : weight !== reportWeight.value
        ? `report said ${reportWeight.value} · click to edit`
        : 'from report header · click to edit'
    return [
      { label: 'scan date', value: formatDateTerse(res.date), accent: false },
      { label: 'figures found', value: `${previewEntries.value.length}`, accent: true },
      { label: 'scale weight', value: weight == null ? '—' : `${weight} lbs`, accent: false, hint, glyph: '✎', onClick: openWeightModal },
      report
    ]
  }
  // Not every lab prints a fasting line (Quest does, CHW doesn't), so the extractor can miss it —
  // for bloodwork the cell doubles as a toggle so it's correctable before saving.
  const fastingCell: ResultCell = reportType.value === 'bloodwork'
    ? { label: 'fasting', value: res.fasting ? 'YES' : 'NO', accent: false, hint: 'click to flip', onClick: toggleFasting }
    : { label: 'fasting', value: res.fasting ? 'YES' : 'NO', accent: false }
  return [
    { label: 'draw date', value: formatDateTerse(res.date), accent: false },
    { label: 'markers found', value: `${previewEntries.value.length}`, accent: true },
    fastingCell,
    report
  ]
})

function toggleFasting() {
  if (result.value) result.value.fasting = !result.value.fasting
}

function openWeightModal() {
  weightModalOpen.value = true
}

// The edited weight goes straight onto the result, so the figures grid, DOWNLOAD JSON and SAVE TO
// SITE all carry it — the same way the fasting toggle works.
function applyWeight(weight: number) {
  if (result.value) result.value.weight_lbs = weight
  weightModalOpen.value = false
}

const saveMessage = computed(() => {
  const res = saveResult.value
  if (!res) return ''
  if (!res.ok) return res.message ?? 'Failed to save. Please try again.'
  return `Saved ${res.date ? formatDate(res.date, 'long') : 'this draw'} — the dashboard will update automatically.`
})

function colorClass(res: string) {
  return {
    warning: 'text-warn',
    success: 'text-accent',
    neutral: 'text-body'
  }[qualitativeColor(res)]
}

async function upload(file: File) {
  if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
    error.value = 'Please upload a PDF file.'
    return
  }

  filename.value = file.name
  processing.value = true
  error.value = ''
  result.value = null
  saveResult.value = null

  try {
    const form = new FormData()
    form.append('pdf', file)
    form.append('type', reportType.value)
    result.value = await $fetch<LabResult>('/api/labs/process-pdf', { method: 'POST', body: form })
    reportWeight.value = typeof result.value.weight_lbs === 'number' ? result.value.weight_lbs : null
  }
  catch (e: unknown) {
    error.value = extractErrorMessage(e, 'Something went wrong. Please try again.')
    processing.value = false
  }
  finally {
    processing.value = false
  }
}

function reset() {
  result.value = null
  error.value = ''
  filename.value = ''
  saveResult.value = null
  summarizing.value = false
  summary.value = ''
  summaryError.value = ''
  reportWeight.value = null
  weightModalOpen.value = false
  pdf.value = null
}

function downloadJson() {
  if (!result.value) return
  const blob = new Blob([JSON.stringify(result.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${result.value.date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function saveToSite() {
  if (!result.value) return
  saving.value = true
  saveResult.value = null
  try {
    const res = await $fetch<{ ok: boolean, table: string, date: string }>('/api/labs/save-json', {
      method: 'POST',
      body: { ...result.value, _type: reportType.value }
    })
    saveResult.value = { ok: true, date: res.date }
    // The shell summary carries the last-draw date, flag counts, PDF total and latest DEXA.
    await refreshNuxtData('overview')
    // Each table has its own narrator: a draw gets the marker-history summary, a scan the
    // body-composition one. Both store the prose on the row for their page to show.
    generateSummary(res.table === 'dexa_entries' ? '/api/dexa/generate-summary' : '/api/labs/generate-summary', res.date)
  }
  catch (e: unknown) {
    saveResult.value = { ok: false, message: extractErrorMessage(e, 'Failed to save. Please try again.') }
  }
  finally {
    saving.value = false
  }
}

async function generateSummary(endpoint: string, date: string) {
  summarizing.value = true
  summary.value = ''
  summaryError.value = ''
  try {
    const res = await $fetch<{ summary: string }>(endpoint, { method: 'POST', body: { date } })
    summary.value = res.summary
  }
  catch {
    summaryError.value = 'Summary generation failed — your results were still saved.'
  }
  finally {
    summarizing.value = false
  }
}
</script>
