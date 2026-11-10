<template>
  <div>
    <!-- Breadcrumb title row, the hematocrit page's shape -->
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2 px-4 sm:px-6 pt-4 pb-3.5">
      <h1 class="flex items-baseline gap-2.5 min-w-0">
        <span class="text-meta text-muted tracking-[0.06em] uppercase">
          <NuxtLink
            to="/labs"
            class="hover:text-accent"
          >labs</NuxtLink> /
        </span>
        <span class="num-display text-hi text-tile leading-none">DRAW LEDGER</span>
      </h1>
      <p
        v-if="rows.length"
        class="text-meta text-muted tracking-[0.06em] uppercase"
      >
        {{ rows.length }} draws · {{ formatDate(rows[rows.length - 1]!.date, 'monthDay') }} → {{ formatDate(rows[0]!.date, 'monthDay') }}
      </p>
      <div class="flex flex-wrap items-center gap-2 ml-auto">
        <NuxtLink
          to="/labs"
          class="tui-btn"
        >
          BLOODWORK →
        </NuxtLink>
        <button
          type="button"
          class="tui-btn print:hidden"
          @click="print"
        >
          PRINT
        </button>
      </div>
    </div>

    <TuiDataState
      :error="error"
      :empty="!rows.length"
      empty-title="No blood draws yet"
      empty-description="Upload a panel and each draw gets a row here."
      @retry="refresh"
    />

    <template v-if="rows.length">
      <p class="px-4 sm:px-6 pb-3 text-small text-dim leading-[1.7] max-w-3xl">
        One row per draw: what the protocol was that day, how long after the last shot the blood was taken, and the markers that gate the protocol, each with its change from the previous reading. The question every row answers is "what was I on when this was drawn?"
      </p>

      <UTable
        :data="rows"
        :columns="columns"
        class="border-y border-line"
        :ui="{ td: 'py-2 align-top text-small', th: 'text-label uppercase tracking-[0.12em] text-muted' }"
      >
        <template #date-cell="{ row }">
          <span class="text-hi tabular-nums whitespace-nowrap">{{ formatDate(row.original.date, 'short') }}</span>
          <span
            v-if="!row.original.fasting"
            class="block text-meta text-faint"
          >non-fasting</span>
        </template>
        <template #protocol-cell="{ row }">
          <span
            v-if="row.original.protocol.length"
            class="text-dim"
          >
            <span
              v-for="c in row.original.protocol"
              :key="c.compound"
              class="block whitespace-nowrap"
              :title="`${c.compound} ${c.label} on ${c.perWeek} day${c.perWeek === 1 ? '' : 's'} a week`"
            >{{ c.short }} {{ c.text }}</span>
          </span>
          <span
            v-else
            class="text-faint"
          >—</span>
        </template>
        <template #timing-cell="{ row }">
          <span
            v-if="row.original.timing.length"
            class="text-dim"
          >
            <span
              v-for="c in row.original.timing"
              :key="c.compound"
              class="block whitespace-nowrap"
              :title="`${c.compound}: last shot ${c.timing.lastDoseDate}, ${c.timing.phase} — ${TIMING_CAVEAT}`"
            >{{ c.text }}</span>
          </span>
          <span
            v-else
            class="text-faint"
          >—</span>
        </template>
        <template
          v-for="key in LEDGER_MARKERS"
          :key="key"
          #[`${key}-cell`]="{ row }"
        >
          <span
            class="tabular-nums whitespace-nowrap"
            :class="cellClass(key, row.original.cells[key])"
            :title="cellTitle(key, row.original.cells[key])"
          >{{ cellText(row.original.cells[key]) }}<span
            v-if="row.original.cells[key].noted && !row.original.cells[key].censored"
            class="text-warn"
          > *</span><span
            v-if="row.original.cells[key].tags.length"
            class="text-muted"
          > {{ tagGlyphs(row.original.cells[key]) }}</span></span>
        </template>
      </UTable>

      <p class="px-4 sm:px-6 py-3 text-meta text-faint leading-[1.6]">
        Change in parentheses is against the previous usable reading of that marker. † a value at the assay's ceiling, a bound rather than a measurement, never diffed. * a reading with an assay or lab note (a different assay or lab from its neighbours). {{ TAG_GLYPH.transitional }} a red-cell reading inside the ~{{ RBC_TURNOVER_DAYS }}-day turnover window after a dose change, which cannot yet show that change's full effect. {{ TAG_GLYPH['post-phlebotomy'] }} a reading within {{ PHLEBOTOMY_EFFECT_DAYS / 7 }} weeks of a blood donation or therapeutic phlebotomy, which reads the blood taken out. Timing is {{ TIMING_CAVEAT.charAt(0).toLowerCase() + TIMING_CAVEAT.slice(1) }}.
      </p>
      <p class="px-4 sm:px-6 pb-3 text-meta text-ghost">
        {{ GENERAL_DISCLAIMER }}
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { LEDGER_MARKERS, cellText, ledgerRows, type LedgerMarker, type LedgerRow, type MarkerCell } from '#shared/utils/drawLedger'
import { TIMING_CAVEAT } from '#shared/utils/drawTimingView'
import { PHLEBOTOMY_EFFECT_DAYS, RBC_TURNOVER_DAYS, type ReadingTag } from '#shared/utils/hematocrit'
import { BIOMARKERS, getStatus, isEchoOnly } from '~/data/biomarkers'
import { GENERAL_DISCLAIMER } from '~/data/compoundInfo'

