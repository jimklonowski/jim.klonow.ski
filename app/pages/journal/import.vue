<template>
  <UContainer>
    <div class="py-8 max-w-4xl mx-auto space-y-10">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
        <div>
          <h1 class="text-2xl font-bold">Import Health Data</h1>
          <p class="text-sm text-muted">Fill in vitals from Apple Health</p>
        </div>
      </div>

      <!-- XML Import -->
      <section class="space-y-4">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">One-time XML Import</h2>

        <UCard class="space-y-4">
          <p class="text-sm text-muted">
            On your iPhone: <strong>Health</strong> → tap your profile photo → <strong>Export All Health Data</strong> → share the ZIP to your Mac → unzip → upload <code class="font-mono bg-elevated px-1 rounded">export.xml</code> below.
          </p>

          <div class="flex items-center gap-3 flex-wrap">
            <input
              ref="fileInput"
              type="file"
              accept=".xml"
              class="hidden"
              @change="onFileChange"
            />
            <UButton variant="outline" icon="i-lucide-upload" @click="fileInput?.click()">
              {{ fileName || 'Choose export.xml' }}
            </UButton>
            <UButton
              v-if="fileName && !parsing"
              icon="i-lucide-scan-line"
              @click="parseFile"
            >
              Parse
            </UButton>
            <span v-if="parsing" class="text-sm text-muted">
              Parsing… {{ parseProgress }}%
              <span class="text-xs">({{ fileSizeMb }} MB file — this takes a moment)</span>
            </span>
          </div>

          <UProgress v-if="parsing" :value="parseProgress" class="mt-2" />

          <!-- Parse results summary -->
          <div v-if="rows.length" class="space-y-4">
            <div class="flex flex-wrap gap-4 text-sm">
              <span class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-success" />
                {{ newCount }} new entries
              </span>
              <span class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-primary" />
                {{ updateCount }} filling missing vitals
              </span>
              <span class="text-muted">{{ rows.length }} total rows</span>
            </div>

            <!-- Preview table -->
            <div class="overflow-x-auto rounded-lg border border-default">
              <table class="w-full text-xs font-mono">
                <thead>
                  <tr class="border-b border-default bg-elevated">
                    <th class="py-2 px-3 text-left font-medium text-muted w-8">
                      <UCheckbox
                        :model-value="allSelected"
                        :indeterminate="someSelected && !allSelected"
                        @update:model-value="toggleAll"
                      />
                    </th>
                    <th class="py-2 px-3 text-left font-medium text-muted">Date</th>
                    <th class="py-2 px-3 text-right font-medium text-muted">Weight</th>
                    <th class="py-2 px-3 text-right font-medium text-muted">BP</th>
                    <th class="py-2 px-3 text-right font-medium text-muted">RHR</th>
                    <th class="py-2 px-3 text-right font-medium text-muted">HRV</th>
                    <th class="py-2 px-3 text-left font-medium text-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in rows"
                    :key="row.date"
                    class="border-b border-default last:border-0 hover:bg-elevated/50 transition-colors"
                    :class="!row.selected ? 'opacity-50' : ''"
                  >
                    <td class="py-2 px-3">
                      <UCheckbox v-model="row.selected" />
                    </td>
                    <td class="py-2 px-3">{{ row.date }}</td>
                    <td class="py-2 px-3 text-right">
                      <span v-if="row.weight_lbs" :class="row.updates.weight_lbs != null ? 'text-success' : 'text-muted'">
                        {{ row.weight_lbs }}
                      </span>
                      <span v-else class="text-muted opacity-40">—</span>
                    </td>
                    <td class="py-2 px-3 text-right">
                      <span v-if="row.bp_systolic" :class="row.updates.bp_systolic != null ? 'text-success' : 'text-muted'">
                        {{ row.bp_systolic }}/{{ row.bp_diastolic }}
                      </span>
                      <span v-else class="text-muted opacity-40">—</span>
                    </td>
                    <td class="py-2 px-3 text-right">
                      <span v-if="row.rhr" :class="row.updates.rhr != null ? 'text-success' : 'text-muted'">
                        {{ row.rhr }}
                      </span>
                      <span v-else class="text-muted opacity-40">—</span>
                    </td>
                    <td class="py-2 px-3 text-right">
                      <span v-if="row.hrv" :class="row.updates.hrv != null ? 'text-success' : 'text-muted'">
                        {{ row.hrv }}
                      </span>
                      <span v-else class="text-muted opacity-40">—</span>
                    </td>
                    <td class="py-2 px-3">
                      <span
                        class="px-1.5 py-0.5 rounded text-xs"
                        :class="row.action === 'create' ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary'"
                      >
                        {{ row.action === 'create' ? 'New entry' : 'Fill missing' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Import button -->
            <div class="flex items-center gap-4">
              <UButton
                :loading="importing"
                :disabled="selectedCount === 0"
                icon="i-lucide-download"
                @click="importRows"
              >
                Import {{ selectedCount }} {{ selectedCount === 1 ? 'entry' : 'entries' }}
              </UButton>
              <div v-if="importing || importDone" class="text-sm text-muted">
                {{ done }} / {{ selectedCount }} saved
                <span v-if="importDone" class="text-success ml-2">Done!</span>
              </div>
            </div>
          </div>

          <p v-else-if="parsed && !rows.length" class="text-sm text-muted">
            No new vitals found — all dates in this export already have complete data in your journal.
          </p>
        </UCard>
      </section>

      <!-- Auto-sync webhook setup -->
      <section class="space-y-4">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted">Auto-Sync (Health Auto Export)</h2>

        <UCard class="space-y-6">
          <p class="text-sm text-muted">
            <a href="https://www.healthexportapp.com" target="_blank" class="text-primary underline">Health Auto Export</a>
            (~$4 on the App Store) can POST your daily metrics to this app automatically. Once set up, weight, RHR, HRV, and BP populate without touching the form.
          </p>

          <ol class="space-y-5 text-sm">
            <li class="flex gap-3">
              <span class="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">1</span>
              <div>
                <p class="font-medium">Install the app</p>
                <p class="text-muted mt-0.5">Search "Health Auto Export" in the App Store. The paid version supports REST API exports.</p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">2</span>
              <div>
                <p class="font-medium">Create a new REST API export</p>
                <p class="text-muted mt-0.5">In the app: <strong>Automations</strong> → <strong>+</strong> → <strong>REST API</strong></p>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">3</span>
              <div>
                <p class="font-medium">Configure the endpoint</p>
                <div class="mt-2 space-y-2 font-mono text-xs bg-elevated rounded-lg p-3">
                  <div class="flex gap-2">
                    <span class="text-muted w-20 shrink-0">URL</span>
                    <span>{{ webhookUrl }}</span>
                  </div>
                  <div class="flex gap-2">
                    <span class="text-muted w-20 shrink-0">Method</span>
                    <span>POST</span>
                  </div>
                  <div class="flex gap-2">
                    <span class="text-muted w-20 shrink-0">Header</span>
                    <span>Authorization: Bearer <em class="not-italic text-muted">[your LABS_SECRET value]</em></span>
                  </div>
                </div>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">4</span>
              <div>
                <p class="font-medium">Select these metrics</p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <span
                    v-for="m in METRICS"
                    :key="m"
                    class="px-2 py-0.5 bg-elevated rounded text-xs font-mono"
                  >
                    {{ m }}
                  </span>
                </div>
              </div>
            </li>
            <li class="flex gap-3">
              <span class="shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">5</span>
              <div>
                <p class="font-medium">Set schedule</p>
                <p class="text-muted mt-0.5">Daily at a time after your morning measurements. The endpoint only fills in fields that are blank — it won't overwrite values you've entered manually.</p>
              </div>
            </li>
          </ol>

          <UAlert
            icon="i-lucide-info"
            color="neutral"
            variant="subtle"
            title="Dev-only note"
            description="Like the journal save button, the webhook only writes files in dev mode (npm run dev). In production the endpoint will return 403 until file-based writes are replaced with a database."
          />
        </UCard>
      </section>

    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { blankEntry } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const METRICS = ['Body Mass', 'Resting Heart Rate', 'Heart Rate Variability', 'Blood Pressure']

const RECORD_TYPES: Record<string, string> = {
  HKQuantityTypeIdentifierBodyMass: 'weight',
  HKQuantityTypeIdentifierRestingHeartRate: 'rhr',
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: 'hrv',
  HKQuantityTypeIdentifierBloodPressureSystolic: 'bp_systolic',
  HKQuantityTypeIdentifierBloodPressureDiastolic: 'bp_diastolic',
}

const { data: allEntries } = await useAsyncData('/journal', () =>
  queryCollection('journal').order('date', 'ASC').all(),
  { getCachedData: (key, app) => { const d = app.payload.data[key]; return d?.length ? d : undefined } }
)

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
const fileInput = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const selectedFile = ref<File | null>(null)
const fileSizeMb = computed(() =>
  selectedFile.value ? Math.round(selectedFile.value.size / 1024 / 1024) : 0
)

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  selectedFile.value = f
  fileName.value = f.name
  rows.value = []
  parsed.value = false
}

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

const typeRe = /type="([^"]+)"/
const dateRe = /startDate="(\d{4}-\d{2}-\d{2})/
const valueRe = /\bvalue="([^"]+)"/
const unitRe = /\bunit="([^"]+)"/

