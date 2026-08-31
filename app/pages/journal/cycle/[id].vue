<template>
  <div>
    <JournalHeader
      section="CYCLE"
      :meta="cycle?.name ?? '…'"
    >
      <template #actions>
        <span
          v-if="cycle"
          class="text-[11px] tracking-[0.08em] uppercase border px-2 py-1"
          :class="STATUS_CHIP[status]"
        >{{ statusLabel }}</span>
        <template v-if="isOwner && cycle">
          <button
            type="button"
            class="tui-btn"
            @click="cycleForm?.open(cycle)"
          >
            EDIT
          </button>
          <button
            v-if="status === 'active'"
            type="button"
            class="tui-btn"
            @click="endToday"
          >
            END TODAY
          </button>
          <button
            v-else-if="cycle.actual_end"
            type="button"
            class="tui-btn"
            title="Clear the off-plan end date and let the cycle run as planned"
            @click="clearEnd"
          >
            RESUME PLAN
          </button>
        </template>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <p
      v-if="!cycle"
      class="px-4 sm:px-6 py-5 text-[12px] text-muted"
    >
      No cycle with this id. <NuxtLink
        to="/journal/cycles"
        class="text-accent hover:text-accent-hover"
      >all cycles →</NuxtLink>
    </p>

    <template v-else>
      <!-- Stat cells -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border-b border-line">
        <div class="bg-bg px-4 sm:px-6 py-3.5">
          <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
            {{ status === 'upcoming' ? 'Starts' : status === 'active' ? 'Progress' : 'Ran' }}
          </p>
          <p class="num-display text-[28px] leading-none mt-1.5">
            {{ progressStat }}
          </p>
          <p class="text-[11px] text-muted mt-1">
            {{ formatDate(cycle.start_date, 'monthDay') }} → {{ formatDate(endDate, 'monthDay') }}{{ cycle.actual_end ? ' · off-plan end' : '' }}
          </p>
        </div>
        <div class="bg-bg px-4 sm:px-6 py-3.5">
          <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
            Adherence
          </p>
          <p
            class="num-display text-[28px] leading-none mt-1.5"
            :class="pctClass(adherence.pct)"
          >
            {{ adherence.pct != null ? `${adherence.pct}%` : '—' }}
          </p>
        </div>
        <div class="bg-bg px-4 sm:px-6 py-3.5">
          <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
            Next draw
          </p>
          <p class="text-[13px] text-body mt-2.5">
            {{ nextCheckpointLabel }}
          </p>
        </div>
        <div class="bg-bg px-4 sm:px-6 py-3.5">
          <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
            Weight
          </p>
          <p class="num-display text-[28px] leading-none mt-1.5">
            {{ weightDelta ?? '—' }}
          </p>
          <p
            v-if="weightDelta"
            class="text-[11px] text-muted mt-1"
          >
            vs 2 wks pre-start
          </p>
        </div>
      </div>

      <div class="px-4 sm:px-6 py-3.5 space-y-4">
        <p
          v-if="cycle.goal"
          class="text-[12px] text-muted"
        >
          goal: {{ cycle.goal }}
        </p>

        <!-- Planned timeline: one bar per compound across the cycle's weeks -->
        <section>
          <TuiHeader
            label="PLAN ── by week"
            :dashes="0"
          >
            <span class="text-[10px] text-muted normal-case">{{ totalWeeks }} wks</span>
          </TuiHeader>
          <div class="flex flex-col gap-1 mt-2.5">
            <div
              v-for="(bar, i) in planBars"
              :key="i"
              class="flex items-center gap-2.5 text-[10px]"
            >
              <NuxtLink
                :to="`/journal/compound/${encodeURIComponent(bar.compound)}`"
                class="shrink-0 w-24 sm:w-30 text-right truncate hover:opacity-70 transition-opacity"
                :style="{ color: getCompoundColor(bar.compound) }"
              >{{ bar.compound }}</NuxtLink>
              <div class="relative flex-1 h-2.25 bg-raised min-w-0">
                <div
                  class="absolute inset-y-0"
                  :style="{ left: `${bar.left}%`, width: `${bar.width}%`, background: getCompoundColor(bar.compound), opacity: 0.6 }"
                  :title="bar.title"
                />
                <span
                  v-if="nowLeft != null"
                  class="absolute inset-y-0 w-px bg-accent"
                  :style="{ left: `${nowLeft}%` }"
                  title="now"
                />
              </div>
              <span class="shrink-0 w-24 sm:w-34 text-muted truncate">{{ bar.label }}</span>
            </div>
          </div>
        </section>

        <!-- Planned vs logged exposure, Bateman-modeled -->
        <section v-if="overlayChart.data.length">
          <TuiHeader
            label="ESTIMATED LEVELS ── planned vs logged"
            :dashes="0"
          >
            <span class="text-[10px] text-muted normal-case">% of each compound's planned peak</span>
          </TuiHeader>
          <div class="mt-2.5">
            <ClientOnly>
              <AreaChart
                :data="overlayChart.data"
                :categories="overlayChart.categories"
                :height="190"
                show-legend
                :mark-lines="overlayMarks"
              />
              <template #fallback>
                <div class="h-48" />
              </template>
            </ClientOnly>
          </div>
          <p class="mt-1.5 text-[11px] text-faint leading-[1.6]">
            Faint line = the plan, solid = modeled from logged doses; divergence is deviation. Dashed guides mark the start and lab draws.{{ unmodeledNote }}
          </p>
        </section>

        <!-- Planned vs logged, scored per week -->
        <section v-if="status !== 'upcoming' && adherence.rows.length">
          <TuiHeader
            label="ADHERENCE ── planned vs logged"
            :dashes="0"
          >
            <span class="text-[10px] text-muted normal-case">cycle weeks only</span>
          </TuiHeader>
          <div class="flex flex-col gap-1.5 mt-2.5">
            <div
              v-for="row in adherenceRows"
              :key="`${row.compound}-${row.cadence}`"
              class="grid grid-cols-[1fr_auto] lg:grid-cols-[180px_150px_minmax(0,1fr)_50px_110px] gap-x-3 gap-y-1.5 items-center px-3 py-2 bg-raised text-[12px]"
            >
              <NuxtLink
                :to="`/journal/compound/${encodeURIComponent(row.compound)}`"
                class="text-hi flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0"
                  :style="{ background: getCompoundColor(row.compound) }"
                />
                <span class="truncate">{{ row.compound }}</span>
              </NuxtLink>
              <span class="text-dim text-right lg:text-left text-[11px]">{{ row.doseLabel }} · {{ row.cadence }}</span>

              <span class="flex items-center gap-1 col-span-2 lg:col-span-1">
                <span
                  v-for="w in row.weeks"
                  :key="w.weekStart"
                  class="h-2.5 flex-1 max-w-6"
                  :class="w.expected ? (w.partial ? 'outline outline-line-accent -outline-offset-1' : '') : 'bg-inset opacity-40'"
                  :style="weekCellStyle(row.compound, w)"
                  :title="`wk of ${formatDate(w.weekStart, 'monthDay')} · ${w.actual}/${w.expected}`"
                />
              </span>

              <span
                class="text-right"
                :class="pctClass(row.pct)"
              >{{ row.pct != null ? `${row.pct}%` : '—' }}</span>
              <span
                class="text-right text-[10.5px] tracking-[0.06em]"
                :class="STATUS_CLASSES[row.status.kind]"
              >{{ status === 'active' ? row.status.label : '—' }}</span>
            </div>
          </div>
        </section>

        <!-- Lab checkpoints, derived from the cycle dates -->
        <section>
          <TuiHeader
            label="LAB CHECKPOINTS ── gating markers vs baseline"
            :dashes="0"
          />
          <div class="flex flex-col gap-1.5 mt-2.5">
            <div
              v-for="cp in checkpoints"
              :key="cp.key"
              class="px-3 py-2.5 bg-raised text-[12px]"
            >
              <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span class="text-hi uppercase tracking-[0.06em] text-[11px]">{{ cp.label }}</span>
                <span class="text-faint text-[11px]">{{ formatDate(cp.windowFrom, 'monthDay') }} – {{ formatDate(cp.windowTo, 'monthDay') }}</span>
                <span
                  class="ml-auto text-[10.5px] tracking-[0.06em] uppercase"
                  :class="CP_CLASSES[cp.state]"
                >
                  <template v-if="cp.state === 'done'">
                    <NuxtLink
                      to="/labs"
                      class="hover:underline"
                    >✓ {{ formatDate(cp.drawDate!, 'monthDay').toUpperCase() }}</NuxtLink>
                  </template>
                  <template v-else>{{ cp.state === 'due' ? 'DUE NOW' : cp.state === 'missed' ? 'NO DRAW' : 'UPCOMING' }}</template>
                </span>
              </div>
              <div
                v-if="cp.chips.length"
                class="flex flex-wrap gap-x-3.5 gap-y-1 mt-1.5 text-[11.5px]"
              >
                <NuxtLink
                  v-for="chip in cp.chips"
                  :key="chip.key"
                  :to="{ path: '/labs', query: { marker: chip.key } }"
                  class="hover:opacity-80 transition-opacity"
                  :class="chip.class"
                >{{ chip.text }}</NuxtLink>
              </div>
            </div>
          </div>
          <p class="mt-1.5 text-[11px] text-faint leading-[1.6]">
            Windows are derived from the cycle dates — nothing to schedule. Chips diff HDL/LDL, ALT/AST, hematocrit, ferritin, and estradiol against the baseline draw.
          </p>
        </section>

        <section v-if="cycle.notes">
          <TuiHeader
            label="NOTES"
            :dashes="0"
          />
          <p class="mt-2 text-[12px] text-body whitespace-pre-line leading-[1.7]">
            {{ cycle.notes }}
          </p>
        </section>
      </div>
    </template>

    <JournalCycleForm
      ref="cycleForm"
      @saved="refresh"
    />
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'
import { BIOMARKERS, getStatus } from '~/data/biomarkers'
import { PK_MODELS, exposureSeries } from '#shared/utils/pk'
import type { Cycle } from '#shared/utils/cycles'
import {
  GATING_MARKERS, checkpointStates, cycleEnd, cycleProgress, cycleStatusOn,
  diffDays, doseLabelOf, plannedDoses, shiftDays
} from '#shared/utils/cycles'
import type { AdherenceWeek } from '~/utils/adherence'

