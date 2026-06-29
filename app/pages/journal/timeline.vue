<template>
  <UContainer>
    <div class="py-8 space-y-6">

      <!-- Header -->
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
          <div>
            <h1 class="text-2xl font-bold">Protocol Timeline</h1>
            <p v-if="compounds.length" class="text-sm text-muted">{{ dateRangeLabel }}</p>
          </div>
        </div>
        <div class="flex gap-1">
          <UButton
            v-for="opt in ZOOM_OPTS"
            :key="opt.value"
            size="xs"
            :variant="zoom === opt.value ? 'solid' : 'ghost'"
            @click="zoom = opt.value"
          >
            {{ opt.label }}
          </UButton>
        </div>
      </div>

      <div v-if="!compounds.length" class="text-sm text-muted">No compound data yet.</div>

      <template v-else>

        <!-- Timeline grid -->
        <div class="overflow-x-auto pb-3">
          <div
            class="relative select-none"
            :style="{ minWidth: `${LABEL_W + slots.length * cellWidth}px` }"
          >

            <!-- Top axis: month labels (week zoom) or year labels (month zoom) -->
            <div class="flex mb-0.5" :style="{ paddingLeft: `${LABEL_W}px` }">
              <div
                v-for="group in axisGroups"
                :key="group.key"
                :style="{ width: `${group.count * cellWidth}px` }"
                class="text-xs text-muted truncate pl-1 border-l border-default/50"
              >
                {{ group.label }}
              </div>
            </div>

            <!-- Sub-axis: month abbreviations (month zoom only) -->
            <div v-if="zoom === 'month'" class="flex mb-1.5" :style="{ paddingLeft: `${LABEL_W}px` }">
              <div
                v-for="slot in slots"
                :key="slot"
                :style="{ width: `${cellWidth}px` }"
                class="text-center text-muted border-l border-default/20"
                style="font-size: 10px; line-height: 1.4;"
              >
                {{ monthAbbr(slot) }}
              </div>
            </div>

            <!-- Compound rows -->
            <div
              v-for="compound in compounds"
              :key="compound.name"
              class="flex items-center mb-1"
            >
              <NuxtLink
                :to="`/journal/compound/${encodeURIComponent(compound.name)}`"
                class="shrink-0 text-xs font-medium truncate pr-3 text-right hover:opacity-70 transition-opacity"
                :style="{ width: `${LABEL_W}px`, color: getCompoundColor(compound.name) }"
              >
                {{ compound.name }}
              </NuxtLink>

              <div class="flex gap-px">
                <div
                  v-for="slot in slots"
                  :key="slot"
                  class="rounded-sm transition-opacity hover:opacity-70"
                  :style="{
                    width: `${cellWidth - 1}px`,
                    height: `${ROW_H}px`,
                    background: compound.activeSlots.has(slot)
                      ? getCompoundColor(compound.name)
                      : 'rgba(128,128,128,0.07)',
                  }"
                  :title="compound.activeSlots.has(slot)
                    ? `${compound.name} · ${slotLabel(slot)}`
                    : undefined"
                />
              </div>
            </div>

            <!-- Labs row -->
            <div v-if="labSlots.size" class="flex items-center mt-3 pt-3 border-t border-default/40">
              <div
                class="shrink-0 text-xs text-muted text-right pr-3"
                :style="{ width: `${LABEL_W}px` }"
              >
                Lab draws
              </div>
              <div class="flex gap-px">
                <div
                  v-for="slot in slots"
                  :key="slot"
                  class="flex items-center justify-center"
                  :style="{ width: `${cellWidth - 1}px`, height: `${ROW_H}px` }"
                >
                  <UPopover v-if="labSlots.has(slot)" :content="{ side: 'top', align: 'center' }">
                    <div
                      class="w-3 h-3 rounded-full border-2 border-amber-400 bg-amber-400/30 cursor-pointer hover:bg-amber-400/70 transition-colors"
                      :title="`Lab draw · ${labSlotLabel(slot)}`"
                    />
                    <template #content>
                      <div class="p-3 space-y-2 min-w-48">
                        <p class="text-xs font-semibold text-muted uppercase tracking-wider">{{ labSlotLabel(slot) }}</p>
                        <template v-if="labSourcesMap[slot]?.flatMap(l => l.sources).length">
                          <a
                            v-for="src in labSourcesMap[slot].flatMap(l => l.sources)"
                            :key="src"
                            :href="src"
                            target="_blank"
                            class="flex items-center gap-2 text-sm hover:text-primary transition-colors py-0.5"
                          >
                            <UIcon name="i-lucide-file-text" class="w-3.5 h-3.5 shrink-0 text-amber-400" />
                            {{ pdfLabel(src) }}
                          </a>
                        </template>
                        <p v-else class="text-xs text-muted">No PDFs attached</p>
                      </div>
                    </template>
                  </UPopover>
                </div>
              </div>
            </div>

            <!-- Today marker -->
            <div
              v-if="todaySlotIdx >= 0"
              class="absolute top-0 bottom-0 pointer-events-none"
              :style="{
                left: `${LABEL_W + (todaySlotIdx + 1) * cellWidth - 1}px`,
                width: '2px',
                background: 'var(--ui-primary)',
                opacity: 0.55,
              }"
            />

          </div>
        </div>

        <!-- Legend / compound list -->
        <div class="flex flex-wrap gap-x-6 gap-y-2 pt-2 border-t border-default">
          <NuxtLink
            v-for="compound in compounds"
            :key="compound.name"
            :to="`/journal/compound/${encodeURIComponent(compound.name)}`"
            class="flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity"
          >
            <span class="w-3 h-2.5 rounded-sm shrink-0" :style="{ background: getCompoundColor(compound.name) }" />
            <span class="font-medium">{{ compound.name }}</span>
            <span class="text-muted">{{ compound.activeSlots.size }}{{ zoom === 'week' ? 'w' : 'mo' }}</span>
          </NuxtLink>
          <span class="flex items-center gap-1.5 text-xs text-muted ml-auto">
            <span class="inline-block w-3 h-2.5 rounded-sm border border-primary/50" style="background: var(--ui-primary); opacity: 0.55;" />
            Today
          </span>
        </div>

      </template>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'

