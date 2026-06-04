export const CATEGORY_LABELS = {
  hormones: 'Hormones',
  metabolic: 'Metabolic',
  lipids: 'Lipids',
  cbc: 'CBC',
  inflammation: 'Inflammation & Nutrients'
} as const

export type Category = keyof typeof CATEGORY_LABELS

export interface BiomarkerMeta {
  label: string
  unit: string
  category: Category
  refMin?: number
  refMax?: number
  higherIsBetter?: boolean
  pinned?: boolean
  description?: string
}

export const BIOMARKERS: Record<string, BiomarkerMeta> = {
  // Hormones
  testosterone_total: { label: 'Testosterone (Total)', unit: 'ng/dL', category: 'hormones', refMin: 250, refMax: 1100, pinned: true, description: 'Primary male sex hormone. Key indicator of hormonal health, muscle mass, energy, and libido. Declines naturally with age.' },
  testosterone_free: { label: 'Testosterone (Free)', unit: 'pg/mL', category: 'hormones', refMin: 35.0, refMax: 155.0, description: 'Biologically active testosterone not bound to carrier proteins. More directly reflects hormonal activity than total testosterone.' },
  shbg: { label: 'SHBG', unit: 'nmol/L', category: 'hormones', refMin: 10, refMax: 50, description: 'Sex Hormone Binding Globulin — a protein that binds testosterone. High SHBG reduces free testosterone availability even when total testosterone looks normal.' },
  igf1: { label: 'IGF-1', unit: 'ng/mL', category: 'hormones', refMin: 53, refMax: 331, pinned: true, description: 'Insulin-like Growth Factor 1 — produced in response to growth hormone. Reflects GH axis function; important for muscle synthesis, bone density, and cellular repair.' },
  dhea_sulfate: { label: 'DHEA-S', unit: 'mcg/dL', category: 'hormones', refMin: 93, refMax: 415, description: 'DHEA Sulfate — a precursor hormone produced by the adrenal glands. Declines steadily with age and serves as a building block for sex hormones.' },
  cortisol: { label: 'Cortisol', unit: 'mcg/dL', category: 'hormones', refMin: 4.0, refMax: 22.0, description: 'Primary stress hormone released by the adrenal glands. Chronically elevated cortisol impairs sleep, metabolism, immune function, and testosterone production.' },
  tsh: { label: 'TSH', unit: 'mIU/L', category: 'hormones', refMin: 0.40, refMax: 4.50, description: 'Thyroid Stimulating Hormone — signals the thyroid to produce T3 and T4. High TSH suggests an underactive thyroid; low TSH suggests an overactive one.' },
  estradiol: { label: 'Estradiol', unit: 'pg/mL', category: 'hormones', refMax: 39, description: 'The primary estrogen. Important in men for bone density, cardiovascular health, libido, and mood. Elevated levels can cause water retention and reduced libido.' },
  fsh: { label: 'FSH', unit: 'mIU/mL', category: 'hormones', refMin: 1.4, refMax: 12.8, description: 'Follicle Stimulating Hormone — stimulates sperm production in the testes. Elevated FSH can indicate testicular dysfunction or primary hypogonadism.' },
  lh: { label: 'LH', unit: 'mIU/mL', category: 'hormones', refMin: 1.5, refMax: 9.3, description: 'Luteinizing Hormone — signals the testes to produce testosterone. Works with FSH to regulate reproductive and hormonal function.' },

  // Metabolic
  glucose: { label: 'Glucose', unit: 'mg/dL', category: 'metabolic', refMin: 65, refMax: 99, pinned: true, description: 'Fasting blood sugar level. Elevated readings indicate insulin resistance or pre-diabetes. Optimal fasting glucose is typically 70–85 mg/dL.' },
  hba1c: { label: 'HbA1c', unit: '%', category: 'metabolic', refMax: 5.7, pinned: true, description: 'Glycated hemoglobin — reflects average blood sugar over the past 3 months. More reliable than a single glucose reading for assessing diabetes risk.' },
  insulin: { label: 'Insulin', unit: 'uIU/mL', category: 'metabolic', refMax: 18.4, description: 'Fasting insulin level. Elevated fasting insulin is an early sign of insulin resistance, often before glucose rises. Optimal is typically below 5 uIU/mL.' },
  bun: { label: 'BUN', unit: 'mg/dL', category: 'metabolic', refMin: 7, refMax: 25, description: 'Blood Urea Nitrogen — a waste product of protein metabolism filtered by the kidneys. Reflects both kidney function and dietary protein intake.' },
  creatinine: { label: 'Creatinine', unit: 'mg/dL', category: 'metabolic', refMin: 0.60, refMax: 1.26, description: 'Waste product from muscle metabolism, filtered by the kidneys. Used with eGFR to assess kidney filtration efficiency. Can be elevated with high muscle mass.' },
  egfr: { label: 'eGFR', unit: 'mL/min/1.73m²', category: 'metabolic', refMin: 60, higherIsBetter: true, description: 'Estimated Glomerular Filtration Rate — measures how well the kidneys filter waste. Below 60 for 3+ months indicates chronic kidney disease.' },
  sodium: { label: 'Sodium', unit: 'mmol/L', category: 'metabolic', refMin: 135, refMax: 146, description: 'Electrolyte critical for fluid balance, blood pressure regulation, and nerve signal transmission. Abnormal levels can affect brain and heart function.' },
  potassium: { label: 'Potassium', unit: 'mmol/L', category: 'metabolic', refMin: 3.5, refMax: 5.3, description: 'Electrolyte essential for heart rhythm, muscle contractions, and nerve signaling. Imbalances — especially low potassium — can cause serious cardiac issues.' },
  chloride: { label: 'Chloride', unit: 'mmol/L', category: 'metabolic', refMin: 98, refMax: 110, description: 'Electrolyte that helps maintain acid-base balance and fluid distribution. Typically follows sodium; abnormal levels may reflect dehydration or kidney issues.' },
  co2: { label: 'CO2', unit: 'mmol/L', category: 'metabolic', refMin: 20, refMax: 32, description: 'Reflects bicarbonate levels in the blood, indicating how well the body maintains its acid-base balance. Low CO2 may signal metabolic acidosis.' },
  calcium: { label: 'Calcium', unit: 'mg/dL', category: 'metabolic', refMin: 8.6, refMax: 10.3, description: 'Mineral vital for bone structure, muscle contractions, nerve signaling, and blood clotting. Most calcium in blood is bound to albumin; interpret alongside albumin.' },
  protein_total: { label: 'Protein, Total', unit: 'g/dL', category: 'metabolic', refMin: 6.1, refMax: 8.1, description: 'Total protein in the blood including albumin and globulin. Low levels may indicate malnutrition, liver disease, or protein loss through the kidneys.' },
  albumin: { label: 'Albumin', unit: 'g/dL', category: 'metabolic', refMin: 3.6, refMax: 5.1, description: 'The main protein made by the liver. Carries nutrients, hormones, and drugs through the blood. A key marker of liver function and nutritional status.' },
  globulin: { label: 'Globulin', unit: 'g/dL', category: 'metabolic', refMin: 1.9, refMax: 3.7, description: 'A group of proteins including antibodies (immunoglobulins). Helps fight infection and transport nutrients. Elevated levels can suggest chronic inflammation or immune disorders.' },
  ag_ratio: { label: 'A/G Ratio', unit: '', category: 'metabolic', refMin: 1.0, refMax: 2.5, description: 'Albumin-to-Globulin ratio. A low ratio may indicate liver disease, kidney disease, or immune disorders. Helps interpret total protein results in context.' },
  bilirubin: { label: 'Bilirubin, Total', unit: 'mg/dL', category: 'metabolic', refMin: 0.2, refMax: 1.2, description: 'Breakdown product of red blood cells, processed by the liver. Elevated levels cause jaundice and may indicate liver disease, bile duct obstruction, or hemolysis.' },
  alk_phos: { label: 'Alk Phosphatase', unit: 'U/L', category: 'metabolic', refMin: 36, refMax: 130, description: 'Alkaline Phosphatase — an enzyme found in the liver and bones. Elevated levels can indicate liver disease, bile duct obstruction, or bone disorders.' },
  ast: { label: 'AST', unit: 'U/L', category: 'metabolic', refMin: 10, refMax: 40, description: 'Aspartate Aminotransferase — a liver enzyme also found in heart and muscle. Elevated when cells are damaged. Less liver-specific than ALT; often elevated after intense exercise.' },
  alt: { label: 'ALT', unit: 'U/L', category: 'metabolic', refMin: 9, refMax: 46, description: 'Alanine Aminotransferase — the most liver-specific enzyme in the metabolic panel. The primary marker for liver cell damage from alcohol, fatty liver, or medications.' },

  // Lipids
  cholesterol: { label: 'Total Cholesterol', unit: 'mg/dL', category: 'lipids', refMax: 200, description: 'Total blood cholesterol including HDL, LDL, and VLDL. Less useful as a standalone marker; context from the full lipid panel — especially ApoB — matters more.' },
  hdl: { label: 'HDL', unit: 'mg/dL', category: 'lipids', refMin: 40, higherIsBetter: true, description: '"Good" cholesterol that removes excess LDL from arteries and returns it to the liver. Higher HDL is consistently associated with lower cardiovascular risk.' },
  ldl: { label: 'LDL', unit: 'mg/dL', category: 'lipids', refMax: 100, description: '"Bad" cholesterol that deposits in artery walls and forms plaques. A key cardiovascular risk factor, though ApoB is now considered more accurate.' },
  triglycerides: { label: 'Triglycerides', unit: 'mg/dL', category: 'lipids', refMax: 150, description: 'Blood fats used for energy storage. Elevated levels — often driven by refined carbs, sugar, and alcohol — are linked to insulin resistance and cardiovascular risk.' },
  non_hdl: { label: 'Non-HDL Cholesterol', unit: 'mg/dL', category: 'lipids', refMax: 130, description: 'All cholesterol except HDL (total minus HDL). Captures all atherogenic particles and is a better cardiovascular predictor than LDL alone.' },
  chol_hdl_ratio: { label: 'Chol/HDL Ratio', unit: '', category: 'lipids', refMax: 5.0, description: 'Ratio of total cholesterol to HDL. A useful risk ratio — lower is better. Above 5.0 indicates elevated cardiovascular risk.' },
  apob: { label: 'ApoB', unit: 'mg/dL', category: 'lipids', refMax: 90, pinned: true, description: 'Apolipoprotein B — the protein on every LDL, VLDL, and IDL particle. Counts the actual number of atherogenic particles. Considered the single most accurate cardiovascular risk marker in the lipid panel.' },
  lipoprotein_a: { label: 'Lipoprotein(a)', unit: 'nmol/L', category: 'lipids', refMax: 75, description: 'An inherited, genetically determined lipoprotein. Elevated Lp(a) significantly increases cardiovascular risk independent of LDL, and does not respond well to lifestyle changes.' },

  // CBC
  wbc: { label: 'WBC', unit: 'K/uL', category: 'cbc', refMin: 3.8, refMax: 10.8, description: 'White Blood Cell count — immune cells that fight infection and disease. Chronically elevated WBC can indicate infection, inflammation, or stress; low WBC may suggest immune suppression.' },
  rbc: { label: 'RBC', unit: 'M/uL', category: 'cbc', refMin: 4.20, refMax: 5.80, description: 'Red Blood Cell count — cells that carry oxygen via hemoglobin. Low RBC indicates anemia; high RBC can indicate dehydration or conditions like polycythemia.' },
  hemoglobin: { label: 'Hemoglobin', unit: 'g/dL', category: 'cbc', refMin: 13.2, refMax: 17.1, description: 'The protein in red blood cells that carries oxygen. Low hemoglobin causes fatigue, weakness, and anemia. The primary marker when evaluating for anemia.' },
  hematocrit: { label: 'Hematocrit', unit: '%', category: 'cbc', refMin: 39.4, refMax: 51.1, description: 'Percentage of blood volume made up of red blood cells. Low hematocrit indicates anemia; high hematocrit can increase blood viscosity and clotting risk.' },
  mcv: { label: 'MCV', unit: 'fL', category: 'cbc', refMin: 81.4, refMax: 101.7, description: 'Mean Corpuscular Volume — average size of red blood cells. Helps classify anemia: low MCV suggests iron deficiency; high MCV suggests B12 or folate deficiency.' },
  mch: { label: 'MCH', unit: 'pg', category: 'cbc', refMin: 27.0, refMax: 33.0, description: 'Mean Corpuscular Hemoglobin — average amount of hemoglobin per red blood cell. Mirrors MCV trends; low MCH parallels iron-deficiency anemia.' },
  mchc: { label: 'MCHC', unit: 'g/dL', category: 'cbc', refMin: 31.6, refMax: 35.4, description: 'Mean Corpuscular Hemoglobin Concentration — average hemoglobin concentration within red blood cells. Low MCHC confirms hypochromic anemia; high is rare.' },
  rdw: { label: 'RDW', unit: '%', category: 'cbc', refMin: 11.0, refMax: 15.0, description: 'Red Cell Distribution Width — variation in red blood cell size. Elevated RDW suggests mixed nutritional deficiencies (iron + B12/folate) and is independently associated with cardiovascular risk.' },
  platelets: { label: 'Platelets', unit: 'K/uL', category: 'cbc', refMin: 140, refMax: 400, description: 'Cell fragments that form blood clots to stop bleeding. Low platelets increase bleeding risk; high platelets can increase clotting risk and may indicate inflammation or bone marrow issues.' },
  mpv: { label: 'MPV', unit: 'fL', category: 'cbc', refMin: 7.5, refMax: 12.5, description: 'Mean Platelet Volume — average platelet size. Larger platelets are metabolically more active. High MPV with low platelet count suggests increased platelet turnover.' },
  abs_neutrophils: { label: 'Neutrophils (Abs)', unit: 'cells/uL', category: 'cbc', refMin: 1500, refMax: 7800, description: 'Absolute neutrophil count — the first-responder white blood cells targeting bacterial infections. Low counts significantly increase infection risk.' },
  abs_lymphocytes: { label: 'Lymphocytes (Abs)', unit: 'cells/uL', category: 'cbc', refMin: 850, refMax: 3900, description: 'Absolute lymphocyte count — immune cells that coordinate adaptive immunity against viruses and cancer. Persistently low counts may indicate immune suppression.' },
  abs_monocytes: { label: 'Monocytes (Abs)', unit: 'cells/uL', category: 'cbc', refMin: 200, refMax: 950, description: 'Absolute monocyte count — white blood cells that mature into macrophages. Elevated levels can indicate chronic infection, inflammation, or autoimmune disease.' },
  abs_eosinophils: { label: 'Eosinophils (Abs)', unit: 'cells/uL', category: 'cbc', refMin: 15, refMax: 500, description: 'Absolute eosinophil count — white blood cells involved in allergic reactions and fighting parasites. Elevated counts often reflect allergies, asthma, or parasitic infection.' },
  abs_basophils: { label: 'Basophils (Abs)', unit: 'cells/uL', category: 'cbc', refMin: 0, refMax: 200, description: 'Absolute basophil count — rare white blood cells that release histamine and other mediators. Elevated in allergic reactions and some inflammatory conditions.' },
  neutrophils_pct: { label: 'Neutrophils %', unit: '%', category: 'cbc', description: 'Percentage of total white blood cells that are neutrophils. High percentage suggests bacterial infection or acute stress.' },
  lymphocytes_pct: { label: 'Lymphocytes %', unit: '%', category: 'cbc', description: 'Percentage of total white blood cells that are lymphocytes. High percentage often seen with viral infections.' },
  monocytes_pct: { label: 'Monocytes %', unit: '%', category: 'cbc', description: 'Percentage of total white blood cells that are monocytes.' },
  eosinophils_pct: { label: 'Eosinophils %', unit: '%', category: 'cbc', description: 'Percentage of total white blood cells that are eosinophils. Elevated in allergies, asthma, and parasitic infections.' },
  basophils_pct: { label: 'Basophils %', unit: '%', category: 'cbc', description: 'Percentage of total white blood cells that are basophils.' },

  // Inflammation & Nutrients
  hs_crp: { label: 'hs-CRP', unit: 'mg/L', category: 'inflammation', refMax: 1.0, pinned: true, description: 'High-sensitivity C-Reactive Protein — a marker of systemic inflammation produced by the liver. Elevated levels predict cardiovascular events independent of cholesterol. Optimal is below 1.0 mg/L.' },
  homocysteine: { label: 'Homocysteine', unit: 'umol/L', category: 'inflammation', refMax: 13.5, description: 'An amino acid tied to B-vitamin (B6, B12, folate) status. Elevated homocysteine damages blood vessel walls and independently increases risk of heart disease and cognitive decline.' },
  vitamin_d: { label: 'Vitamin D', unit: 'ng/mL', category: 'inflammation', refMin: 30, refMax: 100, pinned: true, description: 'Fat-soluble vitamin critical for bone health, immune function, mood regulation, and testosterone production. Most people are deficient; optimal levels are typically 50–80 ng/mL.' },
  iron: { label: 'Iron', unit: 'mcg/dL', category: 'inflammation', refMin: 50, refMax: 180, description: 'Serum iron — the amount of iron circulating in the blood. A single snapshot; interpret alongside ferritin and TIBC for a complete picture of iron status.' },
  tibc: { label: 'Iron Binding Capacity', unit: 'mcg/dL', category: 'inflammation', refMin: 250, refMax: 425, description: 'Total Iron Binding Capacity — measures how much iron the blood could carry. High TIBC with low ferritin strongly indicates iron deficiency.' },
  iron_saturation: { label: 'Iron Saturation', unit: '%', category: 'inflammation', refMin: 20, refMax: 48, description: 'Percentage of iron-binding capacity that is currently filled with iron. Below 20% with low ferritin confirms iron deficiency; above 50% may suggest iron overload.' },
  ferritin: { label: 'Ferritin', unit: 'ng/mL', category: 'inflammation', refMin: 38, refMax: 380, pinned: true, description: 'Protein that stores iron in cells — the best single test for body iron stores. Low ferritin confirms iron deficiency before anemia develops. Also an acute-phase reactant, so can be falsely elevated during inflammation.' }
}

export const PINNED_MARKERS = Object.entries(BIOMARKERS)
  .filter(([, m]) => m.pinned)
  .map(([key]) => key)

export function getStatus(value: number | null, meta: BiomarkerMeta): 'optimal' | 'low' | 'high' | 'unknown' {
  if (value === null || value === undefined) return 'unknown'
  if (meta.refMin !== undefined && value < meta.refMin) return 'low'
  if (meta.refMax !== undefined && value > meta.refMax) return 'high'
  return 'optimal'
}

export function getStatusColor(status: ReturnType<typeof getStatus>) {
  return {
    optimal: 'success' as const,
    low: 'warning' as const,
    high: 'error' as const,
    unknown: 'neutral' as const
  }[status]
}

export function formatValue(value: number | null, meta: BiomarkerMeta): string {
  if (value === null || value === undefined) return '—'
  if (meta.unit === '%' || meta.unit === '') return value.toString()
  return value.toString()
}
