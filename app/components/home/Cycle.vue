<template>
  <div v-if="cycle">
    <TuiHeader
      :label="`CYCLE · ${cycle.name.toUpperCase()}`"
      :dashes="4"
      class="mt-4.5"
    />

    <!-- ACTIVE: progress, dosing status, what's next -->
    <template v-if="state === 'active'">
      <div class="flex items-baseline gap-2.5 mt-2.5 text-[12px]">
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
        <span
          v-if="pct != null"
          class="text-[11px]"
          :class="pctClass"
        >{{ pct }}%</span>
      </div>

      <div class="flex flex-col gap-1 mt-2 text-[12px]">
        <div
          v-for="row in doseRows"
          :key="row.compound"
          class="flex gap-2.5"
        >
          <span class="text-ghost shrink-0">├</span>
          <NuxtLink
            :to="`/journal/compound/${encodeURIComponent(row.compound)}`"
            class="text-body hover:text-accent truncate"
          >{{ row.compound }} {{ row.doseLabel }}</NuxtLink>
          <span
            class="ml-auto shrink-0 text-[10.5px] tracking-[0.06em]"
            :class="STATUS_CLASSES[row.status.kind]"
          >{{ row.status.label }}</span>
        </div>
        <div
          v-if="nextPhase"
          class="flex gap-2.5"
        >
          <span class="text-ghost shrink-0">├</span>
          <span class="text-muted truncate">{{ nextPhase }}</span>
        </div>
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">└</span>
          <span
            class="truncate"
            :class="drawLine.class"
          >{{ drawLine.text }}</span>
        </div>
      </div>
      <div
        v-if="chips.length"
        class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 pl-5 text-[11px]"
      >
        <span
          v-for="chip in chips"
          :key="chip.key"
          :class="chip.class"
        >{{ chip.text }}</span>
      </div>
    </template>

    <!-- UPCOMING: pre-flight — baseline draw + gating markers + the plan -->
    <template v-else-if="state === 'upcoming'">
      <div class="flex flex-col gap-1 mt-2.5 text-[12px]">
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">├</span>
          <NuxtLink
            :to="dossier"
            class="text-hi hover:text-accent"
          >starts in {{ startsIn }}d</NuxtLink>
          <span class="ml-auto shrink-0 text-muted">{{ formatDate(cycle.start_date, 'monthDay') }}</span>
        </div>
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">├</span>
          <span :class="drawLine.class">{{ drawLine.text }}</span>
        </div>
        <div
          v-for="(line, i) in planLines"
          :key="line"
          class="flex gap-2.5"
        >
          <span class="text-ghost shrink-0">{{ i === planLines.length - 1 ? '└' : '├' }}</span>
          <span class="text-muted truncate">{{ line }}</span>
        </div>
      </div>
      <div
        v-if="chips.length"
        class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 pl-5 text-[11px]"
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
      <div class="flex flex-col gap-1 mt-2.5 text-[12px]">
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">├</span>
          <NuxtLink
            :to="dossier"
            class="text-hi hover:text-accent"
          >ended {{ formatDate(end, 'monthDay') }}</NuxtLink>
          <span class="ml-auto shrink-0 text-muted">{{ progress.totalWeeks }} wks{{ pct != null ? ` · ${pct}%` : '' }}</span>
        </div>
        <div class="flex gap-2.5">
          <span class="text-ghost shrink-0">└</span>
          <span :class="drawLine.class">{{ drawLine.text }}</span>
        </div>
      </div>
      <div
        v-if="chips.length"
        class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 pl-5 text-[11px]"
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
import type { LabsEntry } from '~/composables/useLabsEntries'
import { BIOMARKERS, getStatus } from '~/data/biomarkers'
import type { Cycle } from '#shared/utils/cycles'
import {
  GATING_MARKERS, checkpointStates, cycleEnd, cycleProgress, cycleStatusOn,
  diffDays, doseLabelOf, relevantCycle
} from '#shared/utils/cycles'

// The one-glance cycle strip for the home dashboard's protocol column. Three states:
// pre-flight for an upcoming cycle (baseline draw + gating markers), progress + due-status
// while active, and the recovery story for ~8 weeks after the end. Renders nothing when no
// cycle is close enough to matter — most of the year this component is invisible.
const props = defineProps<{
  cycles: Cycle[]
  entries: JournalEntry[]
  draws: LabsEntry[]
}>()

const today = localToday()

const cycle = computed(() => relevantCycle(props.cycles, today))
const state = computed(() => cycle.value ? cycleStatusOn(cycle.value, today) : 'done')
const end = computed(() => cycle.value ? cycleEnd(cycle.value) : today)
const progress = computed(() => cycle.value ? cycleProgress(cycle.value, today) : { day: 0, week: 0, totalDays: 1, totalWeeks: 0, pct: 0 })
const startsIn = computed(() => cycle.value ? diffDays(today, cycle.value.start_date) : 0)
const dossier = computed(() => `/journal/cycle/${cycle.value?.id}`)

const STATUS_CLASSES: Record<string, string> = {
  done: 'text-accent',
  due: 'text-hi',
  overdue: 'text-warn',
  next: 'text-muted'
}

const adherence = computed(() =>
  cycle.value && state.value !== 'upcoming'
    ? cycleAdherence(props.entries, cycle.value, today)
    : { rows: [], pct: null }
)
const pct = computed(() => adherence.value.pct)
const pctClass = computed(() => {
  if (pct.value == null) return 'text-muted'
  if (pct.value >= 90) return 'text-accent'
  return pct.value >= 70 ? 'text-dim' : 'text-warn'
})

/** Per-compound due/done status, only for plan items whose window covers today. */
const doseRows = computed(() =>
  adherence.value.rows.filter(r => r.status.label !== '—').slice(0, 3)
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
  cycle.value ? checkpointStates(cycle.value, props.draws.map(d => d.date), today) : []
)

/** The single draw-status line for the current state: baseline before, next due during,
 * recovery after. */
const drawLine = computed(() => {
  const byKey = (k: string) => checkpoints.value.find(cp => cp.key === k)
  if (state.value === 'upcoming') {
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
  const lastDraw = [...props.draws].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  const ago = lastDraw ? ` · last draw ${diffDays(lastDraw.date, today)}d ago` : ''
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
    const fmt = (v: number) => Number.isInteger(v) ? v.toString() : v.toFixed(v < 10 ? 1 : 0)
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
