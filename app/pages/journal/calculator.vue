<template>
  <UContainer>
    <div class="py-8 max-w-2xl mx-auto space-y-8">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <UButton to="/journal" variant="ghost" size="xs" icon="i-lucide-arrow-left" />
        <div>
          <h1 class="text-2xl font-bold">Peptide Calculator</h1>
          <p class="text-sm text-muted">Reconstitution and insulin syringe unit math</p>
        </div>
      </div>

      <!-- Mix -->
      <section>
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Your Mix</h2>
        <UCard>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <UFormField label="Vial Amount">
              <UInput v-model.number="vialAmount" type="number" min="0" step="0.1" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Unit">
              <USelect v-model="vialUnit" :items="DOSE_UNITS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="BAC Water (mL)">
              <UInput v-model.number="bacWaterMl" type="number" min="0.1" step="0.5" class="w-full font-mono" />
            </UFormField>
          </div>

          <div class="flex items-center gap-2 mt-4">
            <span class="text-xs text-muted">Common:</span>
            <UButton
              v-for="ml in [1, 2, 3, 5]"
              :key="ml"
              size="xs"
              :variant="bacWaterMl === ml ? 'solid' : 'outline'"
              @click="() => { bacWaterMl = ml }"
            >
              {{ ml }} mL
            </UButton>
          </div>

          <p v-if="concentration != null" class="text-sm mt-5 pt-4 border-t border-default">
            Concentration: <span class="font-mono font-medium">{{ round(concentration, 3) }} {{ vialUnit }}/mL</span>
          </p>
        </UCard>
      </section>

      <!-- Dose -->
      <section>
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Desired Dose</h2>
        <UCard>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <UFormField label="Dose Amount">
              <UInput v-model.number="dose" type="number" min="0" step="1" class="w-full font-mono" />
            </UFormField>
            <UFormField label="Unit">
              <USelect v-model="doseUnit" :items="DOSE_UNITS" value-key="value" label-key="label" class="w-full" />
            </UFormField>
          </div>

          <div v-if="unitsNeeded != null" class="mt-6 py-6 rounded-lg bg-elevated text-center">
            <p class="text-4xl font-bold font-mono">{{ round(unitsNeeded, 1) }}</p>
            <p class="text-xs text-muted uppercase tracking-wider mt-1">units on a U-100 insulin syringe</p>
            <p class="text-xs text-muted mt-1">≈ {{ round(unitsNeeded / 100, 3) }} mL</p>
          </div>
          <p v-else class="text-sm text-muted mt-4">
            {{ mismatchedUnits ? 'Vial and dose units must both be mass-based (mg/mcg) or both IU.' : 'Enter a vial amount, BAC water volume, and dose to calculate.' }}
          </p>
        </UCard>
      </section>

      <!-- Reference table -->
      <section v-if="referenceTable.length">
        <h2 class="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Quick Reference</h2>
        <UCard>
          <div class="overflow-x-auto">
            <table class="w-full text-sm font-mono">
              <thead>
                <tr class="border-b border-default">
                  <th class="text-left py-2 pr-4 text-xs text-muted font-medium uppercase tracking-wider">Units</th>
                  <th class="text-right py-2 px-4 text-xs text-muted font-medium uppercase tracking-wider">mL</th>
                  <th class="text-right py-2 pl-4 text-xs text-muted font-medium uppercase tracking-wider">Dose ({{ doseUnit }})</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in referenceTable" :key="row.units" class="border-b border-default last:border-0">
                  <td class="py-2 pr-4">{{ row.units }}</td>
                  <td class="py-2 px-4 text-right text-muted">{{ row.ml }}</td>
                  <td class="py-2 pl-4 text-right">{{ row.dose ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </section>

      <p class="text-xs text-muted italic">{{ GENERAL_DISCLAIMER }}</p>
    </div>
  </UContainer>
</template>

<script setup lang="ts">
import { DOSE_UNITS } from '~/data/journal'
import { GENERAL_DISCLAIMER } from '~/data/compoundInfo'
import { calcConcentration, calcUnits, calcDoseForUnits, type MixUnit } from '~/utils/peptideCalc'

definePageMeta({ middleware: 'journal-auth' })

const route = useRoute()

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

const concentration = computed(() => calcConcentration(vialAmount.value, bacWaterMl.value))

const mismatchedUnits = computed(() => {
  const massBased = (u: MixUnit) => u === 'mg' || u === 'mcg'
  return massBased(vialUnit.value) !== massBased(doseUnit.value)
})

const unitsNeeded = computed(() =>
  calcUnits(dose.value, doseUnit.value, vialAmount.value, vialUnit.value, bacWaterMl.value)
)

const referenceTable = computed(() => {
  if (concentration.value == null) return []
  return [5, 10, 15, 20, 25, 30, 40, 50].map(units => {
    const doseValue = calcDoseForUnits(units, vialAmount.value, vialUnit.value, bacWaterMl.value, doseUnit.value)
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
