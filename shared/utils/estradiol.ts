// One estradiol, two assays. A draw can carry the panel's standard immunoassay (key `estradiol`),
// the ultrasensitive LC/MS/MS add-on (key `estradiol_sensitive`), or both on the same sample. The
// LC/MS/MS reading is the accurate one at the concentrations men run and the one to act on; the
// immunoassay cross-reacts with other steroids and reads differently on the same blood.
//
// The record keeps both keys, each with its own range, and the prompts read both. Everything a
// person looks at shows ONE estradiol (Jim, 2026-11-18): per draw the LC/MS/MS reading when the
// draw has it, else the immunoassay, said to be one. A change is only ever between two readings
// of the same assay — which reading the same key on both draws already guarantees.
//
// Before this, the surfaces outside the two cards read the immunoassay key alone (audit #44
// item 20): a draw with only the LC/MS/MS reading left estradiol blank on the ledger, the watch
// tile and the cycle chips, and the immunoassay's retest stayed overdue for good.

export const E2_SENSITIVE = 'estradiol_sensitive'
export const E2_IMMUNOASSAY = 'estradiol'

export type EstradiolAssay = 'sensitive' | 'immunoassay'

export const ESTRADIOL_ASSAYS: Record<string, { assay: EstradiolAssay, short: string, name: string }> = {
  [E2_SENSITIVE]: { assay: 'sensitive', short: 'LC/MS/MS', name: 'ultrasensitive LC/MS/MS' },
  [E2_IMMUNOASSAY]: { assay: 'immunoassay', short: 'immunoassay', name: 'standard immunoassay' }
}

/** The pair's one name, wherever a reading of either assay is shown. */
export const ESTRADIOL_LABEL = 'Estradiol'

/** What the one card says about the marker, in place of the two catalogue descriptions. */
export const ESTRADIOL_DESCRIPTION = 'The primary estrogen. Important in men for bone density, cardiovascular health, libido, and mood; elevated levels can cause water retention and reduced libido. Two assays measure it. The ultrasensitive LC/MS/MS is the accurate one at the low concentrations men run and the number to act on when deciding about an aromatase inhibitor. The standard immunoassay the monthly panels run cross-reacts with other steroids, so the two can read well apart on the same sample. This card shows the LC/MS/MS reading whenever a draw has one; each assay is trended only against its own readings and judged against its own range.'

type Markers = Record<string, number | null | undefined>

export function isEstradiolKey(key: string): boolean {
  return key === E2_SENSITIVE || key === E2_IMMUNOASSAY
}

const measured = (markers: Markers | null | undefined, key: string) => {
  const v = markers?.[key]
  return v != null && Number.isFinite(v)
}

/** The key a draw's estradiol is read from: the LC/MS/MS when it has it, else the immunoassay, else null. */
export function estradiolKeyOn(draw: { markers: Markers } | null | undefined): string | null {
  if (measured(draw?.markers, E2_SENSITIVE)) return E2_SENSITIVE
  return measured(draw?.markers, E2_IMMUNOASSAY) ? E2_IMMUNOASSAY : null
}

export interface EstradiolReading {
  key: string
  assay: EstradiolAssay
  value: number
}

/** The draw's estradiol: the reading to act on, and which assay it is. */
export function actionableEstradiol(draw: { markers: Markers } | null | undefined): EstradiolReading | null {
  const key = estradiolKeyOn(draw)
  return key ? { key, assay: ESTRADIOL_ASSAYS[key]!.assay, value: draw!.markers[key] as number } : null
}

/**
 * The key a marker column reads on one draw. Either estradiol key names the pair's one slot and
 * resolves to the draw's own assay; every other key is itself. A draw with no estradiol at all
 * answers the key asked for, which then reads as blank.
 */
export function slotKeyOn(key: string, draw: { markers: Markers } | null | undefined): string {
  return isEstradiolKey(key) ? estradiolKeyOn(draw) ?? key : key
}

/** The label a marker is shown under: the pair's one name, else the catalogue's. */
export function markerSlotLabel(key: string, label: string): string {
  return isEstradiolKey(key) ? ESTRADIOL_LABEL : label
}

/**
 * A draw's markers as counted and flagged: the immunoassay is left out when the same draw has the
 * LC/MS/MS reading, so one sample's estradiol is one reading (and one flag), not two.
 */
export function foldAssays<T extends Markers>(markers: T): T {
  if (!measured(markers, E2_SENSITIVE) || !(E2_IMMUNOASSAY in markers)) return markers
  const { [E2_IMMUNOASSAY]: _, ...rest } = markers
  return rest as T
}

/**
 * The same fold over "each marker's newest reading" (currentReadings), where the two keys can
 * come from different draws: the newer reading is the current estradiol, and on the same draw the
 * LC/MS/MS is. Returns a new map; the input is left alone.
 */
export function foldCurrent<V extends { date: string }>(current: ReadonlyMap<string, V>): Map<string, V> {
  const out = new Map(current)
  const sensitive = out.get(E2_SENSITIVE)
  const immunoassay = out.get(E2_IMMUNOASSAY)
  if (sensitive && immunoassay) out.delete(immunoassay.date > sensitive.date ? E2_SENSITIVE : E2_IMMUNOASSAY)
  return out
}
