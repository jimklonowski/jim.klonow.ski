<template>
  <div>
    <JournalHeader
      section="COMPOUNDS"
      :meta="`${active.length} active / ${trackedCount} tracked`"
    >
      <template #actions>
        <NuxtLink
          to="/journal/cycles"
          class="text-[11px] text-accent hover:text-accent-hover"
        >cycles →</NuxtLink>
        <span class="text-ghost text-[11px]">·</span>
        <NuxtLink
          to="/tools/calculator"
          class="text-[11px] text-accent hover:text-accent-hover"
        >calculator →</NuxtLink>
        <span class="text-ghost text-[11px]">·</span>
        <NuxtLink
          v-if="canEdit"
          to="/tools/inventory"
          class="text-[11px] text-accent hover:text-accent-hover"
        >vial inventory →</NuxtLink>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <div class="px-4 sm:px-6 py-3.5 space-y-4">
      <!-- Active protocol -->
      <section>
        <TuiHeader
          label="ACTIVE PROTOCOL ── click for dossier"
          :dashes="0"
        >
          <span class="text-[10px] text-muted normal-case">last {{ ACTIVE_WINDOW }}d</span>
        </TuiHeader>

        <div class="flex flex-col gap-1.5 mt-2.5">
          <NuxtLink
            v-for="c in active"
            :key="c.compound"
            :to="`/journal/compound/${encodeURIComponent(c.compound)}`"
            class="grid grid-cols-[1fr_auto] lg:grid-cols-[180px_60px_100px_minmax(0,1fr)_140px] gap-x-3 gap-y-1.5 items-center px-3 py-2 bg-raised hover:bg-[#101a15] transition-colors text-[12px]"
          >
            <span class="text-hi flex items-center gap-2 min-w-0">
              <span
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :style="{ background: getCompoundColor(c.compound) }"
              />
              <span class="truncate">{{ c.compound }}</span>
            </span>
            <span class="text-muted text-right lg:text-left">{{ c.daysUsed }}d</span>
            <span
              class="text-dim col-span-2 lg:col-span-1"
              :title="iuTitle(c.compound, c.doseLabel)"
            >{{ c.doseLabel }}</span>

            <span class="h-1.25 bg-line-soft col-span-2 lg:col-span-1 relative">
              <span
                class="absolute inset-y-0"
                :style="{
                  left: `${c.presence.left}%`,
                  width: `${c.presence.width}%`,
                  background: getCompoundColor(c.compound),
                  opacity: 0.65
                }"
              />
            </span>

            <span class="text-muted text-right col-span-2 lg:col-span-1">last: {{ c.lastLabel }}</span>
          </NuxtLink>
        </div>

        <p
          v-if="!active.length"
          class="mt-2.5 text-[12px] text-muted"
        >
          No compounds dosed in the last {{ ACTIVE_WINDOW }} days.
        </p>
      </section>

      <!-- Modeled exposure for the slow-release injectables -->
      <section v-if="exposureChart.data.length">
        <TuiHeader
          label="ESTIMATED LEVELS ── modeled"
          :dashes="0"
        >
          <span class="text-[10px] text-muted normal-case">last {{ EXPOSURE_DAYS }}d · % of each compound's peak</span>
        </TuiHeader>
        <div class="mt-2.5">
          <ClientOnly>
            <AreaChart
              :data="exposureChart.data"
              :categories="exposureChart.categories"
              :height="170"
              :show-legend="Object.keys(exposureChart.categories).length > 1"
              :mark-lines="exposureMarks"
              area
            />
            <template #fallback>
              <div class="h-42" />
            </template>
          </ClientOnly>
        </div>
        <p class="mt-1.5 text-[11px] text-faint leading-[1.6]">
          Bateman-modeled from logged doses and typical ester/peptide half-lives — relative shape only, not measured serum levels. Dashed guides mark lab draws.
        </p>
      </section>

      <!-- Planned vs logged, from the hand-maintained PROTOCOL_RULES cadence -->
      <section v-if="adherence.length">
        <TuiHeader
          label="ADHERENCE ── planned vs logged"
          :dashes="0"
        >
          <span class="text-[10px] text-muted normal-case">last {{ ADHERENCE_WEEKS }} wks</span>
        </TuiHeader>
        <div class="flex flex-col gap-1.5 mt-2.5">
          <div
            v-for="row in adherence"
            :key="row.compound"
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
            <span
              class="text-dim text-right lg:text-left text-[11px]"
              :title="iuTitle(row.compound, row.doseLabel)"
            >{{ row.doseLabel }} · {{ row.cadence }}</span>

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
            >{{ row.status.label }}</span>
          </div>
        </div>
        <p class="mt-1.5 text-[11px] text-faint leading-[1.6]">
          Weeks score logged dose-days against the intended cadence, so a shot slid by a day still counts. As-needed compounds aren't scored.
        </p>
      </section>

      <!-- Full timeline gantt -->
      <section v-if="timelineRows.length">
        <TuiHeader :label="timelineLabel">
          <span class="flex gap-2.5 text-[10px]">
            <button
              v-for="opt in ZOOM_OPTS"
              :key="opt"
              type="button"
              class="cursor-pointer normal-case"
              :class="zoom === opt ? 'text-accent' : 'text-faint hover:text-accent'"
              @click="zoom = opt"
            >{{ zoom === opt ? `[${opt}]` : opt }}</button>
          </span>
        </TuiHeader>

        <div class="flex flex-col gap-1 mt-2.5">
          <div
            v-for="row in visibleTimelineRows"
            :key="row.name"
            class="flex items-center gap-2.5 text-[10px]"
          >
            <NuxtLink
              :to="`/journal/compound/${encodeURIComponent(row.name)}`"
              class="shrink-0 w-24 sm:w-30 text-right truncate hover:opacity-70 transition-opacity"
              :style="{ color: getCompoundColor(row.name) }"
            >{{ row.name }}</NuxtLink>

            <div class="relative flex-1 h-2.25 bg-raised min-w-0">
              <div
                v-for="(run, i) in row.runs"
                :key="i"
                class="absolute inset-y-0"
                :style="{
                  left: `${run.left}%`,
                  width: `${run.width}%`,
                  background: getCompoundColor(row.name),
                  opacity: 0.6
                }"
                :title="run.title"
              />
            </div>

            <span class="shrink-0 w-7 text-muted">{{ row.span }}</span>
          </div>

          <!-- Lab draw markers + now line -->
          <div class="flex items-center gap-2.5 text-[10px]">
            <button
              v-if="hiddenTimelineCount"
              type="button"
              class="shrink-0 w-24 sm:w-30 text-right text-faint hover:text-accent cursor-pointer truncate"
              @click="showAllTimeline = !showAllTimeline"
            >
              {{ showAllTimeline ? '− fewer rows' : `+ ${hiddenTimelineCount} more rows` }}
            </button>
            <span
              v-else
              class="shrink-0 w-24 sm:w-30 text-right text-muted"
            >lab draws</span>

            <div class="relative flex-1 h-2.25 min-w-0">
              <NuxtLink
                v-for="mark in labMarks"
                :key="mark.slot"
                to="/labs"
                class="absolute top-0 -translate-x-1/2 text-[8px] text-accent leading-none hover:text-accent-hover"
                :style="{ left: `${mark.left}%` }"
                :title="mark.title"
              >▲</NuxtLink>
              <span
                v-if="nowLeft != null"
                class="absolute inset-y-0 w-px bg-accent"
                :style="{ left: `${nowLeft}%` }"
                title="now"
              />
            </div>
            <span class="shrink-0 w-7" />
          </div>
        </div>
      </section>

      <!-- Inactive, grouped into category chips -->
      <section class="flex flex-wrap items-center gap-2">
        <span class="tui-label">Inactive ·</span>
        <UDropdownMenu
          v-for="group in inactiveGroups"
          :key="group.label"
          :items="group.items"
          :content="{ align: 'start' }"
          :ui="{ content: 'bg-raised border border-line-accent ring-0 max-h-80 overflow-y-auto', item: 'text-[12px]' }"
        >
          <button
            type="button"
            class="px-2 py-1 border border-line-soft text-[10.5px] text-muted hover:text-accent hover:border-line-accent cursor-pointer uppercase tracking-[0.06em]"
          >
            {{ group.label }} {{ group.count }} ▾
          </button>
        </UDropdownMenu>
        <span class="ml-auto text-[10.5px] text-ghost">never-used compounds hidden until searched (⌘K)</span>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor, COMPOUND_GROUPS, KNOWN_COMPOUNDS, STANDING_COMPOUNDS } from '~/data/journal'
