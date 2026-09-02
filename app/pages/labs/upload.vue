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
        <div class="flex items-center gap-2 mt-3">
          <span class="shrink-0 text-accent text-[13px] leading-none">❯</span>
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
        </div>
        <UButton
          class="w-full justify-center mt-3"
          :loading="pinLoading"
          :disabled="pin.length !== 9"
          @click="submitPin"
        >
          Unlock
        </UButton>
        <p
          v-if="pinError"
          class="mt-2.5 text-[12px] text-danger"
        >
          ✕ {{ pinError }}
        </p>
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
      <div class="grid grid-cols-3 gap-px bg-line border border-line mt-2">
        <button
          v-for="t in REPORT_TYPES"
          :key="t.value"
          type="button"
          class="px-3 py-2.5 text-[11px] tracking-widest uppercase cursor-pointer transition-colors"
          :class="reportType === t.value
            ? 'bg-nav-active text-accent'
            : 'bg-bg text-[#6b8578] hover:text-accent'"
          @click="reportType = t.value"
        >
          {{ t.label }}
        </button>
      </div>

      <TuiHeader
        label="SOURCE PDF"
        :dashes="10"
        class="mt-4"
      />
      <div
        class="mt-2 border border-dashed cursor-pointer transition-colors"
        :class="dragging
          ? 'border-accent bg-nav-active'
          : 'border-line-input bg-inset hover:border-line-accent'"
        @click="fileInput?.click()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <div class="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
          <span
            class="num-display text-[28px] leading-none"
            :class="dragging ? 'text-accent' : 'text-faint'"
          >↑</span>
          <p class="text-[12.5px] text-hi tracking-[0.06em] uppercase">
            drop your {{ dropZoneLabel }} pdf here
          </p>
          <p class="text-[11px] text-muted">
            or click to browse · Claude reads the PDF, values land in D1
          </p>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".pdf,application/pdf"
          class="hidden"
          @change="onFileSelect"
        >
      </div>
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
          <span class="w-[7px] h-3.5 bg-accent shrink-0 animate-[tui-blink_1.1s_step-end_infinite]" />
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
          <p
            class="num-display text-[24px] leading-none mt-1.5 whitespace-nowrap"
            :class="cell.accent ? 'text-accent' : ''"
          >
            {{ cell.value }}
          </p>
        </div>
      </div>

      <!-- Extracted markers -->
      <section class="px-4 sm:px-6 py-4">
        <TuiHeader
          :label="`MARKERS · ${markerEntries.length}`"
          :dashes="8"
        >
          <span class="text-[10.5px] text-muted normal-case truncate">{{ filename }}</span>
        </TuiHeader>

        <div
          v-if="markerEntries.length"
          class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-px bg-line border border-line mt-2.5"
        >
          <div
            v-for="[key, value] in markerEntries"
            :key="key"
            class="bg-raised px-3 py-2.5"
          >
            <p
              class="text-[10.5px] text-muted uppercase tracking-[0.08em] leading-tight truncate"
              :title="markerLabel(key)"
            >
              {{ markerLabel(key) }}
            </p>
            <p class="num-display text-[22px] leading-none mt-1.5">
              {{ value }}
            </p>
            <p
              class="mt-1.5 text-[10.5px]"
              :class="BIOMARKERS[key] ? 'text-muted' : 'text-warn'"
            >
              {{ markerUnit(key) }}
            </p>
          </div>
        </div>

        <p
          v-else
          class="mt-2.5 text-[12px] text-muted"
        >
          No numeric markers in this report.
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
          Comparing this draw against your history…
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { BIOMARKERS } from '~/data/biomarkers'

definePageMeta({ middleware: 'labs-auth' })
useSeoMeta({ title: () => 'Labs · Upload' })

interface QualitativeResult {
  name: string
  result: string
}

interface LabResult {
  date: string
  fasting: boolean
  markers: Record<string, number>
  qualitative?: QualitativeResult[]
}

