<template>
  <UContainer>
    <div class="py-8 max-w-4xl mx-auto space-y-8">

      <!-- Header -->
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
          <span
            class="w-3 h-3 rounded-full shrink-0"
            :style="{ background: getCompoundColor(compoundName) }"
          />
          <div>
            <h1 class="text-2xl font-bold">{{ compoundName }}</h1>
            <p class="text-sm text-muted">{{ onDays.length }} days used</p>
          </div>
        </div>
        <UButton to="/journal/inventory" variant="ghost" size="xs" icon="i-lucide-package">Inventory</UButton>
      </div>

      <div v-if="!onDays.length" class="text-muted text-sm">
        No entries found for {{ compoundName }}.
      </div>

      <template v-else>

        <!-- Stats cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider mb-1">Total Injections</p>
            <p class="text-2xl font-bold font-mono">{{ totalInjections }}</p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider mb-1">Avg Dose</p>
            <p class="text-2xl font-bold font-mono">{{ avgDose }}<span class="text-sm font-normal text-muted ml-1">{{ unit }}</span></p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider mb-1">First Used</p>
            <p class="text-lg font-bold font-mono">{{ formatDate(onDays[0]!.date) }}</p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted uppercase tracking-wider mb-1">Last Used</p>
            <p class="text-lg font-bold font-mono">{{ formatDate(onDays.at(-1)!.date) }}</p>
            <p class="text-xs text-muted mt-1">{{ daysAgo }} days ago</p>
          </UCard>
        </div>

        <!-- Compound info -->
        <section v-if="info">
          <div class="flex items-baseline justify-between mb-4">
            <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">About {{ compoundName }}</h2>
            <UBadge variant="subtle" size="sm">{{ info.category }}</UBadge>
          </div>
          <UCard>
            <div class="space-y-5">
              <p v-if="info.aka" class="text-xs text-muted -mt-1">Also known as: {{ info.aka }}</p>
              <p class="text-sm leading-relaxed">{{ info.summary }}</p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p class="text-xs text-muted uppercase tracking-wider mb-1">Typical Dosing</p>
                  <p class="text-sm font-medium">{{ info.dosing.range }}</p>
                  <p class="text-xs text-muted mt-0.5">{{ info.dosing.frequency }}</p>
                  <p v-if="info.dosing.timing" class="text-xs text-muted mt-0.5">{{ info.dosing.timing }}</p>
                  <p v-if="info.dosing.notes" class="text-xs text-muted mt-0.5">{{ info.dosing.notes }}</p>
                </div>
                <div v-if="info.reconstitution">
                  <p class="text-xs text-muted uppercase tracking-wider mb-1">Reconstitution</p>
                  <p class="text-sm">{{ info.reconstitution.instructions }}</p>
                  <p v-if="info.reconstitution.measuring" class="text-xs text-muted mt-0.5">{{ info.reconstitution.measuring }}</p>
                </div>
                <div v-if="info.cycling">
                  <p class="text-xs text-muted uppercase tracking-wider mb-1">Cycling</p>
                  <p class="text-sm">{{ info.cycling }}</p>
                </div>
                <div>
                  <p class="text-xs text-muted uppercase tracking-wider mb-1">Storage</p>
                  <p class="text-sm">{{ info.storage }}</p>
                </div>
                <div v-if="info.halfLife">
                  <p class="text-xs text-muted uppercase tracking-wider mb-1">Half-Life</p>
                  <p class="text-sm">{{ info.halfLife }}</p>
                </div>
              </div>

              <p v-if="info.caution" class="text-xs text-warning border-t border-default pt-3">{{ info.caution }}</p>
              <p class="text-xs text-muted italic border-t border-default pt-3">{{ GENERAL_DISCLAIMER }}</p>
            </div>
          </UCard>
        </section>

        <!-- Syringe units -->
        <section v-if="currentMix">
          <div class="flex items-baseline justify-between mb-4">
            <h2 class="text-sm font-semibold text-muted uppercase tracking-wider">Syringe Units (Your Mix)</h2>
            <UButton
              :to="calculatorLink"
              variant="ghost"
              size="xs"
              icon="i-lucide-calculator"
            >
              Open in Calculator
            </UButton>
          </div>
          <UCard>
            <template #header>
              <p class="text-sm font-medium">
                {{ currentMix.vial_amount }}{{ currentMix.vial_unit }} vial + {{ currentMix.bac_water_ml }}mL BAC water
              </p>
              <p class="text-xs text-muted">
                ≈ {{ concentrationPerMl }} {{ currentMix.vial_unit }}/mL · 1 unit (0.01 mL) ≈ {{ mcgPerUnit }} {{ unit }}
              </p>
            </template>
            <ClientOnly>
              <BarChart
                :data="syringeChart"
                :categories="{ units: { name: 'Units', color: getCompoundColor(compoundName) } }"
                :y-axis-keys="['units']"
                x-axis-key="dose"
                :height="180"
                :radius="4"
              />
            </ClientOnly>
            <p class="text-xs text-muted mt-4">
              Based on your most recently logged mix ({{ formatDate(currentMix.date) }}). Units shown are for a U-100 insulin syringe (1 unit = 0.01 mL) — recalculate if you switch to a different vial size or dilution.
            </p>
          </UCard>
        </section>

        <!-- Vitals impact -->
        <section v-if="hasVitalsData">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Vitals: On Days vs Off Days</h2>
          <UCard>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-default">
                    <th class="text-left py-2 pr-4 text-muted font-medium text-xs uppercase tracking-wider">Metric</th>
                    <th class="text-right py-2 px-4 font-medium">
                      <span class="flex items-center justify-end gap-1.5">
                        <span class="w-2 h-2 rounded-full" :style="{ background: getCompoundColor(compoundName) }" />
                        On days
                      </span>
                    </th>
                    <th class="text-right py-2 px-4 font-medium text-muted">Off days</th>
                    <th class="text-right py-2 pl-4 font-medium text-muted text-xs uppercase tracking-wider">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in vitalsRows" :key="row.label" class="border-b border-default last:border-0">
                    <td class="py-3 pr-4 text-muted text-xs uppercase tracking-wider">{{ row.label }}</td>
                    <td class="py-3 px-4 text-right font-mono font-medium">
                      {{ row.on ?? '—' }}
                    </td>
                    <td class="py-3 px-4 text-right font-mono text-muted">
                      {{ row.off ?? '—' }}
                    </td>
                    <td class="py-3 pl-4 text-right font-mono text-xs">
                      <span
                        v-if="row.on != null && row.off != null"
                        :class="row.betterClass"
                      >
                        {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}
                      </span>
                      <span v-else class="text-muted">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="text-xs text-muted mt-4">
              Based on {{ onDaysWithVitals }} on-day readings and {{ offDaysWithVitals }} off-day readings.
              Correlation only — not causal.
            </p>
          </UCard>
        </section>

        <!-- Dose history chart -->
        <section v-if="doseChart.length >= 2">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Dose History</h2>
          <UCard>
            <template #header>
              <p class="text-sm font-medium">Daily dose over time</p>
              <p class="text-xs text-muted">{{ unit }}</p>
            </template>
            <ClientOnly>
              <AreaChart
                :data="doseChart"
                :categories="{ dose: { name: 'Dose', color: getCompoundColor(compoundName) } }"
                :height="160"
              />
            </ClientOnly>
          </UCard>
        </section>

        <!-- Most common sites -->
        <section v-if="siteBreakdown.length">
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Injection Sites</h2>
          <div class="flex flex-wrap gap-2">
            <div
              v-for="[site, count] in siteBreakdown"
              :key="site"
              class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm"
            >
              <span class="font-medium">{{ formatSite(site) }}</span>
              <span class="text-xs text-muted">{{ count }}×</span>
            </div>
          </div>
        </section>

        <!-- Recent injections -->
        <section>
          <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Recent Injections</h2>
          <div class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-sm font-mono">
              <thead>
                <tr class="border-b border-default bg-elevated">
                  <th class="text-left py-2 px-3 text-xs text-muted font-medium">Date</th>
                  <th class="text-left py-2 px-3 text-xs text-muted font-medium">Time</th>
                  <th class="text-right py-2 px-3 text-xs text-muted font-medium">Dose</th>
                  <th class="text-left py-2 px-3 text-xs text-muted font-medium">Site</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="inj in recentInjections"
                  :key="`${inj.date}-${inj.time}`"
                  class="border-b border-default last:border-0 hover:bg-elevated/50 cursor-pointer transition-colors"
                  @click="navigateTo(`/journal/${inj.date}`)"
                >
                  <td class="py-2 px-3">{{ inj.date }}</td>
                  <td class="py-2 px-3 text-muted">{{ inj.time || '—' }}</td>
                  <td class="py-2 px-3 text-right">{{ inj.dose }} {{ inj.unit }}</td>
                  <td class="py-2 px-3 text-muted">{{ formatSite(inj.site) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

      </template>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { getCompoundColor, formatSite } from '~/data/journal'
import { getCompoundInfo, GENERAL_DISCLAIMER } from '~/data/compoundInfo'
import { calcUnits, type MixUnit } from '~/utils/peptideCalc'

definePageMeta({ middleware: 'journal-auth' })

const route = useRoute()
const compoundName = computed(() => decodeURIComponent(route.params.name as string))
const info = computed(() => getCompoundInfo(compoundName.value))

const { data, refresh } = await useJournalEntries()
onMounted(refresh)

const entries = computed(() => data.value ?? [])

type Peptide = { time: string; compound: string; dose: number; unit: string; site: string }

const onDays = computed(() =>
  entries.value.filter(e =>
    (e.peptides ?? []).some((p: Peptide) => p.compound === compoundName.value)
  )
)

const offDays = computed(() =>
  entries.value.filter(e =>
    !(e.peptides ?? []).some((p: Peptide) => p.compound === compoundName.value)
  )
)

// --- Stats ---
const allInjections = computed(() =>
  onDays.value.flatMap(e =>
    (e.peptides ?? []).filter((p: Peptide) => p.compound === compoundName.value)
      .map((p: Peptide) => ({ ...p, date: e.date }))
  )
)

const totalInjections = computed(() => allInjections.value.length)

const unit = computed(() => allInjections.value.at(-1)?.unit ?? 'mg')

const avgDose = computed(() => {
  const doses = allInjections.value.map(p => p.dose)
  if (!doses.length) return 0
  return Math.round(doses.reduce((a, b) => a + b, 0) / doses.length * 10) / 10
})

const daysAgo = computed(() => {
  const last = onDays.value.at(-1)?.date
  if (!last) return null
  return Math.floor((Date.now() - new Date(last + 'T12:00:00').getTime()) / 86400000)
})

// --- Vitals correlation ---
function avgVital(list: typeof entries.value, field: string): number | null {
  const vals = list
    .map(e => (e as unknown as Record<string, unknown>)[field] as number | null)
    .filter((v): v is number => v != null && v > 0)
  if (vals.length < 5) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10
}

const onDaysWithVitals = computed(() =>
  onDays.value.filter(e => e.hrv != null || e.rhr != null).length
)
const offDaysWithVitals = computed(() =>
  offDays.value.filter(e => e.hrv != null || e.rhr != null).length
)
const hasVitalsData = computed(() => onDaysWithVitals.value >= 5)

const vitalsRows = computed(() => {
  const on = onDays.value
  const off = offDays.value

  const rows = [
    { label: 'HRV', field: 'hrv', higherIsBetter: true, unit: 'ms' },
    { label: 'RHR', field: 'rhr', higherIsBetter: false, unit: 'bpm' },
    { label: 'BP Sys', field: 'bp_systolic', higherIsBetter: false, unit: 'mmHg' },
    { label: 'Weight', field: 'weight_lbs', higherIsBetter: null, unit: 'lbs' },
  ]

  return rows.map(r => {
    const onVal = avgVital(on, r.field)
    const offVal = avgVital(off, r.field)
    const delta = onVal != null && offVal != null
      ? Math.round((onVal - offVal) * 10) / 10
      : 0

    let betterClass = 'text-muted'
    if (r.higherIsBetter !== null && onVal != null && offVal != null) {
      const better = r.higherIsBetter ? delta > 0 : delta < 0
      betterClass = better ? 'text-success font-medium' : delta === 0 ? 'text-muted' : 'text-warning font-medium'
    }

    return { ...r, on: onVal, off: offVal, delta, betterClass }
  })
})

// --- Dose chart ---
const doseChart = computed(() =>
  onDays.value.map(e => {
    const doses = (e.peptides ?? [])
      .filter((p: Peptide) => p.compound === compoundName.value)
      .map((p: Peptide) => p.dose)
    const total = Math.round(doses.reduce((a, b) => a + b, 0) * 10) / 10
    return { date: e.date.substring(5), dose: total }
  })
)

// --- Syringe units ---
type Reconstitution = { compound: string; vial_amount: number; vial_unit: MixUnit; bac_water_ml: number }

const reconstitutions = computed(() =>
  entries.value
    .flatMap(e =>
      (e.reconstitutions ?? [])
        .filter((r: Reconstitution) => r.compound === compoundName.value)
        .map((r: Reconstitution) => ({ ...r, date: e.date }))
    )
    .sort((a, b) => a.date.localeCompare(b.date))
)

const currentMix = computed(() => reconstitutions.value.at(-1) ?? null)

const concentrationPerMl = computed(() => {
  const mix = currentMix.value
  if (!mix || !mix.bac_water_ml) return null
  return Math.round((mix.vial_amount / mix.bac_water_ml) * 1000) / 1000
})

const mcgPerUnit = computed(() => {
  const mix = currentMix.value
  if (!mix) return null
  const units = calcUnits(1, unit.value as MixUnit, mix.vial_amount, mix.vial_unit, mix.bac_water_ml)
  if (!units) return null
  return Math.round((1 / units) * 1000) / 1000
})

const syringeChart = computed(() => {
  const mix = currentMix.value
  if (!mix) return []
  const doses = [...new Set(allInjections.value.map(p => p.dose))].sort((a, b) => a - b)
  return doses
    .map(dose => {
      const units = calcUnits(dose, unit.value as MixUnit, mix.vial_amount, mix.vial_unit, mix.bac_water_ml)
      return { dose: `${dose} ${unit.value}`, units: units != null ? Math.round(units * 10) / 10 : null }
    })
    .filter((d): d is { dose: string, units: number } => d.units != null)
})

const calculatorLink = computed(() => {
  const mix = currentMix.value
  if (!mix) return '/journal/calculator'
  return {
    path: '/journal/calculator',
    query: {
      vialAmount: mix.vial_amount,
      vialUnit: mix.vial_unit,
      bacWaterMl: mix.bac_water_ml,
      dose: avgDose.value,
      doseUnit: unit.value
    }
  }
})

// --- Site breakdown ---
const siteBreakdown = computed(() => {
  const counts: Record<string, number> = {}
  for (const inj of allInjections.value) {
    counts[inj.site] = (counts[inj.site] ?? 0) + 1
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)
})

// --- Recent injections ---
const recentInjections = computed(() =>
  [...allInjections.value].reverse().slice(0, 20)
)

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
</script>
