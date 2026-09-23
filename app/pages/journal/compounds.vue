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
            class="grid grid-cols-[1fr_auto] lg:grid-cols-[180px_60px_100px_minmax(0,1fr)_140px] gap-x-3 gap-y-1.5 items-center px-3 py-2 bg-raised hover:bg-row-hover transition-colors text-[12px]"
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
        <JournalAdherenceTable :rows="adherence" />
        <p class="mt-1.5 text-[11px] text-faint leading-[1.6]">
          Weeks score logged dose-days against the intended cadence, so a shot slid by a day still counts. As-needed compounds aren't scored.
        </p>
      </section>

      <!-- Full timeline gantt -->
      <section v-if="hasDoses">
        <JournalProtocolTimeline
          v-model:zoom="zoom"
          :label="timelineLabel"
          :entries="entries"
          :lab-dates="labDates"
          :from="historyStart"
          :today="today"
          :preview="TIMELINE_PREVIEW"
        />
      </section>

      <!-- Inactive, grouped into category chips -->
      <section class="flex flex-wrap items-center gap-2">
        <span class="tui-label">Inactive ·</span>
        <UDropdownMenu
          v-for="group in inactiveGroups"
          :key="group.label"
          :items="group.items"
          :content="{ align: 'start' }"
          :ui="{ content: 'max-h-80 overflow-y-auto' }"
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
import { diffDays } from '#shared/utils/dates'
import { getCompoundColor, COMPOUND_GROUPS, KNOWN_COMPOUNDS } from '~/data/journal'
import type { PeptideEntry } from '~/data/journal'
import { PK_MODELS, exposureSeries, pkDosesFor } from '#shared/utils/pk'
import { ruleActiveOn } from '#shared/utils/protocolRules'
import type { TimelineZoom } from '#shared/utils/timeline'
import { iuEquivalentLabel } from '#shared/utils/peptideCalc'

useSeoMeta({ title: 'Journal · Compounds' })

const { data, refresh, error } = await useJournalEntries()
const { data: labsData } = await useLabsEntries()
const { data: cyclesData } = await useCycles()
const { canEdit, role } = await useAuth()

const entries = computed(() => data.value ?? [])
const today = localToday()

/**
 * A compound counts as "active protocol" if it was dosed inside this window. Two weeks: long
 * enough that a twice-weekly compound has several doses to read a cadence from, short enough
 * that something stopped a fortnight ago has left the list (was 21d, which kept BPC-157 around).
 */
const ACTIVE_WINDOW = 14

// The standing schedule with planned cycles layered in (override semantics — see mergeRules):
// the intent both the dose shorthand and the adherence panel read. Empty for the demo persona,
// whose dose dates re-anchor nightly and drift across weekdays by design, so weekday-based
// scoring would read as constant failure there.
const scheduleRules = computed(() => role.value === 'demo' ? [] : effectiveRules(cyclesData.value ?? []))

interface Usage {
  compound: string
  daysUsed: number
  dates: string[]
  doses: (PeptideEntry & { date: string })[]
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
      u.doses.push({ ...p, date: e.date })
      map.set(p.compound, u)
    }
  }
  return map
})

const trackedCount = computed(() => new Set([...KNOWN_COMPOUNDS, ...usage.value.keys()]).size)

function daysAgo(date: string) {
  return diffDays(date, today)
}

/**
 * Dose shorthand: the current dose plus a cadence — qd (daily), eod (every other day), or Nx/wk.
 *
 * Dose: the last three logged doses when they agree (a change held for three doses is deliberate —
 * hCG 250 → 300 IU shows after one week instead of once it outvotes the old amount), otherwise the
 * mode over the active window with ties to the most recent dose.
 *
 * Cadence: the schedule rule's intent when one is active, so a daily compound with a travel gap
 * still reads "qd" rather than the "6×/wk" its logged days round to. Observed cadence only for
 * compounds without a rule (as-needed BPC-157, the demo persona).
 */
function doseShorthand(u: Usage): string {
  const key = (d: Usage['doses'][number]) => `${d.dose}${d.unit}`
  const lastThree = u.doses.slice(-3)
  let dose: string
  if (lastThree.length === 3 && lastThree.every(d => key(d) === key(lastThree[0]!))) {
    dose = key(lastThree[0]!)
  }
  else {
    const inWindow = u.doses.filter(d => daysAgo(d.date) <= ACTIVE_WINDOW)
    const recent = inWindow.length ? inWindow : u.doses.slice(-40)
    const counts = new Map<string, { n: number, lastIdx: number }>()
    recent.forEach((d, i) => {
      const c = counts.get(key(d)) ?? { n: 0, lastIdx: -1 }
      c.n++
      c.lastIdx = i
      counts.set(key(d), c)
    })
    dose = [...counts.entries()]
      .sort((a, b) => b[1].n - a[1].n || b[1].lastIdx - a[1].lastIdx)[0]?.[0] ?? '—'
  }

  const rule = scheduleRules.value.find(r => r.compound === u.compound && ruleActiveOn(r, today))
  if (rule) return rule.weekdays.length === 7 ? `${dose} qd` : `${dose} ${rule.weekdays.length}×/wk`

  const windowDates = u.dates.filter(d => daysAgo(d) <= ACTIVE_WINDOW)
  if (windowDates.length < 2) return dose
  // The window is inclusive on both ends, so it spans ACTIVE_WINDOW + 1 days.
  const perWeek = (windowDates.length / (ACTIVE_WINDOW + 1)) * 7
  if (perWeek >= 6) return `${dose} qd`
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
    const doses = pkDosesFor(entries.value, compound, model)
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

// scheduleRules is already empty for the demo persona, which makes this [] there.
const adherence = computed(() =>
  computeAdherence(entries.value, today, ADHERENCE_WEEKS, scheduleRules.value)
)

/** Hover tooltip with the mass equivalence for IU dose labels ("2iu qd", "250 IU"). */
function iuTitle(compound: string, label: string): string | undefined {
  if (!label.toLowerCase().includes('iu')) return undefined
  return iuEquivalentLabel(compound, parseFloat(label)) ?? undefined
}

// --- timeline gantt (engine: shared/utils/timeline.ts) ---
const zoom = ref<TimelineZoom>('month')
const TIMELINE_PREVIEW = 3
const hasDoses = computed(() => entries.value.some(e => (e.peptides ?? []).length))
const labDates = computed(() => (labsData.value ?? []).map(l => l.date))

const timelineLabel = computed(() => {
  const from = formatDate(historyStart.value, 'monthDay').toUpperCase()
  return `FULL TIMELINE · ${from} → NOW`
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
</script>
