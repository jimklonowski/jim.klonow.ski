<template>
  <div>
    <ToolsHeader
      section="IMPORT"
      meta="apple health → journal vitals"
    >
      <template #actions>
        <span class="text-[11px] text-muted hidden md:inline">parsed in your browser · nothing leaves the page until you import</span>
      </template>
    </ToolsHeader>
    <ToolsNav />

    <div class="px-4 sm:px-6 py-4 space-y-5">
      <!-- One-time XML import -->
      <section class="bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="ONE-TIME XML IMPORT"
          :dashes="8"
        >
          <span class="text-[10.5px] text-muted normal-case">{{ fileMeta }}</span>
        </TuiHeader>

        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          On your iPhone: <span class="text-hi">Health</span> → tap your profile photo → <span class="text-hi">Export All Health Data</span>
          → share the ZIP to your Mac → unzip → drop <code class="text-accent">export.xml</code> below.
        </p>

        <UFileUpload
          v-model="selectedFile"
          accept=".xml"
          icon="i-lucide-upload-cloud"
          label="Drop export.xml here"
          description="or click to browse — the file is read locally, never uploaded"
          class="w-full mt-3"
          :ui="{
            base: 'bg-inset border-line-input hover:border-line-accent p-5',
            icon: 'text-faint',
            label: 'text-[12.5px] text-dim mt-2',
            description: 'text-[11px] text-muted mt-1',
            file: 'border-line-input bg-inset text-[11.5px]',
            fileName: 'text-body',
            fileSize: 'text-muted'
          }"
        />

        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
          <button
            v-if="selectedFile && !parsing"
            type="button"
            class="tui-btn tui-btn-accent"
            @click="parseFile"
          >
            ⌖ PARSE FILE
          </button>
          <span
            v-if="parsing"
            class="flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-muted"
          >
            <span>parsing…</span>
            <span class="num-display text-hi">{{ parseProgress }}%</span>
            <span class="text-faint">· {{ fileSizeMb }} MB file, this takes a moment</span>
          </span>
        </div>

        <UProgress
          v-if="parsing"
          :value="parseProgress"
          size="sm"
          class="mt-2.5"
        />

        <!-- Parse results -->
        <div
          v-if="rows.length"
          class="mt-3.5"
        >
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span class="flex items-center gap-1.5 text-body">
              <span class="w-1.5 h-1.5 rounded-full bg-accent glow-dot shrink-0" />
              <span class="num-display text-hi">{{ newCount }}</span> new entries
            </span>
            <span class="flex items-center gap-1.5 text-body">
              <span class="w-1.5 h-1.5 rounded-full bg-dim shrink-0" />
              <span class="num-display text-hi">{{ updateCount }}</span> filling missing vitals
            </span>
            <span class="text-muted">{{ rows.length }} total rows</span>
            <span class="ml-auto text-muted">{{ selectedCount }} selected</span>
          </div>

          <!-- Preview table -->
          <div class="mt-2.5 border border-line-soft max-h-104 overflow-auto">
            <table class="w-full text-[12px]">
              <thead class="sticky top-0 z-10">
                <tr class="bg-inset border-b border-line">
                  <th class="py-1.5 px-2.5 w-8">
                    <UCheckbox
                      :model-value="allSelected"
                      :indeterminate="someSelected && !allSelected"
                      size="xs"
                      @update:model-value="toggleAll"
                    />
                  </th>
                  <th
                    v-for="col in COLUMNS"
                    :key="col.key"
                    class="py-1.5 px-2.5 text-[10.5px] tracking-[0.12em] uppercase text-faint font-medium"
                    :class="col.align === 'right' ? 'text-right' : 'text-left'"
                  >
                    {{ col.label }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(row, i) in rows"
                  :key="row.date"
                  class="border-b border-line-soft last:border-0 hover:bg-[#101a15] transition-colors"
                  :class="[i % 2 ? 'bg-inset' : '', row.selected ? '' : 'opacity-45']"
                >
                  <td class="py-1.5 px-2.5">
                    <UCheckbox
                      v-model="row.selected"
                      size="xs"
                    />
                  </td>
                  <td class="py-1.5 px-2.5 text-muted whitespace-nowrap">
                    {{ row.date }}
                  </td>
                  <td class="py-1.5 px-2.5 text-right">
                    <span :class="valueClass(row, 'weight_lbs')">{{ row.weight_lbs ?? '—' }}</span>
                  </td>
                  <td class="py-1.5 px-2.5 text-right whitespace-nowrap">
                    <span :class="valueClass(row, 'bp_systolic')">{{ bpText(row) }}</span>
                  </td>
                  <td class="py-1.5 px-2.5 text-right">
                    <span :class="valueClass(row, 'rhr')">{{ row.rhr ?? '—' }}</span>
                  </td>
                  <td class="py-1.5 px-2.5 text-right">
                    <span :class="valueClass(row, 'hrv')">{{ row.hrv ?? '—' }}</span>
                  </td>
                  <td class="py-1.5 px-2.5">
                    <span
                      class="text-[10.5px] tracking-widest uppercase border px-1.5 py-0.5 whitespace-nowrap"
                      :class="row.action === 'create'
                        ? 'text-accent border-line-accent'
                        : 'text-dim border-line-input'"
                    >
                      {{ row.action === 'create' ? 'new' : 'fill' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Import -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
            <button
              type="button"
              class="tui-btn tui-btn-accent disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="importing || selectedCount === 0"
              @click="importRows"
            >
              {{ importing ? 'IMPORTING ⟳' : importButtonLabel }}
            </button>
            <span
              v-if="importing || importDone"
              class="flex flex-wrap items-center gap-x-2 text-[11px] text-muted"
            >
              <span><span class="num-display text-hi">{{ done }}</span> / {{ selectedCount }} saved</span>
              <span
                v-if="importDone && !failedDates.length"
                class="text-accent"
              >· done ✓</span>
              <span
                v-else-if="failedText"
                class="text-danger"
              >· {{ failedText }}</span>
            </span>
          </div>
        </div>

        <p
          v-else-if="parsed"
          class="mt-3 text-[12px] text-muted"
        >
          No new vitals found — every date in this export already has complete data in your journal.
        </p>
      </section>

      <!-- Auto-sync webhook setup -->
      <section class="bg-raised border border-line-soft px-3.5 py-3">
        <TuiHeader
          label="AUTO-SYNC · HEALTH AUTO EXPORT"
          :dashes="4"
        >
          <span class="text-[10.5px] text-muted normal-case">daily push, no manual export</span>
        </TuiHeader>

        <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
          <a
            href="https://www.healthexportapp.com"
            target="_blank"
            class="text-accent hover:text-accent-hover underline"
          >Health Auto Export</a>
          (~$4 on the App Store) can POST your daily metrics to this app automatically. Once set up, weight,
          RHR, HRV, and BP populate without touching the form.
        </p>

        <ol class="mt-3 space-y-3 text-[12px]">
          <li class="flex gap-2.5">
            <span class="shrink-0 w-5 h-5 border border-line-accent text-accent text-[10.5px] flex items-center justify-center">1</span>
            <div class="min-w-0">
              <p class="text-hi">
                Install the app
              </p>
              <p class="text-muted mt-0.5">
                Search "Health Auto Export" in the App Store. The paid version supports REST API exports.
              </p>
            </div>
          </li>
          <li class="flex gap-2.5">
            <span class="shrink-0 w-5 h-5 border border-line-accent text-accent text-[10.5px] flex items-center justify-center">2</span>
            <div class="min-w-0">
              <p class="text-hi">
                Create a new REST API export
              </p>
              <p class="text-muted mt-0.5">
                In the app: <span class="text-dim">Automations</span> → <span class="text-dim">+</span> → <span class="text-dim">REST API</span>
              </p>
            </div>
          </li>
          <li class="flex gap-2.5">
            <span class="shrink-0 w-5 h-5 border border-line-accent text-accent text-[10.5px] flex items-center justify-center">3</span>
            <div class="min-w-0 w-full">
              <p class="text-hi">
                Configure the endpoint
              </p>
              <div class="mt-1.5 border border-line-input bg-inset px-2.5 py-2 text-[11.5px] space-y-1">
                <div class="flex gap-2.5">
                  <span class="shrink-0 w-16 text-[10.5px] tracking-[0.12em] uppercase text-faint">url</span>
                  <span class="text-accent break-all">{{ webhookUrl }}</span>
                </div>
                <div class="flex gap-2.5">
                  <span class="shrink-0 w-16 text-[10.5px] tracking-[0.12em] uppercase text-faint">method</span>
                  <span class="text-body">POST</span>
                </div>
                <div class="flex gap-2.5">
                  <span class="shrink-0 w-16 text-[10.5px] tracking-[0.12em] uppercase text-faint">header</span>
                  <span class="text-body break-all">Authorization: Bearer <span class="text-muted">[your LABS_SECRET value]</span></span>
                </div>
              </div>
            </div>
          </li>
          <li class="flex gap-2.5">
            <span class="shrink-0 w-5 h-5 border border-line-accent text-accent text-[10.5px] flex items-center justify-center">4</span>
            <div class="min-w-0">
              <p class="text-hi">
                Select these metrics
              </p>
              <div class="flex flex-wrap gap-1.5 mt-1.5">
                <span
                  v-for="m in METRICS"
                  :key="m"
                  class="px-2 py-0.5 border border-line-soft text-[11px] text-muted"
                >
                  {{ m }}
                </span>
              </div>
            </div>
          </li>
          <li class="flex gap-2.5">
            <span class="shrink-0 w-5 h-5 border border-line-accent text-accent text-[10.5px] flex items-center justify-center">5</span>
            <div class="min-w-0">
              <p class="text-hi">
                Set schedule
              </p>
              <p class="text-muted mt-0.5">
                Daily at a time after your morning measurements. The endpoint only fills in fields that are
                blank — it won't overwrite values you've entered manually.
              </p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { blankEntry } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })
useSeoMeta({ title: 'Tools · Data Import' })

const METRICS = ['Body Mass', 'Resting Heart Rate', 'Heart Rate Variability', 'Blood Pressure']

const COLUMNS = [
  { key: 'date', label: 'Date', align: 'left' },
  { key: 'weight', label: 'Weight', align: 'right' },
  { key: 'bp', label: 'BP', align: 'right' },
  { key: 'rhr', label: 'RHR', align: 'right' },
  { key: 'hrv', label: 'HRV', align: 'right' },
  { key: 'status', label: 'Status', align: 'left' }
]

const RECORD_TYPES: Record<string, string> = {
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierRestingHeartRate: 'rhr',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv',
  HKQuantityTypeIdentifierBloodPressureSystolic: 'bp_systolic',
  HKQuantityTypeIdentifierBloodPressureDiastolic: 'bp_diastolic'
}

const { data: allEntries } = await useJournalEntries()

const entryMap = computed(() => {
  const map: Record<string, typeof allEntries.value extends Array<infer T> ? T : never> = {}
  for (const e of (allEntries.value ?? [])) {
    (map as Record<string, unknown>)[e.date] = e
  }
  return map
})

const webhookUrl = computed(() =>
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/journal/health-webhook`
    : '/api/journal/health-webhook'
)

// --- File handling ---
// UFileUpload owns the picker + drag/drop; `selectedFile` is its v-model.
const selectedFile = ref<File | null>(null)
const fileSizeMb = computed(() =>
  selectedFile.value ? Math.round(selectedFile.value.size / 1024 / 1024) : 0
)

const fileMeta = computed(() =>
  selectedFile.value
    ? `${selectedFile.value.name} · ${fileSizeMb.value} MB`
    : 'export.xml from a Health data export'
)

// --- Parsing ---
interface HealthData {
  weight_lbs?: number
  rhr?: number
  hrv?: number
  bp_systolic?: number
  bp_diastolic?: number
}

interface ParsedRow extends HealthData {
  date: string
  action: 'create' | 'update'
  updates: Partial<HealthData>
  selected: boolean
}

const parsing = ref(false)
const parseProgress = ref(0)
const parsed = ref(false)
const rows = ref<ParsedRow[]>([])

// A different file means the previous preview no longer describes what's staged.
watch(selectedFile, () => {
  rows.value = []
  parsed.value = false
})

const typeRe = /type="([^"]+)"/
const dateRe = /startDate="(\d{4}-\d{2}-\d{2})/
const valueRe = /\bvalue="([^"]+)"/
const unitRe = /\bunit="([^"]+)"/

function processLine(line: string, byDate: Record<string, HealthData>) {
  if (!line.includes('<Record')) return

  const recordType = typeRe.exec(line)?.[1]
  const field = recordType ? RECORD_TYPES[recordType] : undefined
  if (!field) return

  const dateStr = dateRe.exec(line)?.[1]
  if (!dateStr) return

  const rawValue = valueRe.exec(line)?.[1]
  if (rawValue == null) return
  const value = parseFloat(rawValue)
  if (isNaN(value)) return

  const day = (byDate[dateStr] ??= {})

  if (field === 'weight') {
    const unit = unitRe.exec(line)?.[1] ?? 'lb'
    day.weight_lbs = unit === 'kg'
      ? Math.round(value * 2.20462 * 10) / 10
      : Math.round(value * 10) / 10
  }
  else {
    (day as Record<string, number>)[field] = Math.round(value)
  }
}

function buildRows(byDate: Record<string, HealthData>): ParsedRow[] {
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([date, data]) => {
      const existing = (entryMap.value as Record<string, Record<string, unknown>>)[date]
      const updates: Partial<HealthData> = {}

      if (data.weight_lbs != null && existing?.weight_lbs == null) updates.weight_lbs = data.weight_lbs
      if (data.rhr != null && existing?.rhr == null) updates.rhr = data.rhr
      if (data.hrv != null && existing?.hrv == null) updates.hrv = data.hrv
      if (data.bp_systolic != null && existing?.bp_systolic == null) updates.bp_systolic = data.bp_systolic
      if (data.bp_diastolic != null && existing?.bp_diastolic == null) updates.bp_diastolic = data.bp_diastolic

      if (Object.keys(updates).length === 0) return []

      return [{ date, ...data, updates, action: existing ? 'update' : 'create', selected: true }]
    })
}

async function parseFile() {
  if (!selectedFile.value) return
  parsing.value = true
  parseProgress.value = 0
  rows.value = []
  parsed.value = false
  await nextTick()

  try {
    const byDate: Record<string, HealthData> = {}
    const totalBytes = selectedFile.value.size
    let bytesProcessed = 0
    let buffer = ''

    const reader = selectedFile.value.stream().pipeThrough(new TextDecoderStream()).getReader()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += value
      bytesProcessed += value.length
      parseProgress.value = Math.min(99, Math.round(bytesProcessed / totalBytes * 100))

      const lastNewline = buffer.lastIndexOf('\n')
      if (lastNewline === -1) continue

      const chunk = buffer.substring(0, lastNewline + 1)
      buffer = buffer.substring(lastNewline + 1)

      for (const line of chunk.split('\n')) {
        processLine(line, byDate)
      }
    }
    if (buffer) processLine(buffer, byDate)

    parseProgress.value = 100
    rows.value = buildRows(byDate)
    parsed.value = true
  }
  finally {
    parsing.value = false
  }
}

// --- Preview formatting ---
/** Values that will actually be written read as accent; already-present ones stay muted. */
function valueClass(row: ParsedRow, field: keyof HealthData) {
  if (row[field] == null) return 'text-ghost'
  return row.updates[field] != null ? 'text-accent' : 'text-muted'
}

function bpText(row: ParsedRow) {
  return row.bp_systolic ? `${row.bp_systolic}/${row.bp_diastolic}` : '—'
}

// --- Selection ---
const newCount = computed(() => rows.value.filter(r => r.action === 'create').length)
const updateCount = computed(() => rows.value.filter(r => r.action === 'update').length)
const selectedCount = computed(() => rows.value.filter(r => r.selected).length)
const allSelected = computed(() => rows.value.length > 0 && rows.value.every(r => r.selected))
const someSelected = computed(() => rows.value.some(r => r.selected))

// UCheckbox's header state is tri-state, so only an explicit `true` selects everything.
function toggleAll(value: boolean | 'indeterminate') {
  const next = value === true
  for (const row of rows.value) row.selected = next
}

// --- Import ---
const importing = ref(false)
const importDone = ref(false)
const done = ref(0)
const failedDates = ref<string[]>([])

const importButtonLabel = computed(() =>
  `↓ IMPORT ${selectedCount.value} ${selectedCount.value === 1 ? 'ENTRY' : 'ENTRIES'}`
)

const failedText = computed(() =>
  failedDates.value.length
    ? `${failedDates.value.length} failed (${failedDates.value.join(', ')}) — re-run import to retry`
    : ''
)

async function importRows() {
  importing.value = true
  importDone.value = false
  done.value = 0
  failedDates.value = []

  const selected = rows.value.filter(r => r.selected)

  try {
    for (const row of selected) {
      const existing = (entryMap.value as Record<string, Record<string, unknown>>)[row.date]
      let payload: Record<string, unknown>

      if (existing) {
        payload = { ...existing, ...row.updates }
      }
      else {
        const blank = blankEntry(row.date)
        payload = {
          ...blank,
          weight_lbs: row.weight_lbs ?? null,
          rhr: row.rhr ?? null,
          hrv: row.hrv ?? null,
          bp_systolic: row.bp_systolic ?? null,
          bp_diastolic: row.bp_diastolic ?? null
        }
      }

      // One bad row shouldn't abandon the rest of the batch (or strand the button in its
      // loading state) — record it and keep going.
      try {
        await $fetch('/api/journal/save', { method: 'POST', body: payload })
        done.value++
      }
      catch {
        failedDates.value.push(row.date)
      }
    }
  }
  finally {
    importDone.value = true
    importing.value = false
  }
}
</script>
