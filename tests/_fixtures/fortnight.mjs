// Two weeks of a made-up record, small enough to check every figure by hand, for the fact-sheet
// tests (digestFacts, askContext). The week under test is Mon 2026-11-09 … Sun 2026-11-15, the
// day under test Thu 2026-11-12; the week before is the comparison baseline.
//
// What each row is there to exercise is said beside it. Nothing here is anyone's real data.
import { insert } from './d1.mjs'
import { mealKey } from '../../shared/utils/mealKey.ts'

export const DAY = '2026-11-12'
export const WEEK = ['2026-11-09', '2026-11-15']
export const TODAY = '2026-11-16'

const STAMP = '2026-11-01T00:00:00.000Z'
const TRT = { compound: 'Testosterone Cypionate', dose: 70, unit: 'mg', site: 'right_glute' }
const HCG = { compound: 'hCG', dose: 250, unit: 'IU', site: 'abdomen' }

/** The schedule the doses below follow: TRT Thu + Sun, hCG Tue + Fri. Friday's hCG is the miss. */
export const RULES = [
  { compound: 'Testosterone Cypionate', doseLabel: '70 mg', weekdays: [0, 4], from: '2026-06-01', injected: true },
  { compound: 'hCG', doseLabel: '250 IU', weekdays: [2, 5], from: '2026-06-01', injected: true }
]
export const PROTOCOL = { rules: RULES, standing: [], asNeeded: [] }

