<template>
  <div class="py-8 max-w-3xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <UButton to="/labs" variant="ghost" icon="i-lucide-arrow-left" size="sm">Labs</UButton>
      <h1 class="text-2xl font-bold">Upload Lab Results</h1>
    </div>

    <!-- PIN gate -->
    <UCard v-if="!uploadAuthed">
      <div class="flex flex-col items-center py-12 space-y-5">
        <UIcon name="i-lucide-lock" class="w-10 h-10 text-muted" />
        <div class="text-center">
          <p class="font-medium">Upload PIN required</p>
          <p class="text-sm text-muted mt-1">Enter your 9-digit upload PIN to continue</p>
        </div>
        <div class="w-full max-w-xs space-y-3">
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
            Unlock
          </UButton>
          <p v-if="pinError" class="text-sm text-error text-center">{{ pinError }}</p>
        </div>
      </div>
    </UCard>

    <!-- Drop zone -->
    <UCard v-else-if="!processing && !result && !error">
      <!-- Report type selector -->
      <div class="flex gap-2 mb-6">
        <UButton
          v-for="t in REPORT_TYPES"
          :key="t.value"
          :variant="reportType === t.value ? 'solid' : 'outline'"
          size="sm"
          :icon="t.icon"
          @click="reportType = t.value"
        >
          {{ t.label }}
        </UButton>
      </div>
      <div
        class="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-lg cursor-pointer transition-colors"
        :class="dragging ? 'border-primary bg-primary/5' : 'border-neutral-700 hover:border-neutral-500'"
        @click="fileInput?.click()"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <UIcon name="i-lucide-upload-cloud" class="w-14 h-14 text-muted mb-4" />
        <p class="text-lg font-medium">Drop your {{ dropZoneLabel }} PDF here</p>
        <p class="text-sm text-muted mt-1">or click to browse</p>
        <input ref="fileInput" type="file" accept=".pdf,application/pdf" class="hidden" @change="onFileSelect" />
      </div>
    </UCard>

    <!-- Processing -->
    <UCard v-else-if="processing">
      <div class="flex flex-col items-center py-16 space-y-4">
        <div class="relative">
          <UIcon name="i-lucide-file-text" class="w-16 h-16 text-muted" />
          <div class="absolute -bottom-1 -right-1 bg-primary rounded-full p-1.5">
            <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <div class="text-center">
          <p class="font-medium">Reading your lab report...</p>
          <p class="text-sm text-muted mt-1">Claude is extracting your biomarker values</p>
        </div>
      </div>
    </UCard>

    <!-- Error -->
    <UCard v-else-if="error">
      <div class="flex flex-col items-center py-12 space-y-4 text-center">
        <UIcon name="i-lucide-alert-circle" class="w-12 h-12 text-error" />
        <div>
          <p class="font-medium">Extraction failed</p>
          <p class="text-sm text-muted mt-1 max-w-sm">{{ error }}</p>
        </div>
        <UButton @click="reset">Try again</UButton>
      </div>
    </UCard>

    <!-- Results -->
    <template v-if="result">
      <UCard>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs text-muted">Extracted from <span class="font-medium text-foreground">{{ filename }}</span></p>
            <div class="flex items-center gap-2 mt-1">
              <p class="text-lg font-semibold">{{ formatDate(result.date) }}</p>
              <UBadge v-if="result.fasting" color="neutral" variant="subtle" size="sm">Fasting</UBadge>
            </div>
          </div>
          <UBadge color="success" variant="subtle" size="lg">{{ markerEntries.length }} markers found</UBadge>
        </div>
      </UCard>

      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <UCard v-for="[key, value] in markerEntries" :key="key">
          <div class="space-y-1.5">
            <p class="text-xs text-muted leading-tight">{{ BIOMARKERS[key]?.label ?? key }}</p>
            <p class="text-2xl font-bold tabular-nums">{{ value }}</p>
            <p v-if="BIOMARKERS[key]" class="text-xs text-muted">{{ BIOMARKERS[key].unit }}</p>
            <UBadge v-else color="neutral" variant="subtle" size="xs">Unrecognized key</UBadge>
          </div>
        </UCard>
      </div>

      <div v-if="result.qualitative?.length" class="space-y-2">
        <p class="text-xs font-semibold text-muted uppercase tracking-wider">Genetic &amp; Qualitative Results</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <UCard v-for="item in result.qualitative" :key="item.name">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-medium">{{ item.name }}</p>
              <UBadge :color="qualitativeColor(item.result)" variant="subtle">{{ item.result }}</UBadge>
            </div>
          </UCard>
        </div>
      </div>

      <div class="flex flex-wrap gap-3">
        <UButton icon="i-lucide-download" @click="downloadJson">Download JSON</UButton>
        <UButton variant="outline" icon="i-lucide-save" :loading="saving" @click="saveToSite">
          Save to Site
        </UButton>
        <UButton variant="ghost" icon="i-lucide-refresh-cw" @click="reset">Upload another</UButton>
      </div>

      <UAlert
        v-if="saveResult"
        :color="saveResult.ok ? 'success' : 'error'"
        :title="saveResult.ok ? 'Saved!' : 'Could not save'"
        :description="saveResult.ok
          ? `Saved ${formatDate(saveResult.date!)} — the dashboard will update automatically.`
          : saveResult.message"
      />

      <UCard v-if="summarizing || summary || summaryError">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-primary" />
            <p class="text-sm font-medium">AI Summary</p>
          </div>
        </template>
        <div v-if="summarizing" class="flex items-center gap-3 text-sm text-muted py-2">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          Comparing this draw against your history...
        </div>
        <p v-else-if="summary" class="text-sm leading-relaxed whitespace-pre-line">{{ summary }}</p>
        <p v-else class="text-sm text-muted">{{ summaryError }}</p>
      </UCard>
    </template>
  </div>
</template>

<script setup lang="ts">
import { BIOMARKERS } from '~/data/biomarkers'

definePageMeta({ middleware: 'labs-auth' })

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
  { value: 'bloodwork', label: 'Bloodwork', icon: 'i-lucide-test-tube' },
  { value: 'dexa', label: 'DEXA Scan', icon: 'i-lucide-scan' },
  { value: 'echo', label: 'Echocardiogram', icon: 'i-lucide-heart-pulse' }
] as const
type ReportType = 'bloodwork' | 'dexa' | 'echo'
const reportType = ref<ReportType>('bloodwork')

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

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
</script>
