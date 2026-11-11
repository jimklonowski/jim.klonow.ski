<template>
  <div>
    <!-- Breadcrumb title row, the ledger's shape -->
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2 px-4 sm:px-6 pt-4 pb-3.5 print:hidden">
      <h1 class="flex items-baseline gap-2.5 min-w-0">
        <span class="text-meta text-muted tracking-[0.06em] uppercase">
          <NuxtLink
            to="/labs"
            class="hover:text-accent"
          >labs</NuxtLink> /
        </span>
        <span class="num-display text-hi text-tile leading-none">CLINICAL SUMMARY</span>
      </h1>
      <p class="text-meta text-muted tracking-[0.06em] uppercase">
        as of {{ formatDate(asOf, 'monthDay') }}
      </p>
      <div class="flex flex-wrap items-center gap-2 ml-auto">
        <NuxtLink
          to="/labs"
          class="tui-btn"
        >
          BLOODWORK →
        </NuxtLink>
        <NuxtLink
          to="/labs/ledger"
          class="tui-btn"
        >
          LEDGER →
        </NuxtLink>
        <button
          type="button"
          class="tui-btn"
          @click="print"
        >
          PRINT
        </button>
      </div>
    </div>

    <TuiDataState
      :error="error"
      :empty="!draws.length"
      empty-title="No blood draws yet"
      empty-description="Upload a panel and the summary builds itself from the record."
      @retry="refresh"
    />

    <!-- One page for a clinician: everything deterministic, nothing written by a model. -->
    <article
      v-if="draws.length"
      class="px-4 sm:px-6 pb-6 max-w-4xl text-small leading-[1.6]"
      data-report
    >
      <header class="border-b border-line pb-3 mb-4">
        <p class="num-display text-hi text-figure leading-none">
          Clinical summary · {{ formatDate(asOf, 'long') }}
        </p>
        <p class="mt-1.5 text-muted">
          {{ facts.join(' · ') }}
        </p>
        <p class="mt-1 text-meta text-faint">
          Built from the record as stored: lab values with each laboratory's own reference ranges, the dosing schedule, the logged vitals. No AI-written text. Printed {{ formatDate(today, 'long') }}.
        </p>
      </header>

      <!-- 1. Protocol in force -->
      <section class="mb-4">
        <TuiHeader label="PROTOCOL IN FORCE" />
        <div
          v-if="protocolRows.length"
          class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5"
        >
          <template
            v-for="r in protocolRows"
            :key="r.name"
          >
            <span class="text-hi">{{ r.name }}</span>
            <span class="text-dim">{{ r.text }}</span>
          </template>
        </div>
        <p
          v-else
          class="mt-1.5 text-muted"
        >
          Nothing on the schedule on this date.
        </p>
        <p
          v-for="c in activeCycles"
          :key="c.text"
          class="mt-1 text-dim"
        >
          {{ c.text }}
        </p>
        <p
          v-if="timing.length"
          class="mt-1 text-meta text-muted"
        >
          Latest draw ({{ formatDate(latestDraw!.date, 'monthDay') }}) was taken {{ timing.map(t => t.text).join(', ') }}. {{ TIMING_CAVEAT }}
        </p>
      </section>

      <!-- 2. Flagged markers -->
      <section class="mb-4">
        <TuiHeader :label="`OUT OF RANGE · ${flagged.length}`" />
        <table
          v-if="flagged.length"
          class="mt-1.5 w-full"
        >
          <thead>
            <tr class="text-label uppercase tracking-[0.12em] text-muted text-left">
              <th class="pr-3 font-normal">
                Marker
              </th>
              <th class="pr-3 font-normal">
                Value
              </th>
              <th class="pr-3 font-normal">
                Reference
              </th>
              <th class="pr-3 font-normal">
                Drawn
              </th>
              <th class="font-normal">
                Note
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="f in flagged"
              :key="f.key"
              class="border-t border-line-row align-top"
            >
              <td class="pr-3 py-1 text-hi">
                {{ f.label }}
              </td>
              <td class="pr-3 py-1 tabular-nums whitespace-nowrap">
                <span :class="f.status === 'high' ? 'text-danger' : 'text-warn'">{{ f.value }}</span> {{ f.unit }} <span class="text-meta text-muted">{{ f.status.toUpperCase() }}</span>
              </td>
              <td class="pr-3 py-1 text-dim tabular-nums whitespace-nowrap">
                {{ f.ref }}
              </td>
              <td class="pr-3 py-1 text-dim whitespace-nowrap">
                {{ formatDate(f.date, 'monthDay') }}
              </td>
              <td class="py-1 text-muted">
                {{ f.note }}
              </td>
            </tr>
          </tbody>
        </table>
        <p
          v-else
          class="mt-1.5 text-muted"
        >
          Every current reading is inside its reference range.
        </p>
        <p class="mt-1 text-meta text-faint">
          Current = each marker's newest reading in the {{ CURRENT_WINDOW_DAYS }} days before the latest draw. A reading marked † was printed by the lab as a bound (&lt; or &gt;), not a measurement.
        </p>
      </section>

      <!-- 3. Hematocrit and iron -->
      <section class="mb-4">
        <TuiHeader label="HEMATOCRIT · HEMOGLOBIN · FERRITIN" />
        <table
          v-if="hctRows.length"
          class="mt-1.5"
        >
          <thead>
            <tr class="text-label uppercase tracking-[0.12em] text-muted text-left">
              <th class="pr-4 font-normal">
                Drawn
              </th>
              <th class="pr-4 font-normal">
                Hct %
              </th>
              <th class="pr-4 font-normal">
                Hgb g/dL
              </th>
              <th class="font-normal">
                Ferritin ng/mL
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="d in hctRows"
              :key="d.date"
              class="border-t border-line-row"
            >
              <td class="pr-4 py-0.5 text-dim whitespace-nowrap">
                {{ formatDate(d.date, 'short') }}
              </td>
              <td class="pr-4 py-0.5 tabular-nums">
                {{ d.hematocrit ?? '—' }}
              </td>
              <td class="pr-4 py-0.5 tabular-nums">
                {{ d.hemoglobin ?? '—' }}
              </td>
              <td class="py-0.5 tabular-nums">
                {{ d.ferritin ?? '—' }}
              </td>
            </tr>
          </tbody>
        </table>
        <p
          v-else
          class="mt-1.5 text-muted"
        >
          No CBC on file.
        </p>
        <p
          v-if="rungLine"
          class="mt-1 text-dim"
        >
          {{ rungLine }}
        </p>
        <p
          v-for="p in phlebRows"
          :key="p.text"
          class="mt-0.5 text-dim"
        >
          {{ p.text }}
        </p>
        <p
          v-if="deferral"
          class="mt-1 text-warn"
        >
          {{ deferral }}
        </p>
      </section>

      <!-- 4. Vitals, last 30 days -->
      <section class="mb-4">
        <TuiHeader label="VITALS · LAST 30 DAYS" />
        <p
          v-if="vitalsLine"
          class="mt-1.5 text-dim"
        >
          {{ vitalsLine }}
        </p>
        <p
          v-else
          class="mt-1.5 text-muted"
        >
          {{ journalShared ? 'No vitals logged in the window.' : 'The daily log is not part of this view.' }}
        </p>
      </section>

      <!-- 5. Next draw -->
      <section class="mb-4">
        <TuiHeader label="NEXT DRAW" />
        <p
          v-if="nextDraw"
          class="mt-1.5 text-dim"
        >
          {{ nextDraw }}
        </p>
        <p
          v-else
          class="mt-1.5 text-muted"
        >
          No draw booked.
        </p>
        <p
          v-if="dueLine"
          class="mt-1 text-dim"
        >
          {{ dueLine }}
        </p>
      </section>

      <!-- 6. Immunizations -->
      <section class="mb-4">
        <TuiHeader label="IMMUNIZATIONS" />
        <div
          v-if="vaccineRows.length"
          class="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5"
        >
          <template
            v-for="v in vaccineRows"
            :key="v.family"
          >
            <span class="text-hi">{{ v.label }}</span>
            <span class="text-dim">{{ v.text }}</span>
          </template>
        </div>
        <p
          v-else
          class="mt-1.5 text-muted"
        >
          No immunizations on file.
        </p>
      </section>

      <p class="text-meta text-ghost border-t border-line pt-2">
        {{ GENERAL_DISCLAIMER }}
      </p>
    </article>
  </div>