import type { PeptideEntry } from '~/data/journal'
import { PK_MODELS, exposureSeries } from '#shared/utils/pk'
import type { AdherenceWeek } from '~/utils/adherence'
import { iuEquivalentLabel } from '~/utils/peptideCalc'

definePageMeta({ middleware: 'journal-auth' })

const { data, refresh, error } = await useJournalEntries()
const { data: labsData } = await useLabsEntries()
const { data: cyclesData } = await useCycles()
const { canEdit, role } = await useAuth()

onMounted(refresh)

const entries = computed(() => data.value ?? [])
const today = localToday()

/** A compound counts as "active protocol" if it was dosed inside this window. */
const ACTIVE_WINDOW = 21

interface Usage {
  compound: string
  daysUsed: number
  dates: string[]
  doses: PeptideEntry[]
}

const usage = computed(() => {
  const map = new Map<string, Usage>()
  for (const e of entries.value) {
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      const u = map.get(p.compound) ?? { compound: p.compound, daysUsed: 0, dates: [], doses: [] }
      if (u.dates.at(-1) !== e.date) {
        u.dates.push(e.date)
        u.daysUsed++
      }
      u.doses.push(p)
      map.set(p.compound, u)
    }
  }
  return map
})

const trackedCount = computed(() => new Set([...KNOWN_COMPOUNDS, ...usage.value.keys()]).size)