useSeoMeta({ title: 'Labs · Draw ledger' })

// The draw ledger (audit #43 item 64): per draw, the protocol in force, the injection-relative
// timing and the gating markers with deltas — a doctor-readable table, printable, no AI.
// shared/utils/drawLedger.ts holds the arithmetic. The dose log is a client-only list and the
// doctor role has none, so that column reads "—" for it.
const [{ data: labsData, error, refresh }, { data: journalData }, { rules }, { data: phlebData }] = await Promise.all([
  useLabsEntries(),
  useJournalEntries(),
  useProtocol(),
  // Each Hct/ferritin cell says when it sits in a turnover window or just after a phlebotomy (item 101).
  usePhlebotomies()
])

// Blood draws only: an echo-only row is a scan, not a draw.
const draws = computed(() => (labsData.value ?? []).filter(e => !isEchoOnly(e)))
const rows = computed(() => ledgerRows(draws.value, journalData.value ?? [], rules.value, phlebData.value ?? []))

// Printable superscripts for the two reading tags; the footer spells them out.
const TAG_GLYPH: Record<ReadingTag['kind'], string> = { 'transitional': 'ᵗ', 'post-phlebotomy': 'ᵖ' }
const tagGlyphs = (cell: MarkerCell) => cell.tags.map(t => TAG_GLYPH[t.kind]).join('')

const columns: TableColumn<LedgerRow>[] = [
  { id: 'date', header: 'Draw' },
  { id: 'protocol', header: 'Protocol in force' },
  { id: 'timing', header: 'Since the shot' },
  ...LEDGER_MARKERS.map(key => ({ id: key, header: `${BIOMARKERS[key]?.label.replace(/^Testosterone \((\w+)\)$/, '$1 T') ?? key} ${BIOMARKERS[key]?.unit ? `(${BIOMARKERS[key]!.unit})` : ''}`.trim() }))
]

function cellClass(key: LedgerMarker, cell: MarkerCell): string {
  if (cell.value == null) return 'text-faint'
  if (cell.censored) return 'text-muted'
  const meta = BIOMARKERS[key]
  const s = meta ? getStatus(cell.value, meta) : 'normal'
  return s === 'high' ? 'text-danger' : s === 'low' ? 'text-warn' : s === 'optimal' ? 'text-accent' : 'text-hi'
}

function cellTitle(key: LedgerMarker, cell: MarkerCell): string | undefined {
  if (cell.value == null) return undefined
  const parts = [BIOMARKERS[key]?.label ?? key]
  if (cell.censored) parts.push('at the assay ceiling — a bound, not a measurement')
  else if (cell.since) parts.push(`change since the ${cell.since} draw`)
  for (const t of cell.tags) parts.push(`${t.short}: ${t.text}`)
  return parts.join(' · ')
}

function print() {
  if (import.meta.client) window.print()
}
</script>
