<template>
  <div>
    <TuiHeader label="TODAY · VITALS" />

    <div class="flex flex-col gap-3 mt-3">
      <div
        v-for="row in rows"
        :key="row.label"
        class="flex items-baseline gap-2"
      >
        <span class="w-[74px] shrink-0 text-[11px] text-muted">{{ row.label }}</span>
        <span
          class="num-display text-[21px] leading-none"
          :class="row.accentValue ? 'text-accent' : 'text-hi'"
        >{{ row.value }}</span>
        <span
          v-if="row.unit"
          class="text-[10.5px] text-muted"
        >{{ row.unit }}</span>
        <span
          v-if="row.delta"
          class="ml-auto text-[11px] shrink-0"
          :class="row.delta.class"
        >{{ row.delta.text }}</span>
      </div>
    </div>

    <p
      v-if="!rows.length"
      class="mt-3 text-[12px] text-muted"
    >
      No vitals logged yet.
    </p>
  </div>
</template>

<script setup lang="ts">
import type { JournalEntry } from '~/data/journal'
import type { HealthMetricsEntry } from '~/composables/useHealthMetricsEntries'

const props = defineProps<{
  /** Journal entries, oldest first. */
  entries: JournalEntry[]
  /** Health-metrics entries, oldest first. */
  metrics: HealthMetricsEntry[]
}>()

type Direction = 'up-good' | 'up-bad' | 'neutral'

/** Latest non-null reading and the one before it, for a field on a dated series. */
function pair<T>(list: T[], pick: (row: T) => number | null | undefined) {
  const values = list.map(pick).filter((v): v is number => v != null)
  return { current: values.at(-1) ?? null, prev: values.length >= 2 ? values.at(-2)! : null }
}

function fmtSleep(min: number) {
  return `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, '0')}m`
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
  const out: Array<{
    label: string
    value: string
    unit?: string
    accentValue?: boolean
    delta?: { text: string, class: string }
  }> = []

  const weight = pair(props.entries, e => e.weight_lbs)
  if (weight.current != null) {
    out.push({
      label: 'WEIGHT',
      value: weight.current.toFixed(1),
      unit: 'lbs',
      delta: weight.prev != null ? delta(weight.current, weight.prev, 'up-bad') : undefined
    })
  }

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
      accentValue: recovery.current >= 60,
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
