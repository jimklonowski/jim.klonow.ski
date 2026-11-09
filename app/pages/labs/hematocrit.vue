<template>
  <div>
    <!-- Breadcrumb title row, the DEXA page's shape -->
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2 px-4 sm:px-6 pt-4 pb-3.5">
      <h1 class="flex items-baseline gap-2.5 min-w-0">
        <span class="text-meta text-muted tracking-[0.06em] uppercase">
          <NuxtLink
            to="/labs"
            class="hover:text-accent"
          >labs</NuxtLink> /
        </span>
        <span class="num-display text-hi text-tile leading-none">HEMATOCRIT</span>
      </h1>

      <p
        v-if="titleMeta"
        class="text-meta text-muted tracking-[0.06em] uppercase"
      >
        {{ titleMeta }}
      </p>

      <div class="flex flex-wrap items-center gap-2 ml-auto">
        <NuxtLink
          :to="{ path: '/labs', query: { marker: 'hematocrit' } }"
          class="tui-btn"
        >
          BLOODWORK →
        </NuxtLink>
        <button
          v-if="canEdit"
          type="button"
          class="tui-btn tui-btn-accent"
          @click="openAddModal"
        >
          + LOG PHLEBOTOMY
        </button>
      </div>
    </div>

    <TuiDataState
      :error="error"
      :empty="!draws.length"
      empty-title="No CBC on file yet"
      empty-description="Upload a panel with a hematocrit and the campaign lands here."
      @retry="refresh"
    />

    <template v-if="draws.length">
      <!-- Stat cells, the compound page's row: the reading, its rung, the iron store, the visits -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-px bg-line border-y border-line">
        <div
          v-for="cell in statCells"
          :key="cell.label"
          class="bg-bg px-4 sm:px-6 py-3.5"
        >
          <p class="text-label text-muted uppercase tracking-[0.12em]">
            {{ cell.label }}
          </p>
          <p
            class="num-display text-display leading-none mt-1.5 whitespace-nowrap"
            :class="cell.class"
          >
            {{ cell.value }}<span
              v-if="cell.unit"
              class="text-meta text-muted"
            > {{ cell.unit }}</span>
          </p>
          <p
            v-if="cell.note"
            class="text-meta text-muted mt-1"
          >
            {{ cell.note }}
          </p>
        </div>
      </div>

      <!-- Main split, the compound page's: the ladder and dossier in a 380px track, the data on
           the right. Both need min-w-0 so the chart's pixel width can't hold the grid open. -->
      <div class="grid gap-px bg-line lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section class="bg-bg px-4 sm:px-6 py-4 space-y-4 min-w-0">
          <!-- The ladder: where the reading sits and what the next rung asks -->
          <div>
            <TuiHeader
              label="LADDER"
              :dashes="14"
            >
              <span class="text-label text-muted normal-case">{{ ladderLine }}</span>
            </TuiHeader>
            <div class="mt-2">
              <div
                v-for="rung in ladderRows"
                :key="rung.at"
                class="flex items-baseline gap-2.5 py-2 border-b border-line-row last:border-0"
                :class="rung.reached ? '' : 'opacity-60'"
              >
                <span
                  class="num-display text-title w-8 shrink-0"
                  :class="rung.reached ? toneClass(rung.tone) : 'text-muted'"
                >{{ rung.at }}</span>
                <span
                  class="text-meta uppercase tracking-[0.08em] w-11 shrink-0"
                  :class="rung.reached ? toneClass(rung.tone) : 'text-faint'"
                >{{ rung.label }}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-small text-dim leading-[1.6]">{{ rungAction(rung, donationDeferred) }}</span>
                  <span
                    v-if="rung.here"
                    class="block text-meta text-accent mt-0.5"
                  >◀ here{{ headline.next ? ` · ${headline.next.gap} to ${headline.next.rung.at} ${headline.next.rung.label}` : ' · top of the ladder' }}</span>
                </span>
              </div>
            </div>
            <p
              v-if="deferral"
              class="mt-3 text-small text-dim leading-[1.7] border-l-2 border-warn pl-2.5"
            >
              <template v-if="deferral.active">
                <span class="text-warn">No donation until {{ formatDate(deferral.until) }}:</span> isotretinoin course, plus {{ DONATION_DEFERRAL_DAYS }} days after the last capsule. Blood banks refuse donors on it because the drug in donated blood can harm a pregnant recipient's baby. Blood out before then is a therapeutic phlebotomy on a prescriber's order.
              </template>
              <template v-else>
                <span class="text-warn">Isotretinoin starts {{ formatDate(deferral.start, 'monthDay') }}:</span> from then until {{ formatDate(deferral.until) }} ({{ DONATION_DEFERRAL_DAYS }} days after the last capsule) blood banks refuse donors, and blood out is a therapeutic phlebotomy on a prescriber's order.
              </template>
            </p>
            <p
              v-if="headline.transitional"
              class="mt-3 text-small text-dim leading-[1.7] border-l-2 border-warn pl-2.5"
            >
              <span class="text-warn">Transitional:</span> {{ headline.transitional.change }} was {{ headline.daysIn }} days ago. Red cells turn over on a ~{{ RBC_TURNOVER_DAYS }}-day cycle, so the full effect of that change isn't expected before {{ formatDate(headline.transitional.to, 'monthDay') }} — a flat reading until then is the expected reading, not the change failing.
            </p>
          </div>

          <!-- Dossier: what the number is and the rules of thumb the panel runs on -->
          <div>
            <TuiHeader
              label="DOSSIER"
              :dashes="20"
            />
            <p class="mt-2.5 text-row leading-[1.7] text-dim">
              {{ HEMATOCRIT_DOSSIER.summary }}
            </p>
            <dl class="mt-3 space-y-2 text-small">
              <div v-if="driverLine">
                <dt class="text-label text-muted uppercase tracking-[0.12em]">
                  Drivers on the protocol
                </dt>
                <dd class="text-dim">
                  {{ driverLine }}
                </dd>
              </div>
              <div
                v-for="entry in HEMATOCRIT_DOSSIER.entries"
                :key="entry.label"
              >
                <dt class="text-label text-muted uppercase tracking-[0.12em]">
                  {{ entry.label }}
                </dt>
                <dd class="text-dim">
                  {{ entry.text }}
                </dd>
                <dd
                  v-if="entry.note"
                  class="text-faint"
                >
                  {{ entry.note }}
                </dd>
              </div>
            </dl>
            <p class="mt-3 text-small text-warn leading-[1.6]">
              ⚠ {{ HEMATOCRIT_DOSSIER.caution }}
            </p>
          </div>
        </section>

        <section class="bg-bg px-4 sm:px-6 py-4 space-y-4 min-w-0">
          <!-- The chart: Hct and Hgb, dose changes as lines, turnover windows as bands, phlebotomies as verticals -->
          <div>
            <TuiHeader
              label="HCT · HGB"
              :dashes="12"
            >
              <span class="hidden sm:inline text-label text-muted normal-case">
                <span class="text-ember">│</span> dose change · <span class="text-faint">▒</span> turnover window · <span class="text-muted">┊</span> phlebotomy
              </span>
            </TuiHeader>
            <AreaChart
              :data="chartRows"
              :categories="chartCategories"
              :height="200"
              :annotations="placedAnnotations"
              :mark-lines="phlebotomyDates"
              dual-axis
              connect-nulls
              fit-y
              show-legend
              class="mt-2.5"
              :aria-label="`Hematocrit and hemoglobin across ${draws.length} draws, with dose changes and phlebotomies marked`"
            />
          </div>

          <!-- Phlebotomies -->
          <div>
            <TuiHeader
              label="PHLEBOTOMIES"
              :dashes="8"
            >
              <span class="hidden sm:inline text-label text-muted normal-case">blood out · the draw before against the first after</span>
            </TuiHeader>
            <p
              v-if="phlebError"
              class="mt-2 text-small text-warn flex flex-wrap items-baseline gap-x-3 gap-y-1"
            >
              The phlebotomy log didn't load, so the visits, their marks and the iron out below are missing.
              <button
                type="button"
                class="tui-btn"
                @click="refreshPhlebs()"
              >
                ⟳ RETRY
              </button>
            </p>
            <p
              v-else-if="!effects.length"
              class="mt-2 text-small text-muted"
            >
              None logged.{{ canEdit ? ' Use + LOG PHLEBOTOMY after a donation or a therapeutic draw — the chart marks it and the next CBC shows what it bought.' : '' }}
            </p>
            <div
              v-else
              class="mt-1.5"
            >
              <div
                v-for="e in [...effects].reverse()"
                :key="e.phlebotomy.id"
                class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-2 border-b border-line-row last:border-0 group"
              >
                <span class="text-small text-muted tabular-nums w-23 shrink-0">{{ formatDate(e.phlebotomy.date) }}</span>
                <span class="text-prose text-hi">{{ kindLabel(e.phlebotomy.kind) }}</span>
                <span class="text-small text-muted">{{ e.phlebotomy.ml ?? DEFAULT_DONATION_ML }} mL<span
                  v-if="e.phlebotomy.ml == null"
                  class="text-faint"
                > (assumed)</span> · ≈{{ Math.round((e.phlebotomy.ml ?? DEFAULT_DONATION_ML) * IRON_MG_PER_ML_BLOOD) }} mg iron</span>
                <span
                  v-if="e.phlebotomy.pre_hgb != null"
                  class="text-small text-muted"
                >pre-Hgb {{ e.phlebotomy.pre_hgb }}</span>
                <span
                  v-if="e.before || e.after"
                  class="text-small"
                  :class="e.hctDelta != null && e.hctDelta < 0 ? 'text-accent' : 'text-dim'"
                >Hct {{ e.before ? fmt(e.before.value) : '—' }} → {{ e.after ? fmt(e.after.value) : 'no draw yet' }}{{ e.hctDelta != null ? ` (${e.hctDelta > 0 ? '+' : ''}${e.hctDelta})` : '' }}</span>
                <span
                  v-if="e.sharedWith.length"
                  class="text-small text-faint"
                  :title="`No hematocrit draw between these visits, so ${e.after ? 'that change belongs to them together' : 'the next draw will read them together'}`"
                >together with {{ e.sharedWith.map(d => formatDate(d, 'monthDay')).join(', ') }}</span>
                <span
                  v-if="e.phlebotomy.notes"
                  class="text-small text-faint"
                >{{ e.phlebotomy.notes }}</span>
                <span
                  v-if="canEdit"
                  class="ml-auto flex items-baseline gap-2 shrink-0"
                >
                  <button
                    type="button"
                    class="text-meta text-faint hover:text-accent cursor-pointer tui-row-action"
                    :aria-label="`Edit the ${kindLabel(e.phlebotomy.kind).toLowerCase()} on ${e.phlebotomy.date}`"
                    @click="openEditModal(e.phlebotomy)"
                  >edit</button>
                  <button
                    type="button"
                    class="text-meta text-faint hover:text-danger cursor-pointer tui-row-action"
                    :aria-label="`Delete the ${kindLabel(e.phlebotomy.kind).toLowerCase()} on ${e.phlebotomy.date}`"
                    @click="confirmDelete(e.phlebotomy)"
                  >✕</button>
                </span>
              </div>
            </div>
          </div>

          <!-- Iron: the campaign's cost against what the protocol puts back -->
          <div>
            <TuiHeader
              label="IRON"
              :dashes="15"
            >
              <span class="hidden sm:inline text-label text-muted normal-case">{{ ironNote }}</span>
            </TuiHeader>
            <p class="sm:hidden mt-1 text-meta text-faint">
              {{ ironNote }}
            </p>
            <div class="mt-2.5 grid grid-cols-2 xl:grid-cols-4 gap-px bg-line border border-line">
              <div
                v-for="stat in ironStats"
                :key="stat.label"
                class="bg-bg px-3.5 py-3"
              >
                <p class="text-micro text-muted uppercase tracking-widest">
                  {{ stat.label }}
                </p>
                <p
                  class="num-display text-tile leading-none mt-1.5"
                  :class="stat.class"
                >
                  {{ stat.value }}<span class="text-label text-muted"> {{ stat.unit }}</span>
                </p>
                <p class="text-label text-faint mt-1">
                  {{ stat.note }}
                </p>
              </div>
            </div>
            <p
              v-if="ledger.sources.length"
              class="mt-2 text-meta text-faint leading-[1.6]"
            >
              Oral iron in the window: {{ ledger.sources.map(s => `${s.label} — ${s.mg} mg over ${s.days} d`).join(' · ') }}
            </p>
            <p
              v-else
              class="mt-2 text-meta text-faint leading-[1.6]"
            >
              No oral iron on the protocol in the window — a standing iron item or an iron cycle would count here.
            </p>
          </div>

          <!-- Transitional draws: the ones that cannot show the change yet -->
          <div v-if="transitionalDraws.length">
            <TuiHeader
              label="TRANSITIONAL DRAWS"
              :dashes="4"
            >
              <span class="hidden sm:inline text-label text-muted normal-case">inside the {{ RBC_TURNOVER_DAYS }}-day window after a change</span>
            </TuiHeader>
            <div class="mt-1.5">
              <div
                v-for="d in transitionalDraws"
                :key="d.date"
                class="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap py-2 border-b border-line-row last:border-0"
              >
                <span class="text-small text-muted tabular-nums w-23 shrink-0">{{ formatDate(d.date) }}</span>
                <span class="num-display text-title text-hi">{{ fmt(d.hematocrit!) }}<span class="text-label text-muted"> %</span></span>
                <span class="text-small text-dim">{{ d.daysAfter }} d after {{ d.change }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <p class="px-4 sm:px-6 py-3 text-meta text-ghost border-t border-line">
        {{ GENERAL_DISCLAIMER }}
      </p>
    </template>

    <!-- Add / Edit modal -->
    <UModal
      v-model:open="formModalOpen"
      :title="form.id ? 'Edit Phlebotomy' : 'Log Phlebotomy'"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Date"
              required
            >
              <UInput
                v-model="form.date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Kind"
              required
            >
              <USelect
                v-model="form.kind"
                :items="PHLEBOTOMY_KINDS"
                class="w-full"
              />
              <template
                v-if="formDeferral"
                #help
              >
                <span class="text-warn">Isotretinoin: no donation until {{ formatDate(formDeferral.until) }}</span>
              </template>
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Volume"
              help="A whole-blood donation is about 500 mL; blank assumes that"
            >
              <UInput
                v-model.number="form.ml"
                type="number"
                inputmode="numeric"
                min="50"
                max="1500"
                placeholder="500"
                class="w-full"
              >
                <template #trailing>
                  <span class="text-meta text-muted">mL</span>
                </template>
              </UInput>
            </UFormField>
            <UFormField
              label="Pre-donation Hgb"
              help="The finger-stick the clinic took, if they said"
            >
              <UInput
                v-model.number="form.pre_hgb"
                type="number"
                inputmode="decimal"
                step="0.1"
                min="5"
                max="25"
                placeholder="16.4"
                class="w-full"
              >
                <template #trailing>
                  <span class="text-meta text-muted">g/dL</span>
                </template>
              </UInput>
            </UFormField>
          </div>
          <UFormField
            label="Notes"
            help="Included in AI context — where, how it went, deferral given"
          >
            <UTextarea
              v-model="form.notes"
              :rows="2"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="tui-btn"
              @click="formModalOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="saving"
              :disabled="!form.date || !form.kind"
              @click="savePhlebotomy"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { DONATION_DEFERRAL_DAYS, donationDeferral } from '#shared/utils/accutane'
import type { PlacedAnnotation } from '#shared/utils/chartAnnotations'
import { placeAnnotations, ruleAnnotations } from '#shared/utils/chartAnnotations'
import { cycleRules } from '#shared/utils/cycles'
import { shiftDays } from '#shared/utils/dates'
import type { Phlebotomy, PhlebotomyKind, IronSpan } from '#shared/utils/hematocrit'
import {
  DEFAULT_DONATION_ML, HCT_LADDER, IRON_MG_PER_ML_BLOOD, ORAL_IRON_ABSORBED, PHLEBOTOMY_KINDS, RBC_DRIVERS, RBC_TURNOVER_DAYS,
  hctDraws, hctHeadline, ironLedger, ironMgOf, phlebotomyEffects, rungAction, transitionalFor, transitionalWindows
} from '#shared/utils/hematocrit'
import { fmtMarkerValue } from '#shared/utils/markerValue'
import { GENERAL_DISCLAIMER } from '~/data/compoundInfo'
import { HEMATOCRIT_DOSSIER } from '~/data/hematocritInfo'
import { effectiveRules } from '~/utils/adherence'
import { CHART_ACCENT, CHART_INDIGO } from '~/utils/chartTheme'

useSeoMeta({ title: 'Labs · Hematocrit' })

// The hematocrit campaign (audit #43 item 59): the action ladder, the ~120-day red-cell turnover
// window after each dose change (a draw inside it is "transitional"), the phlebotomies and what
// each bought, and the iron they cost against the protocol's standing iron and loading rounds.
// Reads the same stores the labs page does; its own table is the phlebotomy log.

const IRON_WINDOW_DAYS = 180
// The ledger's caveat: in the header on a desk, under it on a phone (the header note has no room).
const ironNote = `last ${IRON_WINDOW_DAYS} days · estimates: ${IRON_MG_PER_ML_BLOOD} mg per mL out, ${Math.round(ORAL_IRON_ABSORBED * 100)} % of oral iron absorbed`

const { canEdit } = await useAuth()
const today = useToday()
const [{ data: labsData, error, refresh }, { data: phlebData, error: phlebError, refresh: refreshPhlebs }, { rules: protocolRules, standing }, { data: cyclesData }] = await Promise.all([
  useLabsEntries(),
  usePhlebotomies(),
  useProtocol(),
  useCycles()
])

const draws = computed(() => hctDraws(labsData.value ?? []))
const phlebotomies = computed(() => phlebData.value ?? [])
const cycles = computed(() => cyclesData.value ?? [])
// The standing rules with planned cycles folded in (a Primo run's start opens a window too).
const rules = computed(() => effectiveRules(cycles.value, protocolRules.value))
const windows = computed(() => transitionalWindows(rules.value))
const headline = computed(() => hctHeadline(draws.value, windows.value, today.value))
const effects = computed(() => phlebotomyEffects(phlebotomies.value, draws.value))
// An isotretinoin course rules out donation from capsule one to a month after (item 85): the
// ladder's blood-out advice turns therapeutic and the form stops defaulting to a donation.
const deferral = computed(() => donationDeferral(cycles.value, today.value))
const donationDeferred = computed(() => deferral.value?.active === true)

const fmt = fmtMarkerValue
const kindLabel = (kind: PhlebotomyKind) => PHLEBOTOMY_KINDS.find(k => k.value === kind)?.label ?? kind
function toneClass(tone: 'ok' | 'warn' | 'danger' | undefined) {
  return tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-accent'
}

const titleMeta = computed(() => {
  const h = headline.value
  if (!h.current) return ''
  const parts = [`${fmt(h.current.value)} % · ${formatDate(h.current.date, 'monthDay')}`]
  parts.push(h.rung ? `${h.rung.label} rung` : 'under the ladder')
  if (h.transitional) parts.push(`transitional until ${formatDate(h.transitional.to, 'monthDay')}`)
  return parts.join(' · ')
})

// Top rung first on screen; "here" marks the one the current reading has reached.
const ladderRows = computed(() => [...HCT_LADDER].reverse().map(r => ({
  ...r,
  reached: headline.value.current != null && headline.value.current.value >= r.at,
  here: headline.value.rung?.at === r.at
})))
const ladderLine = HCT_LADDER.map(r => `${r.at} ${r.label}`).join(' · ')

// The compounds on the protocol that move red-cell mass — the dossier names them, the chart
// draws their dose lines.
const driverLine = computed(() => [...new Set(rules.value.filter(r => RBC_DRIVERS.test(r.compound)).map(r => r.compound))].join(' · '))

// --- chart ---
const phlebotomyDates = computed(() => phlebotomies.value.map(p => p.date))
// The draws, plus an empty row on each visit day without one (item 86): the chart draws a guide
// only on a date its rows carry, so a donation between draws had no line. connect-nulls bridges
// the empty rows.
const chartRows = computed(() => {
  const rows: Array<{ date: string, hematocrit: number | null, hemoglobin: number | null }> = draws.value.map(d => ({ date: d.date, hematocrit: d.hematocrit, hemoglobin: d.hemoglobin }))
  const drawn = new Set(rows.map(r => r.date))
  for (const date of new Set(phlebotomyDates.value)) {
    if (!drawn.has(date)) rows.push({ date, hematocrit: null, hemoglobin: null })
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date))
})
const chartCategories = {
  hematocrit: { name: 'Hct %', color: CHART_ACCENT },
  hemoglobin: { name: 'Hgb g/dL', color: CHART_INDIGO }
}
// Dose lines for the erythropoietic compounds and each turnover window as a band, placed on
// the dates the chart actually has (placeAnnotations snaps and clips).
const placedAnnotations = computed<PlacedAnnotation[]>(() => placeAnnotations([
  ...ruleAnnotations(rules.value.filter(r => RBC_DRIVERS.test(r.compound))),
  ...windows.value.map(w => ({ kind: 'event' as const, from: w.from, to: w.to, text: `turnover window · ${w.change}` }))
], chartRows.value.map(r => r.date)))