</template>

<script setup lang="ts">
import { donationDeferral } from '#shared/utils/accutane'
import { bpAverageLabel } from '#shared/utils/bloodPressure'
import { cycleProgress, cycleStatusOn } from '#shared/utils/cycles'
import { diffDays, shiftDays } from '#shared/utils/dates'
import { protocolOn } from '#shared/utils/drawLedger'
import { TIMING_CAVEAT, drawTimingChips } from '#shared/utils/drawTimingView'
import { hctDraws, ladderRung, phlebotomyEffects } from '#shared/utils/hematocrit'
import { isCensored } from '#shared/utils/labNotes'
import { readingOn, readingRangeText, readingValueText } from '#shared/utils/labReadings'
import { CURRENT_WINDOW_DAYS, currentReadings, entriesAsOf } from '#shared/utils/labsTimeline'
import { fmtMarkerValue } from '#shared/utils/markerValue'
import { drawLabel, nextPlannedDraw, purposeLines } from '#shared/utils/plannedDraws'
import { cadenceOf, ruleActiveOn } from '#shared/utils/protocolRules'
import { markersDue } from '#shared/utils/retest'
import { vaccineCoverage } from '#shared/utils/vaccines'
import { describeTrend, weighInsOf, weightTrend } from '#shared/utils/weightTrend'
import { BIOMARKERS, getStatus, isEchoOnly } from '~/data/biomarkers'
import { GENERAL_DISCLAIMER } from '~/data/compoundInfo'
import { effectiveRules } from '~/utils/adherence'