definePageMeta({ middleware: 'journal-auth' })

const route = useRoute()
const toast = useToast()
const { isOwner } = await useAuth()

const { data, refresh, error } = await useCycles()
const { data: journalData } = await useJournalEntries()
const { data: labsData } = await useLabsEntries()
onMounted(() => refresh())

const cycleForm = useTemplateRef('cycleForm')

const today = localToday()
const cycle = computed(() => (data.value ?? []).find(c => c.id === Number(route.params.id)) ?? null)
const entries = computed(() => journalData.value ?? [])
const draws = computed(() => [...(labsData.value ?? [])].sort((a, b) => a.date.localeCompare(b.date)))

const status = computed(() => cycle.value ? cycleStatusOn(cycle.value, today) : 'upcoming')
const endDate = computed(() => cycle.value ? cycleEnd(cycle.value) : today)
const progress = computed(() => cycle.value ? cycleProgress(cycle.value, today) : null)
const totalWeeks = computed(() => progress.value?.totalWeeks ?? 0)

const STATUS_CHIP: Record<string, string> = {
  active: 'text-accent border-line-accent',
  upcoming: 'text-hi border-line-soft',
  done: 'text-muted border-line-soft'
}

const statusLabel = computed(() => {
  if (!cycle.value) return ''
  if (status.value === 'active') return `DAY ${progress.value!.day}/${progress.value!.totalDays} · WK ${progress.value!.week} OF ${totalWeeks.value}`
  if (status.value === 'upcoming') return `STARTS IN ${diffDays(today, cycle.value.start_date)}D`
  return `DONE · ${progress.value!.totalDays}D`
})

