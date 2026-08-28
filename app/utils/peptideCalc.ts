export type MixUnit = 'mg' | 'mcg' | 'iu'

const SYRINGE_UNITS_PER_ML = 100 // U-100 insulin syringe: 1 unit = 0.01 mL

// IU→mass equivalences for the compounds dosed by IU. HGH is exact by definition — the WHO
// somatropin standard sets 1 mg = 3 IU. hCG is labeled by bioactivity and never by mass;
// purified urinary hCG runs ≈9,300 IU/mg (recombinant products calibrate differently), so
// its mass figure is intuition, not a lab fact. Dosing stays in IU because that's how the
// vials are labeled — these factors just let the UI say what an IU dose means in milligrams.
export const IU_PER_MG: Record<string, number> = {
  HGH: 3,
  hCG: 9300
}

export function convertUnit(amount: number, from: MixUnit, to: MixUnit): number | null {
  if (from === to) return amount
  if (from === 'mg' && to === 'mcg') return amount * 1000
  if (from === 'mcg' && to === 'mg') return amount / 1000
  return null
}

/** convertUnit that can also bridge IU↔mass when the compound has a known IU_PER_MG factor. */
export function convertUnitFor(compound: string, amount: number, from: MixUnit, to: MixUnit): number | null {
  const direct = convertUnit(amount, from, to)
  if (direct != null) return direct
  const perMg = IU_PER_MG[compound]
  if (!perMg) return null
  if (from === 'iu') return convertUnit(amount / perMg, 'mg', to)
  if (to === 'iu') {
    const mg = convertUnit(amount, from, 'mg')
    return mg == null ? null : mg * perMg
  }
  return null
}

/** "≈ 0.67 mg" / "≈ 26.9 mcg" for an IU dose of a compound with a known factor, else null. */
export function iuEquivalentLabel(compound: string, doseIu: number): string | null {
  const perMg = IU_PER_MG[compound]
  if (!perMg || !doseIu) return null
  const mg = doseIu / perMg
  if (mg >= 0.1) return `≈ ${Math.round(mg * 100) / 100} mg`
  return `≈ ${Math.round(mg * 10000) / 10} mcg`
}

export function calcConcentration(vialAmount: number, bacWaterMl: number): number | null {
  if (!vialAmount || !bacWaterMl) return null
  return vialAmount / bacWaterMl
}

export function calcUnits(
  dose: number,
  doseUnit: MixUnit,
  vialAmount: number,
  vialUnit: MixUnit,
  bacWaterMl: number,
  compound?: string
): number | null {
  const concentration = calcConcentration(vialAmount, bacWaterMl)
  if (concentration == null || !dose) return null
  const doseInVialUnit = compound
    ? convertUnitFor(compound, dose, doseUnit, vialUnit)
    : convertUnit(dose, doseUnit, vialUnit)
  if (doseInVialUnit == null) return null
  const mlNeeded = doseInVialUnit / concentration
  return mlNeeded * SYRINGE_UNITS_PER_ML
}

export function calcDoseForUnits(
  units: number,
  vialAmount: number,
  vialUnit: MixUnit,
  bacWaterMl: number,
  doseUnit: MixUnit,
  compound?: string
): number | null {
  const concentration = calcConcentration(vialAmount, bacWaterMl)
  if (concentration == null) return null
  const doseInVialUnit = (units / SYRINGE_UNITS_PER_ML) * concentration
  return compound
    ? convertUnitFor(compound, doseInVialUnit, vialUnit, doseUnit)
    : convertUnit(doseInVialUnit, vialUnit, doseUnit)
}
