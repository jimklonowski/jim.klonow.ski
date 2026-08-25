<template>
  <div>
    <JournalHeader
      section="COMPOUND"
      :meta="compoundName"
    >
      <template #actions>
        <span
          class="w-2.5 h-2.5 rounded-full shrink-0 glow-dot"
          :style="{ background: compoundColor, boxShadow: `0 0 8px ${compoundColor}` }"
        />
        <span
          v-if="info"
          class="text-[11px] text-accent border border-line-accent px-2 py-1 uppercase tracking-[0.08em]"
        >{{ info.category }}</span>
        <span
          v-if="onDays.length"
          class="text-[11px] text-muted tracking-[0.06em] uppercase"
        >{{ usageSummary }}</span>
      </template>
    </JournalHeader>
    <JournalNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <!-- Stat cells -->
    <div
      v-if="onDays.length"
      class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border-b border-line"
    >
      <div class="bg-bg px-4 sm:px-6 py-3.5">
        <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
          Total {{ isInjected ? 'injections' : 'doses' }}
        </p>
        <p class="num-display text-[28px] leading-none mt-1.5">
          {{ totalDoses }}
        </p>
      </div>
      <div class="bg-bg px-4 sm:px-6 py-3.5">
        <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
          Avg dose
        </p>
        <p class="num-display text-[28px] leading-none mt-1.5">
          {{ avgDose }}<span class="text-[11px] text-muted"> {{ unit }}</span>
        </p>
      </div>
      <div class="bg-bg px-4 sm:px-6 py-3.5">
        <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
          First used
        </p>
        <p class="num-display text-[28px] leading-none mt-1.5">
          {{ formatDate(onDays[0]!.date, 'monthDay').toUpperCase() }}
        </p>
      </div>
      <div class="bg-bg px-4 sm:px-6 py-3.5">
        <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
          {{ isInjected ? 'Sites' : 'Route' }}
        </p>
        <p class="text-[13px] text-body mt-2.5">
          {{ sitesLabel || '—' }}
        </p>
      </div>
    </div>

    <p
      v-if="!onDays.length"
      class="px-4 sm:px-6 py-4 text-[12px] text-muted"
    >
      No doses of {{ compoundName }} logged yet.
    </p>

    <!-- Main split -->
    <div class="grid gap-px bg-line lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <section class="bg-bg px-4 sm:px-6 py-4 space-y-4">
        <!-- Vitals on vs off -->
        <div v-if="hasVitalsData">
          <TuiHeader
            label="VITALS · ON DAYS VS OFF"
            :dashes="4"
          />
          <table class="w-full mt-2.5 text-[12.5px]">
            <thead>
              <tr class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                <th class="text-left font-medium py-1.5">
                  Metric
                </th>
                <th class="text-right font-medium py-1.5">
                  <span class="inline-flex items-center gap-1.5">
                    <span
                      class="w-1.5 h-1.5 rounded-full"
                      :style="{ background: compoundColor }"
                    />
                    On
                  </span>
                </th>
                <th class="text-right font-medium py-1.5">
                  Off
                </th>
                <th class="text-right font-medium py-1.5">
                  Diff
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in vitalsRows"
                :key="row.label"
                class="border-t border-line-soft"
              >
                <td class="py-2 text-muted uppercase text-[11px] tracking-[0.08em]">
                  {{ row.label }}
                </td>
                <td class="py-2 text-right text-hi">
                  {{ row.on ?? '—' }}
                </td>
                <td class="py-2 text-right text-muted">
                  {{ row.off ?? '—' }}
                </td>
                <td
                  class="py-2 text-right"
                  :class="row.deltaClass"
                >
                  {{ row.deltaText }}
                </td>
              </tr>
            </tbody>
          </table>
          <p class="mt-2 text-[11px] text-faint leading-[1.6]">
            {{ onDaysWithVitals }} on-day vs {{ offDaysWithVitals.toLocaleString('en-US') }} off-day readings · correlation only — not causal
          </p>
        </div>

        <!-- Dossier -->
        <div v-if="info">
          <TuiHeader
            label="DOSSIER"
            :dashes="20"
          />
          <p class="mt-2.5 text-[12.5px] leading-[1.7] text-dim">
            {{ info.summary }}
          </p>
          <dl class="mt-3 space-y-2 text-[12px]">
            <div v-if="info.aka">
              <dt class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                Also known as
              </dt>
              <dd class="text-dim">
                {{ info.aka }}
              </dd>
            </div>
            <div>
              <dt class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                Typical dosing
              </dt>
              <dd class="text-dim">
                {{ dosingLine }}
              </dd>
            </div>
            <div v-if="info.reconstitution">
              <dt class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                Reconstitution
              </dt>
              <dd class="text-dim">
                {{ info.reconstitution.instructions }}
              </dd>
              <dd
                v-if="info.reconstitution.measuring"
                class="text-faint"
              >
                {{ info.reconstitution.measuring }}
              </dd>
            </div>
            <div v-if="info.cycling">
              <dt class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                Cycling
              </dt>
              <dd class="text-dim">
                {{ info.cycling }}
              </dd>
            </div>
            <div>
              <dt class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                Storage
              </dt>
              <dd class="text-dim">
                {{ info.storage }}
              </dd>
            </div>
            <div v-if="info.halfLife">
              <dt class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                Half-life
              </dt>
              <dd class="text-dim">
                {{ info.halfLife }}
              </dd>
            </div>
          </dl>
          <p
            v-if="info.caution"
            class="mt-3 text-[12px] text-warn leading-[1.6]"
          >
            ⚠ {{ info.caution }}
          </p>
        </div>
      </section>

      <section class="bg-bg px-4 sm:px-6 py-4 space-y-4">
        <!-- Daily dose step chart -->
        <div v-if="doseChart.length >= 2">
          <TuiHeader :label="`DAILY DOSE · ${unit.toUpperCase()}`">
            <span class="text-[10.5px] text-muted">{{ doseRangeLabel }}</span>
          </TuiHeader>
          <div class="mt-2.5">
            <ClientOnly>
              <AreaChart
                :data="doseChart"
                :categories="{ dose: { name: `Dose (${unit})`, color: compoundColor } }"
                :height="150"
                step
              />
              <template #fallback>
                <div class="h-38" />
              </template>
            </ClientOnly>
          </div>
          <div class="flex items-baseline justify-between gap-3 mt-1 text-[11px] text-muted">
            <span>{{ doseSummary.start }}</span>
            <span>{{ doseSummary.recent }}</span>
          </div>
        </div>

        <!-- Recent doses -->
        <div v-if="recentDoses.length">
          <TuiHeader
            :label="isInjected ? 'RECENT INJECTIONS' : 'RECENT DOSES'"
            :dashes="10"
          />
          <table class="w-full mt-2.5 text-[12.5px]">
            <thead>
              <tr class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                <th class="text-left font-medium py-1.5">
                  Date
                </th>
                <th class="text-left font-medium py-1.5">
                  Time
                </th>
                <th class="text-right font-medium py-1.5">
                  Dose
                </th>
                <th class="text-right font-medium py-1.5">
                  {{ isInjected ? 'Site' : 'Route' }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(inj, i) in recentDoses"
                :key="`${inj.date}-${inj.time}-${i}`"
                class="cursor-pointer hover:bg-[#101a15] transition-colors"
                :class="i % 2 ? 'bg-inset' : ''"
                @click="navigateTo(`/journal/${inj.date}`)"
              >
                <td class="py-1.5 text-body">
                  {{ inj.date }}
                </td>
                <td class="py-1.5 text-muted">
                  {{ inj.time || '—' }}
                </td>
                <td class="py-1.5 text-right text-hi">
                  {{ inj.dose }} <span class="text-muted">{{ inj.unit }}</span>
                </td>
                <td class="py-1.5 text-right text-muted uppercase">
                  {{ shortSite(inj.site) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Syringe units for the current mix -->
        <div v-if="isInjected && currentMix && syringeChart.length">
          <TuiHeader
            label="SYRINGE UNITS · YOUR MIX"
            :dashes="4"
          >
            <NuxtLink
              :to="calculatorLink"
              class="text-[10.5px] text-accent hover:text-accent-hover"
            >calculator →</NuxtLink>
          </TuiHeader>
          <p class="mt-2 text-[11px] text-muted">
            {{ mixLine }}
          </p>
          <div class="mt-2">
            <ClientOnly>
              <BarChart
                :data="syringeChart"
                :categories="{ units: { name: 'Units', color: compoundColor } }"
                :y-axis-keys="['units']"
                x-axis-key="dose"
                :height="150"
              />
              <template #fallback>
                <div class="h-38" />
              </template>
            </ClientOnly>
          </div>
          <p class="mt-1.5 text-[11px] text-faint leading-[1.6]">
            Based on your most recently logged mix ({{ formatDate(currentMix.date) }}). Units are for a U-100 insulin syringe (1 unit = 0.01 mL) — recalculate if you change vial size or dilution.
          </p>
        </div>
      </section>
    </div>

    <p class="px-4 sm:px-6 py-3 text-[11px] text-ghost border-t border-line">
      {{ GENERAL_DISCLAIMER }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor, isInjectedSite } from '~/data/journal'
import type { PeptideEntry } from '~/data/journal'
import { getCompoundInfo, GENERAL_DISCLAIMER } from '~/data/compoundInfo'
import { calcUnits, type MixUnit } from '~/utils/peptideCalc'

definePageMeta({ middleware: 'journal-auth' })

const route = useRoute()
const compoundName = computed(() => decodeURIComponent(route.params.name as string))
const compoundColor = computed(() => getCompoundColor(compoundName.value))
const info = computed(() => getCompoundInfo(compoundName.value))

const { data, refresh, error } = await useJournalEntries()
onMounted(refresh)

const entries = computed(() => data.value ?? [])

function dosesOf(entry: { peptides?: PeptideEntry[] }) {
  return (entry.peptides ?? []).filter(p => p.compound === compoundName.value)
}

const onDays = computed(() => entries.value.filter(e => dosesOf(e).length > 0))
const offDays = computed(() => entries.value.filter(e => dosesOf(e).length === 0))

// --- Stats ---
const allDoses = computed(() =>
  onDays.value.flatMap(e => dosesOf(e).map(p => ({ ...p, date: e.date })))
)

const totalDoses = computed(() => allDoses.value.length)
const unit = computed(() => allDoses.value.at(-1)?.unit ?? 'mg')

/**
 * Whether every logged dose of this compound went in through a needle — the whole page
 * says "injections" only when that holds. Orals and nasal sprays (finasteride, modafinil)
 * get neutral "dose" wording, and so does a compound logged both ways, since one label has
 * to cover every row in the table. Read off the logged sites rather than a hand-kept list:
 * a few compounds are legitimately taken either way.
 */
const isInjected = computed(() => {
  const sites = allDoses.value.map(p => p.site).filter(Boolean)
  return sites.length > 0 && sites.every(isInjectedSite)
})

const avgDose = computed(() => {
  const doses = allDoses.value.map(p => p.dose)
  if (!doses.length) return 0
  return Math.round(doses.reduce((a, b) => a + b, 0) / doses.length * 10) / 10
})

const daysAgo = computed(() => {
  const last = onDays.value.at(-1)?.date
  if (!last) return null
  return Math.floor((Date.now() - new Date(last + 'T12:00:00').getTime()) / 86400000)
})

/** "18 days used · last -3d" — the title-row usage note, assembled here so Vue's whitespace
 * condensing can't eat the separators. */
const usageSummary = computed(() => {
  const base = `${onDays.value.length} days used`
  if (daysAgo.value == null) return base
  return `${base} · last ${daysAgo.value === 0 ? 'today' : `-${daysAgo.value}d`}`
})

/** "R glute 18× · L glute 3×" — the sites cell in the stat row. */
const sitesLabel = computed(() => {
  const counts: Record<string, number> = {}
  for (const inj of allDoses.value) {
    if (inj.site) counts[inj.site] = (counts[inj.site] ?? 0) + 1
  }
  const ranked = Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 3)
  // For an oral or nasal compound there's only one route and its count just restates the
  // total, so that cell names the route and stops there.
  if (!isInjected.value) return ranked.map(([site]) => shortSite(site)).join(' · ')
  return ranked.map(([site, count]) => `${shortSite(site)} ${count}×`).join(' · ')
})

const dosingLine = computed(() => {
  const d = info.value?.dosing
  if (!d) return ''
  return [d.range, d.frequency, d.timing, d.notes].filter(Boolean).join(' · ')
})

// --- Vitals correlation ---
// Needs at least 5 readings on each side before it means anything; below that the average
// swings too much on a single day to be worth showing.
const MIN_READINGS = 5

function avgVital(list: typeof entries.value, field: keyof typeof entries.value[number]): number | null {
  const vals = list
    .map(e => e[field] as number | null | undefined)
    .filter((v): v is number => v != null && v > 0)
  if (vals.length < MIN_READINGS) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10
}

const onDaysWithVitals = computed(() => onDays.value.filter(e => e.hrv != null || e.rhr != null).length)
const offDaysWithVitals = computed(() => offDays.value.filter(e => e.hrv != null || e.rhr != null).length)
const hasVitalsData = computed(() => onDaysWithVitals.value >= MIN_READINGS)

const VITALS_FIELDS = [
  { label: 'HRV', field: 'hrv', higherIsBetter: true },
  { label: 'RHR', field: 'rhr', higherIsBetter: false },
  { label: 'BP Sys', field: 'bp_systolic', higherIsBetter: false },
  { label: 'Weight', field: 'weight_lbs', higherIsBetter: null }
] as const

const vitalsRows = computed(() =>
  VITALS_FIELDS.map((r) => {
    const on = avgVital(onDays.value, r.field)
    const off = avgVital(offDays.value, r.field)
    if (on == null || off == null) {
      return { label: r.label, on, off, deltaText: '—', deltaClass: 'text-muted' }
    }
    const delta = Math.round((on - off) * 10) / 10
    let deltaClass = 'text-muted'
    if (r.higherIsBetter !== null && delta !== 0) {
      deltaClass = (r.higherIsBetter ? delta > 0 : delta < 0) ? 'text-accent' : 'text-warn'
    }
    return { label: r.label, on, off, deltaText: `${delta > 0 ? '+' : ''}${delta}`, deltaClass }
  })
)

// --- Dose chart ---
const doseChart = computed(() =>
  onDays.value.map((e) => {
    const total = dosesOf(e).reduce((sum, p) => sum + p.dose, 0)
    return { date: formatDate(e.date, 'monthDay'), dose: Math.round(total * 10) / 10 }
  })
)

const doseRangeLabel = computed(() => {
  const first = onDays.value[0]?.date
  const last = onDays.value.at(-1)?.date
  if (!first || !last) return ''
  return `${formatDate(first, 'monthDay').toUpperCase()} → ${formatDate(last, 'monthDay').toUpperCase()}`
})

/** Captions under the step chart: where the dose started, and where it sits now. */
const doseSummary = computed(() => {
  const doses = doseChart.value.map(d => d.dose)
  if (!doses.length) return { start: '', recent: '' }
  const first = doses[0]!
  const last = doses.at(-1)!
  // The mode is a better "steady" reading than the mean when a dose steps between levels.
  const counts = new Map<number, number>()
  for (const d of doses) counts.set(d, (counts.get(d) ?? 0) + 1)
  const steady = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  const recent = steady === last
    ? `${last}${unit.value} steady`
    : `${steady}${unit.value} steady · ${last}${unit.value} last`
  return { start: `${first}${unit.value} start`, recent }
})

// --- Syringe units ---
const reconstitutions = computed(() =>
  entries.value
    .flatMap(e =>
      (e.reconstitutions ?? [])
        .filter(r => r.compound === compoundName.value)
        .map(r => ({ ...r, date: e.date }))
    )
    .sort((a, b) => a.date.localeCompare(b.date))
)

const currentMix = computed(() => reconstitutions.value.at(-1) ?? null)

const mixLine = computed(() => {
  const mix = currentMix.value
  if (!mix) return ''
  const parts = [`${mix.vial_amount}${mix.vial_unit} vial + ${mix.bac_water_ml}mL BAC water`]
  const perMl = mix.bac_water_ml ? Math.round((mix.vial_amount / mix.bac_water_ml) * 1000) / 1000 : null
  if (perMl != null) parts.push(`≈ ${perMl} ${mix.vial_unit}/mL`)
  const units = calcUnits(1, unit.value as MixUnit, mix.vial_amount, mix.vial_unit, mix.bac_water_ml)
  if (units) parts.push(`1 unit ≈ ${Math.round((1 / units) * 1000) / 1000} ${unit.value}`)
  return parts.join(' · ')
})

const syringeChart = computed(() => {
  const mix = currentMix.value
  if (!mix) return []
  const doses = [...new Set(allDoses.value.map(p => p.dose))].sort((a, b) => a - b)
  return doses
    .map((dose) => {
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

const recentDoses = computed(() => [...allDoses.value].reverse().slice(0, 20))

useSeoMeta({ title: () => compoundName.value })
</script>