definePageMeta({ middleware: 'journal-auth' })

const LABEL_W = 148
const CELL_W_WEEK = 26
const CELL_W_MONTH = 90
const ROW_H = 26

const ZOOM_OPTS = [
  { label: 'Week', value: 'week' as const },
  { label: 'Month', value: 'month' as const },
]
const zoom = ref<'week' | 'month'>('week')
const cellWidth = computed(() => zoom.value === 'week' ? CELL_W_WEEK : CELL_W_MONTH)

const { data, refresh } = await useAsyncData('/journal', () =>
  queryCollection('journal').order('date', 'ASC').all(),
  { getCachedData: (key, app) => { const d = app.payload.data[key]; return d?.length ? d : undefined } }
)
const { data: labsData } = await useAsyncData('labs-draws', () =>
  queryCollection('labs').order('date', 'ASC').all()
)
onMounted(refresh)

const entries = computed(() => data.value ?? [])
const todayDate: string = new Date().toISOString().slice(0, 10)

const firstPeptideDate = computed(() => {
  for (const e of entries.value) {
    if ((e.peptides ?? []).length > 0) return e.date
  }
  return null
})

const dateRangeLabel = computed(() => {
  if (!firstPeptideDate.value) return ''
  return `${fmtDate(firstPeptideDate.value)} → ${fmtDate(todayDate)}`
})

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// --- Week / month slot generation ---

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay()) // Sunday start
  return d.toISOString().slice(0, 10)
}

// --- Lab draw slots ---
const labSlots = computed(() => {
  const set = new Set<string>()
  for (const lab of (labsData.value ?? [])) {
    const key = zoom.value === 'week'
      ? getWeekStart((lab as { date: string }).date)
      : (lab as { date: string }).date.substring(0, 7)
    set.add(key)
  }
  return set
})