function daysAgo(date: string) {
  return Math.round(
    (new Date(today + 'T12:00:00').getTime() - new Date(date + 'T12:00:00').getTime()) / 86400000
  )
}

/**
 * Dose shorthand: the modal dose plus a cadence read off how often it was taken across the
 * active window — qd (daily), eod (every other day), or Nx/wk.
 */
function doseShorthand(u: Usage): string {
  const recent = u.doses.filter((_, i) => u.doses.length - i <= 40)
  const counts = new Map<string, number>()
  for (const d of recent) {
    const unit = d.unit === 'iu' ? 'iu' : d.unit
    counts.set(`${d.dose}${unit}`, (counts.get(`${d.dose}${unit}`) ?? 0) + 1)
  }
  const dose = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  const windowDates = u.dates.filter(d => daysAgo(d) <= ACTIVE_WINDOW)
  if (windowDates.length < 2) return dose
  const perWeek = (windowDates.length / ACTIVE_WINDOW) * 7
  if (perWeek >= 6.5) return `${dose} qd`
  if (perWeek >= 3 && perWeek <= 4) return `${dose} eod`
  return `${dose} ${Math.round(perWeek)}×/wk`
}

/** "today 03:58" / "yesterday" / "6d ago" for the last dose. */
function lastLabel(u: Usage): string {
  const last = u.dates.at(-1)
  if (!last) return '—'
  const ago = daysAgo(last)
  const time = u.doses.filter(d => d.time).at(-1)?.time
  if (ago === 0) return time ? `today ${time}` : 'today'
  if (ago === 1) return 'yesterday'
  return `${ago}d ago`
}

/**
 * Where this compound's run sits inside the whole tracked history, as a percentage bar —
 * so a compound started recently reads as a short bar at the right edge.
 */
function presenceBar(u: Usage) {
  const first = historyStart.value
  const spanDays = Math.max(1, daysAgo(first))
  const startPct = ((spanDays - daysAgo(u.dates[0]!)) / spanDays) * 100
  const endPct = ((spanDays - daysAgo(u.dates.at(-1)!)) / spanDays) * 100
  return { left: Math.max(0, startPct), width: Math.max(2, endPct - startPct) }
}

const historyStart = computed(() => {
  for (const e of entries.value) {
    if ((e.peptides ?? []).length) return e.date
  }
  return today
})

const active = computed(() =>
  [...usage.value.values()]
    .filter(u => daysAgo(u.dates.at(-1)!) <= ACTIVE_WINDOW)
    .sort((a, b) => b.daysUsed - a.daysUsed)
    .map(u => ({
      compound: u.compound,
      daysUsed: u.daysUsed,
      doseLabel: doseShorthand(u),
      lastLabel: lastLabel(u),
      presence: presenceBar(u)
    }))
)

// --- modeled exposure ---
const EXPOSURE_DAYS = 120

// One normalized series per PK-modeled compound with a dose inside the window. Each line is
// % of that compound's own window peak — hCG doses in IU and testosterone in mg can't share
// an absolute axis, and the model is only trustworthy about shape anyway.
const exposureSeriesRows = computed(() => {
  const from = localDaysAgo(EXPOSURE_DAYS - 1)
  const rows: Array<{ compound: string, points: Array<{ date: string, pct: number }> }> = []
  for (const [compound, model] of Object.entries(PK_MODELS)) {
    const doses = entries.value.flatMap(e =>
      (e.peptides ?? [])
        .filter(p => p.compound === compound)
        .map(p => ({ date: e.date, time: p.time, amount: p.dose }))
    )
    if (!doses.some(d => d.date >= from)) continue
    const points = exposureSeries(doses, model, from, today)
    const max = Math.max(...points.map(p => p.level))
    if (max <= 0) continue
    rows.push({
      compound,
      points: points.map(p => ({ date: p.date, pct: Math.round((p.level / max) * 1000) / 10 }))
    })
  }
  return rows
})

