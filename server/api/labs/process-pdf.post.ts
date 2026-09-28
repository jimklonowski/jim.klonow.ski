import { normalizeAbsDifferential } from '#shared/utils/labsUnits'
import { isIsoDate } from '#shared/utils/time'

// Builds "[YYYY-MM-DD]-[Description].pdf" from an arbitrary uploaded filename, stripping any
// date-like text already in it first so re-running extraction never doubles up the date.
function buildPdfFilename(originalName: string, date: string): string {
  const base = originalName
    .replace(/\.pdf$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, '')
    .replace(/[-_ ]*\d{4}-\d{2}-\d{2}$/, '')
    .replace(/\d{4}$/, '')
    .replace(/^[-_ ]+/, '')
    .replace(/[-_ ]+$/, '')
    .trim() || 'LabResult'
  return `${date}-${base}.pdf`
}

// The response shape is enforced by structured outputs (the *_SCHEMA constants below), so the
// prompts only say what goes in each field. They used to ask for "ONLY valid JSON" and parse the
// reply as text, which turned a stray code fence or a cut-off object into an opaque 502.
const EXTRACTION_PROMPT = `Extract every biomarker value from this lab report PDF.

Rules:
- date: specimen collection date
- fasting: true if the report indicates a fasting specimen in ANY wording — Quest prints "FASTING: YES", other labs (e.g. CHW) print "Fasting", "Fasting: Y", "Patient fasting", or a fasting note beside glucose/lipids. false if it says FASTING: NO / non-fasting, or carries no fasting information at all
- For values like "<10", use the number 10
- For values like ">X", use X
- Units: convert to the unit the site stores. ABSOLUTE NEUTROPHILS/LYMPHOCYTES/MONOCYTES/EOSINOPHILS/BASOPHILS are stored in cells/uL — if the report gives them in K/uL, x10E3/uL, x10^3/uL or thousand/uL, multiply by 1000 (1.6 K/uL → 1600). WHITE BLOOD CELL COUNT and PLATELET COUNT are stored in K/uL; RED BLOOD CELL COUNT in M/uL
- Lab names vary between labs ("Neutrophils Absolute", "Neut Abs" and "ANC" are all ABSOLUTE NEUTROPHILS) — match by meaning, not exact wording, but never invent a marker the report doesn't contain
- Only include markers actually present in the report
- markers: one { key, value } entry per numeric result, key being one of the exact key names below
- qualitative is for any test result that is NOT a plain number — genetic/mutation analyses, antibody positive/negative, presence/absence findings, or any other categorical result. Use the report's own test name for "name" and its exact reported result (e.g. "Negative", "Heterozygous", "Detected") for "result". Leave the list empty if there are no such results.

Use EXACTLY these key names (lab name → key):
GLUCOSE → glucose
HEMOGLOBIN A1c → hba1c
INSULIN → insulin
UREA NITROGEN (BUN) → bun
CREATININE → creatinine
EGFR → egfr
SODIUM → sodium
POTASSIUM → potassium
CHLORIDE → chloride
CARBON DIOXIDE → co2
CALCIUM → calcium
PROTEIN, TOTAL → protein_total
ALBUMIN → albumin
GLOBULIN → globulin
ALBUMIN/GLOBULIN RATIO → ag_ratio
BILIRUBIN, TOTAL → bilirubin
ALKALINE PHOSPHATASE → alk_phos
AST → ast
ALT → alt
VITAMIN D,25-OH,TOTAL,IA → vitamin_d
IRON, TOTAL → iron
IRON BINDING CAPACITY → tibc
% SATURATION → iron_saturation
FERRITIN → ferritin
TESTOSTERONE, TOTAL → testosterone_total
TESTOSTERONE, FREE → testosterone_free
SEX HORMONE BINDING GLOBULIN → shbg
ESTRADIOL → estradiol
FSH → fsh
LH → lh
DHEA SULFATE → dhea_sulfate
CORTISOL, TOTAL → cortisol
TSH → tsh
IGF 1 → igf1
CHOLESTEROL, TOTAL → cholesterol
HDL CHOLESTEROL → hdl
LDL-CHOLESTEROL → ldl
TRIGLYCERIDES → triglycerides
NON HDL CHOLESTEROL → non_hdl
CHOL/HDLC RATIO → chol_hdl_ratio
APOLIPOPROTEIN B → apob
LIPOPROTEIN (a) → lipoprotein_a
WHITE BLOOD CELL COUNT → wbc
RED BLOOD CELL COUNT → rbc
HEMOGLOBIN → hemoglobin
HEMATOCRIT → hematocrit
MCV → mcv
MCH → mch
MCHC → mchc
RDW → rdw
PLATELET COUNT → platelets
MPV → mpv
ABSOLUTE NEUTROPHILS → abs_neutrophils
ABSOLUTE LYMPHOCYTES → abs_lymphocytes
ABSOLUTE MONOCYTES → abs_monocytes
ABSOLUTE EOSINOPHILS → abs_eosinophils
ABSOLUTE BASOPHILS → abs_basophils
NEUTROPHILS % → neutrophils_pct
LYMPHOCYTES % → lymphocytes_pct
MONOCYTES % → monocytes_pct
EOSINOPHILS % → eosinophils_pct
BASOPHILS % → basophils_pct
HS CRP → hs_crp
HOMOCYSTEINE → homocysteine
URIC ACID → uric_acid
PHOSPHORUS → phosphorus
BUN/CREATININE RATIO → bun_creatinine_ratio
BILIRUBIN, DIRECT → bilirubin_direct
GGT → ggt
LDH → ldh
PSA → psa
VITAMIN B12 → vitamin_b12
FOLATE (FOLIC ACID) → folate`