const labSourcesMap = computed(() => {
  const map: Record<string, { date: string, sources: string[] }[]> = {}
  for (const lab of (labsData.value ?? [])) {
    const l = lab as { date: string, sources?: string[] }
    const key = zoom.value === 'week'
      ? getWeekStart(l.date)
      : l.date.substring(0, 7)
    if (!map[key]) map[key] = []
    map[key].push({ date: l.date, sources: l.sources ?? [] })
  }
  return map
})

function labSlotLabel(slot: string): string {
  const lab = (labsData.value ?? []).find((l) => {
    const key = zoom.value === 'week'
      ? getWeekStart((l as { date: string }).date)
      : (l as { date: string }).date.substring(0, 7)
    return key === slot
  })
  return lab ? (lab as { date: string }).date : slot
}

function pdfLabel(src: string): string {
  return src.replace(/^\/labs\//, '').replace(/\.pdf$/i, '')
}

const weekSlots = computed((): string[] => {
  if (!firstPeptideDate.value) return []
  const start = getWeekStart(firstPeptideDate.value)
  const end = getWeekStart(todayDate)
  const result: string[] = []
  const cur = new Date(start + 'T12:00:00')
  const endDate = new Date(end + 'T12:00:00')
  while (cur <= endDate) {
    result.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 7)
  }
  return result
})

const monthSlots = computed((): string[] => {
  if (!firstPeptideDate.value) return []
  const startParts = firstPeptideDate.value.split('-')
  const endParts = todayDate.split('-')
  let y = Number(startParts[0]), m = Number(startParts[1])
  const ey = Number(endParts[0]), em = Number(endParts[1])
  const result: string[] = []
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return result
})

const slots = computed(() => zoom.value === 'week' ? weekSlots.value : monthSlots.value)

const todaySlotIdx = computed(() => {
  const key = zoom.value === 'week' ? getWeekStart(todayDate) : todayDate.substring(0, 7)
  return slots.value.indexOf(key)
})

// --- Compounds with active slot sets ---

const compounds = computed(() => {
  const usageMap: Record<string, Set<string>> = {}
  const firstUse: Record<string, string> = {}

  for (const entry of entries.value) {
    const slotKey = zoom.value === 'week'
      ? getWeekStart(entry.date)
      : entry.date.substring(0, 7)

    for (const p of (entry.peptides ?? [])) {
      const name = (p as { compound: string }).compound
      if (!name) continue
      if (!usageMap[name]) usageMap[name] = new Set()
      usageMap[name].add(slotKey)
      if (!firstUse[name]) firstUse[name] = entry.date
    }
  }

  return Object.entries(usageMap)
    .sort(([a], [b]) => (firstUse[a] ?? '').localeCompare(firstUse[b] ?? ''))
    .map(([name, activeSlots]) => ({ name, activeSlots }))
})

// --- Axis label groups ---

interface AxisGroup { key: string; label: string; count: number }

const axisGroups = computed((): AxisGroup[] => {
  const groups: AxisGroup[] = []

  if (zoom.value === 'week') {
    let curMonth = '', count = 0
    for (const week of slots.value) {
      const month = week.substring(0, 7)
      if (month !== curMonth) {
        if (curMonth) groups.push({ key: curMonth, label: fmtMonth(curMonth), count })
        curMonth = month; count = 1
      } else { count++ }
    }
    if (curMonth) groups.push({ key: curMonth, label: fmtMonth(curMonth), count })
  } else {
    let curYear = '', count = 0
    for (const month of slots.value) {
      const year = month.substring(0, 4)
      if (year !== curYear) {
        if (curYear) groups.push({ key: curYear, label: curYear, count })
        curYear = year; count = 1
      } else { count++ }
    }
    if (curYear) groups.push({ key: curYear, label: curYear, count })
  }

  return groups
})

function fmtMonth(yyyyMm: string) {
  const y = parseInt(yyyyMm.substring(0, 4))
  const m = parseInt(yyyyMm.substring(5, 7))
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function monthAbbr(yyyyMm: string) {
  const y = parseInt(yyyyMm.substring(0, 4))
  const m = parseInt(yyyyMm.substring(5, 7))
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' }).substring(0, 3)
}

function slotLabel(slot: string) {
  if (zoom.value === 'month') {
    return fmtMonth(slot)
  }
  return `week of ${new Date(slot + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
</script>