const progressStat = computed(() => {
  if (!cycle.value) return ''
  if (status.value === 'upcoming') return `${diffDays(today, cycle.value.start_date)}D`
  if (status.value === 'active') return `${progress.value!.pct}%`
  return `${totalWeeks.value} WKS`
})

// --- adherence (cycle rules only, finished runs included) ---

const adherence = computed(() =>
  cycle.value ? cycleAdherence(entries.value, cycle.value, today) : { rows: [], pct: null }
)

// The scorer runs start-week → current week; for a finished cycle that tail is all dead
// cells, so the display clips to the weeks the cycle actually spans.
const adherenceRows = computed(() => {
  if (!cycle.value) return []
  const firstWeek = shiftDays(cycle.value.start_date, -6)
  return adherence.value.rows.map(row => ({
    ...row,
    weeks: row.weeks.filter(w => w.weekStart >= firstWeek && w.weekStart <= endDate.value)
  }))
})

function weekCellStyle(compound: string, w: AdherenceWeek) {
  if (!w.expected) return {}
  return {
    background: getCompoundColor(compound),
    opacity: 0.2 + 0.8 * Math.min(w.actual / w.expected, 1)
  }
}

function pctClass(pct: number | null): string {
  if (pct == null) return 'text-muted'
  if (pct >= 90) return 'text-accent'
  if (pct >= 70) return 'text-dim'
  return 'text-warn'
}

