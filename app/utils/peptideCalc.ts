export type MixUnit = 'mg' | 'mcg' | 'iu'

const SYRINGE_UNITS_PER_ML = 100 // U-100 insulin syringe: 1 unit = 0.01 mL

export function convertUnit(amount: number, from: MixUnit, to: MixUnit): number | null {
  if (from === to) return amount
  if (from === 'mg' && to === 'mcg') return amount * 1000
  if (from === 'mcg' && to === 'mg') return amount / 1000
  return null
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
  bacWaterMl: number
): number | null {
  const concentration = calcConcentration(vialAmount, bacWaterMl)
  if (concentration == null || !dose) return null
  const doseInVialUnit = convertUnit(dose, doseUnit, vialUnit)
  if (doseInVialUnit == null) return null
  const mlNeeded = doseInVialUnit / concentration
  return mlNeeded * SYRINGE_UNITS_PER_ML
}

export function calcDoseForUnits(
  units: number,
  vialAmount: number,
  vialUnit: MixUnit,
  bacWaterMl: number,
  doseUnit: MixUnit
): number | null {
  const concentration = calcConcentration(vialAmount, bacWaterMl)
  if (concentration == null) return null
  const doseInVialUnit = (units / SYRINGE_UNITS_PER_ML) * concentration
  return convertUnit(doseInVialUnit, vialUnit, doseUnit)
}