const exposureChart = computed(() => {
  const rows = exposureSeriesRows.value
  if (!rows.length) return { data: [], categories: {} as Record<string, { name: string, color: string }> }
  const categories: Record<string, { name: string, color: string }> = {}
  rows.forEach((row, i) => {
    categories[`c${i}`] = { name: row.compound, color: getCompoundColor(row.compound) }
  })
  const data = rows[0]!.points.map((p, idx) => {
    const point: Record<string, unknown> = { date: formatDate(p.date, 'monthDay') }
    rows.forEach((row, i) => {
      point[`c${i}`] = row.points[idx]?.pct
    })
    return point
  })
  return { data, categories }
})

const exposureMarks = computed(() => {
  const from = localDaysAgo(EXPOSURE_DAYS - 1)
  return (labsData.value ?? [])
    .filter(l => l.date >= from && l.date <= today)
    .map(l => formatDate(l.date, 'monthDay'))
})

// --- adherence ---
const ADHERENCE_WEEKS = 8

// The demo persona's dose dates re-anchor nightly and drift across weekdays by design, so
// weekday-based scoring would read as constant failure there — real sessions only. Planned
// cycles merge in through effectiveRules, overriding the standing cadence where they collide.
const adherence = computed(() =>
  role.value === 'demo'
    ? []
    : computeAdherence(entries.value, today, ADHERENCE_WEEKS, effectiveRules(cyclesData.value ?? []))
)

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

/** Hover tooltip with the mass equivalence for IU dose labels ("2iu qd", "250 IU"). */
function iuTitle(compound: string, label: string): string | undefined {
  if (!label.toLowerCase().includes('iu')) return undefined
  return iuEquivalentLabel(compound, parseFloat(label)) ?? undefined
}

// --- timeline gantt ---
const ZOOM_OPTS = ['week', 'month'] as const
const zoom = ref<'week' | 'month'>('month')
const showAllTimeline = ref(false)
const TIMELINE_PREVIEW = 3

const timelineLabel = computed(() => {
  const from = formatDate(historyStart.value, 'monthDay').toUpperCase()
  return `FULL TIMELINE · ${from} → NOW`
})

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d.toLocaleDateString('en-CA')
}

function slotKey(dateStr: string) {
  return zoom.value === 'week' ? getWeekStart(dateStr) : dateStr.slice(0, 7)
}

