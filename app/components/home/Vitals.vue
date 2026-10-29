<template>
  <div>
    <!-- ‹ › scrub the card back a day at a time (Whoop's day picker, Jim 2026-10-26): the label
         names the shown day, the rows read "latest as of" it, and the deltas are that day's.
         Tapping TODAY returns; the state is the component's own and never reaches the URL. -->
    <TuiHeader
      :label="`${isToday ? 'TODAY' : label} · VITALS`"
      fill
    >
      <span class="flex items-center gap-1.5 text-meta">
        <button
          v-if="!isToday"
          type="button"
          class="text-accent hover:text-accent-hover cursor-pointer"
          @click="reset()"
        >today</button>
        <!-- ‹ hugs the left of its box and › the right (Jim 2026-10-29), so › ends flush with
             the deltas' right edge below instead of a few px inside it. -->
        <button
          type="button"
          class="inline-flex w-4 justify-start text-prose cursor-pointer disabled:cursor-default"
          :class="canBack ? 'text-faint hover:text-accent' : 'text-ghost'"
          :disabled="!canBack"
          :aria-label="`Show ${formatDate(shiftDays(asOf, -1), 'monthDay')}`"
          @click="step(-1)"
        >‹</button>
        <button
          type="button"
          class="inline-flex w-4 justify-end text-prose cursor-pointer disabled:cursor-default"
          :class="isToday ? 'text-ghost' : 'text-faint hover:text-accent'"
          :disabled="isToday"
          :aria-label="`Show ${formatDate(shiftDays(asOf, 1), 'monthDay')}`"
          @click="step(1)"
        >›</button>
      </span>
    </TuiHeader>

    <!-- Two-up tiles until lg: on a phone these rows used to fill the whole first screen on
         their own, pushing LOG TODAY and the quick-log buttons below the fold. From lg the block
         sits in the 390px column and the rows read as a list (label · value · delta) as before;
         `lg:contents` dissolves the value+unit wrapper so the delta's ml-auto works there. -->
    <div class="grid grid-cols-2 gap-x-4 gap-y-3 mt-3 lg:flex lg:flex-col lg:gap-3">
      <div
        v-for="row in rows"
        :key="row.label"
        class="flex flex-col min-w-0 lg:flex-row lg:items-baseline lg:gap-2"
        :title="row.title"
      >
        <span class="text-meta text-muted lg:w-18.5 lg:shrink-0">{{ row.label }}</span>
        <span class="flex items-baseline gap-1.5 mt-0.5 lg:contents">
          <span
            class="num-display text-figure leading-none"
            :class="row.tone === 'accent' ? 'text-accent' : row.tone === 'muted' ? 'text-muted' : 'text-hi'"
          >{{ row.value }}</span>
          <span
            v-if="row.unit"
            class="text-label text-muted whitespace-nowrap"
          >{{ row.unit }}</span>
        </span>
        <span
          v-if="row.delta"
          class="mt-1 text-meta lg:mt-0 lg:ml-auto lg:shrink-0"
          :class="row.delta.class"
        >{{ row.delta.text }}</span>
      </div>
    </div>

    <p
      v-if="!rows.length"
      class="mt-3 text-small text-muted"
    >
      {{ isToday ? 'No vitals logged yet.' : `Nothing logged by ${formatDate(asOf, 'monthDay')}.` }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { JournalEntry } from '~/data/journal'
import type { HealthMetricsEntry } from '#shared/types/journal'
import { RECOVERY_GREEN_MIN } from '#shared/utils/recovery'
import { shiftDays } from '#shared/utils/dates'

/**
 * The shown day, or null for today. A model so the page can follow it: the whole left column
 * scrubs with these arrows (workouts, doses, the INTAKE meters — and a swipe on a phone, which
 * the page owns). useDayScrub on this same ref is what both sides read.
 */
const shownDate = defineModel<string | null>('date', { default: null })

// Body signals only: PROTEIN moved to the page's INTAKE block with water and soda (option C of
// the 2026-10-29 side-panel canvas, Jim's pick).
const props = defineProps<{
  /** Journal entries, oldest first. */
  entries: JournalEntry[]
  /** Health-metrics entries, oldest first. */
  metrics: HealthMetricsEntry[]
}>()

type Direction = 'up-good' | 'up-bad' | 'neutral'

interface Row {
  label: string
  value: string
  unit?: string
  tone?: 'accent' | 'muted'
  title?: string
  delta?: { text: string, class: string }
}

// --- the shown day (useDayScrub: ‹ stops at the first day either series has) ---
const firstDate = computed(() => firstDateOf(props.entries, props.metrics))
const { asOf, isToday, canBack, label, step, reset } = useDayScrub(shownDate, firstDate)

// "Latest as of" the shown day (Jim's call over strict per-day values, which blank most days):
// each row is the newest reading on or before it, so a skipped weigh-in still shows the last
// weight, with the reading's date in the title when it isn't the shown day.
const entriesAsOf = computed(() => props.entries.filter(e => e.date <= asOf.value))
const metricsAsOf = computed(() => props.metrics.filter(m => m.date <= asOf.value))

/** Latest non-null reading (and its date) and the one before it, for a field on a dated series. */
function pair<T extends { date: string }>(list: T[], pick: (row: T) => number | null | undefined) {
  const rows = list.filter(r => pick(r) != null)
  const current = rows.at(-1)
  const prev = rows.length >= 2 ? rows.at(-2)! : null
  return {
    current: current ? pick(current)! : null,
    prev: prev ? pick(prev)! : null,
    title: current && current.date < asOf.value ? `last reading ${formatDate(current.date, 'monthDay')}` : undefined
  }
}

function fmtSleep(min: number) {
  // Round the total BEFORE splitting: floor/round separately turned 419.7 into "6h60m".
  const total = Math.round(min)
  return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}m`
}

// A rising weight/RHR is a "watch" (warn) rather than a failure; a falling HRV or
// recovery is bad news outright (danger). Strain is informational only.
function delta(current: number, prev: number, dir: Direction, unit = '', decimals = 1) {
  const diff = current - prev
  if (Math.abs(diff) < 10 ** -decimals / 2) return { text: '● even', class: 'text-muted' }
  const rising = diff > 0
  const magnitude = decimals === 0 ? Math.round(Math.abs(diff)).toString() : Math.abs(diff).toFixed(decimals)
  const text = `${rising ? '▲' : '▼'} ${rising ? '+' : '-'}${magnitude}${unit}`
  if (dir === 'neutral') return { text, class: 'text-muted' }
  const good = dir === 'up-good' ? rising : !rising
  if (good) return { text, class: 'text-accent' }
  // The "bad" direction reads as warn when it's a slow drift metric, danger when acute.
  return { text, class: dir === 'up-bad' ? 'text-warn' : 'text-danger' }
}

const rows = computed(() => {
  const out: Row[] = []

  const weight = pair(entriesAsOf.value, e => e.weight_lbs)
  if (weight.current != null) {
    out.push({
      label: 'WEIGHT',
      value: weight.current.toFixed(1),
      unit: 'lbs',
      title: weight.title,
      delta: weight.prev != null ? delta(weight.current, weight.prev, 'up-bad') : undefined
    })
  }

  const bpRow = entriesAsOf.value.findLast(e => e.bp_systolic != null && e.bp_diastolic != null)
  if (bpRow) {
    const sys = bpRow.bp_systolic!
    const dia = bpRow.bp_diastolic!
    const high = sys >= 130 || dia >= 85
    const elevated = sys >= 120 || dia >= 80
    out.push({
      label: 'BP',
      value: `${sys}/${dia}`,
      unit: 'mmHg',
      title: bpRow.date < asOf.value ? `last reading ${formatDate(bpRow.date, 'monthDay')}` : undefined,
      delta: {
        text: high ? '● high' : elevated ? '● watch' : '● ok',
        class: high ? 'text-danger' : elevated ? 'text-warn' : 'text-accent'
      }
    })
  }

  const rhr = pair(entriesAsOf.value, e => e.rhr)
  if (rhr.current != null) {
    out.push({
      label: 'RHR',
      value: Math.round(rhr.current).toString(),
      unit: 'bpm',
      title: rhr.title,
      delta: rhr.prev != null ? delta(rhr.current, rhr.prev, 'up-bad', '', 0) : undefined
    })
  }

  const hrv = pair(entriesAsOf.value, e => e.hrv)
  if (hrv.current != null) {
    out.push({
      label: 'HRV',
      value: Math.round(hrv.current).toString(),
      unit: 'ms',
      title: hrv.title,
      delta: hrv.prev != null ? delta(hrv.current, hrv.prev, 'up-good', '', 0) : undefined
    })
  }

  const sleep = pair(metricsAsOf.value, m => m.sleep_total_min)
  if (sleep.current != null) {
    out.push({
      label: 'SLEEP',
      value: fmtSleep(sleep.current),
      title: sleep.title,
      delta: sleep.prev != null
        ? delta(sleep.current, sleep.prev, 'up-good', 'm', 0)
        : undefined
    })
  }

  const recovery = pair(metricsAsOf.value, m => m.recovery_score)
  if (recovery.current != null) {
    out.push({
      label: 'RECOVERY',
      value: `${Math.round(recovery.current)}%`,
      tone: recovery.current >= RECOVERY_GREEN_MIN ? 'accent' : undefined,
      title: recovery.title,
      delta: recovery.prev != null ? delta(recovery.current, recovery.prev, 'up-good', '', 0) : undefined
    })
  }

  const strain = pair(metricsAsOf.value, m => m.strain)
  if (strain.current != null) {
    out.push({
      label: 'STRAIN',
      value: strain.current.toFixed(1),
      title: strain.title,
      delta: strain.prev != null ? delta(strain.current, strain.prev, 'neutral') : undefined
    })
  }

  return out
})
</script>