function processLine(line: string, byDate: Record<string, HealthData>) {
  if (!line.includes('<Record')) return

  const typeMatch = typeRe.exec(line)
  if (!typeMatch || !RECORD_TYPES[typeMatch[1]]) return

  const dateMatch = dateRe.exec(line)
  if (!dateMatch) return
  const dateStr = dateMatch[1]

  const valueMatch = valueRe.exec(line)
  if (!valueMatch) return
  const value = parseFloat(valueMatch[1])
  if (isNaN(value)) return

  if (!byDate[dateStr]) byDate[dateStr] = {}
  const field = RECORD_TYPES[typeMatch[1]]

  if (field === 'weight') {
    const unit = unitRe.exec(line)?.[1] ?? 'lb'
    byDate[dateStr].weight_lbs = unit === 'kg'
      ? Math.round(value * 2.20462 * 10) / 10
      : Math.round(value * 10) / 10
  }
  else {
    (byDate[dateStr] as Record<string, number>)[field] = Math.round(value)
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

// --- Selection ---
const newCount = computed(() => rows.value.filter(r => r.action === 'create').length)
const updateCount = computed(() => rows.value.filter(r => r.action === 'update').length)
const selectedCount = computed(() => rows.value.filter(r => r.selected).length)
const allSelected = computed(() => rows.value.length > 0 && rows.value.every(r => r.selected))
const someSelected = computed(() => rows.value.some(r => r.selected))

function toggleAll(val: boolean) {
  for (const row of rows.value) row.selected = val
}

// --- Import ---
const importing = ref(false)
const importDone = ref(false)
const done = ref(0)

async function importRows() {
  importing.value = true
  importDone.value = false
  done.value = 0

  const selected = rows.value.filter(r => r.selected)

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
        bp_diastolic: row.bp_diastolic ?? null,
      }
    }

    await $fetch('/api/journal/save', { method: 'POST', body: payload })
    done.value++
  }

  importDone.value = true
  importing.value = false
}
</script>