// PIN gate — validated server-side (httpOnly cookie, not readable by JS)
const uploadAuthed = ref(false)
const pin = ref('')
const pinLoading = ref(false)
const pinError = ref('')

onMounted(async () => {
  try {
    await $fetch('/api/labs/validate-upload')
    uploadAuthed.value = true
  }
  catch {
    uploadAuthed.value = false
  }
})

async function submitPin() {
  if (pin.value.length !== 9) return
  pinLoading.value = true
  pinError.value = ''
  try {
    await $fetch('/api/labs/upload-auth', { method: 'POST', body: { pin: pin.value } })
    uploadAuthed.value = true
  }
  catch {
    pinError.value = 'Incorrect PIN. Try again.'
    pin.value = ''
  }
  finally {
    pinLoading.value = false
  }
}

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
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const processing = ref(false)
const error = ref('')
const filename = ref('')
const result = ref<LabResult | null>(null)
const saving = ref(false)
const saveResult = ref<{ ok: boolean, date?: string, message?: string } | null>(null)
const summarizing = ref(false)
const summary = ref('')
const summaryError = ref('')

const markerEntries = computed(() =>
  Object.entries(result.value?.markers ?? {}).sort(([a], [b]) => {
    const aKnown = !!BIOMARKERS[a]
    const bKnown = !!BIOMARKERS[b]
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    return a.localeCompare(b)
  })
)

// Multi-part meta strings are assembled here — adjacent <template v-if> blocks in the markup
// lose the spaces between them once Vue condenses whitespace.
const statusMeta = computed(() => {
  if (!uploadAuthed.value) return 'pin locked'
  if (processing.value) return 'reading pdf'
  if (error.value) return 'extraction failed'
  if (result.value) {
    const parts = [`${markerEntries.value.length} markers`, formatDateTerse(result.value.date)]
    if (result.value.fasting) parts.push('fasting')
    return parts.join(' · ')
  }
  return `awaiting ${dropZoneLabel.value} pdf`
})

const resultCells = computed(() => {
  const res = result.value
  if (!res) return []
  return [
    { label: 'draw date', value: formatDateTerse(res.date), accent: false },
    { label: 'markers found', value: `${markerEntries.value.length}`, accent: true },
    { label: 'fasting', value: res.fasting ? 'YES' : 'NO', accent: false },
    { label: 'report', value: REPORT_LABELS[reportType.value].toUpperCase(), accent: false }
  ]
})

const saveMessage = computed(() => {
  const res = saveResult.value
  if (!res) return ''
  if (!res.ok) return res.message ?? 'Failed to save. Please try again.'
  return `Saved ${res.date ? formatDate(res.date, 'long') : 'this draw'} — the dashboard will update automatically.`
})

function markerLabel(key: string) {
  return BIOMARKERS[key]?.label ?? key
}

function markerUnit(key: string) {
  return BIOMARKERS[key]?.unit ?? 'unrecognized key'
}

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
  }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    error.value = msg || 'Something went wrong. Please try again.'
    processing.value = false
  }
  finally {
    processing.value = false
  }
}

function onFileSelect(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) upload(file)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) upload(file)
}

function reset() {
  result.value = null
  error.value = ''
  filename.value = ''
  saveResult.value = null
  summarizing.value = false
  summary.value = ''
  summaryError.value = ''
  if (fileInput.value) fileInput.value.value = ''
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
    // DEXA saves go to their own table and have no marker history to narrate.
    if (res.table === 'labs_entries') generateSummary(res.date)
  }
  catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save. Please try again.'
    saveResult.value = { ok: false, message: msg }
  }
  finally {
    saving.value = false
  }
}

async function generateSummary(date: string) {
  summarizing.value = true
  summary.value = ''
  summaryError.value = ''
  try {
    const res = await $fetch<{ summary: string }>('/api/labs/generate-summary', { method: 'POST', body: { date } })
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
