// Generates the synthetic demo persona: scripts/demo/demo-seed.json (+ placeholder photo SVGs
// in scripts/demo/assets/). Deterministic — a fixed PRNG seed means re-running produces the
// same persona, so the committed seed only changes when this script does.
//
// Dates are stored as RELATIVE day-offsets, not absolute dates: any string starting with
// "@D<n>" materializes to (anchor - n days) at seed/reset time, where the anchor is
// "yesterday" in the app's home timezone. That keeps the demo permanently alive — streaks,
// "LOGGED TODAY", digest recency and the 60-day strip all read the current date, so an
// absolute-dated seed would look abandoned within weeks.
//
//   node scripts/demo/generate-demo-data.mjs
//
// The seed is uploaded to R2 (demo/seed.json in LABS_BUCKET) by scripts/demo/seed-demo.mjs and
// re-read nightly by the demo:reset task. It must NEVER be imported by server code — the seed
// riding along in the Worker bundle would eat the free-plan size budget for nothing.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// --- Deterministic PRNG (mulberry32) ------------------------------------------------------

let prngState = 0xC0FFEE
function rand() {
  prngState |= 0
  prngState = (prngState + 0x6D2B79F5) | 0
  let t = Math.imul(prngState ^ (prngState >>> 15), 1 | prngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (lo, hi) => lo + rand() * (hi - lo)
const pick = arr => arr[Math.floor(rand() * arr.length)]
const round1 = n => Math.round(n * 10) / 10
const round2 = n => Math.round(n * 100) / 100
const chance = p => rand() < p

// Day-offset helpers. TOTAL_DAYS-1 = oldest day, 0 = "yesterday" at materialization time.
const TOTAL_DAYS = 600
const D = n => `@D${n}`
// Weekday for an offset. Offsets count back from the anchor, whose weekday shifts daily in
// production — the persona's "Mon/Thu" style schedules are therefore anchored to offset % 7,
// which stays internally consistent (every 7th day) even though the real-world weekday drifts.
const wd = offset => ((TOTAL_DAYS - offset) % 7) // 0..6, arbitrary but stable labels below
const isDoseDayTRT = o => wd(o) === 1 || wd(o) === 4 // twice a week, 3/4-day split
const isRetaDay = o => wd(o) === 0 // weekly
const isNadDay = o => wd(o) === 1 || wd(o) === 3 || wd(o) === 5
const isTesaDay = o => wd(o) !== 0 && wd(o) !== 6 // 5 on / 2 off

// --- Story arcs ----------------------------------------------------------------------------

// Protocol phase starts, as offsets (bigger = further in the past).
const TRT_START = 400
const RETA_START = 300
const TESA_NAD_START = 200
const BPC_START = 150
const BPC_END = 108

// Weight: 212 -> ~186 with a slow diet-only start, GLP-1 acceleration, one holiday bump.
function weightAt(o) {
  const t = TOTAL_DAYS - o // days into the story
  let w = 212 - t * 0.012 // slow baseline drift
  const retaDays = Math.max(0, RETA_START - o)
  w -= Math.min(retaDays, 240) * 0.075 // GLP-1 era: ~0.5 lb/week extra
  if (o < 180 && o > 150) w += (180 - o) * 0.12 // holiday bump...
  else if (o <= 150) w += 3.6 - Math.min(150 - o, 45) * 0.08 // ...worked back off
  return w
}
const rhrAt = o => 62 - (TOTAL_DAYS - o) * (8 / TOTAL_DAYS)
const hrvAt = o => 38 + (TOTAL_DAYS - o) * (17 / TOTAL_DAYS)
const bpSysAt = o => 132 - (TOTAL_DAYS - o) * (14 / TOTAL_DAYS)
const bpDiaAt = o => 86 - (TOTAL_DAYS - o) * (10 / TOTAL_DAYS)
const bodyFatAt = o => 28.4 - (TOTAL_DAYS - o) * (8.6 / TOTAL_DAYS)

// --- journal_entries -----------------------------------------------------------------------

const GLUTE_DELT = ['left_glute', 'right_glute', 'left_delt', 'right_delt']
const BELLY = ['abdomen', 'left_navel', 'right_navel', 'left_love_handle', 'right_love_handle']

const BREAKFASTS = ['eggs + oatmeal', 'greek yogurt, berries, granola', 'protein shake + banana', 'eggs, turkey bacon, toast', 'overnight oats', 'cottage cheese + peaches', 'skipped — coffee only']
const LUNCHES = ['chicken rice bowl', 'turkey wrap + apple', 'leftover chili', 'tuna salad sandwich', 'chipotle bowl (double chicken)', 'soup + half sandwich', 'grilled chicken caesar']
const DINNERS = ['salmon, potatoes, asparagus', 'steak + sweet potato', 'ground turkey pasta', 'sheet-pan chicken + veg', 'tacos (3, corn tortillas)', 'pork tenderloin + rice', 'burger, no bun, side salad', 'shrimp stir fry']
const SNACKS = ['protein bar', 'almonds', 'apple + peanut butter', 'beef jerky', 'popcorn', 'cheese stick']

const PLAIN_NOTES = [
  'Slept badly — neighbor\'s dog going all night.', 'Solid day. Energy good all afternoon.',
  'Long day at work, skipped the gym, walked at lunch instead.', 'Meal prepped for the week.',
  'Felt flat this morning, better after coffee and a walk.', 'New PR on bench — small one, but counts.',
  'Appetite basically gone by dinner. GLP-1 doing its thing.', 'Grip felt off today. More sleep.',
  'Zone 2 felt easy today — pace at the same HR keeps creeping up.', 'Cheat meal with friends. Worth it.',
  'Left delt a little sore from yesterday\'s pin. Rotating sites more carefully.',
  'Travel day. Hotel gym was two dumbbells and a prayer.', 'Best HRV reading of the month this morning.',
  'Hungrier than usual this week — up-titration hunger rebound is real.', 'Skipped soda at the movies. Progress.'
]

const journalRows = []
const dosesByOffset = new Map() // offset -> PeptideEntry[], reused by digests/stats

for (let o = TOTAL_DAYS - 1; o >= 0; o--) {
  const t = TOTAL_DAYS - o
  // Logging density ramps from ~65% early to ~95%, and the last 35 days are complete so the
  // entries-page streak strip lights up.
  const logged = o < 35 || chance(0.65 + (t / TOTAL_DAYS) * 0.3)
  if (!logged) continue

  const peptides = []
  const addDose = (time, compound, dose, unit, site) => peptides.push({ time, compound, dose, unit, site })

  if (o <= TRT_START && isDoseDayTRT(o) && !chance(0.03)) {
    addDose('08:00', 'Testosterone Cypionate', 70, 'mg', pick(GLUTE_DELT))
  }
  if (o <= RETA_START && isRetaDay(o) && !chance(0.02)) {
    const weeks = Math.floor((RETA_START - o) / 7)
    const dose = weeks < 4 ? 2 : weeks < 12 ? 4 : 6
    addDose('09:00', 'Retatrutide', dose, 'mg', pick(BELLY))
  }
  if (o <= TESA_NAD_START && isTesaDay(o) && !chance(0.08)) {
    addDose('22:00', 'Tesamorelin', 1, 'mg', pick(BELLY))
  }
  if (o <= TESA_NAD_START && isNadDay(o) && !chance(0.1)) {
    addDose('07:15', 'NAD+', 100, 'mg', 'abdomen')
  }
  if (o <= BPC_START && o >= BPC_END && !chance(0.05)) {
    addDose('21:30', 'BPC-157', 250, 'mcg', 'abdomen')
  }
  dosesByOffset.set(o, peptides)

  // Reconstitutions land on the days the matching vials get opened (see vials below).
  const reconstitutions = []
  if (o === 14) reconstitutions.push({ compound: 'Retatrutide', vial_amount: 24, vial_unit: 'mg', supplier: 'Bluewater Research', bac_water_ml: 2.4 })
  if (o === 9) {
    reconstitutions.push({ compound: 'Tesamorelin', vial_amount: 10, vial_unit: 'mg', supplier: 'Vial & Vessel', bac_water_ml: 3 })
    reconstitutions.push({ compound: 'NAD+', vial_amount: 500, vial_unit: 'mg', supplier: 'Vial & Vessel', bac_water_ml: 5 })
  }

  const food = {}
  if (chance(0.4)) {
    food.breakfast = pick(BREAKFASTS)
    food.lunch = pick(LUNCHES)
    food.dinner = pick(DINNERS)
    if (chance(0.35)) food.snack = pick(SNACKS)
  }

  // Soda habit tapers from ~0.8/day to ~0.2/day across the story.
  const sodas = []
  const sodaRate = 0.8 - (t / TOTAL_DAYS) * 0.6
  if (chance(sodaRate)) sodas.push({ time: pick(['12:40', '14:15', '15:30', '19:05']), drink: pick(['Dr Pepper', 'Coke Zero', 'Root Beer', 'Diet Coke']), size: pick(['12oz can', 'Mini can', '20oz bottle']) })
  if (chance(sodaRate * 0.25)) sodas.push({ time: '20:30', drink: pick(['Coke', 'Sprite']), size: '12oz can' })

  let notes = ''
  if (o === TRT_START) notes = 'First testosterone pin this morning. Clinic walked me through everything — glute, slow push, no drama. Here we go.'
  else if (o === RETA_START) notes = 'Started retatrutide at 2 mg. Reading suggests appetite effect kicks in around week two.'
  else if (o === RETA_START - 28) notes = 'Up to 4 mg on the reta. Appetite noticeably quieter — dinner portions basically halved themselves.'
  else if (o === TESA_NAD_START) notes = 'Adding tesamorelin (weeknights) and NAD+ (M/W/F) to the protocol. Fridge is getting crowded.'
  else if (o === BPC_START) notes = 'Elbow has been barking since the press day two weeks ago. Starting a 6-week BPC-157 run for it.'
  else if (o === BPC_END) notes = 'Calling the elbow rehabbed — full pressing week with zero complaints. Ending the BPC run.'
  else if (chance(0.22)) notes = pick(PLAIN_NOTES)

  journalRows.push([
    D(o),
    chance(0.92) ? round1(weightAt(o) + between(-0.9, 0.9)) : null,
    chance(0.5) ? Math.round(bpSysAt(o) + between(-4, 4)) : null,
    chance(0.5) ? Math.round(bpDiaAt(o) + between(-3, 3)) : null,
    Math.round(rhrAt(o) + between(-2, 2)),
    Math.round(hrvAt(o) + between(-6, 6)),
    peptides,
    reconstitutions,
    food,
    sodas,
    notes || null
  ])
  // BP null pairing: if systolic rolled and diastolic didn't (or vice versa) it looks broken.
  const row = journalRows[journalRows.length - 1]
  if ((row[2] == null) !== (row[3] == null)) {
    row[2] = row[2] ?? Math.round(bpSysAt(o) + between(-4, 4))
    row[3] = row[3] ?? Math.round(bpDiaAt(o) + between(-3, 3))
  }
}

// --- labs_entries --------------------------------------------------------------------------

// Nine draws, ~10 weeks apart. Storylines: ApoB falls 108 -> 71 (diet + fish oil arc),
// testosterone climbs onto TRT with LH/FSH suppression + hematocrit creep, ferritin stays
// low-ish (flags on the latest draw), HbA1c/insulin improve with the weight.
const DRAWS = [580, 510, 440, 370, 300, 230, 160, 90, 20]

// Hand-tuned marker arcs, one value per draw (index-aligned with DRAWS).
const ARC = {
  testosterone_total: [468, 452, 487, 742, 815, 868, 842, 861, 889],
  testosterone_free: [72, 68, 75, 118, 131, 142, 138, 141, 146],
  shbg: [38, 37, 36, 31, 29, 28, 27, 28, 27],
  estradiol: [21, 19, 22, 31, 36, 44, 38, 35, 37],
  lh: [4.6, 4.2, 4.8, 0.4, 0.2, 0.2, 0.2, 0.1, 0.2],
  fsh: [3.8, 3.5, 4.1, 0.7, 0.3, 0.2, 0.3, 0.2, 0.2],
  igf1: [158, 149, 163, 171, 168, 205, 232, 241, 238],
  apob: [108, 102, 96, 93, 88, 84, 79, 74, 71],
  ldl: [128, 121, 114, 109, 103, 97, 92, 88, 86],
  hdl: [44, 45, 46, 47, 49, 52, 54, 56, 58],
  triglycerides: [142, 131, 118, 104, 96, 88, 81, 76, 72],
  hba1c: [5.6, 5.6, 5.5, 5.4, 5.4, 5.3, 5.3, 5.2, 5.2],
  glucose: [96, 94, 92, 90, 88, 87, 86, 85, 84],
  insulin: [8.2, 7.6, 6.8, 6.1, 5.4, 4.9, 4.5, 4.1, 3.9],
  ferritin: [42, 39, 44, 41, 37, 40, 36, 35, 33],
  vitamin_d: [28, 34, 41, 47, 52, 56, 58, 61, 62],
  hs_crp: [2.1, 1.8, 1.5, 1.2, 1.0, 0.9, 0.8, 0.7, 0.6],
  hematocrit: [45.8, 46.1, 46.4, 47.9, 49.2, 50.1, 50.6, 51.4, 50.8],
  hemoglobin: [15.2, 15.3, 15.4, 15.9, 16.3, 16.6, 16.8, 17.0, 16.9],
  tsh: [1.9, 2.1, 1.8, 1.7, 1.9, 1.8, 1.6, 1.7, 1.8],
  dhea_sulfate: [235, 228, 241, 250, 246, 252, 249, 255, 251],
  cortisol: [14.2, 13.8, 15.1, 12.9, 12.2, 11.8, 12.4, 11.5, 11.9]
}

// The rest of the panel: stable, in-range, small noise.
const STEADY = {
  bun: [7, 25], creatinine: [0.9, 1.15], egfr: [88, 105], sodium: [138, 142],
  potassium: [4.0, 4.6], chloride: [100, 105], co2: [24, 28], calcium: [9.2, 9.8],
  protein_total: [6.8, 7.4], albumin: [4.4, 4.8], globulin: [2.4, 2.8],
  bilirubin: [0.4, 0.9], alk_phos: [55, 75], ast: [22, 34], alt: [24, 38],
  wbc: [4.8, 6.9], rbc: [4.8, 5.4], mcv: [86, 92], mch: [28.5, 31], mchc: [32.5, 34.5],
  rdw: [12.2, 13.4], platelets: [210, 280], iron: [78, 112], tibc: [300, 360], iron_saturation: [24, 34]
}

// TICKER-voice draw summaries, written date-agnostic ("since the last draw") because the
// offsets shift with every nightly re-anchor. {key} tokens interpolate that draw's value.
const AI_SUMMARIES = [
  'First full panel in the books, and I\'ll be honest with you: ApoB at {apob} is the number I keep looking at. Lipids want work — triglycerides {triglycerides}, HDL {hdl} — and vitamin D at {vitamin_d} is scraping the floor. Testosterone sits mid-range at {testosterone_total}. Nothing scary, plenty actionable: this is a solid "before" picture. Fasting insulin {insulin} says metabolism is still cooperating. Let\'s build from here.',
  'Second draw, early wins. ApoB nudged down to {apob} and triglycerides to {triglycerides} — diet changes are showing up in the plumbing. Vitamin D responding to supplementation at {vitamin_d}. Testosterone basically unchanged at {testosterone_total}; energy complaints match it. Ferritin at {ferritin} bears watching — not deficient, not comfortable either. Keep the fish oil, keep the walks.',
  'Steady as she goes. Lipids keep drifting the right way (ApoB {apob}, LDL {ldl}) and HbA1c ticked to {hba1c}. Testosterone still mid-4s at {testosterone_total} with LH {lh} — the clinic conversation about TRT is on the table now, and this panel is the clean baseline you\'d want before starting. Everything hepatic and renal is boring, which is exactly how I like it.',
  'First panel on testosterone therapy, and the axis did what it does: total T up to {testosterone_total}, free T {testosterone_free}, LH/FSH suppressed to {lh}/{fsh} — expected on-protocol, not a problem to fix. Estradiol rose with it to {estradiol}; no symptoms logged, so we watch rather than react. Hematocrit {hematocrit} — up from baseline, still in range. Meanwhile the lipid story keeps improving: ApoB {apob}. Good draw.',
  'Settling in. Testosterone holding at {testosterone_total} and the insulin picture keeps tightening — fasting insulin {insulin}, HOMA-IR territory I\'m happy with. Estradiol {estradiol} tracks the higher T like it should. Hematocrit {hematocrit}, creeping — hydration before draws matters, and this is the marker TRT asks us to respect. ApoB {apob} and hs-CRP {hs_crp}: the cardiovascular file keeps getting thinner. Ferritin {ferritin} still unimpressive.',
  'Big panel, echo included — the heart itself reads structurally normal, EF mid-normal, atria where they should be. On the blood side: estradiol popped over range at {estradiol}. Given zero symptoms in the journal, the playbook says re-test before reaching for an AI. Hematocrit {hematocrit} — highest yet, still in range, donation is the friendly lever if it keeps climbing. IGF-1 rising at {igf1} now that tesamorelin is aboard. ApoB {apob}. The trend lines all point the right way.',
  'Estradiol back inside at {estradiol} on the re-test — patience beat the pill, as it usually does. IGF-1 at {igf1}: tesamorelin earning its slot in the fridge. HbA1c {hba1c}, insulin {insulin}, triglycerides {triglycerides} — the metabolic panel of a lighter man, because you are one. Ferritin {ferritin} drifting down again; iron with vitamin C on empty-stomach mornings, and we re-check.',
  'The headline is hematocrit at {hematocrit} — a hair over range, first flag of the TRT era. Not alarming, absolutely worth acting on: hydrate properly before draws, consider a donation, re-check next panel. Everything else is a victory lap — ApoB {apob}, HDL {hdl}, hs-CRP {hs_crp}. Testosterone {testosterone_total} with free T {testosterone_free}. IGF-1 steady at {igf1}.',
  'Latest draw, and the "after" picture is real: ApoB {apob} (down from 108 at baseline), triglycerides {triglycerides}, HbA1c {hba1c}, hs-CRP {hs_crp}. Hematocrit back inside at {hematocrit} — the donation worked. Two watch items and they\'re familiar: ferritin dipped to {ferritin}, just under range, so the iron protocol gets serious now; LH/FSH remain suppressed at {lh}/{fsh}, which is the deal we signed with TRT. Overall: this is what eighteen months of showing up looks like.'
]

const labsRows = DRAWS.map((o, i) => {
  const markers = {}
  for (const [key, arc] of Object.entries(ARC)) markers[key] = arc[i]
  for (const [key, [lo, hi]] of Object.entries(STEADY)) {
    const v = between(lo, hi)
    markers[key] = ['wbc', 'rbc', 'creatinine', 'protein_total', 'albumin', 'globulin', 'bilirubin', 'mch', 'mchc', 'rdw'].includes(key) ? round2(v) : ['mcv'].includes(key) ? round1(v) : Math.round(v)
  }
  markers.cholesterol = Math.round(markers.ldl + markers.hdl + markers.triglycerides / 5 + between(4, 9))
  markers.non_hdl = markers.cholesterol - markers.hdl
  markers.chol_hdl_ratio = round1(markers.cholesterol / markers.hdl)
  markers.ag_ratio = round1(markers.albumin / markers.globulin)
  if (i === 0) markers.lipoprotein_a = 18 // genetic, measured once
  if (i === 5) { // echo draw
    markers.la_volume_index = 27
    markers.ejection_fraction = 62
    markers.e_e_prime_ratio = 7.8
    markers.lv_mass_index = 88
    markers.ivs_thickness = 0.9
  }

  const qualitative = i === 5
    ? [
        { name: 'LV Systolic Function', result: 'Normal', category: 'echo' },
        { name: 'Diastolic Function', result: 'Normal for age', category: 'echo' },
        { name: 'Mitral Valve', result: 'Trace regurgitation', category: 'echo' },
        { name: 'Aortic Valve', result: 'Trileaflet, normal', category: 'echo' },
        { name: 'Pericardium', result: 'No effusion', category: 'echo' }
      ]
    : []

  const summary = AI_SUMMARIES[i].replace(/\{(\w+)\}/g, (_, key) => String(markers[key]))
  return [D(o), 1, [], markers, qualitative, summary]
})

// --- dexa_entries --------------------------------------------------------------------------

const DEXA_SCANS = [540, 360, 180, 30].map((o) => {
  const bf = round1(bodyFatAt(o))
  const weight = round1(weightAt(o))
  const fat = round1(weight * bf / 100)
  const bmc = round1(6.4 + (TOTAL_DAYS - o) * 0.0004)
  const lean = round1(weight - fat - bmc)
  const androidPct = round1(bf * 1.22)
  const gynoidPct = round1(bf * 1.04)
  return [
    D(o),
    weight,
    [],
    { body_fat_pct: bf, total_mass_lbs: weight, fat_mass_lbs: fat, lean_mass_lbs: lean, bmc_lbs: bmc, fat_free_lbs: round1(lean + bmc) },
    {
      arms: { fat_pct: round1(bf * 0.82), fat_lbs: round1(fat * 0.10), lean_lbs: round1(lean * 0.135) },
      legs: { fat_pct: round1(bf * 1.05), fat_lbs: round1(fat * 0.33), lean_lbs: round1(lean * 0.34) },
      trunk: { fat_pct: round1(bf * 1.12), fat_lbs: round1(fat * 0.52), lean_lbs: round1(lean * 0.46) },
      android: { fat_pct: androidPct, fat_lbs: round1(fat * 0.09) },
      gynoid: { fat_pct: gynoidPct, fat_lbs: round1(fat * 0.16) }
    },
    { volume_in3: Math.round(62 - (TOTAL_DAYS - o) * 0.054), fat_mass_lbs: round1(2.2 - (TOTAL_DAYS - o) * 0.0019) },
    round2(androidPct / gynoidPct),
    { total_bmd: 1.21, t_score: 0.4, z_score: 0.3 },
    { right_arm_lean: round1(lean * 0.069), left_arm_lean: round1(lean * 0.066), right_leg_lean: round1(lean * 0.172), left_leg_lean: round1(lean * 0.168) }
  ]
})

// --- health_metrics (daily) ----------------------------------------------------------------

const healthRows = []
const strainByOffset = new Map()
for (let o = TOTAL_DAYS - 1; o >= 0; o--) {
  const total = Math.round(between(360, 480))
  const rem = Math.round(total * between(0.19, 0.25))
  const deep = Math.round(total * between(0.15, 0.21))
  const awake = Math.round(total * between(0.03, 0.07))
  const core = total - rem - deep - awake
  const strain = round1(between(4, 16))
  strainByOffset.set(o, strain)
  const prevStrain = strainByOffset.get(o + 1) ?? 10
  const recovery = Math.max(20, Math.min(99, Math.round(
    55 + (total - 420) * 0.12 - (prevStrain - 10) * 2.5 + between(-12, 12) + (TOTAL_DAYS - o) * 0.012
  )))
  const isWeekly = wd(o) === 0
  const monthly = o % 30 === 0
  healthRows.push([
    D(o),
    isWeekly ? round1(38 + (TOTAL_DAYS - o) * (8 / TOTAL_DAYS) + between(-0.4, 0.4)) : null,
    monthly ? round1(bodyFatAt(o) + between(-0.4, 0.4)) : null,
    monthly ? round1(weightAt(o) * (1 - bodyFatAt(o) / 100) - 6.4) : null,
    total, rem, deep, core, awake,
    recovery,
    strain,
    Math.max(45, Math.min(100, Math.round(total / 4.8 + between(-6, 4))))
  ])
}

// --- workouts ------------------------------------------------------------------------------

const workoutRows = []
for (let o = TOTAL_DAYS - 1; o >= 0; o--) {
  const day = wd(o)
  const sessions = []
  if (day === 1 || day === 4 || day === 6) {
    if (!chance(0.12)) sessions.push({ type: pick(['Traditional Strength Training', 'Functional Strength Training']), time: pick(['06:10', '17:05', '17:40']), dur: between(42, 68), hr: [between(104, 118), between(148, 165)] })
  }
  if (day === 2 || day === 5) {
    if (!chance(0.2)) {
      const run = chance(0.6)
      sessions.push({ type: run ? 'Running' : 'Cycling', time: pick(['06:20', '18:00']), dur: between(32, 55), hr: [between(126, 142), between(150, 168)], dist: run ? between(2.6, 4.8) : between(8, 14) })
    }
  }
  if (day === 0 && chance(0.4)) {
    sessions.push({ type: 'Tennis', time: '10:00', dur: between(55, 85), hr: [between(118, 132), between(158, 176)] })
  }
  for (const s of sessions) {
    const dur = round1(s.dur)
    workoutRows.push([
      null, // external_id: mirrors Apple Health rows, deduped on natural key
      D(o),
      s.type,
      `${D(o)} ${s.time}:00 -0500`,
      dur,
      Math.round(dur * between(6.5, 9.5)),
      Math.round(s.hr[0]),
      Math.round(s.hr[1]),
      s.dist ? round1(s.dist) : null
    ])
  }
}

// --- supplements ---------------------------------------------------------------------------

const supplementRows = [
  ['Creatine Monohydrate', '5 g', 'supplement', 'active', 'daily', D(560), null, 'In the morning shake.', 10],
  ['Vitamin D3 + K2', '5000 IU / 100 mcg', 'supplement', 'active', 'daily, with breakfast', D(555), null, 'Started after the first draw came back at 28 ng/mL.', 20],
  ['Fish Oil (EPA/DHA)', '2 g', 'supplement', 'active', 'daily, with dinner', D(555), null, 'Part of the ApoB project.', 30],
  ['Magnesium Glycinate', '400 mg', 'supplement', 'active', 'nightly', D(500), null, 'Sleep stack.', 40],
  ['Zinc Picolinate', '25 mg', 'supplement', 'active', 'daily', D(430), null, null, 50],
  ['Iron Bisglycinate', '25 mg', 'supplement', 'active', 'empty stomach + vitamin C, M/W/F', D(60), null, 'Ferritin protocol — re-check next draw.', 60],
  ['Electrolytes', '1 packet', 'supplement', 'active', 'training days', D(420), null, null, 70],
  ['Psyllium Husk', '5 g', 'supplement', 'active', 'nightly', D(300), null, 'Fiber floor while the GLP-1 keeps portions small.', 80],
  ['Tretinoin 0.025%', 'pea-sized', 'skin', 'active', 'nightly, ~3x/week', D(380), null, 'Buffered with moisturizer.', 90],
  ['SPF 50 (face)', null, 'skin', 'active', 'every morning', D(380), null, 'Non-negotiable with the tretinoin.', 100],
  ['Berberine', '500 mg', 'supplement', 'on_hand', 'with largest meal', null, null, 'Bought before the GLP-1 era; probably redundant now.', 110],
  ['Ashwagandha', '600 mg', 'supplement', 'stopped', 'nightly', D(520), D(330), 'Six months, no measurable difference in HRV or sleep — dropped it.', 120]
].map(r => [...r, `${r[5] ?? D(560)}T14:00:00Z`])

// --- vials ---------------------------------------------------------------------------------

// Active-vial remaining mg derives from journal doses on/after opened_date, so the amounts
// here are sized against the dose schedule above (Reta 6 mg/wk, Tesa 1 mg x5/wk, NAD+ 100 x3/wk).
const vialRows = [
  ['Retatrutide', 'Bluewater Research', 24, 'mg', 2, 'sealed', null, null, 'BW-2411', D(-240), 210, 'Fridge, top shelf.', `${D(70)}T14:00:00Z`],
  ['Retatrutide', 'Bluewater Research', 24, 'mg', 1, 'active', D(14), 2.4, 'BW-2411', D(-240), 210, null, `${D(14)}T14:00:00Z`],
  ['Tesamorelin', 'Vial & Vessel', 10, 'mg', 3, 'sealed', null, null, 'VV-7719', D(-300), 95, null, `${D(70)}T14:00:00Z`],
  ['Tesamorelin', 'Vial & Vessel', 10, 'mg', 1, 'active', D(9), 3, 'VV-7719', D(-300), 95, null, `${D(9)}T14:00:00Z`],
  ['NAD+', 'Vial & Vessel', 500, 'mg', 1, 'sealed', null, null, 'VV-8102', D(-330), 60, null, `${D(70)}T14:00:00Z`],
  ['NAD+', 'Vial & Vessel', 500, 'mg', 1, 'active', D(9), 5, 'VV-8102', D(-330), 60, null, `${D(9)}T14:00:00Z`],
  ['Testosterone Cypionate', 'TRT clinic', 2000, 'mg', 1, 'active', D(45), null, null, D(-500), null, '10 mL @ 200 mg/mL, clinic-dispensed.', `${D(45)}T14:00:00Z`],
  ['BPC-157', 'Bluewater Research', 10, 'mg', 1, 'finished', D(150), 2, 'BW-1988', D(-100), 42, 'Elbow rehab run — worked.', `${D(150)}T14:00:00Z`],
  ['Retatrutide', 'Bluewater Research', 24, 'mg', 1, 'finished', D(42), 2.4, 'BW-2296', D(-240), 210, null, `${D(42)}T14:00:00Z`],
  ['Tesamorelin', 'Vial & Vessel', 10, 'mg', 1, 'finished', D(23), 3, 'VV-7719', D(-300), 95, null, `${D(23)}T14:00:00Z`]
]

// --- digests -------------------------------------------------------------------------------

// Stats are computed from the generated rows so the canned digests never contradict the data
// on screen. Summaries are hand-written in TICKER's voice, date-agnostic.
const journalByOffset = new Map(journalRows.map(r => [Number(r[0].slice(2)), r]))
const healthByOffset = new Map(healthRows.map(r => [Number(r[0].slice(2)), r]))
const workoutsByOffset = new Map()
for (const w of workoutRows) {
  const o = Number(w[1].slice(2))
  workoutsByOffset.set(o, (workoutsByOffset.get(o) ?? 0) + 1)
}

function dailyStats(o) {
  const j = journalByOffset.get(o)
  const h = healthByOffset.get(o)
  return {
    weight_lbs: j?.[1] ?? null,
    rhr: j?.[4] ?? null,
    hrv: j?.[5] ?? null,
    recovery: h?.[9] ?? null,
    strain: h?.[10] ?? null,
    sleep_min: h?.[4] ?? null,
    doses: (dosesByOffset.get(o) ?? []).length,
    workouts: workoutsByOffset.get(o) ?? 0,
    sodas: j?.[9]?.length ?? 0
  }
}

const DAILY_DIGESTS = [
  'Yesterday earned a nod: {doses} dose{doses_s} logged on schedule, recovery sitting at {recovery}, and the scale at {weight_lbs}. Sleep came in at {sleep_h} — not your best week for it, but the HRV of {hrv} says the engine room is fine. Today\'s only ask from me: water before coffee.',
  'Quiet, solid day. RHR {rhr}, HRV {hrv}, recovery {recovery} — three greens on the board. {workouts_line} No soda, which I noticed and appreciated. Protocol ticked along without drama.',
  'The kind of day that builds the trend line. Weight {weight_lbs}, sleep {sleep_h}, strain {strain} — an honest day\'s work without borrowing from tomorrow. Doses done. I have no complaints, which you know is rare.',
  'Recovery dipped to {recovery} — yesterday\'s strain of {strain} plus a shorter night ({sleep_h}) will do that. Nothing structural; HRV {hrv} is still in your normal band. If today wants to be easy, let it be easy.',
  'A {sleep_h} night, recovery {recovery}, and the weekly weigh-in trend still pointing gently down at {weight_lbs}. {workouts_line} The streak is doing the quiet compounding work. Keep feeding it.',
  'Logged everything, lifted {workouts_line_short}, kept the sodas at {sodas}. RHR {rhr} continues its slow drift down — that\'s months of zone 2 talking, not luck. Strain {strain}, recovery {recovery}. Carry on.',
  'Yesterday: {doses} dose{doses_s}, {sodas} soda{sodas_s}, sleep {sleep_h}, recovery {recovery}. The numbers are so steady lately that my job is mostly narration. Weight {weight_lbs}. See you at the next draw.'
]

function fmtSleep(min) {
  if (min == null) return '—'
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

const digestRows = []
for (let i = 0; i < 7; i++) {
  // The newest daily digest covers the anchor day itself ("yesterday" at materialization
  // time), created the following day — matching the real digest:daily cron's cadence.
  const o = i
  const s = dailyStats(o)
  const summary = DAILY_DIGESTS[i]
    .replaceAll('{doses}', String(s.doses))
    .replaceAll('{doses_s}', s.doses === 1 ? '' : 's')
    .replaceAll('{sodas}', String(s.sodas))
    .replaceAll('{sodas_s}', s.sodas === 1 ? '' : 's')
    .replaceAll('{recovery}', s.recovery != null ? String(s.recovery) : '—')
    .replaceAll('{strain}', s.strain != null ? String(s.strain) : '—')
    .replaceAll('{weight_lbs}', s.weight_lbs != null ? `${s.weight_lbs} lbs` : 'unlogged')
    .replaceAll('{rhr}', s.rhr != null ? String(s.rhr) : '—')
    .replaceAll('{hrv}', s.hrv != null ? String(s.hrv) : '—')
    .replaceAll('{sleep_h}', fmtSleep(s.sleep_min))
    .replaceAll('{workouts_line}', s.workouts ? `${s.workouts} workout${s.workouts === 1 ? '' : 's'} in the log.` : 'Rest day, honestly taken.')
    .replaceAll('{workouts_line_short}', s.workouts ? `${s.workouts}x` : 'nothing (rest day)')
  digestRows.push(['daily', D(o), D(o), summary, s, `${D(o - 1)}T14:00:00Z`])
}

function weeklyStats(endO) {
  const range = []
  for (let o = endO; o < endO + 7; o++) range.push(o)
  const js = range.map(o => journalByOffset.get(o)).filter(Boolean)
  const hs = range.map(o => healthByOffset.get(o)).filter(Boolean)
  const weights = js.map(j => j[1]).filter(v => v != null)
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const bpSys = js.map(j => j[2]).filter(v => v != null)
  const bpDia = js.map(j => j[3]).filter(v => v != null)
  return {
    weight_lbs: weights[weights.length - 1] ?? null,
    weight_change: weights.length >= 2 ? round1(weights[weights.length - 1] - weights[0]) : null,
    avg_recovery: hs.length ? Math.round(avg(hs.map(h => h[9]))) : null,
    avg_strain: hs.length ? round1(avg(hs.map(h => h[10]))) : null,
    avg_sleep_min: hs.length ? Math.round(avg(hs.map(h => h[4]))) : null,
    avg_bp_systolic: bpSys.length ? Math.round(avg(bpSys)) : null,
    avg_bp_diastolic: bpDia.length ? Math.round(avg(bpDia)) : null,
    compounds: range.reduce((n, o) => n + (dosesByOffset.get(o)?.length ?? 0), 0),
    workouts: range.reduce((n, o) => n + (workoutsByOffset.get(o) ?? 0), 0),
    sodas: js.reduce((n, j) => n + (j[9]?.length ?? 0), 0)
  }
}

const WEEKLY_DIGESTS = [
  'Week in review: {compounds} doses, {workouts} workouts, {sodas} sodas, and the scale closing at {weight_lbs} ({weight_change} on the week). Average recovery {avg_recovery} on {avg_sleep} of sleep a night — the machine is humming. BP averaged {bp}. My note for next week is the same as this week: nothing heroic, just attendance.',
  'Another week banked. Weight {weight_lbs}, {weight_change} on the week — the GLP-1 era continues to be quietly ruthless. {workouts} sessions, average strain {avg_strain}, and recovery holding at {avg_recovery}. Soda count: {sodas}. I remember when that number had two digits a week. Growth.',
  'Strong week. {workouts} workouts against an average recovery of {avg_recovery} — load and recovery are actually talking to each other now. BP averaging {bp}, which would make your first lab draw blush. {compounds} doses, all on schedule. The consistency is the protocol.'
]

const WEEKLY_ENDS = [0, 7, 14]
WEEKLY_ENDS.forEach((endO, i) => {
  const s = weeklyStats(endO)
  const summary = WEEKLY_DIGESTS[i]
    .replaceAll('{compounds}', String(s.compounds))
    .replaceAll('{workouts}', String(s.workouts))
    .replaceAll('{sodas}', String(s.sodas))
    .replaceAll('{weight_lbs}', s.weight_lbs != null ? `${s.weight_lbs} lbs` : '—')
    .replaceAll('{weight_change}', s.weight_change != null ? `${s.weight_change > 0 ? '+' : ''}${s.weight_change} lbs` : '—')
    .replaceAll('{avg_recovery}', s.avg_recovery != null ? String(s.avg_recovery) : '—')
    .replaceAll('{avg_strain}', s.avg_strain != null ? String(s.avg_strain) : '—')
    .replaceAll('{avg_sleep}', fmtSleep(s.avg_sleep_min))
    .replaceAll('{bp}', s.avg_bp_systolic != null ? `${s.avg_bp_systolic}/${s.avg_bp_diastolic}` : '—')
  digestRows.push(['weekly', D(endO + 6), D(endO), summary, s, `${D(endO - 1)}T15:00:00Z`])
})

// --- progress_photos + placeholder SVGs ----------------------------------------------------

// Neutral generated silhouettes — recognizably placeholders, styled to the terminal theme.
// The waist narrows across phases so the compare slider has something honest to show.
function torsoSvg(label, phase) {
  const waist = 92 - phase * 9
  const shoulder = 96 + phase * 3
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 300 400">
<rect width="300" height="400" fill="#0b1210"/>
<g fill="none" stroke="#22c55e" stroke-width="2" opacity="0.8">
<circle cx="150" cy="70" r="26"/>
<path d="M150 96 C ${150 - shoulder / 2} 110, ${150 - shoulder / 2} 130, ${150 - shoulder / 2 + 6} 190 C ${150 - waist / 2} 240, ${150 - waist / 2} 280, ${150 - waist / 2 - 4} 340 M150 96 C ${150 + shoulder / 2} 110, ${150 + shoulder / 2} 130, ${150 + shoulder / 2 - 6} 190 C ${150 + waist / 2} 240, ${150 + waist / 2} 280, ${150 + waist / 2 + 4} 340"/>
</g>
<text x="150" y="376" fill="#3f6f57" font-family="monospace" font-size="13" text-anchor="middle">DEMO PLACEHOLDER · ${label}</text>
</svg>`
}

function faceSvg(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 300 400">
<rect width="300" height="400" fill="#0b1210"/>
<g fill="none" stroke="#22c55e" stroke-width="2" opacity="0.8">
<ellipse cx="150" cy="180" rx="70" ry="92"/>
<path d="M118 165 h24 M158 165 h24 M150 175 v28 M128 240 q22 16 44 0"/>
</g>
<text x="150" y="376" fill="#3f6f57" font-family="monospace" font-size="13" text-anchor="middle">DEMO PLACEHOLDER · ${label}</text>
</svg>`
}

const assetsDir = join(HERE, 'assets')
mkdirSync(assetsDir, { recursive: true })
const photoRows = []
const PHOTO_SETS = [
  [540, 0], [360, 1], [180, 2], [30, 3]
]
for (const [o, phase] of PHOTO_SETS) {
  writeFileSync(join(assetsDir, `chest-${phase + 1}.svg`), torsoSvg(`CHEST ${phase + 1}/4`, phase))
  photoRows.push([D(o), 'chest', `demo/chest-${phase + 1}.svg`, null, `${D(o)}T09:1${phase}:00`, `${D(o)}T14:00:00Z`, 0, 0, 1])
}
for (const [o, phase] of [[420, 0], [40, 1]]) {
  writeFileSync(join(assetsDir, `face-${phase + 1}.svg`), faceSvg(`FACE ${phase + 1}/2`))
  photoRows.push([D(o), 'face', `demo/face-${phase + 1}.svg`, null, `${D(o)}T09:30:00`, `${D(o)}T14:00:00Z`, 0, 0, 1])
}

// --- Assemble ------------------------------------------------------------------------------

const seed = {
  version: 1,
  note: 'Synthetic demo persona. All values are generated fiction — no real health data. Regenerate with: node scripts/demo/generate-demo-data.mjs',
  tables: {
    journal_entries: {
      cols: ['date', 'weight_lbs', 'bp_systolic', 'bp_diastolic', 'rhr', 'hrv', 'peptides', 'reconstitutions', 'food', 'sodas', 'notes'],
      jsonCols: ['peptides', 'reconstitutions', 'food', 'sodas'],
      rows: journalRows
    },
    labs_entries: {
      cols: ['date', 'fasting', 'sources', 'markers', 'qualitative', 'ai_summary'],
      jsonCols: ['sources', 'markers', 'qualitative'],
      rows: labsRows
    },
    dexa_entries: {
      cols: ['date', 'weight_lbs', 'sources', 'total', 'regions', 'vat', 'ag_ratio', 'bone_density', 'symmetry'],
      jsonCols: ['sources', 'total', 'regions', 'vat', 'bone_density', 'symmetry'],
      rows: DEXA_SCANS
    },
    health_metrics: {
      cols: ['date', 'vo2_max', 'body_fat_pct', 'lean_body_mass_lbs', 'sleep_total_min', 'sleep_rem_min', 'sleep_deep_min', 'sleep_core_min', 'sleep_awake_min', 'recovery_score', 'strain', 'sleep_performance_pct'],
      jsonCols: [],
      rows: healthRows
    },
    workouts: {
      cols: ['external_id', 'date', 'workout_type', 'start_time', 'duration_min', 'calories', 'avg_hr', 'max_hr', 'distance_mi'],
      jsonCols: [],
      rows: workoutRows
    },
    supplements: {
      cols: ['name', 'dose', 'category', 'status', 'schedule', 'started', 'stopped', 'notes', 'sort', 'created_at'],
      jsonCols: [],
      rows: supplementRows
    },
    vials: {
      cols: ['compound', 'supplier', 'vial_amount', 'vial_unit', 'quantity', 'status', 'opened_date', 'bac_water_ml', 'lot', 'expiry', 'cost', 'notes', 'created_at'],
      jsonCols: [],
      rows: vialRows
    },
    digests: {
      cols: ['type', 'period_start', 'period_end', 'summary', 'stats', 'created_at'],
      jsonCols: ['stats'],
      rows: digestRows
    },
    progress_photos: {
      cols: ['date', 'category', 'r2_key', 'thumb_r2_key', 'taken_at', 'created_at', 'frame_offset_x', 'frame_offset_y', 'frame_scale'],
      jsonCols: [],
      rows: photoRows
    }
  }
}

const outPath = join(HERE, 'demo-seed.json')
writeFileSync(outPath, JSON.stringify(seed))
const counts = Object.entries(seed.tables).map(([t, { rows }]) => `${t}: ${rows.length}`).join(', ')
console.log(`Wrote ${outPath}`)
console.log(`Rows — ${counts}`)