const DEXA_EXTRACTION_PROMPT = `Extract the data from this DEXA/DXA body composition scan report. All masses in pounds, all percentages as plain numbers (20.2 for 20.2%).

Rules:
- date: scan measurement date
- measurements: one { field, value } entry per figure the report gives, field being one of:
  weight_lbs — the patient's measured/scale weight (not DEXA total mass)
  total.body_fat_pct, total.total_mass_lbs, total.fat_mass_lbs, total.lean_mass_lbs, total.bmc_lbs, total.fat_free_lbs — whole-body figures
  regions.arms / regions.legs / regions.trunk .fat_pct, .fat_lbs, .lean_lbs — e.g. regions.arms.fat_pct
  regions.android / regions.gynoid .fat_pct, .fat_lbs
  vat.volume_in3, vat.fat_mass_lbs — visceral adipose tissue
  ag_ratio — the android/gynoid ratio
  bone_density.total_bmd, bone_density.t_score, bone_density.z_score
  symmetry.right_arm_lean, symmetry.left_arm_lean, symmetry.right_leg_lean, symmetry.left_leg_lean
- Leave out any figure the report doesn't have — never estimate one`

const ECHO_EXTRACTION_PROMPT = `Extract data from this transthoracic echocardiogram report.

Rules:
- date: the study date
- markers: one { key, value } entry per value found. The keys and where to find each value in the "Measurements" table:
  - la_volume_index: the "Vol/bsa, S" row under the "Left atrium" section (ml/m²)
  - lv_mass_index: the "Mass/bsa" row under the "Left ventricle" section (g/m²)
  - e_e_prime_ratio: the "E/e', avg, TDI" row under the "Left ventricle" section (unitless)
  - ivs_thickness: the "IVS, ED" row under the "Ventricular septum" section specifically (cm) — do NOT use the "PW, ED" row under "Left ventricle", which is a different measurement (posterior wall, not septum)
  - ejection_fraction: the estimated ejection fraction stated in the Conclusions/Observations narrative text (not the measurements table). It is usually given as a range like "55-60%" — use the midpoint (e.g. 57.5 for "55-60%")
- Only include a marker if its value is actually present in the report
- qualitative: any notable narrative findings from the Conclusions/Observations/Summary sections that are not plain numbers — valve regurgitation/stenosis grades, wall motion abnormalities, chamber size/function descriptions, pericardial findings, overall impression, etc. Use a short descriptive "name" (e.g. "Mitral Valve", "Overall Impression") and the finding as "result" (e.g. "Mild regurgitation", "Normal LV systolic and diastolic function"). Leave the list empty if there's nothing notable.`