// --- transitional draws ---
const transitionalDraws = computed(() =>
  draws.value.flatMap((d) => {
    if (d.hematocrit == null) return []
    const w = transitionalFor(d.date, windows.value)
    if (!w) return []
    const daysAfter = Math.round((Date.parse(d.date) - Date.parse(w.from)) / 86_400_000)
    return [{ date: d.date, hematocrit: d.hematocrit, change: w.change, daysAfter }]
  }).reverse()
)

// --- iron ---
// The standing iron item on the protocol and every iron cycle's rows (a Vorck round) as spans.
const ironSpans = computed<IronSpan[]>(() => {
  const spans: IronSpan[] = []
  for (const s of standing.value) {
    const mg = /iron/i.test(s.compound) ? ironMgOf(s.label) : null
    if (mg != null) spans.push({ label: `${s.compound} ${s.label} (standing)`, from: s.from, to: s.to, mgPerDay: mg })
  }
  for (const c of cycles.value) {
    for (const r of cycleRules(c)) {
      const mg = /iron/i.test(r.compound) ? ironMgOf(r.doseLabel) : null
      if (mg != null) spans.push({ label: `${c.name} (${r.doseLabel})`, from: r.from, to: r.to ?? null, mgPerDay: mg * r.weekdays.length / 7 })
    }
  }
  return spans
})
const ledger = computed(() => ironLedger(phlebotomies.value, ironSpans.value, shiftDays(today.value, -(IRON_WINDOW_DAYS - 1)), today.value))
const latestFerritin = computed(() => [...draws.value].reverse().find(d => d.ferritin != null) ?? null)
// Without the log (a failed fetch) the blood-out side is unknown, not zero (item 87).
const ironStats = computed(() => [
  phlebError.value
    ? { label: 'Iron out', value: '—', unit: 'mg', class: 'text-muted', note: 'log not loaded' }
    : { label: 'Iron out', value: String(ledger.value.lostMg), unit: 'mg', class: ledger.value.lostMg ? 'text-warn' : 'text-muted', note: `${ledger.value.phlebotomies} phlebotom${ledger.value.phlebotomies === 1 ? 'y' : 'ies'}` },
  { label: 'Oral iron taken', value: String(ledger.value.takenMg), unit: 'mg', class: 'text-hi', note: 'elemental, as the protocol lists it' },
  { label: 'Absorbed ≈', value: String(ledger.value.absorbedMg), unit: 'mg', class: 'text-hi', note: `at ${Math.round(ORAL_IRON_ABSORBED * 100)} % — the usual repleted-adult fraction` },
  // Ferritin itself sits in the stat row; the ledger's last tile is the balance it should explain.
  phlebError.value
    ? { label: 'Net ≈', value: '—', unit: 'mg', class: 'text-muted', note: 'needs the phlebotomy log' }
    : { label: 'Net ≈', value: `${ledger.value.netMg > 0 ? '+' : ''}${ledger.value.netMg}`, unit: 'mg', class: ledger.value.netMg < 0 ? 'text-warn' : 'text-accent', note: 'absorbed − out, in the window' }
])