export function seedFortnight(db) {
  const journal = [
    // ── the week before ──
    { date: '2026-11-02', weight_lbs: 188.4, rhr: 59, hrv: 49 },
    { date: '2026-11-05', weight_lbs: 188.0, bp_systolic: 126, bp_diastolic: 80, rhr: 58, hrv: 50, peptides: [TRT],
      sodas: [{ time: '13:00', drink: 'Coke Zero', size: '12oz can' }], water: [{ time: '09:00', oz: 60 }] },
    { date: '2026-11-08', weight_lbs: 187.6, rhr: 56, hrv: 52, peptides: [TRT] },
    // ── the week ──
    { date: '2026-11-10', weight_lbs: 187.4, bp_systolic: 124, bp_diastolic: 78, rhr: 57, hrv: 51, peptides: [HCG],
      reconstitutions: [{ compound: 'hCG', vial_amount: 5000, vial_unit: 'IU', bac_water_ml: 5, supplier: 'Empower' }] },
    // A tap and nothing else: a journal row with no vitals. Not "the prior weigh-in".
    { date: '2026-11-11', sodas: [{ time: '15:10', drink: 'dr pepper', size: '20oz bottle' }] },
    { date: DAY, weight_lbs: 187.0, bp_systolic: 122, bp_diastolic: 76, rhr: 55, hrv: 54, peptides: [TRT],
      // Two spellings of one soda, and a sports drink that is not a soda and counts as water.
      sodas: [
        { time: '10:00', drink: 'Gatorade Zero', size: '20oz bottle' },
        { time: '12:30', drink: 'Dr Pepper', size: '12oz can' },
        { time: '16:20', drink: ' dr pepper ', size: '12oz can' }
      ],
      water: [{ time: '08:00', oz: 16 }, { time: '14:00', oz: 24 }],
      // Breakfast has label figures, dinner a model estimate, lunch none: the day's total is a floor.
      food: { breakfast: 'zzq oats', lunch: 'zzq sandwich', dinner: 'zzq mystery stew' },
      notes: 'Legs felt heavy.\n\nSlept late.' },
    // Logged through to dinner with figures for every meal: the one day the week's food average may use.
    { date: '2026-11-13', weight_lbs: 186.8, bp_systolic: 120, bp_diastolic: 74, rhr: 54,
      water: [{ time: '09:00', oz: 100 }],
      food: { breakfast: 'zzq oats', lunch: 'zzq oats', dinner: 'zzq mystery stew' } },
    { date: '2026-11-15', weight_lbs: 186.5, hrv: 56, peptides: [TRT] }
  ]
  for (const row of journal) insert(db, 'journal_entries', row)

  const health = [
    { date: '2026-11-05', recovery_score: 50, strain: 8, sleep_total_min: 400 },
    { date: '2026-11-08', recovery_score: 58, strain: 10, sleep_total_min: 410 },
    // 420, 419, 420: an average of 419.67 minutes, which must read "7h 0m" and never "6h 60m".
    { date: '2026-11-10', recovery_score: 70, strain: 9.5, sleep_total_min: 420, sleep_deep_min: 90, sleep_rem_min: 100 },
    { date: '2026-11-11', recovery_score: 55, strain: 11, sleep_total_min: 419, sleep_deep_min: 80, sleep_rem_min: 105 },
    { date: DAY, recovery_score: 62, strain: 12.34, sleep_total_min: 420, sleep_performance_pct: 88, sleep_deep_min: 95, sleep_rem_min: 110 }
  ]
  for (const row of health) insert(db, 'health_metrics', row)

  const workouts = [
    { external_id: 'whoop:w0', date: '2026-11-05', workout_type: 'Running', start_time: '2026-11-05T23:00:00.000Z', duration_min: 30, calories: 300, strain: 8.1 },
    { external_id: 'whoop:w1', date: '2026-11-10', workout_type: 'Strength Training', start_time: '2026-11-11T00:00:00.000Z', duration_min: 60, calories: 350, strain: 7.2 },
    // One ride, recorded twice: Whoop's copy and Apple's. Counted once.
    { external_id: 'whoop:w2', date: DAY, workout_type: 'Cycling', start_time: '2026-11-12T23:30:00.000Z', duration_min: 45, calories: 400, strain: 9.8 },
    { external_id: 'hae:w2', date: DAY, workout_type: 'Cycling', start_time: '2026-11-12 17:31:00 -0600', duration_min: 46, calories: 410, avg_hr: 141 }
  ]
  for (const row of workouts) insert(db, 'workouts', row)

  insert(db, 'labs_entries', { date: DAY, fasting: 1, markers: { hematocrit: 49.5, estradiol: 31 }, readings: {} })
  insert(db, 'dexa_entries', { date: '2026-09-20', weight_lbs: 188.2, total: { fat_pct: 17.6, lean_lbs: 150.1 }, regions: {}, vat: { mass_lbs: 0.9 }, ag_ratio: 0.98 })
  insert(db, 'vials', { compound: 'hCG', vial_amount: 5000, vial_unit: 'IU', status: 'active', opened_date: '2026-11-10', bac_water_ml: 5, supplier: 'Empower', created_at: STAMP })
  insert(db, 'vials', { compound: 'Testosterone Cypionate', vial_amount: 200, vial_unit: 'mg', quantity: 2, status: 'sealed', created_at: STAMP })

  for (const [key, value] of [['water_goal_oz', '100'], ['protein_target_g', '150'], ['blood_type', 'A+']]) {
    insert(db, 'profile', { key, value, updated_at: STAMP })
  }
  // 'zzq oats' typed in from its label; the stew a model estimate; the sandwich has no figures.
  insert(db, 'meal_estimates', { key: mealKey('zzq oats'), text: 'zzq oats', kcal: 300, protein_g: 10, carbs_g: 50, fat_g: 6, sodium_mg: 100, fiber_g: 8, confidence: 'high', source: 'manual', created_at: STAMP, updated_at: STAMP })
  insert(db, 'meal_estimates', { key: mealKey('zzq mystery stew'), text: 'zzq mystery stew', kcal: 600, protein_g: 40, carbs_g: 45, fat_g: 25, sodium_mg: 900, fiber_g: 6, confidence: 'medium', source: 'ai', model: 'test', created_at: STAMP, updated_at: STAMP })
}