// --- Response schemas (structured outputs) ---------------------------------------------------
// Every property is required, and every figure is a { key, value } list entry rather than an
// optional or nullable field: the API caps a schema at 16 union-typed (nullable) parameters, and
// a DEXA report written as nested nullable fields had 33. A figure the report lacks is simply not
// in the list. Keys are enums, so the model can't invent one; sanitizeMarkers still whitelists.

type JsonSchema = Record<string, unknown>
const num: JsonSchema = { type: 'number' }
const str: JsonSchema = { type: 'string' }
const obj = (properties: Record<string, JsonSchema>): JsonSchema =>
  ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })

/** The bloodwork keys, read off the prompt's own "LAB NAME → key" list so the two can't drift. */
const BLOODWORK_KEYS = [...EXTRACTION_PROMPT.matchAll(/→ (\w+)$/gm)].map(m => m[1]!)
const ECHO_KEYS = ['la_volume_index', 'lv_mass_index', 'e_e_prime_ratio', 'ivs_thickness', 'ejection_fraction']

const markerList = (keys: string[]): JsonSchema => ({ type: 'array', items: obj({ key: { type: 'string', enum: keys }, value: num }) })
const qualitativeList: JsonSchema = { type: 'array', items: obj({ name: str, result: str }) }
const date: JsonSchema = { type: 'string', format: 'date' }

const BLOODWORK_SCHEMA = obj({ date, fasting: { type: 'boolean' }, markers: markerList(BLOODWORK_KEYS), qualitative: qualitativeList })
const ECHO_SCHEMA = obj({ date, markers: markerList(ECHO_KEYS), qualitative: qualitativeList })
/** Every DEXA figure as a dotted path into the stored shape (dexa_entries' JSON columns). */
const DEXA_FIELDS = [
  'weight_lbs',
  ...['body_fat_pct', 'total_mass_lbs', 'fat_mass_lbs', 'lean_mass_lbs', 'bmc_lbs', 'fat_free_lbs'].map(f => `total.${f}`),
  ...['arms', 'legs', 'trunk'].flatMap(r => ['fat_pct', 'fat_lbs', 'lean_lbs'].map(f => `regions.${r}.${f}`)),
  ...['android', 'gynoid'].flatMap(r => ['fat_pct', 'fat_lbs'].map(f => `regions.${r}.${f}`)),
  'vat.volume_in3', 'vat.fat_mass_lbs',
  'ag_ratio',
  'bone_density.total_bmd', 'bone_density.t_score', 'bone_density.z_score',
  'symmetry.right_arm_lean', 'symmetry.left_arm_lean', 'symmetry.right_leg_lean', 'symmetry.left_leg_lean'
]
const DEXA_SCHEMA = obj({
  date,
  measurements: { type: 'array', items: obj({ field: { type: 'string', enum: DEXA_FIELDS }, value: num }) }
})