useSeoMeta({ title: 'Labs · Clinical summary' })

// The one-page clinician summary (audit #43 item 73): what a doctor needs at the start of a
// visit, on one printable page, every line computed from the record — the protocol in force,
// the out-of-range markers with their draw timing, the hematocrit campaign, a month of vitals,
// the next draw and the immunization record. No model output anywhere. `?asof=YYYY-MM-DD`
// renders it as of an earlier day (the draws on or before it; the schedule that day).

const VITALS_WINDOW_DAYS = 30
const HCT_ROWS = 6

const route = useRoute()
const today = useToday()
const { role } = await useAuth()
const [{ data: labsData, error, refresh }, { rules: protocolRules, standing: protocolStanding }, { data: cyclesData }, { data: journalData }, { data: phlebData }, { data: plannedData }, { data: vaccData }, { data: profileData }] = await Promise.all([
  useLabsEntries(),
  useProtocol(),
  useCycles(),
  useJournalEntries(),
  usePhlebotomies(),
  usePlannedDraws(),
  useVaccinations(),
  useProfile()
])

const asOf = computed(() => {
  const q = route.query.asof
  return typeof q === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= today.value ? q : today.value
})
// Blood draws on or before the date; an echo-only row is a scan.
const draws = computed(() => entriesAsOf((labsData.value ?? []).filter(e => !isEchoOnly(e)), asOf.value))
const latestDraw = computed(() => draws.value.at(-1) ?? null)
const journal = computed(() => (journalData.value ?? []).filter(e => e.date <= asOf.value))
// The doctor's view carries no daily log (the list answers empty), so the vitals section says so
// instead of reading as "none logged".
const journalShared = computed(() => role.value !== 'doctor')
const cycles = computed(() => cyclesData.value ?? [])
const rules = computed(() => effectiveRules(cycles.value, protocolRules.value))