// --- stat cells ---
// The compound page's row: the reading, the rung it sits on, the iron store, the visits.
const statCells = computed(() => {
  const h = headline.value
  const ferritin = latestFerritin.value
  const lastVisit = [...phlebotomies.value].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  return [
    {
      label: 'Current',
      value: h.current ? fmt(h.current.value) : '—',
      unit: '%',
      class: h.current ? toneClass(h.rung?.tone) : 'text-muted',
      note: h.current ? `${formatDate(h.current.date, 'monthDay')}${h.currentIsTransitional ? ' · transitional' : ''}` : 'no reading'
    },
    {
      label: 'Rung',
      value: h.rung ? h.rung.label.toUpperCase() : h.current ? 'CLEAR' : '—',
      unit: '',
      class: h.rung ? toneClass(h.rung.tone) : 'text-accent',
      note: h.next ? `${h.next.gap} to ${h.next.rung.at} ${h.next.rung.label}` : h.current ? 'top of the ladder' : ''
    },
    {
      label: 'Ferritin',
      value: ferritin ? fmt(ferritin.ferritin!) : '—',
      unit: 'ng/mL',
      class: ferritin && ferritin.ferritin! < 30 ? 'text-warn' : 'text-hi',
      note: ferritin ? formatDate(ferritin.date, 'monthDay') : 'no reading'
    },
    {
      label: 'Phlebotomies',
      value: phlebError.value ? '—' : String(phlebotomies.value.length),
      unit: '',
      class: phlebError.value ? 'text-muted' : 'text-hi',
      note: phlebError.value ? 'log not loaded' : lastVisit ? `last ${formatDate(lastVisit.date, 'monthDay')}` : 'none logged'
    }
  ]
})

