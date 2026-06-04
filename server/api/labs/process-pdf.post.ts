import Anthropic from '@anthropic-ai/sdk'

const EXTRACTION_PROMPT = `Extract all biomarker values from this lab report PDF and return ONLY a valid JSON object — no markdown, no explanation, just JSON.

Structure:
{
  "date": "YYYY-MM-DD",
  "fasting": true,
  "markers": {}
}

Rules:
- date: specimen collection date in YYYY-MM-DD format
- fasting: true if report says FASTING:YES, false otherwise
- For values like "<10", use the number 10
- For values like ">X", use X
- Only include markers actually present in the report

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
HOMOCYSTEINE → homocysteine`

export default defineEventHandler(async (event) => {
  const authCookie = getCookie(event, 'labs-auth')
  const secret = process.env.LABS_SECRET
  if (!secret || !authCookie || authCookie !== secret) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const uploadPin = getCookie(event, 'labs-upload-auth')
  const correctPin = process.env.LABS_UPLOAD_PIN
  if (!correctPin || !uploadPin || uploadPin !== correctPin) {
    throw createError({ statusCode: 403, message: 'Upload PIN required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw createError({ statusCode: 500, message: 'ANTHROPIC_API_KEY is not configured' })
  }

  const formData = await readMultipartFormData(event)
  if (!formData?.length) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const pdf = formData.find(p => p.type === 'application/pdf' || p.filename?.toLowerCase().endsWith('.pdf'))
  if (!pdf) {
    throw createError({ statusCode: 400, message: 'No PDF file found in request' })
  }

  const base64Data = Buffer.from(pdf.data).toString('base64')

  const anthropic = new Anthropic({ apiKey })

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64Data }
        },
        { type: 'text', text: EXTRACTION_PROMPT }
      ]
    }]
  })

  const text = response.content.find(b => b.type === 'text')?.text ?? ''
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  let extracted: Record<string, unknown>
  try {
    extracted = JSON.parse(cleaned)
  }
  catch {
    throw createError({ statusCode: 500, message: `Could not parse extraction result: ${text.slice(0, 200)}` })
  }

  // Save PDF to /public/labs/ in dev so the source link works
  const pdfFilename = pdf.filename ?? 'lab.pdf'
  if (import.meta.dev) {
    const [{ writeFile }, { join }] = await Promise.all([
      import('node:fs/promises'),
      import('node:path')
    ])
    await writeFile(join(process.cwd(), 'public', 'labs', pdfFilename), pdf.data)
  }

  // Populate sources with the public path so the dashboard can link to it
  const existingSources = Array.isArray(extracted.sources) ? extracted.sources as string[] : []
  const pdfPath = `/labs/${pdfFilename}`
  const sources = existingSources.includes(pdfPath) ? existingSources : [...existingSources, pdfPath]

  return { ...extracted, sources }
})