/** [{ field: 'total.body_fat_pct', value }] → { total: { body_fat_pct } }, the stored shape. */
function dexaObject(extracted: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { date: extracted.date }
  for (const m of Array.isArray(extracted.measurements) ? extracted.measurements : []) {
    const { field, value } = m as { field: string, value: number }
    const path = field.split('.')
    let node = out
    for (const part of path.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>
    node[path.at(-1)!] = value
  }
  return out
}

/** [{ key, value }] → { key: value }, the stored form. */
function markerObject(list: unknown): Record<string, unknown> {
  if (!Array.isArray(list)) return {}
  return Object.fromEntries(list.filter(m => m && typeof m === 'object').map(m => [(m as { key: string }).key, (m as { value: unknown }).value]))
}

export default defineEventHandler(async (event) => {
  requireOwner(event)
  await requireUploadPin(event)

  const formData = await readMultipartFormData(event)
  if (!formData?.length) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const pdf = formData.find(p => p.type === 'application/pdf' || p.filename?.toLowerCase().endsWith('.pdf'))
  if (!pdf) {
    throw createError({ statusCode: 400, message: 'No PDF file found in request' })
  }

  const reportTypePart = formData.find(p => p.name === 'type')
  const reportType = reportTypePart?.data?.toString() ?? 'bloodwork'

  const [prompt, schema] = reportType === 'dexa'
    ? [DEXA_EXTRACTION_PROMPT, DEXA_SCHEMA]
    : reportType === 'echo'
      ? [ECHO_EXTRACTION_PROMPT, ECHO_SCHEMA]
      : [EXTRACTION_PROMPT, BLOODWORK_SCHEMA]

  const base64Data = Buffer.from(pdf.data).toString('base64')

  const startedAt = Date.now()
  let response
  try {
    response = await createAnthropic({ timeout: 120_000 }).messages.create({
      model: AI_MODELS.extract,
      // A wide panel's JSON runs long; 2048 could truncate it mid-object, which then surfaced
      // only as an opaque "could not parse" with the cause invisible. This model also thinks
      // adaptively and max_tokens caps thinking + output together, hence the headroom. Medium
      // effort: a misread value lands in the lab history, so this is worth some reasoning.
      max_tokens: 16_000,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Data }
          },
          { type: 'text', text: prompt }
        ]
      }]
    })
  }
  catch (err) {
    throw aiError(err, 'extract')
  }
  logAiUsage('extract', AI_MODELS.extract, response.usage, response.stop_reason, startedAt)
  assertCompleted(response.stop_reason, 'extract')

  // Structured outputs guarantee the shape; the parse only fails on an empty or refused reply.
  let extracted: Record<string, unknown>
  try {
    extracted = JSON.parse(textOf(response.content)) as Record<string, unknown>
  }
  catch {
    throw createError({ statusCode: 502, message: 'The extraction came back empty — try re-running it.' })
  }
  if (reportType === 'dexa') extracted = dexaObject(extracted)
  else extracted.markers = markerObject(extracted.markers)

  // The report is third-party content sharing a turn with the extraction instructions, so what
  // comes back is untrusted: keep only marker keys this site can store, as finite numbers, and
  // bounded {name, result} qualitative pairs. Anything else is dropped and reported in the
  // preview rather than silently carried into the save.
  let dropped: string[] = []
  if (reportType !== 'dexa') {
    const clean = sanitizeMarkers(extracted.markers)
    dropped = clean.dropped
    // Belt and braces on the prompt's unit rule: CHW prints the WBC differential in K/uL and the
    // site stores cells/uL. Normalizing here means the preview shows exactly what gets saved.
    extracted.markers = reportType === 'bloodwork'
      ? normalizeAbsDifferential(clean.markers)
      : clean.markers
    extracted.qualitative = sanitizeQualitative(extracted.qualitative)
  }

  // Store the PDF in R2 — sources hold bare object keys; list endpoints turn them into proxy URLs.
  // Filename is derived from the extracted (authoritative) date, not whatever the file was named on
  // upload, so every stored PDF follows "[Description]-[YYYY-MM-DD].pdf" regardless of source filename.
  const extractedDate = isIsoDate(extracted.date) ? extracted.date : null
  const pdfFilename = extractedDate
    ? buildPdfFilename(pdf.filename ?? 'LabResult.pdf', extractedDate)
    : (pdf.filename ?? 'lab.pdf')
  const bucket = getLabsBucket(event)
  await bucket.put(pdfFilename, pdf.data, {
    httpMetadata: { contentType: 'application/pdf' }
  })

  // `sources` is built here and only here. It used to start from whatever the model returned,
  // which meant a crafted PDF could name any object in the labs bucket and have the saved row
  // link to it through the authenticated PDF proxy.
  return { ...extracted, sources: [pdfFilename], ...(dropped.length ? { ignoredMarkers: dropped } : {}) }
})
