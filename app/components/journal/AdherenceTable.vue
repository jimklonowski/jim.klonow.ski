<script setup lang="ts">
// Planned-vs-logged rows: compound, dose · cadence, one cell per week shaded by how much of that
// week's expected dosing landed, the window's %, and today's status. The compounds page shows
// the standing schedule's last few weeks; the cycle dossier shows a cycle's own weeks.
import type { AdherenceRow, AdherenceWeek } from '~/utils/adherence'
import { adherencePctClass } from '~/utils/adherence'
import { getCompoundColor } from '~/data/journal'
import { iuEquivalentLabel } from '#shared/utils/peptideCalc'

withDefaults(defineProps<{
  rows: AdherenceRow[]
  /** The status column only means something while the plan is running. When false it shows "—". */
  showStatus?: boolean
}>(), {
  showStatus: true
})

const STATUS_CLASSES: Record<AdherenceRow['status']['kind'], string> = {
  done: 'text-accent',
  due: 'text-hi',
  overdue: 'text-warn',
  next: 'text-muted'
}

function weekCellStyle(compound: string, w: AdherenceWeek) {
  if (!w.expected) return {}
  return {
    background: getCompoundColor(compound),
    opacity: 0.2 + 0.8 * Math.min(w.actual / w.expected, 1)
  }
}

/** Hover tooltip with the mass equivalence for IU dose labels ("2iu qd", "250 IU"). */
function iuTitle(compound: string, label: string): string | undefined {
  if (!label.toLowerCase().includes('iu')) return undefined
  return iuEquivalentLabel(compound, parseFloat(label)) ?? undefined
}
</script>

<template>
  <div class="flex flex-col gap-1.5 mt-2.5">
    <div
      v-for="row in rows"
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
        :class="adherencePctClass(row.pct)"
      >{{ row.pct != null ? `${row.pct}%` : '—' }}</span>
      <span
        class="text-right text-[10.5px] tracking-[0.06em]"
        :class="STATUS_CLASSES[row.status.kind]"
      >{{ showStatus ? row.status.label : '—' }}</span>
    </div>
  </div>
</template>