const facts = computed(() => {
  const out: string[] = []
  const blood = profileData.value?.blood_type
  if (blood) out.push(`blood type ${blood}`)
  out.push(`${draws.value.length} draw${draws.value.length === 1 ? '' : 's'} on file`)
  if (latestDraw.value) out.push(`latest ${formatDate(latestDraw.value.date, 'monthDay')}${latestDraw.value.fasting ? ', fasting' : ''}`)
  return out
})

// --- 1. protocol in force ---
const protocolRows = computed(() => {
  const injectables = protocolOn(rules.value, asOf.value).map(c => ({
    name: c.compound,
    text: `${c.text} — ${c.label} ${cadenceOf(rules.value.find(r => r.compound === c.compound && ruleActiveOn(r, asOf.value))?.weekdays ?? [])}`
  }))
  const seen = new Set(injectables.map(r => r.name))
  // Scored rules that are not injectables (orals logged daily), then the standing list — taken
  // daily without being logged, so it carries a label and no weekdays.
  const orals = rules.value
    .filter(r => ruleActiveOn(r, asOf.value) && !seen.has(r.compound))
    .map(r => ({ name: r.compound, text: `${r.doseLabel} ${cadenceOf(r.weekdays)}${r.from ? ` · since ${formatDate(r.from, 'monthDay')}` : ''}` }))
  for (const r of orals) seen.add(r.name)
  const standing = protocolStanding.value
    .filter(r => ruleActiveOn(r, asOf.value) && !seen.has(r.compound))
    .map(r => ({ name: r.compound, text: `${r.label}, daily${r.from ? ` · since ${formatDate(r.from, 'monthDay')}` : ''}` }))
  return [...injectables, ...orals, ...standing]
})
const activeCycles = computed(() => cycles.value
  .filter(c => cycleStatusOn(c, asOf.value) === 'active')
  .map((c) => {
    const p = cycleProgress(c, asOf.value)
    return { text: `${c.name}: day ${p.day} of ${p.totalDays} (week ${p.week} of ${p.totalWeeks}), started ${formatDate(c.start_date, 'monthDay')}.` }
  }))
const timing = computed(() => (latestDraw.value ? drawTimingChips(journal.value, latestDraw.value.date) : []))

// --- 2. out of range ---
const flagged = computed(() => {
  const current = currentReadings(draws.value)
  const out: Array<{ key: string, label: string, value: string, unit: string, status: 'high' | 'low', ref: string, date: string, note: string }> = []
  for (const [key, cur] of current) {
    const meta = BIOMARKERS[key]
    if (!meta || meta.category === 'cardiac') continue
    const status = getStatus(cur.value, meta)
    if (status !== 'high' && status !== 'low') continue
    const draw = draws.value.find(d => d.date === cur.date)
    const prov = readingOn(draw, key)
    const censored = isCensored(draw, key)
    // The range the lab printed for that reading when known, else the catalogue's.
    const printed = readingRangeText(prov)
    const ref = printed || (meta.refMin == null && meta.refMax == null ? '' : `${meta.refMin ?? ''}–${meta.refMax ?? ''}`.replace(/^–/, '<').replace(/–$/, '>'))
    const notes = [
      censored ? '† a bound at the assay limit' : '',
      prov?.lab ? prov.lab : '',
      readingNoteShort(draw?.notes?.[key]?.note)
    ].filter(Boolean)
    out.push({ key, label: meta.label, value: readingValueText(fmtMarkerValue(cur.value), prov), unit: meta.unit, status, ref, date: cur.date, note: notes.join(' · ') })
  }
  return out.sort((a, b) => a.label.localeCompare(b.label))
})
/** The first clause of a hand note, for a cell. */
function readingNoteShort(note: string | undefined): string {
  if (!note) return ''
  const first = note.split(/(?<=\.)\s/)[0] ?? note
  return first.length > 120 ? `${first.slice(0, 117)}…` : first
}

