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

  'Sustanon 250': {
    category: 'TRT / Hormone',
    aka: 'Sustanon / Sust / Testosterone Blend',
    summary: 'A blend of four testosterone esters in one oil (30 mg propionate, 60 mg phenylpropionate, 60 mg isocaproate, 100 mg decanoate per 250 mg). Designed for infrequent clinical injections — the short esters kick in fast while the decanoate provides a long tail. In practice, injecting it infrequently produces noticeable peaks and troughs.',
    dosing: {
      range: '125–250 mg every 7–14 days (clinical TRT); enhanced educational protocols run 250–750 mg weekly',
      frequency: 'Despite the "long-acting blend" design, 2x weekly injections give far more stable levels than the labeled every-3-weeks schedule',
      timing: 'Intramuscular injection; consistency between doses matters more than time of day.'
    },
    cycling: 'Same as any testosterone base — continuous for TRT with lab-guided adjustments, or defined blocks in enhanced protocols.',
    storage: 'Room temperature, away from light and heat; no refrigeration needed for oil-based esters.',
    halfLife: 'Composite — the propionate peaks within ~1–2 days while the decanoate tail extends ~2 weeks, so levels are inherently less predictable than a single ester.',
    caution: 'Same monitoring as any testosterone (hematocrit, estradiol, lipids, PSA). The mixed esters make lab timing awkward — trough levels are harder to define than with a single ester, and estrogen management is bumpier due to the built-in peaks.'
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

  'Clomiphene': {
    category: 'SERM',
    aka: 'Clomid / Clomiphene Citrate',
    summary: 'A selective estrogen receptor modulator that blocks estrogen feedback at the hypothalamus/pituitary, raising LH/FSH and endogenous testosterone. The classic PCT (post-cycle therapy) drug for restarting natural production after suppression. It is a mix of two isomers: enclomiphene (the active trans-isomer) and zuclomiphene (a long-lived, weakly estrogenic cis-isomer responsible for most of the side-effect baggage — which is why isolated enclomiphene exists as a cleaner alternative).',
    dosing: {
      range: '25–50 mg/day (PCT protocols commonly start at 50 mg for 2 weeks, then taper to 25 mg)',
      frequency: 'Once daily for 4–6 weeks in PCT contexts',
      timing: 'Oral, any time of day; consistency matters more than timing.'
    },
    cycling: 'Used as a defined 4–6 week PCT block starting once the suppressive compounds have cleared (timed off the longest ester’s half-life), or lower-dose continuously for fertility/hypogonadism protocols under physician guidance.',
    storage: 'Room temperature, in original packaging.',
    halfLife: '~5–7 days for the drug overall, but zuclomiphene persists for weeks after the last dose.',
    caution: 'Visual disturbances (tracers, blurring) are a known side effect — rare but a signal to stop immediately, as persistent cases are documented. Mood changes/irritability are commonly reported at PCT doses. Verify recovery with labs (LH, FSH, total/free T) rather than assuming it worked.'
  },

  'Tamoxifen': {
    category: 'SERM',
    aka: 'Nolvadex / Tamoxifen Citrate',
    summary: 'A selective estrogen receptor modulator that blocks estrogen receptors in breast tissue (its approved use is breast cancer) while acting as a weak estrogen agonist in liver and bone. The standard defense against gynecomastia from aromatizing compounds and a common PCT drug — often considered better tolerated than clomiphene. Note it blocks the receptor rather than lowering estrogen levels; serum estradiol can actually rise while on it.',
    dosing: {
      range: '20–40 mg/day for PCT; 10–20 mg/day for gyno management while on aromatizing compounds',
      frequency: 'Once daily (long half-life makes split dosing unnecessary)',
      timing: 'Oral, any time of day, with or without food.'
    },
    cycling: 'PCT: 4–6 weeks starting once suppressive compounds have cleared. For gyno symptoms (itchy/puffy nipples), often run at 10–20 mg until symptoms resolve. Less useful against prolactin-driven gyno from 19-nors (trenbolone, nandrolone), which is a different mechanism.',
    storage: 'Room temperature, in original packaging.',
    halfLife: '~5–7 days (active metabolite endoxifen even longer), so steady state takes weeks.',
    caution: 'Modestly lowers IGF-1. Rare but serious risk of blood clots (avoid with clotting history). Liver-agonist activity actually improves some lipid markers, but liver enzymes are still worth watching. Vision changes are a stop signal, as with clomiphene.'
  },

  'Mesterolone': {
    category: 'Androgen (Oral Ancillary)',
    aka: 'Proviron',
    summary: 'An oral DHT derivative that is not C17-alpha-alkylated (so minimal liver toxicity) and is rapidly deactivated in muscle tissue — making it nearly useless as a mass-builder but popular as an on-cycle ancillary. It binds SHBG strongly (raising free testosterone), has a reputation for mild anti-estrogenic activity, and is commonly used for libido, well-being, and cosmetic "hardening" effects.',
    dosing: {
      range: '25–75 mg/day',
      frequency: 'Once daily or split into two doses',
      timing: 'Oral, with or without food.'
    },
    cycling: 'Typically run alongside other compounds for the duration of a cycle rather than standalone; some TRT protocols add low doses continuously for libido/free-T effects.',
    storage: 'Room temperature, in original packaging.',
    halfLife: '~12 hours.',
    caution: 'It is pure DHT activity — accelerates androgenic hair loss in those predisposed and can worsen lipids. Mildly suppressive on its own despite the "ancillary" label. Not hepatotoxic like 17-alkylated orals, but still warrants lab monitoring in context.'
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

  'Methenolone Acetate': {
    category: 'Anabolic Steroid (Oral)',
    aka: 'Primobolan / Primo',
    summary: 'The oral (acetate ester) form of methenolone, a DHT-derived anabolic steroid valued for a mild side-effect profile relative to its anabolic activity. Not C17-alpha-alkylated like most orals, which is generally associated with lower hepatotoxicity than compounds like anavar or dianabol, though oral bioavailability is lower and it is considered only mildly anabolic/weakly androgenic — often run at higher total doses or stacked with a base compound.',
    dosing: {
      range: '50–100 mg/day (oral acetate; requires higher doses than the injectable enanthate version due to lower bioavailability and short half-life)',
      frequency: 'Split into 2 daily doses given its short half-life',
      timing: 'Oral, with or without food per product guidance.'
    },
    cycling: 'Typically run 12–16 weeks given its mild nature and slow-building effects; suppresses natural testosterone production (reversible), so commonly run alongside a TRT-dose testosterone base rather than alone.',
    storage: 'Room temperature, in original packaging, away from moisture and light.',
    halfLife: '~4–6 hours (acetate ester, oral) — considerably shorter than the injectable enanthate version (~10.5 days).',
    caution: 'Widely counterfeited/underdosed on the gray market since genuine methenolone is expensive to produce — sourcing matters more than with many other compounds. Can still modestly suppress HDL and endogenous testosterone despite its "mild" reputation. Physician oversight and periodic lipid/liver labs recommended.'
  },

  'Methenolone Enanthate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'Primobolan Depot / Primo',
    summary: 'The injectable (enanthate ester) form of methenolone, a DHT-derived anabolic steroid. Not aromatizable to estrogen and considered only mildly anabolic/weakly androgenic, which is why it is valued for a favorable side-effect profile but often stacked with a stronger base compound to notice meaningful gains. The long enanthate ester allows less-frequent injections than the oral acetate version.',
    dosing: {
      range: '300–600 mg weekly (higher end of typical educational ranges since it is comparatively weak per mg)',
      frequency: '1–2x weekly given the long ester',
      timing: 'Intramuscular injection; time of day is not important, consistency between doses is.'
    },
    cycling: 'Typically run 12–16 weeks; suppresses natural testosterone production (reversible), so commonly run alongside a TRT-dose testosterone base rather than alone.',
    storage: 'Room temperature, away from light and heat; no refrigeration needed for oil-based esters.',
    halfLife: '~10.5 days — considerably longer than the oral acetate version (~4–6 hours), supporting less-frequent dosing.',
    caution: 'Widely counterfeited/underdosed on the gray market since genuine methenolone is expensive to produce — sourcing matters more than with many other compounds. Can still modestly suppress HDL and endogenous testosterone despite its "mild" reputation. Physician oversight and periodic lipid/liver labs recommended.'
  },

  'Trenbolone Acetate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'Tren A / Tren Ace / Finaplix',
    summary: 'The short-ester form of trenbolone, a 19-nor compound with several times the androgen-receptor binding affinity of testosterone — widely regarded as the most powerful commonly used AAS for recomposition, and also one of the harshest. Does not aromatize to estrogen but has strong progestogenic activity. Originally a veterinary cattle implant (Finaplix); there is no approved human formulation. The acetate ester is often preferred over enanthate specifically because it clears in days if side effects become intolerable.',
    dosing: {
      range: '200–400 mg weekly (educational ranges; often started low to assess tolerance)',
      frequency: 'Every day or every other day given the short ester',
      timing: 'Intramuscular injection; consistency between doses matters.'
    },
    cycling: 'Run in defined 6–10 week blocks alongside a testosterone base, never standalone and never as a first cycle — universally considered an advanced compound. Strongly suppressive; requires a full recovery plan.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~1–2 days — the shortest tren ester, and the main reason it’s recommended over long esters for anyone’s first exposure.',
    caution: 'Notorious side-effect profile: night sweats, insomnia, elevated heart rate and blood pressure, anxiety/aggression and mood changes, sharply worsened lipids, and reduced cardio capacity. Progestogenic gyno is possible (prolactin pathway — tamoxifen alone won’t address it). "Tren cough" — a brief coughing fit immediately after injection — is common and alarming but usually transient. Significant cardiovascular strain; regular BP monitoring and labs are the minimum.'
  },

  'Trenbolone Enanthate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'Tren E',
    summary: 'The long-ester form of trenbolone, identical in effect to the acetate but with less frequent injections. The trade-off: if side effects hit, the compound takes weeks to clear rather than days — which is why the acetate ester is usually suggested for first-time exposure.',
    dosing: {
      range: '200–400 mg weekly (educational ranges)',
      frequency: '2x weekly',
      timing: 'Intramuscular injection; consistency between doses matters.'
    },
    cycling: 'Run in defined 8–12 week blocks alongside a testosterone base; advanced-only compound. Strongly suppressive; requires a full recovery plan.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~5–7 days — sides linger for weeks after the last injection.',
    caution: 'Same harsh profile as trenbolone acetate (sleep disruption, night sweats, BP/heart-rate elevation, mood effects, brutal lipid impact, progestogenic gyno risk) with the added problem that none of it can be shut off quickly. Regular BP monitoring and labs are the minimum.'
  },

  'Trenbolone Hexahydrobenzylcarbonate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'Tren Hex / Parabolan',
    summary: 'Trenbolone with the very long hexahydrobenzylcarbonate ester — the only trenbolone ever approved for human use (as Parabolan in France, discontinued in 1997, in 76.5 mg ampules). Pharmacologically identical to other tren esters; today it exists only through gray-market production and is mostly chosen for novelty or injection-frequency preference.',
    dosing: {
      range: '150–300 mg weekly (the historic human product was dosed at 76.5 mg every 1–2 weeks clinically)',
      frequency: '1–2x weekly given the long ester',
      timing: 'Intramuscular injection.'
    },
    cycling: 'Defined 8–12 week blocks alongside a testosterone base; advanced-only, strongly suppressive.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~8–10 days — the slowest tren ester to clear.',
    caution: 'All the trenbolone cautions apply (sleep, BP, mood, lipids, progestogenic gyno), with the slowest exit if sides become intolerable. Gray-market-only production makes counterfeiting/underdosing common.'
  },

  'Boldenone Undecylenate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'EQ / Equipoise',
    summary: 'A veterinary injectable (1-dehydrotestosterone) with a very long ester, known for slow, steady, relatively dry gains, a pronounced appetite increase, and roughly half the aromatization rate of testosterone. Its signature side effect is a strong stimulation of red blood cell production — hematocrit climbing out of range is the most common reason people stop it.',
    dosing: {
      range: '300–600 mg weekly (educational ranges)',
      frequency: '1–2x weekly given the long ester',
      timing: 'Intramuscular injection.'
    },
    cycling: 'Because onset is slow, typically run in long 14–20 week blocks alongside a testosterone base; suppressive, requires a recovery plan.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~14 days — takes over a month to reach steady state and similarly long to clear.',
    caution: 'Monitor hematocrit/hemoglobin closely — erythrocytosis is near-universal on EQ and raises clot risk; some users end up donating blood to manage it. Some report anxiety/irritability. Lipid impact milder than orals but real. Long detection window and slow clearance.'
  },

  'Nandrolone Phenylpropionate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'NPP',
    summary: 'The short-ester form of nandrolone, a 19-nor compound known for adding quality mass with notable joint/connective-tissue relief (increased collagen synthesis and synovial fluid). Aromatizes at only ~20% the rate of testosterone but is progestogenic, which drives its own set of side effects. The short ester makes it easier to bail out than deca if sides appear.',
    dosing: {
      range: '300–400 mg weekly (educational ranges)',
      frequency: 'Every other day given the short ester',
      timing: 'Intramuscular injection.'
    },
    cycling: 'Run 8–12 weeks alongside a testosterone base — nandrolone without a test base is strongly associated with libido/erectile problems ("deca dick"). Deeply suppressive; recovery takes longer than with testosterone-only protocols.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~2–3 days.',
    caution: 'Progestogenic/prolactin-mediated sides: gyno (not fixed by tamoxifen alone), water retention, libido loss. Nandrolone metabolites are detectable in anti-doping tests for up to ~18 months. Mental-health effects (flat mood, anhedonia) are commonly reported with 19-nors. Monitor prolactin, lipids, and BP.'
  },

  'Nandrolone Decanoate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'Deca / Deca-Durabolin',
    summary: 'The classic long-ester nandrolone — one of the oldest and most-used AAS, prescribed historically for anemia and wasting. Same compound as NPP with a much longer ester: steady mass gains, famous joint relief, low aromatization but real progestogenic activity. Some protocols run low-dose deca (~100–150 mg/week) alongside TRT purely for joint comfort.',
    dosing: {
      range: '200–400 mg weekly (educational ranges); 100–150 mg weekly in "therapeutic" joint-support protocols',
      frequency: '1x weekly',
      timing: 'Intramuscular injection.'
    },
    cycling: 'Slow onset — typically 12–16 week blocks alongside a testosterone base (never solo; see "deca dick"). Deeply suppressive with a long recovery tail.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~7–12 days.',
    caution: 'Same progestogenic/prolactin cautions as NPP (gyno, water retention, libido loss) but slow to clear if sides appear. Metabolites detectable up to ~18 months. Commonly reported flat/blunted mood on 19-nors. Monitor prolactin, lipids, BP, and hematocrit.'
  },

  'Drostanolone Propionate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'Masteron / Mast P',
    summary: 'A DHT-derived injectable originally developed for breast cancer treatment. Cannot aromatize and carries a mild anti-estrogenic reputation. Only modestly anabolic — it’s used almost entirely as a cosmetic "finishing" compound for muscle hardness and dryness, with effects really only visible at low body fat. Popular in contest-prep stacks.',
    dosing: {
      range: '300–400 mg weekly (educational ranges)',
      frequency: 'Every other day given the short propionate ester',
      timing: 'Intramuscular injection.'
    },
    cycling: 'Run 6–10 weeks alongside a testosterone base, typically during cutting phases; suppressive like all AAS.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~2 days.',
    caution: 'Pure DHT-line androgenicity: among the worst common compounds for accelerating male pattern hair loss in the predisposed (and 5-AR inhibitors like finasteride/dutasteride do nothing for it, since it is already a DHT derivative). Lowers HDL notably. Little point at higher body fat percentages.'
  },

  'Drostanolone Enanthate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'Masteron Enanthate / Mast E',
    summary: 'The long-ester version of drostanolone — identical cosmetic hardening/drying effects to the propionate with less frequent injections. A gray-market creation (the original pharmaceutical Masteron was propionate only).',
    dosing: {
      range: '400–600 mg weekly (educational ranges; slightly higher than prop is common since more of the weight is ester)',
      frequency: '2x weekly',
      timing: 'Intramuscular injection.'
    },
    cycling: 'Run 8–12 weeks alongside a testosterone base, typically while cutting; suppressive.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~10 days.',
    caution: 'Same profile as drostanolone propionate: severe hair-loss acceleration in the predisposed (not preventable with finasteride/dutasteride), notable HDL suppression, and cosmetic effects that require low body fat to see.'
  },

  'Dihydroboldenone Cypionate': {
    category: 'Anabolic Steroid (Injectable)',
    aka: 'DHB / 1-Testosterone Cypionate',
    summary: 'The 5-alpha-reduced form of boldenone (also called 1-testosterone), a gray-market injectable with essentially no human clinical data. Reputation: testosterone-like or better anabolic effect with zero aromatization — lean, dry gains without estrogen management. Its defining practical problem is severe post-injection pain (PIP) even at modest concentrations, which is why many people try it once and quit.',
    dosing: {
      range: '200–400 mg weekly (educational ranges)',
      frequency: '2x weekly',
      timing: 'Intramuscular injection; many users rotate larger muscle groups and dilute with other oils to manage PIP.'
    },
    cycling: 'Run 8–12 weeks alongside a testosterone base; suppressive.',
    storage: 'Room temperature, away from light and heat.',
    halfLife: '~8 days (cypionate ester).',
    caution: 'Essentially no human research — all dosing and safety knowledge is anecdotal, and it exists only through underground labs, so quality varies wildly. Notorious PIP; injection-site abscesses from bad brews are a real risk. Expect DHT-line androgenic effects (hair, prostate) and lipid suppression. No aromatization means estrogen can run low if used without adequate test.'
  },

  'Methandrostenolone': {
    category: 'Anabolic Steroid (Oral)',
    aka: 'Dianabol / Dbol / Methandienone',
    summary: 'The original and most famous oral AAS, developed in the 1950s and central to bodybuilding’s golden era. A C17-alpha-alkylated testosterone derivative that delivers rapid size and strength — a large share of it water — via strong glycogen retention and aromatization to a potent methylated estrogen. Classically used as a 4–6 week "kickstart" while long injectable esters build up.',
    dosing: {
      range: '20–30 mg/day (educational conservative range)',
      frequency: 'Split into 2–3 doses across the day given the short half-life',
      timing: 'Oral; some protocols concentrate dosing pre-workout.'
    },
    cycling: 'Short 4–6 week blocks only, almost always alongside an injectable base — the hepatotoxicity of 17-alkylated orals makes longer runs a bad trade. Suppressive.',
    storage: 'Room temperature, away from moisture and light.',
    halfLife: '~4–6 hours.',
    caution: 'Aromatizes to methylestradiol, a more potent estrogen than estradiol — water retention, blood pressure elevation, and gyno risk are front-loaded and an AI is commonly needed. Hepatotoxic (17-alpha-alkylated): liver enzymes rise quickly; no alcohol, watch other oral meds, keep blocks short. Sharp HDL suppression. Most of the scale weight leaves when the water does.'
  },

  'Turinabol': {
    category: 'Anabolic Steroid (Oral)',
    aka: 'Tbol / Oral Turinabol / Chlorodehydromethyltestosterone (CDMT)',
    summary: 'A chlorinated modification of dianabol that cannot aromatize — trading dbol’s rapid watery mass for slower, dry, keepable gains with no estrogenic side effects. Historically infamous as the compound at the center of the East German state doping program. Moderate anabolic effect with relatively mild androgenic activity.',
    dosing: {
      range: '20–40 mg/day (educational ranges)',
      frequency: 'Once daily or split into 2 doses',
      timing: 'Oral, with or without food.'
    },
    cycling: 'Short 6–8 week blocks, typically alongside an injectable base; suppressive. Liver limits duration like all 17-alkylated orals.',
    storage: 'Room temperature, away from moisture and light.',
    halfLife: '~16 hours — long for an oral, making once-daily dosing viable.',
    caution: 'Hepatotoxic (17-alpha-alkylated) — keep blocks short and monitor liver enzymes. Strong HDL suppression despite the "mild" reputation. Long-term metabolite detection is excellent in modern anti-doping (it’s the compound behind many retroactive Olympic disqualifications). No pharmaceutical production exists — gray-market only.'
  },

  'Stanozolol': {
    category: 'Anabolic Steroid (Oral)',
    aka: 'Winstrol / Winny (oral tabs or aqueous injectable)',
    summary: 'A DHT-derived compound available as tablets or an aqueous suspension injectable — unusually, both routes are C17-alpha-alkylated, so the injectable is just as liver-toxic. Cannot aromatize; produces a distinctive dry, hard, vascular look, which makes it a contest-prep and athletics staple (famously, Ben Johnson in 1988). Also strongly reduces SHBG, freeing up other compounds in a stack.',
    dosing: {
      range: '25–50 mg/day oral, or 50 mg every other day injectable (educational ranges)',
      frequency: 'Oral split into 2 doses; injectable daily or every other day',
      timing: 'Typically run the final 4–6 weeks before a physique peak.'
    },
    cycling: 'Short 4–6 week blocks alongside a testosterone base; suppressive. The dry-joint effect makes it a poor pairing with heavy low-rep training for some.',
    storage: 'Room temperature; shake aqueous suspension before drawing.',
    halfLife: '~9 hours (oral).',
    caution: 'One of the harshest common compounds on lipids — HDL can crater within weeks. Hepatotoxic by either route (both are 17-alkylated). Notoriously drying to joints (it lowers synovial fluid), with tendon-brittleness concerns. DHT-line hair loss risk, not preventable with 5-AR inhibitors.'
  },

  'Oxymetholone': {
    category: 'Anabolic Steroid (Oral)',
    aka: 'Anadrol / Adrol / A-bombs',
    summary: 'The most aggressive mass-building oral in common use, originally developed for anemia. Delivers dramatic size, fullness, and strength within weeks — much of it water. Bizarrely, despite being DHT-derived and unable to aromatize, it produces strong estrogenic-type side effects (thought to activate estrogen receptors directly), so gyno and water retention are real risks that an aromatase inhibitor cannot fix.',
    dosing: {
      range: '50–100 mg/day (educational ranges; 50 mg is plenty for most)',
      frequency: 'Once daily or split',
      timing: 'Oral; often used as a 4-week kickstart or a pre-contest fullness tool.'
    },
    cycling: 'Short 4–6 week blocks only, alongside an injectable base; suppressive. Diminishing returns above 100 mg are well-documented while toxicity keeps climbing.',
    storage: 'Room temperature, away from moisture and light.',
    halfLife: '~8–9 hours.',
    caution: 'Among the most hepatotoxic common orals (17-alpha-alkylated) — liver enzymes and blood pressure both spike fast. Estrogenic sides respond to SERMs (receptor blockers) but not AIs, since no aromatization is involved. Appetite suppression, lethargy, and headaches are common. Sharp HDL suppression; significant water/BP load on the heart.'
  },

  'Methasterone': {
    category: 'Anabolic Steroid (Oral)',
    aka: 'Superdrol / Sdrol / Methyldrostanolone',
    summary: 'Methylated drostanolone — sold openly as a "prohormone" supplement in the 2000s until banned in 2012, and responsible for a disproportionate share of documented AAS liver-injury case reports. Produces rapid, dry, full gains with no estrogen conversion, which built its cult following; its hepatotoxicity is in a different league from mainstream orals.',
    dosing: {
      range: '10–20 mg/day (educational ranges — this is a compound where more is emphatically not better)',
      frequency: 'Once daily or split',
      timing: 'Oral.'
    },
    cycling: 'Very short 3–4 week blocks maximum, alongside an injectable base; suppressive. Longer runs are where the published liver-injury cases cluster.',
    storage: 'Room temperature, away from moisture and light.',
    halfLife: '~8 hours.',
    caution: 'Severely hepatotoxic — documented cases of cholestatic jaundice and drug-induced liver injury, some requiring hospitalization. Crushing lethargy, appetite loss, and back pumps are commonly reported. Brutal lipid suppression. If any oral warrants pre/mid/post liver labs and strict duration limits, it is this one; many harm-reduction sources simply say skip it.'
  },

  'Fluoxymesterone': {
    category: 'Anabolic Steroid (Oral)',
    aka: 'Halotestin / Halo',
    summary: 'A 17-alkylated testosterone derivative that builds almost no mass but produces dramatic strength, aggression, and muscle density — the classic "meet day" drug for powerlifters and fighters, and a final-week hardener in bodybuilding. Pound-for-pound one of the most androgenic and least anabolic compounds available.',
    dosing: {
      range: '10–20 mg/day (educational ranges)',
      frequency: 'Once daily or split; some strength athletes dose only on training/competition days',
      timing: 'Oral, ~1–2 hours before training when used acutely.'
    },
    cycling: 'Very short 2–4 week blocks (or acute use), alongside a base; suppressive. Duration is limited by liver and lipid toxicity, not by diminishing gains.',
    storage: 'Room temperature, away from moisture and light.',
    halfLife: '~9 hours.',
    caution: 'Among the harshest compounds on both liver and lipids — HDL suppression is severe and fast. The aggression/irritability it is famous for is a real behavioral side effect, not just gym folklore. High androgenicity: hair loss and acne in the predisposed. Strictly a short-duration specialty tool.'
  },

  'Clenbuterol': {
    category: 'Beta-2 Agonist (Cutting)',
    aka: 'Clen',
    summary: 'Not a steroid — a long-acting beta-2 adrenergic agonist bronchodilator (asthma drug in some countries, never approved for humans in the US) used off-label as a thermogenic. Raises metabolic rate a few percent and has mild anti-catabolic properties. Its very long half-life means the stimulant effects run around the clock, unlike caffeine-type thermogenics.',
    dosing: {
      range: '20 mcg/day starting, titrated up by 20 mcg every few days as tolerated; common educational ceiling 80–120 mcg/day',
      frequency: 'Once daily (long half-life) — morning dosing limits sleep disruption',
      timing: 'Classic protocols run 2 weeks on / 2 weeks off to offset receptor downregulation; others taper up continuously and stop.'
    },
    cycling: 'Effectiveness fades as beta-2 receptors downregulate over 2–4 weeks; breaks restore sensitivity. Always titrate — never start at the target dose.',
    storage: 'Room temperature, in original packaging.',
    halfLife: '~26–36 hours — side effects persist all day and take days to fully clear after stopping.',
    caution: 'Serious cardiac concerns: prolonged/high-dose use is associated with cardiac hypertrophy, arrhythmias, and documented myocardial injury cases — this is the compound’s real risk, not the shakes. Common sides: hand tremors, insomnia, sweating, and muscle cramps (it depletes taurine and potassium — supplementing both is standard). Avoid entirely with any cardiac history, and never combine with other stimulants casually.'
  },

  'Finasteride': {
    category: 'DHT Blocker (5-alpha Reductase Inhibitor)',
    aka: 'Propecia (1mg) / Proscar (5mg)',
    summary: 'A selective inhibitor of the type II 5-alpha reductase enzyme, which converts testosterone into DHT. Reduces scalp DHT by roughly 60-70% at the standard 1mg dose, slowing/reversing androgenic hair loss for many users. Approved for male pattern hair loss (1mg) and BPH (5mg).',
    dosing: {
      range: '1 mg/day (hair loss dose; 5mg tablets are commonly split/quartered to reach this)',
      frequency: 'Once daily',
      timing: 'Oral, any time of day; consistency matters more than timing. Effects take 3-6+ months to become noticeable.'
    },
    cycling: 'Taken continuously — benefits reverse within ~6-12 months of stopping since it only suppresses ongoing conversion, it does not create a lasting change.',
    storage: 'Room temperature, in original packaging.',
    halfLife: '~5-6 hours, but tissue DHT suppression persists longer than plasma levels suggest with daily dosing.',
    caution: 'Only blocks 5-alpha reductase conversion of testosterone → DHT — it does not lower DHT-derived compounds that are already DHT itself (e.g. methenolone, oxandrolone), so it won’t offset hair-loss risk from those. Associated with a small but real risk of sexual side effects (libido, erectile function) in a subset of users, sometimes persisting after discontinuation ("post-finasteride syndrome" — rare but reported). Can suppress PSA by ~50%, which must be accounted for when interpreting prostate labs. Pregnant women should not handle crushed/broken tablets (teratogenic).'
  },

  'Dutasteride': {
    category: 'DHT Blocker (5-alpha Reductase Inhibitor)',
    aka: 'Avodart',
    summary: 'A dual inhibitor of both type I and type II 5-alpha reductase enzymes, which convert testosterone into DHT. Suppresses serum DHT by ~90%+ (vs ~70% for finasteride, which only blocks type II), making it the more potent option for androgenic hair loss. Approved for BPH (0.5mg); used off-label for hair loss.',
    dosing: {
      range: '0.5 mg/day (standard dose; some protocols use 0.5 mg every other day or a few times weekly given the very long half-life)',
      frequency: 'Once daily',
      timing: 'Oral, any time of day, with or without food; consistency matters more than timing. Effects take 3-6+ months to become noticeable. When switching from finasteride, no washout is needed — dutasteride covers everything finasteride does and more.'
    },
    cycling: 'Taken continuously — benefits reverse after stopping, though the very long half-life means DHT suppression persists for weeks to months after discontinuation.',
    storage: 'Room temperature, in original packaging. Soft gelatin capsules — do not open or handle if damaged.',
    halfLife: '~4-5 weeks at steady state — dramatically longer than finasteride (~5-6 hours), so missed doses matter little but it also takes months to fully clear.',
    caution: 'Same class-wide risks as finasteride — sexual side effects in a subset of users (with the added caveat that the long half-life means any side effects take much longer to resolve after stopping), and PSA suppression (~50%) that must be accounted for when interpreting prostate labs. Like finasteride, it does not lower compounds that are already DHT-derived (methenolone, oxandrolone). Pregnant women should not handle leaking/damaged capsules (teratogenic). Blood donation deferral: 6 months after the last dose (vs 1 month for finasteride) due to teratogenicity risk.'
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

  'Retatrutide': {
    category: 'GLP-1/GIP/Glucagon Receptor Agonist',
    summary: 'A triple agonist targeting GLP-1, GIP, and glucagon receptors — the addition of glucagon activity distinguishes it from semaglutide (GLP-1 only) and tirzepatide (GLP-1/GIP), and is associated with the largest weight-loss effect sizes seen in GLP-1-class trials to date. Still in late-stage clinical trials, not yet FDA approved; available in research/compounded form.',
    dosing: {
      range: '1 mg starting dose, titrated up to 4–12 mg over months per trial protocols',
      frequency: 'Weekly',
      timing: 'Same day each week; slow titration (every 4 weeks) minimizes GI side effects.'
    },
    reconstitution: {
      instructions: 'Compounded lyophilized vials: reconstitute per supplier-specific concentration with bacteriostatic water — concentration varies by vial, always confirm before dosing.'
    },
    cycling: 'Generally used continuously while pursuing a weight/metabolic goal.',
    storage: 'Refrigerate both before and after reconstitution; avoid freezing.',
    halfLife: '~6 days, supporting once-weekly dosing.',
    caution: 'Not yet FDA approved — no long-term post-market safety data exists outside trials. Common GI side effects during titration; glucagon agonism raises additional theoretical concerns (e.g. on heart rate) versus GLP-1-only agonists. Same class-wide thyroid C-cell tumor warning as other GLP-1-class agonists.'
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
