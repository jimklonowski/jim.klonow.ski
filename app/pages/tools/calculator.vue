<template>
  <div>
    <ToolsHeader
      section="CALCULATOR"
      meta="reconstitution · u-100 syringe units"
    >
      <template #actions>
        <span class="text-[11px] text-muted hidden sm:inline">{{ mixSummary }}</span>
      </template>
    </ToolsHeader>
    <ToolsNav />

    <!-- Inputs: mix | dose -->
    <div class="grid gap-px bg-line lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] border-b border-line">
      <section class="bg-bg px-4 sm:px-6 py-4">
        <TuiHeader
          label="YOUR MIX"
          :dashes="12"
        >
          <span class="text-[10.5px] text-muted normal-case">what's in the vial</span>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
          <UFormField
            label="Vial Amount"
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model.number="vialAmount"
              type="number"
              min="0"
              step="0.1"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Unit"
            :ui="{ label: 'tui-label' }"
          >
            <USelect
              v-model="vialUnit"
              :items="DOSE_UNITS"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="BAC Water (mL)"
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model.number="bacWaterMl"
              type="number"
              min="0.1"
              step="0.5"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="flex flex-wrap items-center gap-2 mt-3">
          <span class="tui-label">common</span>
          <button
            v-for="ml in COMMON_BAC_ML"
            :key="ml"
            type="button"
            class="px-2.5 py-1 border text-[12px] cursor-pointer transition-colors"
            :class="bacWaterMl === ml
              ? 'bg-nav-active border-line-accent text-accent'
              : 'border-line-soft text-faint hover:text-accent hover:border-line-accent'"
            @click="bacWaterMl = ml"
          >
            {{ ml }} mL
          </button>
        </div>
      </section>

      <section class="bg-bg px-4 sm:px-6 py-4">
        <TuiHeader
          label="DESIRED DOSE"
          :dashes="8"
        >
          <span class="text-[10.5px] text-muted normal-case">per injection</span>
        </TuiHeader>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
          <UFormField
            label="Dose Amount"
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model.number="dose"
              type="number"
              min="0"
              step="1"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Unit"
            :ui="{ label: 'tui-label' }"
          >
            <USelect
              v-model="doseUnit"
              :items="DOSE_UNITS"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
        </div>
      </section>
    </div>

    <!-- Result readout -->
    <div
      v-if="unitsNeeded != null"
      class="grid grid-cols-2 sm:grid-cols-3 gap-px bg-line border-b border-line"
    >
      <div class="bg-bg px-4 sm:px-6 py-4 col-span-2 sm:col-span-1">
        <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
          Draw to
        </p>
        <p class="num-display text-accent text-[44px] leading-none mt-1.5 whitespace-nowrap">
          {{ round(unitsNeeded, 1) }}<span class="text-[11px] text-muted ml-1.5 tracking-[0.12em] uppercase">units</span>
        </p>
        <p class="mt-1.5 text-[10.5px] text-muted uppercase tracking-[0.08em]">
          on a u-100 insulin syringe
        </p>
      </div>

      <div class="bg-bg px-4 sm:px-6 py-4">
        <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
          Volume
        </p>
        <p class="num-display text-[32px] leading-none mt-1.5 whitespace-nowrap">
          {{ round(unitsNeeded / 100, 3) }}<span class="text-[10.5px] text-muted ml-1">mL</span>
        </p>
        <p class="mt-1.5 text-[10.5px] text-muted uppercase tracking-[0.08em]">
          {{ doseSummary }}
        </p>
      </div>

      <div class="bg-bg px-4 sm:px-6 py-4">
        <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
          Concentration
        </p>
        <p class="num-display text-[32px] leading-none mt-1.5 whitespace-nowrap">
          {{ concentration != null ? round(concentration, 3) : '—' }}<span class="text-[10.5px] text-muted ml-1">{{ vialUnit }}/mL</span>
        </p>
        <p class="mt-1.5 text-[10.5px] text-muted uppercase tracking-[0.08em]">
          {{ mixSummary }}
        </p>
      </div>
    </div>

    <p
      v-else
      class="px-4 sm:px-6 py-5 text-[12.5px] text-warn border-b border-line"
    >
      {{ blockedMessage }}
    </p>

    <p
      v-if="unitsNeeded != null && bridgeNote"
      class="px-4 sm:px-6 py-2 border-b border-line text-[11px] text-faint"
    >
      {{ bridgeNote }}
    </p>

    <!-- Reference table -->
    <section
      v-if="referenceTable.length"
      class="px-4 sm:px-6 py-4"
    >
      <TuiHeader
        label="QUICK REFERENCE"
        :dashes="8"
      >
        <span class="text-[10.5px] text-muted normal-case">{{ mixSummary }}</span>
      </TuiHeader>

      <div class="overflow-x-auto mt-2.5">
        <table class="w-full text-[12.5px] min-w-80">
          <thead>
            <tr class="border-b border-line">
              <th class="text-left py-2 pr-4 tui-label">
                Units
              </th>
              <th class="text-right py-2 px-4 tui-label">
                mL
              </th>
              <th class="text-right py-2 pl-4 tui-label">
                Dose ({{ doseUnit }})
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, i) in referenceTable"
              :key="row.units"
              :class="i % 2 ? 'bg-inset' : ''"
            >
              <td class="py-1.5 pr-4 num-display text-[14px]">
                {{ row.units }}
              </td>
              <td class="py-1.5 px-4 text-right text-muted">
                {{ row.ml }}
              </td>
              <td class="py-1.5 pl-4 text-right text-hi">
                {{ row.dose ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p class="px-4 sm:px-6 py-3 border-t border-line text-[11px] text-faint">
      {{ GENERAL_DISCLAIMER }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { DOSE_UNITS } from '~/data/journal'
import { GENERAL_DISCLAIMER } from '~/data/compoundInfo'
import { calcConcentration, calcUnits, calcDoseForUnits, IU_PER_MG, type MixUnit } from '~/utils/peptideCalc'

definePageMeta({ middleware: 'journal-auth' })

const route = useRoute()

const COMMON_BAC_ML = [1, 2, 3, 5]

function queryNumber(key: string, fallback: number) {
  const val = Number(route.query[key])
  return Number.isFinite(val) && val > 0 ? val : fallback
}

function queryUnit(key: string, fallback: MixUnit) {
  const val = route.query[key]
  return (val === 'mg' || val === 'mcg' || val === 'iu') ? val : fallback
}

const vialAmount = ref(queryNumber('vialAmount', 10))
const vialUnit = ref<MixUnit>(queryUnit('vialUnit', 'mg'))
const bacWaterMl = ref(queryNumber('bacWaterMl', 2))
const dose = ref(queryNumber('dose', 250))
const doseUnit = ref<MixUnit>(queryUnit('doseUnit', 'mcg'))

// Compound context arrives from a dossier's "calculator →" link. For compounds with a known
// IU↔mass factor (IU_PER_MG) it unlocks mixed-unit math — an HGH mix is labeled in mg but
// dosed in IU. No UI input for it: organic visits just keep units matched.
const compound = ref(typeof route.query.compound === 'string' ? route.query.compound : '')
const bridgeFactor = computed(() => IU_PER_MG[compound.value] ?? null)

const concentration = computed(() => calcConcentration(vialAmount.value, bacWaterMl.value))

const mismatchedUnits = computed(() => {
  const massBased = (u: MixUnit) => u === 'mg' || u === 'mcg'
  return massBased(vialUnit.value) !== massBased(doseUnit.value)
})

const unitsNeeded = computed(() =>
  calcUnits(dose.value, doseUnit.value, vialAmount.value, vialUnit.value, bacWaterMl.value, compound.value || undefined)
)

const bridgeNote = computed(() => {
  if (!bridgeFactor.value || !mismatchedUnits.value) return null
  return compound.value === 'HGH'
    ? 'IU ↔ mg converted via the WHO somatropin standard: 1 mg = 3 IU.'
    : `IU ↔ mg converted via ≈ ${bridgeFactor.value.toLocaleString('en-US')} IU/mg for ${compound.value} — approximate, IU is a bioactivity unit.`
})

// Multi-part captions are assembled here, not as adjacent <template v-if> blocks — Vue's
// whitespace condensing would run the pieces together.
const mixSummary = computed(() => `${vialAmount.value} ${vialUnit.value} / ${bacWaterMl.value} mL bac`)
const doseSummary = computed(() => `${dose.value} ${doseUnit.value} per shot`)

const blockedMessage = computed(() =>
  mismatchedUnits.value
    ? 'Vial and dose units must both be mass-based (mg/mcg) or both IU.'
    : 'Enter a vial amount, BAC water volume, and dose to calculate.'
)

const referenceTable = computed(() => {
  if (concentration.value == null) return []
  return [5, 10, 15, 20, 25, 30, 40, 50].map((units) => {
    const doseValue = calcDoseForUnits(units, vialAmount.value, vialUnit.value, bacWaterMl.value, doseUnit.value, compound.value || undefined)
    return {
      units,
      ml: round(units / 100, 2),
      dose: doseValue != null ? round(doseValue, 2) : null
    }
  })
})

function round(n: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}
</script>
