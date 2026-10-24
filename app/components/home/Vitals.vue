<template>
  <div>
    <TuiHeader
      label="TODAY · VITALS"
      fill
    />

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
        <!-- Progress toward a target (protein) in the delta's place. -->
        <span
          v-else-if="row.bar"
          class="mt-1.5 flex items-center gap-2 lg:mt-0 lg:ml-auto lg:shrink-0"
        >
          <span class="relative h-1.25 w-22 lg:w-16 bg-line-soft overflow-hidden">
            <span
              class="absolute inset-y-0 left-0 bg-accent opacity-70"
              :style="{ width: `${Math.min(100, row.bar.pct)}%` }"
            />
          </span>
          <span
            class="text-meta"
            :class="row.bar.class"
          >{{ row.bar.pct }}%</span>
        </span>
      </div>
    </div>

    <p
      v-if="!rows.length"
      class="mt-3 text-small text-muted"
    >
      No vitals logged yet.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { JournalEntry } from '~/data/journal'
import type { HealthMetricsEntry } from '#shared/types/journal'
import { RECOVERY_GREEN_MIN } from '#shared/utils/recovery'

const props = defineProps<{
  /** Journal entries, oldest first. */
  entries: JournalEntry[]
  /** Health-metrics entries, oldest first. */
  metrics: HealthMetricsEntry[]
  /**
   * Today's protein from the meal figures (shared/utils/nutrition.ts dayNutrition), for the
   * PROTEIN row beside WEIGHT. `grams` is null until a meal with figures is logged — the row then
   * reads a muted "—" rather than a loud zero first thing in the morning. `floor` marks a day
   * with a meal that has no figures yet. Absent (undefined) for roles without food (doctor).
   */
  protein?: { grams: number | null, target: number | null, floor: boolean } | null
}>()

type Direction = 'up-good' | 'up-bad' | 'neutral'

interface Row {
  label: string
  value: string
  unit?: string
  tone?: 'accent' | 'muted'
  title?: string
  delta?: { text: string, class: string }
  bar?: { pct: number, class: string }
}

/** Latest non-null reading and the one before it, for a field on a dated series. */
function pair<T>(list: T[], pick: (row: T) => number | null | undefined) {
  const values = list.map(pick).filter((v): v is number => v != null)
  return { current: values.at(-1) ?? null, prev: values.length >= 2 ? values.at(-2)! : null }
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

/** The PROTEIN row: grams against the profile's target, a bar when both are known. */
function proteinRow(p: NonNullable<typeof props.protein>): Row {
  const unit = p.target ? `/ ${p.target} g${p.floor ? ' +' : ''}` : `g${p.floor ? ' +' : ''}`
  const title = p.floor ? 'A meal today has no figures yet — this is a floor' : undefined
  if (p.grams == null) return { label: 'PROTEIN', value: '—', unit, tone: 'muted', title }
  const grams = Math.round(p.grams)
  if (!p.target) return { label: 'PROTEIN', value: grams.toString(), unit, title }
  const pct = Math.round((grams / p.target) * 100)
  const met = pct >= 100
  return {
    label: 'PROTEIN',
    value: grams.toString(),
    unit,
    tone: met ? 'accent' : undefined,
    title,
    bar: { pct, class: met ? 'text-accent' : 'text-muted' }
  }
}

const rows = computed(() => {
  const out: Row[] = []

  const weight = pair(props.entries, e => e.weight_lbs)
  if (weight.current != null) {
    out.push({
      label: 'WEIGHT',
      value: weight.current.toFixed(1),
      unit: 'lbs',
      delta: weight.prev != null ? delta(weight.current, weight.prev, 'up-bad') : undefined
    })
  }

  // Second, so the phone's first pair is weight | protein — the two the lean-mass goal is about.
  if (props.protein) out.push(proteinRow(props.protein))

  const bp = [...props.entries].reverse().find(e => e.bp_systolic != null && e.bp_diastolic != null)
  if (bp) {
    const sys = bp.bp_systolic!
    const dia = bp.bp_diastolic!
    const high = sys >= 130 || dia >= 85
    const elevated = sys >= 120 || dia >= 80
    out.push({
      label: 'BP',
      value: `${sys}/${dia}`,
      unit: 'mmHg',
      delta: {
        text: high ? '● high' : elevated ? '● watch' : '● ok',
        class: high ? 'text-danger' : elevated ? 'text-warn' : 'text-accent'
      }
    })
  }

  const rhr = pair(props.entries, e => e.rhr)
  if (rhr.current != null) {
    out.push({
      label: 'RHR',
      value: Math.round(rhr.current).toString(),
      unit: 'bpm',
      delta: rhr.prev != null ? delta(rhr.current, rhr.prev, 'up-bad', '', 0) : undefined
    })
  }

  const hrv = pair(props.entries, e => e.hrv)
  if (hrv.current != null) {
    out.push({
      label: 'HRV',
      value: Math.round(hrv.current).toString(),
      unit: 'ms',
      delta: hrv.prev != null ? delta(hrv.current, hrv.prev, 'up-good', '', 0) : undefined
    })
  }

  const sleep = pair(props.metrics, m => m.sleep_total_min)
  if (sleep.current != null) {
    out.push({
      label: 'SLEEP',
      value: fmtSleep(sleep.current),
      delta: sleep.prev != null
        ? delta(sleep.current, sleep.prev, 'up-good', 'm', 0)
        : undefined
    })
  }

  const recovery = pair(props.metrics, m => m.recovery_score)
  if (recovery.current != null) {
    out.push({
      label: 'RECOVERY',
      value: `${Math.round(recovery.current)}%`,
      tone: recovery.current >= RECOVERY_GREEN_MIN ? 'accent' : undefined,
      delta: recovery.prev != null ? delta(recovery.current, recovery.prev, 'up-good', '', 0) : undefined
    })
  }

  const strain = pair(props.metrics, m => m.strain)
  if (strain.current != null) {
    out.push({
      label: 'STRAIN',
      value: strain.current.toFixed(1),
      delta: strain.prev != null ? delta(strain.current, strain.prev, 'neutral') : undefined
    })
  }

  return out
})
</script>