// --- the log's form ---
interface PhlebotomyForm {
  id?: number
  date: string
  kind: PhlebotomyKind
  ml: number | ''
  pre_hgb: number | ''
  notes: string
}

function emptyForm(): PhlebotomyForm {
  return { id: undefined, date: today.value, kind: donationDeferred.value ? 'therapeutic' : 'donation', ml: '', pre_hgb: '', notes: '' }
}

const formModalRaw = ref(false)
const form = reactive<PhlebotomyForm>(emptyForm())
// A donation dated inside a deferral is still saved (the log is what happened), but the form says so.
const formDeferral = computed(() => {
  if (form.kind !== 'donation' || !form.date) return null
  const d = donationDeferral(cycles.value, form.date)
  return d?.active ? d : null
})
const formGuard = useDirtyGuard(() => form)
const formModalOpen = formGuard.guardOpen(formModalRaw)

function openAddModal() {
  Object.assign(form, emptyForm())
  formGuard.markClean()
  formModalOpen.value = true
}

function openEditModal(p: Phlebotomy) {
  Object.assign(form, emptyForm(), { id: p.id, date: p.date, kind: p.kind, ml: p.ml ?? '', pre_hgb: p.pre_hgb ?? '', notes: p.notes ?? '' })
  formGuard.markClean()
  formModalOpen.value = true
}

const { run: savePhlebotomy, pending: saving } = useSaveAction(async () => {
  await $fetch('/api/labs/phlebotomies/save', { method: 'POST', body: { ...form, notes: form.notes || null } })
  await refreshPhlebs()
  formGuard.markClean()
  formModalOpen.value = false
}, { success: () => (form.id ? 'Phlebotomy updated' : 'Phlebotomy logged') })

// The confirm sits outside the save action, inventory's pattern: inside it, Cancel returned
// normally and toasted "deleted" (item 87).
async function confirmDelete(p: Phlebotomy) {
  if (!confirm(`Delete the ${kindLabel(p.kind).toLowerCase()} on ${p.date}?`)) return
  await deletePhlebotomy(p)
}

const { run: deletePhlebotomy } = useSaveAction(async (p: Phlebotomy) => {
  await $fetch('/api/labs/phlebotomies/delete', { method: 'POST', body: { id: p.id } })
  await refreshPhlebs()
}, { success: () => 'Phlebotomy deleted' })
</script>