const STATUS_CLASSES: Record<string, string> = {
  done: 'text-accent',
  due: 'text-hi',
  overdue: 'text-warn',
  next: 'text-muted'
}

// --- plan timeline bars ---

const planBars = computed(() => {
  if (!cycle.value) return []
  const weeks = totalWeeks.value
  return cycle.value.compounds.map((item) => {
    const from = item.fromWeek
    const to = Math.min(item.toWeek ?? weeks, weeks)
    return {
      compound: item.compound,
      left: ((from - 1) / weeks) * 100,
      width: Math.max(((to - from + 1) / weeks) * 100, 2),
      label: `${doseLabelOf(item)} · wks ${from}–${to}`,
      title: `${item.compound} ${doseLabelOf(item)} · weeks ${from}–${to}`
    }
  })
})

const nowLeft = computed(() => {
  if (!cycle.value || !progress.value || status.value === 'upcoming') return null
  return status.value === 'done' ? null : (progress.value.day / progress.value.totalDays) * 100
})

// --- planned-vs-logged exposure overlay ---
// Same Bateman engine as the compounds page, run twice per modeled compound: once on the
// synthetic plan doses, once on the real dose log. Both normalize against the same peak so
// divergence reads as deviation, not scale mismatch. Orals (Anavar) have no PK model — the
// spike comb says nothing — so they appear in adherence and the plan bars only.

const RUN_IN_DAYS = 14

const overlayRows = computed(() => {
  if (!cycle.value) return []
  const from = shiftDays(cycle.value.start_date, -RUN_IN_DAYS)
  const to = endDate.value
  const actualCap = today < to ? today : to
  const rows: Array<{ compound: string, planned: Array<{ date: string, pct: number }>, actual: Array<{ date: string, pct: number }> }> = []

  for (const compound of new Set(cycle.value.compounds.map(c => c.compound))) {
    const model = PK_MODELS[compound]
    if (!model) continue

    const plan = plannedDoses(cycle.value, compound)
    const plannedPoints = exposureSeries(plan, model, from, to)

    const logged = entries.value.flatMap(e =>
      (e.peptides ?? [])
        .filter(p => p.compound === compound)
        .map(p => ({ date: e.date, time: p.time, amount: p.dose }))
    )
    const actualPoints = logged.length ? exposureSeries(logged, model, from, actualCap) : []

    const peak = Math.max(...plannedPoints.map(p => p.level), ...actualPoints.map(p => p.level), 0)
    if (peak <= 0) continue
    const pct = (p: { date: string, level: number }) => ({ date: p.date, pct: Math.round((p.level / peak) * 1000) / 10 })
    rows.push({ compound, planned: plannedPoints.map(pct), actual: actualPoints.map(pct) })
  }
  return rows
})

const overlayChart = computed(() => {
  const rows = overlayRows.value
  if (!cycle.value || !rows.length) return { data: [], categories: {} as Record<string, { name: string, color: string }> }

  const categories: Record<string, { name: string, color: string }> = {}
  rows.forEach((row, i) => {
    // Plan first so the logged line draws over it. '59' ≈ 35% alpha of the compound color.
    categories[`p${i}`] = { name: `${row.compound} · plan`, color: `${getCompoundColor(row.compound)}59` }
    if (row.actual.length) categories[`a${i}`] = { name: row.compound, color: getCompoundColor(row.compound) }
  })

  const from = shiftDays(cycle.value.start_date, -RUN_IN_DAYS)
  const days = diffDays(from, endDate.value) + 1
  const data = Array.from({ length: days }, (_, idx) => {
    const date = shiftDays(from, idx)
    const point: Record<string, unknown> = { date: formatDate(date, 'monthDay') }
    rows.forEach((row, i) => {
      point[`p${i}`] = row.planned[idx]?.pct
      if (row.actual.length) point[`a${i}`] = row.actual[idx]?.pct
    })
    return point
  })
  return { data, categories }
})

const overlayMarks = computed(() => {
  if (!cycle.value) return []
  const from = shiftDays(cycle.value.start_date, -RUN_IN_DAYS)
  const drawMarks = draws.value
    .filter(d => d.date >= from && d.date <= endDate.value)
    .map(d => d.date)
  return [cycle.value.start_date, ...drawMarks].map(d => formatDate(d, 'monthDay'))
})

