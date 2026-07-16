export interface CompoundDosing {
  range: string
  frequency: string
  timing?: string
  notes?: string
}

export interface CompoundReconstitution {
  instructions: string
  measuring?: string
}

export interface CompoundInfo {
  category: string
  aka?: string
  summary: string
  dosing: CompoundDosing
  reconstitution?: CompoundReconstitution
  cycling?: string
  storage: string
  halfLife?: string
  caution?: string
}

export const GENERAL_DISCLAIMER =
  'For research and educational purposes only. Not medical advice — consult a physician before starting, stopping, or adjusting any protocol.'

export const COMPOUND_INFO: Record<string, CompoundInfo> = {
  'BPC-157': {
    category: 'Healing Peptide',
    aka: 'Body Protection Compound-157',
    summary: 'A pentadecapeptide derived from a protective protein found in human gastric juice. Widely studied in animal models for accelerating healing of tendons, ligaments, muscle, and the gut lining, and for general anti-inflammatory effects.',
    dosing: {
      range: '250–500 mcg',
      frequency: '1–2x daily',
      timing: 'Away from food; can be dosed systemically or near the injury site',
      notes: 'Total daily dose commonly kept under ~1000 mcg in educational protocols.'
    },
    reconstitution: {
      instructions: '5 mg vial + 2 mL bacteriostatic water → ~2.5 mg/mL',
      measuring: 'At 2.5 mg/mL, 1 unit (0.01 mL) ≈ 25 mcg on a U-100 insulin syringe.'
    },
    cycling: 'Often run in focused 4–8 week blocks tied to a specific injury, then reassessed rather than used indefinitely.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~30 days, avoid freeze–thaw cycles.',
    halfLife: 'Short (roughly hours), which is why it’s typically dosed more than once a day.'
  },

  'TB-500': {
    category: 'Healing Peptide',
    aka: 'Thymosin Beta-4 fragment',
    summary: 'A synthetic fragment of Thymosin Beta-4, a naturally occurring peptide involved in actin regulation, cell migration, and tissue repair. Studied for wound healing, flexibility, and recovery from soft-tissue injury.',
    dosing: {
      range: '2–2.5 mg',
      frequency: '2x weekly (loading), then weekly for maintenance',
      timing: 'Systemic subcutaneous injection; site does not need to be local to the injury.'
    },
    reconstitution: {
      instructions: '5 mg vial + 2 mL bacteriostatic water → 2.5 mg/mL',
      measuring: 'At 2.5 mg/mL, 1 unit (0.01 mL) ≈ 25 mcg.'
    },
    cycling: 'Common pattern: 4–6 week loading phase, then taper to weekly or discontinue and reassess.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~4 weeks.',
    halfLife: 'Longer than most healing peptides (~1–2 days), supporting less-frequent dosing.'
  },

  'BPC-157 / TB-500': {
    category: 'Healing Peptide Stack',
    aka: 'BPC/TB4 Blend',
    summary: 'A common stack combining BPC-157 and TB-500 (Thymosin Beta-4 fragment), two peptides studied for complementary roles in tissue repair — BPC-157 for gut/tendon/ligament healing and general anti-inflammatory effects, TB-500 for cell migration and systemic recovery.',
    dosing: {
      range: '500 mcg (blend, i.e. 250 mcg BPC-157 + 250 mcg TB-500 per injection)',
      frequency: '1x daily, sometimes 2x during a loading phase',
      timing: 'Subcutaneous injection; can be dosed near an injury site or systemically.'
    },
    reconstitution: {
      instructions: '5 mg/5 mg blended vial + 2 mL bacteriostatic water → 5 mg/mL total (2.5 mg/mL each peptide)',
      measuring: 'At 5 mg/mL total, 1 unit (0.01 mL) ≈ 50 mcg blend; a 500 mcg dose ≈ 10 units (0.1 mL).'
    },
    cycling: 'Often run in focused 4–8 week blocks tied to a specific injury, then reassessed rather than used indefinitely.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~4 weeks, avoid freeze–thaw cycles.',
    halfLife: 'BPC-157 is short-acting (hours); TB-500 is longer-acting (~1–2 days) — the blend is typically dosed to the shorter half-life component.'
  },

  'Ipamorelin': {
    category: 'Growth Hormone Secretagogue',
    summary: 'A selective growth hormone secretagogue (GHRP) that stimulates the pituitary to release GH with minimal effect on cortisol or appetite compared to older GHRPs like GHRP-6.',
    dosing: {
      range: '200–300 mcg',
      frequency: 'Once or twice daily',
      timing: 'On an empty stomach, often before bed and/or upon waking to align with natural GH pulses.'
    },
    reconstitution: {
      instructions: '2–5 mg vial + bacteriostatic water to taste; 2 mL yields 1–2.5 mg/mL depending on vial size',
      measuring: 'Common target: 100 mcg per 0.1 mL for easy insulin-syringe dosing.'
    },
    cycling: 'Frequently stacked with CJC-1295; often cycled 3–6 months on, with a break to preserve pituitary responsiveness.',
    storage: 'Lyophilized: refrigerate or freeze. After mixing: refrigerate 2–8°C, use within ~30 days.',
    halfLife: 'Short (~2 hours), consistent with pulsatile dosing near sleep.'
  },

  'CJC-1295': {
    category: 'Growth Hormone Secretagogue',
    summary: 'A growth-hormone-releasing hormone (GHRH) analog. The DAC version extends half-life to days, while non-DAC ("Mod GRF 1-29") is short-acting and typically paired with a GHRP like Ipamorelin for a synergistic pulse.',
    dosing: {
      range: '100–300 mcg (non-DAC) or 1–2 mg weekly (DAC)',
      frequency: 'Daily (non-DAC) or weekly (DAC)',
      timing: 'Non-DAC: empty stomach, before bed. DAC: timing is less critical due to long half-life.'
    },
    reconstitution: {
      instructions: '2 mg vial + 2 mL bacteriostatic water → 1 mg/mL',
      measuring: 'At 1 mg/mL, 1 unit (0.01 mL) = 10 mcg.'
    },
    cycling: 'Commonly run 3–6 months, then a break; DAC variants are sometimes cycled less frequently due to longer receptor exposure.',
    storage: 'Lyophilized: refrigerate or freeze. After mixing: refrigerate 2–8°C, use within ~30 days.',
    halfLife: 'Non-DAC: ~30 minutes. DAC: ~6–8 days.'
  },

  'CJC-1295 / Ipamorelin': {
    category: 'Growth Hormone Secretagogue Stack',
    summary: 'A common stack pairing a GHRH analog (CJC-1295) with a selective GHRP (Ipamorelin) to produce a stronger, more natural GH pulse than either compound alone.',
    dosing: {
      range: '100 mcg of each (1:1 blend commonly dosed together)',
      frequency: 'Once daily, sometimes twice',
      timing: 'Empty stomach, typically 20–30 minutes before bed to align with the largest natural GH pulse.'
    },
    reconstitution: {
      instructions: 'Blended vials (e.g., 5 mg/5 mg) reconstituted with 2–3 mL bacteriostatic water for a 1:1 mg/mL concentration',
      measuring: 'At 1 mg/mL each, 0.1 mL delivers ~100 mcg of each peptide.'
    },
    cycling: 'Typically run in 3–6 month blocks followed by a break to help maintain pituitary sensitivity.',
    storage: 'Lyophilized: refrigerate or freeze. After mixing: refrigerate 2–8°C, use within ~30 days.',
    halfLife: 'Ipamorelin ~2 hours; CJC-1295 (non-DAC) ~30 minutes.'
  },

  'MOTS-C': {
    category: 'Mitochondrial-Derived Peptide',
    summary: 'A 16-amino-acid peptide encoded in mitochondrial DNA. Studied for effects on metabolic regulation, insulin sensitivity, and exercise capacity by acting as an exercise-mimetic at the cellular level.',
    dosing: {
      range: '5–10 mg weekly, split into 2–3 doses (e.g., ~1.5–2 mg per dose)',
      frequency: '2–3x weekly',
      timing: 'Often dosed prior to exercise in educational protocols.'
    },
    reconstitution: {
      instructions: '10 mg vial + 2 mL bacteriostatic water → 5 mg/mL',
      measuring: 'At 5 mg/mL, 1 unit (0.01 mL) = 50 mcg.'
    },
    cycling: 'Commonly cycled 4‒8 weeks on, followed by a break.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~4 weeks.',
    halfLife: 'Roughly a few hours.'
  },

  'NAD+': {
    category: 'Coenzyme / Cellular Metabolism',
    aka: 'Nicotinamide Adenine Dinucleotide',
    summary: 'A coenzyme essential to cellular energy metabolism and DNA repair. Levels decline with age; supplementation (IV, IM, or subQ) is studied for effects on energy, cognition, and cellular aging pathways.',
    dosing: {
      range: '50–100 mg per injection (subQ/IM); much higher for IV protocols',
      frequency: '2–3x weekly',
      notes: 'Injections can cause transient flushing, warmth, or nausea if pushed too quickly — slow administration reduces this.'
    },
    reconstitution: {
      instructions: 'Often supplied pre-mixed in solution; if lyophilized, reconstitute per supplier instructions with bacteriostatic or sterile water.'
    },
    storage: 'Refrigerate after reconstitution; protect from light. Unreconstituted lyophilized powder can be kept at room temp or refrigerated per supplier guidance.',
    halfLife: 'Short in circulation; effects are generally attributed to downstream metabolic pathways rather than sustained blood levels.'
  },

  'GHK-Cu': {
    category: 'Copper Peptide',
    summary: 'A naturally occurring copper-binding tripeptide studied for skin remodeling, wound healing, anti-inflammatory effects, and antioxidant activity. Used both systemically (subQ) and topically.',
    dosing: {
      range: '1–2 mg',
      frequency: 'Daily or every other day',
      timing: 'Often stacked with GH secretagogues; also used topically for skin applications.'
    },
    reconstitution: {
      instructions: '50 mg vial + 5 mL bacteriostatic water → 10 mg/mL',
      measuring: 'At 10 mg/mL, 1 unit (0.01 mL) = 100 mcg.'
    },
    cycling: 'Often cycled 4–12 weeks with breaks; copper peptides are sometimes rotated with other repair peptides.',
    storage: 'Lyophilized: refrigerate or freeze, protect from light (can oxidize/discolor). After mixing: refrigerate 2–8°C.',
    halfLife: 'Short; cleared relatively quickly from circulation.'
  },

  'KPV': {
    category: 'Anti-Inflammatory Peptide',
    summary: 'The C-terminal tripeptide fragment of alpha-MSH. Studied for anti-inflammatory and gut-healing effects without the pigmentation/libido effects seen with full-length melanocortin peptides.',
    dosing: {
      range: '200–500 mcg',
      frequency: 'Daily',
      notes: 'Can be dosed subcutaneously or taken orally (oral bioavailability is lower, so oral doses are often higher).'
    },
    reconstitution: {
      instructions: '10 mg vial + 3 mL bacteriostatic water → ~3.33 mg/mL',
      measuring: 'At 3.33 mg/mL, 1 unit (0.01 mL) ≈ 33 mcg.'
    },
    cycling: 'Often used in shorter courses (2–4 weeks) tied to a flare-up or gut-healing focus.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~4 weeks.'
  },

  'SS-31': {
    category: 'Mitochondrial-Targeted Peptide',
    aka: 'Elamipretide',
    summary: 'A mitochondria-targeted peptide that concentrates in the inner mitochondrial membrane and interacts with cardiolipin. Studied for effects on mitochondrial efficiency, oxidative stress, and age-related decline in energy production.',
    dosing: {
      range: '4–10 mg',
      frequency: 'Daily or every other day',
      timing: 'Subcutaneous injection.'
    },
    reconstitution: {
      instructions: '50 mg vial + 5 mL bacteriostatic water → 10 mg/mL',
      measuring: 'At 10 mg/mL, 1 unit (0.01 mL) = 100 mcg.'
    },
    cycling: 'Commonly run in 4–8 week blocks.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C.'
  },

  'Epitalon': {
    category: 'Longevity Peptide',
    aka: 'Epithalon',
    summary: 'A synthetic tetrapeptide based on epithalamin, a natural pineal gland extract. Studied for effects on telomerase activity, circadian rhythm regulation (melatonin), and biomarkers of aging.',
    dosing: {
      range: '5–10 mg daily',
      frequency: 'Daily for a short course',
      timing: 'Often dosed in the evening given its link to melatonin/pineal regulation.'
    },
    reconstitution: {
      instructions: '10 mg vial + 2–3 mL bacteriostatic water → ~3.3–5 mg/mL'
    },
    cycling: 'Classically used in short 10–20 day courses, 1–2 times per year, rather than continuously.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~2–3 weeks (matches typical course length).'
  },

  'Humanin': {
    category: 'Mitochondrial-Derived Peptide',
    summary: 'A small peptide encoded within the mitochondrial genome, studied for cytoprotective and anti-apoptotic effects, with early research interest in metabolic and neuroprotective applications.',
    dosing: {
      range: '5–10 mg weekly, split into 2–3 doses',
      frequency: '2–3x weekly'
    },
    reconstitution: {
      instructions: '10 mg vial + 2 mL bacteriostatic water → 5 mg/mL',
      measuring: 'At 5 mg/mL, 1 unit (0.01 mL) = 50 mcg.'
    },
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~4 weeks.',
    caution: 'Human clinical data is limited compared to other peptides on this list; protocols vary widely across sources.'
  },

  'Thymosin Alpha-1': {
    category: 'Immune-Modulating Peptide',
    summary: 'A naturally occurring thymic peptide studied for its role in modulating immune response — supporting T-cell function and helping regulate both under- and over-active immune activity.',
    dosing: {
      range: '1.6 mg',
      frequency: '2x weekly (some protocols use daily dosing during acute immune support)',
      timing: 'Subcutaneous injection.'
    },
    reconstitution: {
      instructions: '10 mg vial + 3 mL bacteriostatic water → ~3.33 mg/mL',
      measuring: 'At 3.33 mg/mL, ~0.5 mL delivers a 1.6 mg dose.'
    },
    cycling: 'Often used for defined 4–12 week periods around illness, travel, or seasonal immune support rather than continuously.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~30 days.'
  },

  'Thymosin Beta-4': {
    category: 'Healing Peptide',
    summary: 'The full-length naturally occurring peptide from which the TB-500 fragment is derived. Involved in actin regulation, cell migration, angiogenesis, and tissue repair.',
    dosing: {
      range: '2–2.5 mg',
      frequency: '2x weekly (loading), then weekly maintenance',
      timing: 'Subcutaneous injection.'
    },
    reconstitution: {
      instructions: '5 mg vial + 2 mL bacteriostatic water → 2.5 mg/mL',
      measuring: 'At 2.5 mg/mL, 1 unit (0.01 mL) = 25 mcg.'
    },
    cycling: 'Similar to TB-500: 4–6 week loading phase, then taper or reassess.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use within ~4 weeks.'
  },

  'PT-141': {
    category: 'Libido Peptide',
    aka: 'Bremelanotide',
    summary: 'A melanocortin receptor agonist (primarily MC4R) that acts on central nervous system pathways involved in sexual arousal, rather than the vascular mechanism used by PDE5 inhibitors like sildenafil. Approved as Vyleesi for female hypoactive sexual desire disorder; also studied off-label for libido and erectile function in men.',
    dosing: {
      range: '0.5–2 mg',
      frequency: 'As needed, not more than a few times per week',
      timing: 'Subcutaneous injection roughly 45 min–2 hours before anticipated activity; effects can last several hours.',
      notes: 'Start at the low end — nausea is common and dose-dependent.'
    },
    reconstitution: {
      instructions: '10 mg vial + 2 mL bacteriostatic water → 5 mg/mL',
      measuring: 'At 5 mg/mL, 1 unit (0.01 mL) = 50 mcg.'
    },
    cycling: 'Used situationally rather than on a fixed schedule; frequent use raises nausea/flushing risk and may blunt effect.',
    storage: 'Lyophilized: refrigerate or freeze. After mixing: refrigerate 2–8°C, use within ~30 days.',
    halfLife: 'A few hours.',
    caution: 'Common side effects: nausea, flushing, headache, and a transient rise in blood pressure — use caution with existing cardiovascular conditions. Can cause temporary skin/gum darkening with frequent use.'
  },

  'Kisspeptin': {
    category: 'Reproductive Hormone Peptide',
    aka: 'Kisspeptin-10',
    summary: 'A neuropeptide that acts upstream of the pituitary, stimulating GnRH release from the hypothalamus and thereby driving downstream LH/FSH and testosterone/estrogen production. Studied as a more "upstream" alternative to hCG for maintaining HPG axis function during TRT, and in fertility research.',
    dosing: {
      range: 'Highly variable across protocols — commonly in the low hundreds of mcg per dose',
      frequency: '1–2x daily or per-protocol',
      timing: 'Subcutaneous injection; some protocols pair timing with other HPG-axis-support compounds.',
      notes: 'Human dosing data is sparse compared to hCG — treat published ranges as a starting reference, not an established standard.'
    },
    reconstitution: {
      instructions: '5–10 mg vial + 2 mL bacteriostatic water, concentration depending on vial size',
      measuring: 'Confirm mg/mL from the actual vial label before calculating units.'
    },
    cycling: 'Often used continuously alongside TRT, similar in intent to hCG, though with far less long-term human usage data.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, use promptly.',
    halfLife: 'Very short (native kisspeptin-10 is on the order of minutes), which makes stable, sustained LH stimulation difficult to achieve with simple bolus dosing.',
    caution: 'Much less human safety/efficacy data than hCG for this purpose; effects on LH can be transient given the short half-life.'
  },

  'Testosterone Cypionate': {
    category: 'TRT / Hormone',
    summary: 'A long-acting testosterone ester delivered in oil, used in TRT protocols to restore physiological testosterone levels. Slower-releasing than propionate, giving more stable blood levels with less frequent dosing.',
    dosing: {
      range: '100–200 mg weekly total (highly individualized based on labs)',
      frequency: 'Typically split into 1–2 injections per week to smooth out peaks/troughs',
      timing: 'Time of day is less important than consistency between doses.'
    },
    cycling: 'TRT is generally continuous rather than cycled; dose adjustments are made based on follow-up labs (total/free T, estradiol, hematocrit) and symptoms.',
    storage: 'Room temperature, away from light and heat; no refrigeration needed for oil-based esters.',
    halfLife: '~8 days.',
    caution: 'Requires periodic bloodwork (hematocrit, estradiol, lipids, PSA) and physician oversight.'
  },

  'Testosterone Enanthate': {
    category: 'TRT / Hormone',
    summary: 'A long-acting testosterone ester very similar in profile to cypionate, delivered in oil for TRT.',
    dosing: {
      range: '100–200 mg weekly total (individualized based on labs)',
      frequency: 'Typically split into 1–2 injections per week'
    },
    cycling: 'Continuous TRT with dose adjusted by follow-up labs rather than on/off cycling.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~7–10 days.',
    caution: 'Requires periodic bloodwork and physician oversight.'
  },

  'Testosterone Propionate': {
    category: 'TRT / Hormone',
    summary: 'A short-acting testosterone ester requiring more frequent injections but producing more stable day-to-day levels than long esters.',
    dosing: {
      range: '~30–50 mg per injection, 2–3x weekly',
      frequency: 'Every 2–3 days due to short half-life'
    },
    cycling: 'Continuous TRT with dose adjusted by follow-up labs.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~2 days — shortest of the common esters.',
    caution: 'More frequent injections can mean more injection-site irritation; requires physician oversight and lab monitoring.'
  },

  'HGH': {
    category: 'TRT / Hormone',
    aka: 'Human Growth Hormone / Somatropin',
    summary: 'Recombinant growth hormone, identical to the body’s own GH. Used medically for diagnosed deficiency, and studied off-label for body composition, recovery, and anti-aging effects.',
    dosing: {
      range: '1–2 IU daily (general use); higher in fitness-focused protocols',
      frequency: 'Daily',
      timing: 'Often dosed in the morning or pre-workout; some protocols use before bed to mimic nocturnal GH pulses.'
    },
    reconstitution: {
      instructions: 'Reconstitute per vial size with bacteriostatic or sterile water — e.g., a 10 IU vial + 1 mL water → 10 IU/mL. Inject slowly down the side of the vial to avoid denaturing the protein.',
      measuring: 'At 10 IU/mL, 1 unit (0.01 mL) = 0.1 IU.'
    },
    cycling: 'Often run continuously for months when used for body composition/recovery goals, with periodic lab monitoring (IGF-1).',
    storage: 'Lyophilized: refrigerate. After mixing: refrigerate 2–8°C, use within ~2–3 weeks, avoid shaking or freezing.',
    halfLife: '~2–3 hours, but downstream effects (via IGF-1) last much longer.',
    caution: 'Can affect blood glucose and IGF-1 levels; periodic labs recommended.'
  },

  'hCG': {
    category: 'TRT / Hormone',
    aka: 'Human Chorionic Gonadotropin',
    summary: 'A hormone that mimics LH, stimulating the testes directly. Commonly added to TRT protocols to maintain testicular size/function and fertility that exogenous testosterone alone would otherwise suppress.',
    dosing: {
      range: '250–500 IU',
      frequency: '2–3x weekly',
      timing: 'Often timed with (or between) testosterone injections.'
    },
    reconstitution: {
      instructions: '5,000 IU vial + 5 mL bacteriostatic water → 1,000 IU/mL',
      measuring: 'At 1,000 IU/mL, 1 unit (0.01 mL) = 10 IU.'
    },
    cycling: 'Typically continuous alongside TRT; some protocols cycle it off periodically to gauge natural response.',
    storage: 'Lyophilized: refrigerate. After mixing: refrigerate 2–8°C, use within ~30–60 days per supplier guidance.',
    caution: 'Can raise estradiol via increased testicular aromatization — often monitored alongside an AI like anastrozole.'
  },

  'Anastrozole': {
    category: 'Aromatase Inhibitor',
    summary: 'An oral aromatase inhibitor that blocks the conversion of testosterone to estradiol. Used selectively in some TRT protocols to manage estrogen-related side effects (water retention, gyno symptoms, mood).',
    dosing: {
      range: '0.25–1 mg',
      frequency: '1–2x weekly, adjusted to labs and symptoms',
      notes: 'Often dosed in small "micro" amounts (e.g., 0.25 mg) rather than the higher doses used in oncology.'
    },
    cycling: 'Dosed only as needed based on estradiol labs and symptoms — over-suppression of estrogen can cause its own problems (joint pain, low libido, poor lipids, low bone density).',
    storage: 'Room temperature, in original packaging, away from moisture.',
    caution: 'Narrow therapeutic window — both high and low estradiol can cause symptoms. Dosing should be guided by labs, not fixed schedules.'
  },

  'Enclomiphene': {
    category: 'SERM',
    summary: 'The trans-isomer of clomiphene citrate. A selective estrogen receptor modulator that blocks estrogen feedback at the hypothalamus/pituitary, increasing LH/FSH and endogenous testosterone production — without the anti-estrogenic liver/eye effects associated with the zuclomiphene isomer in clomiphene.',
    dosing: {
      range: '12.5–25 mg',
      frequency: 'Daily',
      timing: 'Oral, with or without food per supplier instructions.'
    },
    cycling: 'Used either as a standalone way to raise natural testosterone, or as part of post-TRT / fertility-preserving protocols.',
    storage: 'Room temperature, in original packaging.',
    caution: 'Can raise LH/FSH and testosterone significantly — typically monitored with follow-up labs.'
  },

  'Oxandrolone': {
    category: 'Anabolic Steroid (Oral)',
    aka: 'Anavar',
    summary: 'An oral DHT-derived anabolic steroid, historically used medically for weight regain and (at very low doses) considered one of the milder AAS options in terms of androgenic side effects and hepatotoxicity relative to other C17-alpha-alkylated orals. Used off-label for lean mass and body recomposition.',
    dosing: {
      range: '10–20 mg/day (low/conservative end of typical ranges — many protocols run considerably higher)',
      frequency: 'Once or twice daily, split doses given its short half-life',
      timing: 'Oral, with or without food per product guidance.'
    },
    cycling: 'Typically run in defined 6–8 week blocks rather than continuously; suppresses natural testosterone production (reversible), so often timed alongside a TRT baseline or with a post-cycle recovery plan.',
    storage: 'Room temperature, in original packaging, away from moisture and light.',
    halfLife: '~8–12 hours.',
    caution: 'Still C17-alpha-alkylated (hepatotoxic pathway) despite its "mild" reputation — periodic liver enzyme labs are advisable. Commonly lowers HDL cholesterol and can worsen lipid panels; suppresses endogenous testosterone. Physician oversight and lab monitoring recommended.'
  },

  'Semaglutide': {
    category: 'GLP-1 Receptor Agonist',
    summary: 'A GLP-1 receptor agonist that slows gastric emptying, reduces appetite, and improves insulin sensitivity. Approved for type 2 diabetes and weight management (as Ozempic/Wegovy); also used in compounded form for weight-loss protocols.',
    dosing: {
      range: '0.25 mg starting dose, titrated up to 1–2.4 mg over months',
      frequency: 'Weekly',
      timing: 'Same day each week; titration schedule (typically every 4 weeks) reduces GI side effects.'
    },
    reconstitution: {
      instructions: 'Compounded lyophilized vials: reconstitute per supplier-specific concentration with bacteriostatic water — concentration varies by vial, always confirm before dosing.'
    },
    cycling: 'Generally used continuously while pursuing a weight or metabolic goal; discontinuation often leads to some appetite/weight rebound without lifestyle changes in place.',
    storage: 'Refrigerate both before and after reconstitution; avoid freezing.',
    halfLife: '~7 days, supporting once-weekly dosing.',
    caution: 'Common GI side effects (nausea, constipation) especially during titration. Carries an FDA boxed warning regarding thyroid C-cell tumors seen in rodent studies.'
  },

  'Tirzepatide': {
    category: 'GLP-1/GIP Receptor Agonist',
    summary: 'A dual GLP-1/GIP receptor agonist, generally associated with greater weight loss and metabolic improvement than GLP-1-only agonists at equivalent tolerability. Approved as Mounjaro/Zepbound.',
    dosing: {
      range: '2.5 mg starting dose, titrated up to 5–15 mg over months',
      frequency: 'Weekly',
      timing: 'Same day each week; slow titration (every 4 weeks) minimizes GI side effects.'
    },
    reconstitution: {
      instructions: 'Compounded lyophilized vials: reconstitute per supplier-specific concentration with bacteriostatic water — concentration varies by vial, always confirm before dosing.'
    },
    cycling: 'Generally used continuously while pursuing a weight/metabolic goal.',
    storage: 'Refrigerate both before and after reconstitution; avoid freezing.',
    halfLife: '~5 days, supporting once-weekly dosing.',
    caution: 'Common GI side effects during titration; same class-wide thyroid C-cell tumor warning as other GLP-1/GIP agonists.'
  },

  '5-Amino-1MQ': {
    category: 'Metabolic / NNMT Inhibitor',
    summary: 'A small-molecule inhibitor of NNMT (nicotinamide N-methyltransferase), an enzyme that consumes both SAM and NAD+ precursors. By blocking NNMT, cells retain more NAD+/SAM for metabolic processes — studied in animal models for effects on fat cell metabolism, weight management, and mitochondrial/NAD+ support.',
    dosing: {
      range: '50–150 mg/day',
      frequency: 'Once daily (oral)',
      timing: 'Oral capsule, commonly taken with food per supplier guidance.'
    },
    cycling: 'Often used in multi-month blocks tied to a body-composition goal, then reassessed; human long-term data is limited.',
    storage: 'Room temperature, in original packaging.',
    caution: 'Human clinical trial data is very limited — most evidence is preclinical/animal. Sourcing quality varies widely since this is not an approved pharmaceutical.'
  },

  'SLU-PP-332': {
    category: 'Exercise Mimetic (Research Compound)',
    summary: 'A synthetic pan-agonist of the estrogen-related receptors (ERRα/β/γ), developed as a research tool to reproduce exercise-like effects on mitochondrial biogenesis and oxidative muscle fiber metabolism. Studied almost exclusively in rodent models for endurance capacity and fat oxidation ("exercise in a pill") — it is not an approved or clinically tested compound in humans.',
    dosing: {
      range: 'No established human dosing — any protocol in circulation is an extrapolation from animal mg/kg studies, not a validated human dose',
      frequency: 'Reported protocols vary widely; treat all of these as unverified.',
      notes: 'This is an early-stage research chemical, not a peptide/hormone with a track record of human self-administration.'
    },
    storage: 'Store per supplier guidance (typically room temperature, protected from light and moisture); purity varies significantly by source since it is not pharmaceutically manufactured.',
    caution: 'Essentially no human safety or pharmacokinetic data exists. Effects, dosing, and risks are inferred from mouse studies only — treat this as the least-characterized compound on this list.'
  },

  'Modafinil': {
    category: 'Nootropic / Wakefulness Agent',
    summary: 'A eugeroic (wakefulness-promoting agent) approved for narcolepsy and shift-work sleep disorder, widely used off-label for focus and alertness. Works primarily through dopamine reuptake inhibition and other pathways, distinct from traditional stimulants.',
    dosing: {
      range: '100–200 mg',
      frequency: 'As needed, not daily for most educational protocols',
      timing: 'Morning dosing only — effects last 8–12+ hours and can disrupt sleep if taken later in the day.'
    },
    cycling: 'Often used situationally rather than daily to avoid tolerance and sleep disruption.',
    storage: 'Room temperature, in original packaging.',
    halfLife: '~12–15 hours.',
    caution: 'Can mask fatigue rather than replace sleep; avoid combining with other stimulants. Not a substitute for adequate sleep.'
  },

  'Semax': {
    category: 'Nootropic Peptide',
    summary: 'A synthetic peptide derived from ACTH(4-10), developed in Russia. Studied for effects on cognition, focus, and neuroprotection, thought to act partly through BDNF upregulation.',
    dosing: {
      range: '200–600 mcg',
      frequency: '1–2x daily',
      timing: 'Intranasal spray is the most common route; subQ injection is also used.'
    },
    reconstitution: {
      instructions: 'Intranasal: often supplied pre-mixed. Injectable: reconstitute per vial (e.g., 10 mg + 2 mL bacteriostatic water → 5 mg/mL).'
    },
    cycling: 'Frequently cycled (e.g., 2–4 weeks on, 1–2 weeks off) to help preserve responsiveness.',
    storage: 'Refrigerate; intranasal sprays are typically stable at room temp short-term per label.'
  },

  'Selank': {
    category: 'Nootropic Peptide',
    summary: 'A synthetic analog of the endogenous immunomodulatory peptide tuftsin, also developed in Russia. Studied for anxiolytic and mild cognitive effects without the sedation or dependency associated with benzodiazepines.',
    dosing: {
      range: '200–600 mcg',
      frequency: '1–2x daily',
      timing: 'Intranasal spray is the most common route; subQ injection is also used.'
    },
    reconstitution: {
      instructions: 'Intranasal: often supplied pre-mixed. Injectable: reconstitute per vial (e.g., 10 mg + 2 mL bacteriostatic water → 5 mg/mL).'
    },
    cycling: 'Often cycled similarly to Semax (e.g., 2–4 weeks on, 1–2 weeks off).',
    storage: 'Refrigerate; intranasal sprays are typically stable at room temp short-term per label.'
  },

  'DSIP': {
    category: 'Nootropic Peptide',
    aka: 'Delta Sleep-Inducing Peptide',
    summary: 'A naturally occurring nonapeptide (9 amino acids) first isolated from rabbit brain for its association with slow-wave (delta) sleep. Studied for effects on sleep quality/architecture, stress-related cortisol patterns, and mood — without the dependency or next-day grogginess associated with traditional sedatives.',
    dosing: {
      range: '100–300 mcg',
      frequency: 'Once daily',
      timing: 'Evening, before bed; often titrated gradually up from the low end of the range.'
    },
    reconstitution: {
      instructions: '10 mg vial + 3 mL bacteriostatic water → ~3.33 mg/mL',
      measuring: 'At 3.33 mg/mL, 1 unit (0.01 mL) ≈ 33.3 mcg on a U-100 insulin syringe.'
    },
    cycling: 'Commonly used nightly for a period, with periodic breaks to gauge whether ongoing use is still needed.',
    storage: 'Lyophilized: freeze at −20°C. After mixing: refrigerate 2–8°C, avoid freeze–thaw cycles.'
  }
}

export function getCompoundInfo(compound: string): CompoundInfo | undefined {
  return COMPOUND_INFO[compound]
}