const slots = computed((): string[] => {
  const out: string[] = []
  if (zoom.value === 'week') {
    const cur = new Date(getWeekStart(historyStart.value) + 'T12:00:00')
    const end = new Date(getWeekStart(today) + 'T12:00:00')
    while (cur <= end) {
      out.push(cur.toLocaleDateString('en-CA'))
      cur.setDate(cur.getDate() + 7)
    }
  }
  else {
    let [y, m] = historyStart.value.split('-').map(Number) as [number, number]
    const [ey, em] = today.split('-').map(Number) as [number, number]
    while (y < ey || (y === ey && m <= em)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`)
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
  }
  return out
})

function slotLabel(slot: string) {
  if (zoom.value === 'month') {
    const [y, m] = slot.split('-').map(Number) as [number, number]
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
  }
  return `week of ${formatDate(slot, 'monthDay')}`
}

// Contiguous stretches of active slots become one bar, so a compound that ran Feb-Apr reads
// as a single duration instead of a row of disconnected ticks.
function toRuns(activeSlots: Set<string>, name: string) {
  const all = slots.value
  if (!all.length) return []
  const unit = 100 / all.length
  const runs: Array<{ left: number, width: number, title: string }> = []
  let start = -1
  for (let i = 0; i <= all.length; i++) {
    const on = i < all.length && activeSlots.has(all[i]!)
    if (on && start < 0) start = i
    if (!on && start >= 0) {
      runs.push({
        left: start * unit,
        width: (i - start) * unit,
        title: `${name} · ${slotLabel(all[start]!)} → ${slotLabel(all[i - 1]!)}`
      })
      start = -1
    }
  }
  return runs
}

const loggedTimelineRows = computed(() => {
  const bySlot = new Map<string, Set<string>>()
  const firstUse = new Map<string, string>()
  for (const e of entries.value) {
    const key = slotKey(e.date)
    for (const p of e.peptides ?? []) {
      if (!p.compound) continue
      const set = bySlot.get(p.compound) ?? new Set<string>()
      set.add(key)
      bySlot.set(p.compound, set)
      if (!firstUse.has(p.compound)) firstUse.set(p.compound, e.date)
    }
  }
  return [...bySlot.entries()]
    .sort(([a], [b]) => (firstUse.get(a) ?? '').localeCompare(firstUse.get(b) ?? ''))
    .map(([name, activeSlots]) => ({
      name,
      runs: toRuns(activeSlots, name),
      span: `${activeSlots.size}${zoom.value === 'week' ? 'w' : 'mo'}`
    }))
})

// Standing meds (STANDING_COMPOUNDS) as backfilled rows, same treatment as the calendar
// timeline: date ranges → bars clamped to the log window, since these never hit the dose log.
const standingTimelineRows = computed(() => {
  const all = slots.value
  if (!all.length) return []
  const unit = 100 / all.length
  // `covered` is a set because adjacent ranges (a dose-form switch mid-week) can land their
  // boundary in the same slot — counting per-range would tally that week twice.
  const byName = new Map<string, { name: string, covered: Set<number>, runs: Array<{ left: number, width: number, title: string }> }>()
  for (const s of STANDING_COMPOUNDS) {
    const endDate = s.to != null && s.to < today ? s.to : today
    const startKey = slotKey(s.from)
    const endKey = slotKey(endDate)
    if (endKey < all[0]!) continue // range ended before the log window
    const startIdx = all.indexOf(startKey) >= 0 ? all.indexOf(startKey) : 0
    const endIdx = all.indexOf(endKey) >= 0 ? all.indexOf(endKey) : all.length - 1
    const row = byName.get(s.compound) ?? { name: s.compound, covered: new Set<number>(), runs: [] }
    for (let i = startIdx; i <= endIdx; i++) row.covered.add(i)
    row.runs.push({
      left: startIdx * unit,
      width: (endIdx - startIdx + 1) * unit,
      title: `${s.compound} ${s.label} · ${formatDate(s.from)} → ${s.to ? formatDate(s.to) : 'now'}`
    })
    byName.set(s.compound, row)
  }
  return [...byName.values()].map(r => ({
    name: r.name,
    runs: r.runs,
    span: `${r.covered.size}${zoom.value === 'week' ? 'w' : 'mo'}`
  }))
})

/** Standing meds first (they predate the log), then logged compounds by first use. */
const timelineRows = computed(() => [...standingTimelineRows.value, ...loggedTimelineRows.value])

// The collapsed preview keeps the standing rows plus the first few logged ones, so adding a
// standing med never pushes a logged compound out of the default view.
const previewCount = computed(() => standingTimelineRows.value.length + TIMELINE_PREVIEW)
const visibleTimelineRows = computed(() =>
  showAllTimeline.value ? timelineRows.value : timelineRows.value.slice(0, previewCount.value)
)
const hiddenTimelineCount = computed(() => timelineRows.value.length - previewCount.value)

const labMarks = computed(() => {
  const all = slots.value
  if (!all.length) return []
  const unit = 100 / all.length
  const bySlot = new Map<string, string[]>()
  for (const lab of labsData.value ?? []) {
    const key = slotKey(lab.date)
    if (!all.includes(key)) continue
    bySlot.set(key, [...(bySlot.get(key) ?? []), lab.date])
  }
  return [...bySlot.entries()].map(([slot, dates]) => ({
    slot,
    left: (all.indexOf(slot) + 0.5) * unit,
    title: `lab draw · ${dates.map(d => formatDate(d)).join(', ')}`
  }))
})

const nowLeft = computed(() => {
  const all = slots.value
  const idx = all.indexOf(slotKey(today))
  return idx < 0 ? null : (idx + 1) * (100 / all.length)
})

// --- inactive, grouped ---
// Only compounds with logged history appear; never-used ones stay out until ⌘K surfaces them.
const inactiveGroups = computed(() => {
  const activeNames = new Set(active.value.map(a => a.compound))
  return Object.entries(COMPOUND_GROUPS)
    .map(([label, list]) => {
      const rows = list
        .filter(c => !activeNames.has(c) && usage.value.has(c))
        .sort((a, b) => usage.value.get(b)!.daysUsed - usage.value.get(a)!.daysUsed)
        .map(c => ({
          label: `${c} · ${usage.value.get(c)!.daysUsed}d`,
          to: `/journal/compound/${encodeURIComponent(c)}`
        }))
      // UDropdownMenu takes an array of groups, so the rows nest one level deeper than `count`.
      return { label, count: rows.length, items: [rows] }
    })
    .filter(g => g.count > 0)
})

useSeoMeta({ title: 'Journal · Compounds' })
</script>