const unmodeledNote = computed(() => {
  if (!cycle.value) return ''
  const skipped = [...new Set(cycle.value.compounds.map(c => c.compound))].filter(c => !PK_MODELS[c])
  return skipped.length
    ? ` ${skipped.join(', ')}: no exposure model (cleared in hours — the dose log is the whole story).`
    : ''
})

// --- lab checkpoints + gating-marker diffs ---

interface GatingChip {
  key: string
  text: string
  class: string
}

const CP_CLASSES: Record<string, string> = {
  done: 'text-accent',
  due: 'text-hi',
  missed: 'text-warn',
  upcoming: 'text-muted'
}

const checkpoints = computed(() => {
  if (!cycle.value) return []
  const states = checkpointStates(cycle.value, draws.value.map(d => d.date), today)
  const baselineDate = states.find(s => s.key === 'baseline')?.drawDate ?? null
  return states.map(cp => ({
    ...cp,
    chips: cp.drawDate ? gatingChips(cp.drawDate, cp.key === 'baseline' ? null : baselineDate) : []
  }))
})

function statusClassOf(key: string, value: number): string {
  const meta = BIOMARKERS[key]
  const s = meta ? getStatus(value, meta) : 'normal'
  if (s === 'high') return 'text-danger'
  if (s === 'low') return 'text-warn'
  return s === 'optimal' ? 'text-accent' : 'text-dim'
}

function fmtVal(v: number): string {
  return Number.isInteger(v) ? v.toString() : v.toFixed(v < 10 ? 1 : 0)
}

/** "HDL 42→38" per gating marker, colored by where the new value stands. */
function gatingChips(drawDate: string, baselineDate: string | null): GatingChip[] {
  const draw = draws.value.find(d => d.date === drawDate)
  if (!draw) return []
  const baseline = baselineDate ? draws.value.find(d => d.date === baselineDate) : null
  const chips: GatingChip[] = []
  for (const key of GATING_MARKERS) {
    const value = draw.markers[key]
    if (value == null) continue
    const label = BIOMARKERS[key]?.label ?? key
    const prior = baseline?.markers[key]
    chips.push({
      key,
      text: prior != null ? `${label} ${fmtVal(prior)}→${fmtVal(value)}` : `${label} ${fmtVal(value)}`,
      class: statusClassOf(key, value)
    })
  }
  return chips
}

const nextCheckpointLabel = computed(() => {
  const next = checkpoints.value.find(cp => cp.state === 'due' || cp.state === 'upcoming')
  if (!next) return '—'
  return `${next.label} · ${formatDate(next.windowFrom, 'monthDay')}–${formatDate(next.windowTo, 'monthDay')}`
})

// --- weight vs pre-start baseline ---

const weightDelta = computed(() => {
  if (!cycle.value || status.value === 'upcoming') return null
  const start = cycle.value.start_date
  const weights = (range: [string, string]) => entries.value
    .filter(e => e.weight_lbs != null && e.date >= range[0] && e.date <= range[1])
    .map(e => e.weight_lbs!)
  const avg = (v: number[]) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null

  const before = avg(weights([shiftDays(start, -14), shiftDays(start, -1)]))
  const recentEnd = status.value === 'done' ? endDate.value : today
  const during = avg(weights([shiftDays(recentEnd, -13), recentEnd]))
  if (before == null || during == null) return null
  const delta = during - before
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} lbs`
})

// --- owner actions ---

/** Ending early keeps every logged week as history; status flips to done by date math. */
async function endToday() {
  if (!cycle.value) return
  if (!confirm(`End ${cycle.value.name} today? The plan called for ${formatDate(plannedEndOf(cycle.value))}.`)) return
  await saveEnd(today)
}

async function clearEnd() {
  if (!cycle.value) return
  await saveEnd(null)
}

function plannedEndOf(c: Cycle): string {
  return shiftDays(c.start_date, c.planned_weeks * 7 - 1)
}

async function saveEnd(actualEnd: string | null) {
  const c = cycle.value!
  try {
    await $fetch('/api/journal/cycles/save', {
      method: 'POST',
      body: { ...c, actual_end: actualEnd }
    })
    await refresh()
    toast.add({ title: actualEnd ? 'Cycle ended' : 'Back on plan', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
}

useSeoMeta({ title: () => `Cycle · ${cycle.value?.name ?? ''}` })
</script>
