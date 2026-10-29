<template>
  <div v-if="cycle">
    <!-- The header carries when (option C of the 2026-10-29 side-panel canvas, Jim's pick); the
         name gets its own line, which wraps — a long plan name used to truncate in the header,
         and every line below wraps too rather than cutting off mid-compound. -->
    <TuiHeader
      :label="headerLabel"
      fill
      class="mt-4.5"
    >
      <span
        v-if="state === 'upcoming'"
        class="text-label tracking-[0.06em]"
        :class="tentativeStart ? 'text-dim' : 'text-muted'"
      >{{ tentativeStart ? 'NO DATE SET' : formatDate(cycle.start_date, 'monthDay').toUpperCase() }}</span>
    </TuiHeader>
    <NuxtLink
      :to="dossier"
      class="block mt-2.5 text-small text-hi hover:text-accent"
    >{{ nameParts.main }}<span
      v-if="nameParts.note"
      class="text-muted"
    >{{ ` ${nameParts.note}` }}</span></NuxtLink>

    <!-- ACTIVE: progress, dosing status, what's next. The figure after the bar is the bar's own
         number (time through the cycle); adherence sits on the dose row as "taken", where it
         belongs — "100%" next to a five-sevenths bar read as a contradiction. -->
    <template v-if="state === 'active'">
      <div class="flex items-baseline gap-2.5 mt-1.5 text-small">
        <NuxtLink
          :to="dossier"
          class="text-hi hover:text-accent whitespace-nowrap"
        >day {{ progress.day }}/{{ progress.totalDays }}</NuxtLink>
        <span class="text-muted whitespace-nowrap">wk {{ progress.week }} of {{ progress.totalWeeks }}</span>
        <span class="flex-1 h-1.25 bg-line-soft relative min-w-0">
          <span
            class="absolute inset-y-0 left-0 bg-accent opacity-70"
            :style="{ width: `${progress.pct}%` }"
          />
        </span>
        <span class="text-meta text-muted">{{ progress.pct }}%</span>
      </div>

      <div class="flex flex-col gap-1 mt-2 text-small">
        <div
          v-for="row in doseRows"
          :key="row.compound"
          class="flex gap-2.5"
        >
          <span class="text-ghost shrink-0">├</span>
          <NuxtLink
            :to="`/journal/compound/${encodeURIComponent(row.compound)}`"
            class="text-body hover:text-accent min-w-0"
          >{{ row.compound }} {{ row.doseLabel }}</NuxtLink>
          <span
            class="ml-auto shrink-0 text-label tracking-[0.06em]"
            :class="STATUS_CLASSES[row.status.kind]"
          >{{ row.status.label }}<span
            v-if="row.taken"
            class="text-muted"
          > · {{ row.taken.hit }}/{{ row.taken.exp }} taken</span></span>
        </div>
        <div
          v-if="nextPhase"
          class="flex gap-2.5"
        >
          <span class="text-ghost shrink-0">├</span>
          <span class="text-muted min-w-0">{{ nextPhase }}</span>
        </div>
        <div
          v-if="vitalsLine"
          class="flex gap-2.5"
        >
          <span class="text-ghost shrink-0">├</span>
          <span
            class="min-w-0"
            :class="vitalsLine.class"
          >{{ vitalsLine.text }}</span>
        </div>
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">└</span>
          <span
            class="min-w-0"
            :class="drawLine.class"
          >{{ drawLine.text }}</span>
        </div>
      </div>
      <div
        v-if="chips.length"
        class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 pl-5 text-meta"
      >
        <span
          v-for="chip in chips"
          :key="chip.key"
          :class="chip.class"
        >{{ chip.text }}</span>
      </div>
    </template>

    <!-- UPCOMING: pre-flight — baseline draw + gating markers + the plan. A tentative start
         (month/quarter) swaps the countdown for the period it's pencilled in for; there's no
         day to count to. -->
    <template v-else-if="state === 'upcoming'">
      <div class="flex flex-col gap-1 mt-1.5 text-small">
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">├</span>
          <span
            class="min-w-0"
            :class="drawLine.class"
          >{{ drawLine.text }}</span>
        </div>
        <div
          v-for="(line, i) in planLines"
          :key="line"
          class="flex gap-2.5"
        >
          <span class="text-ghost shrink-0">{{ i === planLines.length - 1 ? '└' : '├' }}</span>
          <span class="text-muted min-w-0">{{ line }}</span>
        </div>
      </div>
      <div
        v-if="chips.length"
        class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 pl-5 text-meta"
      >
        <span
          v-for="chip in chips"
          :key="chip.key"
          :class="chip.class"
        >{{ chip.text }}</span>
      </div>
    </template>

    <!-- DONE (recent): the recovery story -->
    <template v-else>
      <div class="flex flex-col gap-1 mt-1.5 text-small">
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">├</span>
          <NuxtLink
            :to="dossier"
            class="text-hi hover:text-accent"
          >ended {{ formatDate(end, 'monthDay') }}</NuxtLink>
          <span class="ml-auto shrink-0 text-muted">{{ progress.totalWeeks }} wks{{ pct != null ? ` · ${pct}% taken` : '' }}</span>
        </div>
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">└</span>
          <span :class="drawLine.class">{{ drawLine.text }}</span>
        </div>
      </div>
      <div
        v-if="chips.length"
        class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 pl-5 text-meta"
      >
        <span
          v-for="chip in chips"
          :key="chip.key"
          :class="chip.class"
        >{{ chip.text }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { JournalEntry } from '~/data/journal'
import type { LabsEntry } from '#shared/types/labs'
import type { HealthMetricsEntry } from '#shared/types/journal'
import { BIOMARKERS, getStatus } from '~/data/biomarkers'
import type { Cycle } from '#shared/utils/cycles'
import {
  BASELINE_LOOKBACK_DAYS, GATING_MARKERS, checkpointStates, cycleEnd, cycleProgress,
  cycleStatusOn, doseLabelOf, relevantCycle, tentativeStartLabel
} from '#shared/utils/cycles'
import { diffDays } from '#shared/utils/dates'
import { activeSignals, computeCycleSignals, signalShorthand } from '#shared/utils/cycleSignals'

// The one-glance cycle strip for the home dashboard's protocol column. Three states:
// pre-flight for an upcoming cycle (baseline draw + gating markers), progress + due-status
// while active, and the recovery story for ~8 weeks after the end. Renders nothing when no
// cycle is close enough to matter — most of the year this component is invisible.
//
// A cycle with a tentative start (month/quarter, no day picked) reads as pre-flight with the
// countdown and baseline window replaced by what's actually known: the period it's pencilled
// in for, and whether a fresh enough draw is in hand for whenever it begins.
const props = defineProps<{
  cycles: Cycle[]
  entries: JournalEntry[]
  draws: LabsEntry[]
  healthMetrics: HealthMetricsEntry[]
}>()

const today = useToday()

const cycle = computed(() => relevantCycle(props.cycles, today.value))
const state = computed(() => cycle.value ? cycleStatusOn(cycle.value, today.value) : 'done')
const end = computed(() => cycle.value ? cycleEnd(cycle.value) : today.value)
const progress = computed(() => cycle.value ? cycleProgress(cycle.value, today.value) : { day: 0, week: 0, totalDays: 1, totalWeeks: 0, pct: 0 })
const startsIn = computed(() => cycle.value ? diffDays(today.value, cycle.value.start_date) : 0)
const dossier = computed(() => `/journal/cycle/${cycle.value?.id}`)

/** "Oct 2026"/"Q4 2026" when the start isn't a picked day yet, else null. */
const tentativeStart = computed(() => cycle.value ? tentativeStartLabel(cycle.value) : null)

/** "CYCLE · Q2 2027" / "CYCLE · STARTS IN 12D" before the start; plain "CYCLE" after, where
 * the rows under it carry the day count or the end date. */
const headerLabel = computed(() => {
  if (state.value !== 'upcoming') return 'CYCLE'
  return tentativeStart.value ? `CYCLE · ${tentativeStart.value.toUpperCase()}` : `CYCLE · STARTS IN ${startsIn.value}D`
})

/** The name with a trailing "[…]" aside split off to be muted: "Test + HGH [+ Anavar maybe]". */
const nameParts = computed(() => {
  const name = cycle.value?.name ?? ''
  const m = /^(.*?)\s*(\[[^\]]*\])$/.exec(name)
  return m && m[1] ? { main: m[1], note: m[2] } : { main: name, note: null }
})

/** Newest draw on file — the baseline candidate for a cycle with no dated window. */
const latestDraw = computed(() =>
  [...props.draws].sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null
)

const STATUS_CLASSES: Record<string, string> = {
  done: 'text-accent',
  due: 'text-hi',
  overdue: 'text-warn',
  next: 'text-muted'
}

const adherence = computed(() =>
  cycle.value && state.value !== 'upcoming'
    ? cycleAdherence(props.entries, cycle.value, today.value)
    : { rows: [], pct: null }
)
const pct = computed(() => adherence.value.pct)

/** Per-compound due/done status, only for plan items whose window covers today, with the
 * item's own taken/expected count across the cycle so far (hits capped per week, as the
 * dossier scores them). */
const doseRows = computed(() =>
  adherence.value.rows
    .filter(r => r.status.label !== '—')
    .slice(0, 3)
    .map((r) => {
      const t = r.weeks.reduce(
        (acc, w) => ({ exp: acc.exp + w.expected, hit: acc.hit + Math.min(w.actual, w.expected) }),
        { exp: 0, hit: 0 }
      )
      return { ...r, taken: t.exp ? t : null }
    })
)

/** "Oxandrolone 25 mg starts wk 12 (in 7 wks)" for the nearest not-yet-started item. */
const nextPhase = computed(() => {
  if (!cycle.value || state.value !== 'active') return null
  const week = progress.value.week
  const later = cycle.value.compounds
    .filter(item => item.fromWeek > week)
    .sort((a, b) => a.fromWeek - b.fromWeek)[0]
  if (!later) return null
  const inWeeks = later.fromWeek - week
  return `${later.compound} ${doseLabelOf(later)} starts wk ${later.fromWeek} (in ${inWeeks} wk${inWeeks > 1 ? 's' : ''})`
})

const checkpoints = computed(() =>
  cycle.value ? checkpointStates(cycle.value, props.draws.map(d => d.date), today.value) : []
)

/** The passive vitals watch, one line: flagged/watch shorthands, or a quiet "steady" so the
 * monitoring itself is visible. Omitted entirely when no metric has enough data yet. */
const vitalsLine = computed(() => {
  if (!cycle.value || state.value !== 'active') return null
  const signals = computeCycleSignals(cycle.value, today.value, props.entries, props.healthMetrics)
  if (!signals.some(s => s.state === 'steady' || s.state === 'watch' || s.state === 'flagged')) return null
  const act = activeSignals(signals)
  if (!act.length) return { text: 'vitals steady vs pre-cycle baseline', class: 'text-muted' }
  // Adverse moves own the line — an improvement doesn't belong inside a red warning. Only
  // when nothing is wrong do the good-direction moves get their (accent) turn.
  const adverse = act.filter(s => s.adverse)
  const shown = adverse.length ? adverse : act
  const parts = shown.slice(0, 3).map(signalShorthand)
  return {
    text: `${adverse.length ? '▲ ' : ''}${parts.join(' · ')}${shown.length > 3 ? ' · …' : ''}`,
    class: adverse.some(s => s.state === 'flagged') ? 'text-danger' : adverse.length ? 'text-warn' : 'text-accent'
  }
})

/** The single draw-status line for the current state: baseline before, next due during,
 * recovery after. */
const drawLine = computed(() => {
  const byKey = (k: string) => checkpoints.value.find(cp => cp.key === k)
  if (state.value === 'upcoming') {
    // With no committed start there's no baseline window to sit inside, so the answerable
    // question shifts from "did a draw land in the window?" to "is one fresh enough to still
    // serve as baseline whenever this starts?".
    if (tentativeStart.value) {
      const last = latestDraw.value
      if (!last) return { text: '⚠ no draw on file — get a baseline before you start', class: 'text-warn' }
      const age = diffDays(last.date, today.value)
      return age <= BASELINE_LOOKBACK_DAYS
        ? { text: `baseline ready · ${formatDate(last.date, 'monthDay')} draw, ${age}d old`, class: 'text-muted' }
        : { text: `⚠ last draw ${age}d ago — get a fresh baseline before you start`, class: 'text-warn' }
    }
    const baseline = byKey('baseline')
    if (baseline?.drawDate) return { text: `baseline draw ✓ ${formatDate(baseline.drawDate, 'monthDay')}`, class: 'text-muted' }
    return { text: '⚠ no baseline draw yet — get one before the start', class: 'text-warn' }
  }
  if (state.value === 'done') {
    const recovery = byKey('recovery')
    if (recovery?.drawDate) return { text: `recovery draw ✓ ${formatDate(recovery.drawDate, 'monthDay')}`, class: 'text-muted' }
    if (recovery?.state === 'missed') return { text: 'recovery draw never happened', class: 'text-warn' }
    return {
      text: `recovery draw ${recovery?.state === 'due' ? 'due now' : 'due'} ${formatDate(recovery!.windowFrom, 'monthDay')}–${formatDate(recovery!.windowTo, 'monthDay')}`,
      class: recovery?.state === 'due' ? 'text-hi' : 'text-muted'
    }
  }
  const next = checkpoints.value.find(cp => cp.state === 'due' || cp.state === 'upcoming')
  const ago = latestDraw.value ? ` · last draw ${diffDays(latestDraw.value.date, today.value)}d ago` : ''
  if (!next) return { text: `all checkpoints drawn${ago}`, class: 'text-muted' }
  return {
    text: `${next.label} ${next.state === 'due' ? 'due now' : `~${formatDate(next.windowFrom, 'monthDay')}`}${ago}`,
    class: next.state === 'due' ? 'text-hi' : 'text-muted'
  }
})

/** First-week compounds for the pre-flight view, later phases called out separately. */
const planLines = computed(() => {
  if (!cycle.value) return []
  const first = cycle.value.compounds.filter(i => i.fromWeek === 1)
  const later = cycle.value.compounds.filter(i => i.fromWeek > 1).sort((a, b) => a.fromWeek - b.fromWeek)
  const lines = [
    `wk 1: ${first.map(i => `${i.compound} ${doseLabelOf(i)}`).join(' + ') || '—'}`
  ]
  for (const item of later) lines.push(`wk ${item.fromWeek}: +${item.compound} ${doseLabelOf(item)}`)
  return lines
})

/** Gating markers off the most relevant draw: pre-flight shows the baseline picture, active
 * and done states diff the latest on/post-cycle draw against baseline. */
const chips = computed(() => {
  if (!cycle.value) return []
  const sorted = [...props.draws].sort((a, b) => a.date.localeCompare(b.date))
  const baseline = checkpoints.value.find(cp => cp.key === 'baseline')?.drawDate ?? null
  const baseDraw = baseline ? sorted.find(d => d.date === baseline) : null

  let draw: LabsEntry | undefined | null = null
  let diffAgainstBaseline = false
  if (state.value === 'upcoming') {
    draw = baseDraw ?? sorted.at(-1)
  }
  else {
    // Latest draw since the start — mid/end/recovery, whichever exists.
    draw = sorted.filter(d => d.date >= cycle.value!.start_date).at(-1)
    diffAgainstBaseline = !!baseDraw && draw?.date !== baseDraw?.date
  }
  if (!draw) return []

  const out: Array<{ key: string, text: string, class: string }> = []
  for (const key of GATING_MARKERS) {
    const value = draw.markers[key]
    if (value == null) continue
    const meta = BIOMARKERS[key]
    const label = meta?.label ?? key
    const s = meta ? getStatus(value, meta) : 'normal'
    const cls = s === 'high' ? 'text-danger' : s === 'low' ? 'text-warn' : s === 'optimal' ? 'text-accent' : 'text-dim'
    // One decimal at most, trailing zero dropped: 51.7 stays 51.7 (it rounded to "52" for values
    // of 10 and up, Jim 2026-10-29), 35.0 reads 35.
    const fmt = (v: number) => Number(v.toFixed(1)).toString()
    const prior = diffAgainstBaseline ? baseDraw?.markers[key] : null
    out.push({
      key,
      text: prior != null ? `${label} ${fmt(prior)}→${fmt(value)}` : `${label} ${fmt(value)} ${s === 'high' || s === 'low' ? '⚠' : '✓'}`,
      class: cls
    })
  }
  return out
})
</script>
