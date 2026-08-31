<template>
  <div
    v-if="coverageRows.length || runwayRows.length"
    class="space-y-5"
  >
    <!-- Cycle readiness -->
    <section v-if="cycle && coverageRows.length">
      <TuiHeader
        :label="`CYCLE RUNWAY · ${cycle.name.toUpperCase()}`"
        :dashes="5"
      >
        <span class="text-[10.5px] text-muted normal-case">
          {{ cycleStatus === 'upcoming' ? `starts ${formatDate(cycle.start_date, 'monthDay')}` : 'doses still ahead of today' }}
        </span>
      </TuiHeader>

      <div class="mt-2.5 border border-line-soft">
        <div
          v-for="(row, i) in coverageRows"
          :key="row.compound"
          class="px-3 py-2.5 border-b border-line-soft last:border-0"
          :class="i % 2 ? 'bg-inset' : ''"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              class="w-1.5 h-1.5 rounded-full shrink-0 self-center"
              :style="{ background: getCompoundColor(row.compound) }"
            />
            <span class="text-[12.5px] text-hi">{{ row.compound }}</span>
            <span class="text-[11.5px] text-muted">
              <span class="num-display">{{ fmtAmount(row.onHand ?? 0) }}</span>
              / {{ fmtAmount(row.needed) }} {{ unitLabel(row.unit) }}
            </span>
            <span
              class="ml-auto text-[11px] tracking-[0.08em] uppercase"
              :class="verdictClass(row)"
            >{{ verdictText(row) }}</span>
          </div>
          <div class="h-1.5 bg-inset mt-2">
            <div
              class="h-full transition-all"
              :style="{ width: `${Math.max(2, row.pct * 100)}%`, background: row.short > 0 ? '#e8b34b' : '#2ce8a4' }"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Days of stock at current pace -->
    <section v-if="runwayRows.length">
      <TuiHeader
        label="STOCK RUNWAY"
        :dashes="8"
      >
        <span class="text-[10.5px] text-muted normal-case">sealed + open stock ÷ current pace</span>
      </TuiHeader>

      <div class="mt-2.5 border border-line-soft">
        <div
          v-for="(row, i) in runwayRows"
          :key="row.compound"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 border-b border-line-soft last:border-0"
          :class="i % 2 ? 'bg-inset' : ''"
        >
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0 self-center"
            :style="{ background: getCompoundColor(row.compound) }"
          />
          <span class="text-[12.5px] text-hi">{{ row.compound }}</span>
          <span class="text-[11.5px] text-muted">
            <span class="num-display">{{ fmtAmount(row.total) }}</span> {{ row.unit }} on hand
          </span>
          <span
            class="ml-auto text-[11.5px]"
            :class="row.days < 30 ? 'text-warn' : 'text-accent'"
          >
            ~{{ Math.round(row.days) }}d{{ row.basis === 'typical' ? '*' : '' }}
            <span class="text-muted">· out ~{{ formatDate(row.runOut, 'monthDay') }}</span>
          </span>
        </div>
      </div>
      <p
        v-if="runwayRows.some(r => r.basis === 'typical')"
        class="mt-1.5 text-[10.5px] text-faint"
      >
        * pace estimated from typical dosing — not enough logged history yet
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor } from '~/data/journal'
import type { Vial, JournalEntry } from '~/data/journal'
import { computeRemaining, estimateDailyRate } from '~/utils/vialInventory'
import { convertUnitFor, type MixUnit } from '~/utils/peptideCalc'
import { relevantCycle, cycleStatusOn, shiftDays } from '#shared/utils/cycles'
import { cycleCoverage, type CycleCoverage } from '#shared/utils/stockRunway'

const props = defineProps<{
  vials: Vial[]
  entries: JournalEntry[]
  today: string
}>()

const { data: cyclesData } = await useCycles()

// Not-finished vials only, keyed by compound. `total` is in the compound's first vial's unit;
// vials in another unit bridge through convertUnitFor and unconvertible ones are skipped
// rather than silently miscounted.
const stockByCompound = computed(() => {
  const map = new Map<string, { unit: MixUnit, total: number, repVial: Vial }>()
  for (const vial of props.vials) {
    if (vial.status === 'finished') continue
    const amount = vial.status === 'active'
      ? computeRemaining(vial, props.entries).remaining
      : vial.vial_amount * (vial.quantity ?? 1)
    const existing = map.get(vial.compound)
    if (!existing) {
      map.set(vial.compound, { unit: vial.vial_unit as MixUnit, total: amount, repVial: vial })
      continue
    }
    const converted = convertUnitFor(vial.compound, amount, vial.vial_unit as MixUnit, existing.unit)
    if (converted != null) existing.total += converted
  }
  return map
})

const cycle = computed(() => {
  const c = relevantCycle(cyclesData.value ?? [], props.today)
  // A finished run has no runway question left in it.
  return c && cycleStatusOn(c, props.today) !== 'done' ? c : null
})

const cycleStatus = computed(() => cycle.value ? cycleStatusOn(cycle.value, props.today) : null)

function onHandIn(compound: string, unit: MixUnit): number | null {
  const stock = stockByCompound.value.get(compound)
  if (!stock) return null
  return convertUnitFor(compound, stock.total, stock.unit, unit)
}

const coverageRows = computed(() =>
  cycle.value ? cycleCoverage(cycle.value, props.today, onHandIn) : []
)

// The most common sealed vial size, for "SHORT ≈ N vials" hints.
function typicalVialSize(compound: string): number | null {
  const counts = new Map<number, number>()
  for (const v of props.vials) {
    if (v.compound !== compound || v.status !== 'sealed') continue
    counts.set(v.vial_amount, (counts.get(v.vial_amount) ?? 0) + (v.quantity ?? 1))
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return best?.[0] ?? null
}

function unitLabel(unit: MixUnit): string {
  return unit === 'iu' ? 'IU' : unit
}

function verdictText(row: CycleCoverage): string {
  if (row.needed <= 0) return 'done'
  if (row.onHand == null) return 'not stocked'
  if (row.short <= 0) return 'ready ✓'
  const size = typicalVialSize(row.compound)
  const vialsShort = size ? ` (≈ ${Math.ceil(row.short / size)} vials)` : ''
  return `short ${fmtAmount(row.short)} ${unitLabel(row.unit)}${vialsShort}`
}

function verdictClass(row: CycleCoverage): string {
  if (row.needed <= 0) return 'text-muted'
  if (row.onHand == null) return 'text-danger'
  return row.short > 0 ? 'text-warn' : 'text-accent'
}

// Days-of-stock per compound at the logged pace. estimateDailyRate only reads compound +
// vial_unit off the vial, so any vial of the compound serves as the rate probe.
const runwayRows = computed(() =>
  [...stockByCompound.value.entries()]
    .map(([compound, stock]) => {
      const { dailyAmount, basis } = estimateDailyRate(stock.repVial, props.entries, props.today)
      const converted = dailyAmount != null
        ? convertUnitFor(compound, dailyAmount, stock.repVial.vial_unit as MixUnit, stock.unit)
        : null
      if (!converted || converted <= 0 || stock.total <= 0) return null
      const days = stock.total / converted
      return { compound, unit: unitLabel(stock.unit), total: stock.total, days, basis, runOut: shiftDays(props.today, Math.ceil(days)) }
    })
    .filter(row => row != null)
    .sort((a, b) => a.days - b.days)
)

function fmtAmount(n: number): number {
  return Math.round(n * 10) / 10
}
</script>