// --- 3. hematocrit ---
const hct = computed(() => hctDraws(draws.value))
const hctRows = computed(() => hct.value.slice(-HCT_ROWS).reverse())
const rungLine = computed(() => {
  const last = [...hct.value].reverse().find(d => d.hematocrit != null)
  if (!last) return ''
  const rung = ladderRung(last.hematocrit)
  return rung
    ? `Latest hematocrit ${last.hematocrit} % (${formatDate(last.date, 'monthDay')}) sits on the "${rung.label}" rung of the action ladder: ${rung.action}.`
    : `Latest hematocrit ${last.hematocrit} % (${formatDate(last.date, 'monthDay')}), under the ladder's first rung (50).`
})
const phlebRows = computed(() => phlebotomyEffects((phlebData.value ?? []).filter(p => p.date <= asOf.value), hct.value).map(e => ({
  text: `${formatDate(e.phlebotomy.date, 'monthDay')}: ${e.phlebotomy.kind === 'donation' ? 'blood donation' : 'therapeutic phlebotomy'}${e.phlebotomy.ml ? `, ${e.phlebotomy.ml} mL` : ''}${e.hctDelta != null ? ` — Hct ${e.before!.value} → ${e.after!.value} (${e.hctDelta > 0 ? '+' : ''}${e.hctDelta})` : e.before ? ` — Hct ${e.before.value} before, no draw since` : ''}.`
})))
const deferral = computed(() => {
  const d = donationDeferral(cycles.value, asOf.value)
  return d?.active ? `Blood donation deferred until ${formatDate(d.until, 'monthDay')}: isotretinoin course since ${formatDate(d.start, 'monthDay')}.` : ''
})

// --- 4. vitals ---
const vitalsLine = computed(() => {
  const from = shiftDays(asOf.value, -(VITALS_WINDOW_DAYS - 1))
  const rows = journal.value.filter(e => e.date >= from)
  const parts: string[] = []
  const bp = bpAverageLabel(rows)
  if (bp) parts.push(`BP ${bp} mmHg (mean of ${rows.filter(r => r.bp_systolic && r.bp_diastolic).length} readings)`)
  const rhr = rows.map(r => r.rhr).filter((v): v is number => typeof v === 'number' && v > 0)
  if (rhr.length) parts.push(`resting HR ${Math.round(rhr.reduce((s, v) => s + v, 0) / rhr.length)} bpm (${rhr.length} days)`)
  const wt = describeTrend(weightTrend(weighInsOf(journal.value), asOf.value))
  if (wt) parts.push(`weight ${wt}`)
  return parts.length ? `${parts.join(' · ')}.` : ''
})

// --- 5. next draw ---
const drawDates = computed(() => draws.value.map(d => d.date))
const nextDraw = computed(() => {
  const s = nextPlannedDraw(plannedData.value ?? [], drawDates.value, asOf.value)
  if (!s) return ''
  const when = s.inDays >= 0 ? `in ${s.inDays} day${s.inDays === 1 ? '' : 's'}` : `${-s.inDays} days ago, results pending`
  const q = purposeLines(s.plan)
  return `${formatDate(s.plan.date, 'long')} (${when}) — ${drawLabel(s.plan)}${q.length ? `. To answer: ${q.join('; ')}` : ''}.`
})
const dueLine = computed(() => {
  const due = markersDue(draws.value, plannedData.value ?? [], asOf.value)
  if (!due.length) return ''
  return `Retests due: ${due.map(d => `${BIOMARKERS[d.key]?.label ?? d.key} (${d.inDays < 0 ? `${-d.inDays} d overdue` : `in ${d.inDays} d`}${d.planned ? ', booked' : ''})`).join(', ')}.`
})

// --- 6. immunizations ---
const vaccineRows = computed(() => vaccineCoverage(vaccData.value ?? [], asOf.value).map(v => ({
  family: v.family,
  label: v.label,
  text: `last ${formatDate(v.lastDate, 'monthDay')} (${v.doses} dose${v.doses === 1 ? '' : 's'})${v.nextDue ? ` · next due ${formatDate(v.nextDue, 'monthDay')}${v.nextDue < asOf.value ? ` — ${diffDays(v.nextDue, asOf.value)} days overdue` : ''}` : ''}`
})))

function print() {
  if (import.meta.client) window.print()
}
</script>
