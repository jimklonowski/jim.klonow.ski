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

    <div
      v-if="draws.length"
      class="px-4 sm:px-6 pb-6 space-y-5"
    >
      <!-- The ladder: where the reading sits and what the next rung asks -->
      <section>
        <TuiHeader
          label="LADDER"
          :dashes="14"
        >
          <span class="text-label text-muted normal-case">50 watch · 52 act · 54 stop</span>
        </TuiHeader>
        <div class="mt-2 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-start">
          <div>
            <p class="text-micro text-muted uppercase tracking-widest">
              Current
            </p>
            <p class="num-display text-big leading-none mt-1">
              <span :class="toneClass(headline.rung?.tone)">{{ headline.current ? fmt(headline.current.value) : '—' }}</span>
              <span class="text-label text-muted"> %</span>
            </p>
            <p
              v-if="headline.current"
              class="text-label text-muted mt-1"
            >
              {{ formatDate(headline.current.date, 'monthDay') }}
              <span v-if="headline.currentIsTransitional"> · transitional</span>
            </p>
          </div>
          <div class="space-y-1">
            <div
              v-for="rung in ladderRows"
              :key="rung.at"
              class="flex items-baseline gap-2.5 py-1 border-b border-line-row last:border-0"
              :class="rung.reached ? '' : 'opacity-60'"
            >
              <span
                class="num-display text-title w-10 shrink-0"
                :class="rung.reached ? toneClass(rung.tone) : 'text-muted'"
              >{{ rung.at }}</span>
              <span
                class="text-meta uppercase tracking-[0.08em] w-12 shrink-0"
                :class="rung.reached ? toneClass(rung.tone) : 'text-faint'"
              >{{ rung.label }}</span>
              <span class="text-small text-dim">{{ rung.action }}</span>
              <span
                v-if="rung.here"
                class="ml-auto shrink-0 text-meta text-accent"
              >◀ here{{ headline.next ? ` · ${headline.next.gap} to ${headline.next.rung.at}` : '' }}</span>
            </div>
          </div>
        </div>
        <p
          v-if="headline.transitional"
          class="mt-3 text-small text-dim leading-[1.7] border-l-2 border-warn pl-2.5"
        >
          <span class="text-warn">Transitional:</span> {{ headline.transitional.change }} was {{ headline.daysIn }} days ago. Red cells turn over on a ~{{ RBC_TURNOVER_DAYS }}-day cycle, so the full effect of that change isn't expected before {{ formatDate(headline.transitional.to, 'monthDay') }} — a flat reading until then is the expected reading, not the change failing.
        </p>
      </section>

      <!-- The chart: Hct and Hgb, dose changes as lines, turnover windows as bands, phlebotomies as verticals -->
      <section>
        <TuiHeader
          label="HCT · HGB"
          :dashes="12"
        >
          <span class="text-label text-muted normal-case">
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
          class="mt-2"
          :aria-label="`Hematocrit and hemoglobin across ${draws.length} draws, with dose changes and phlebotomies marked`"
        />
      </section>

      <!-- Phlebotomies -->
      <section>
        <TuiHeader
          label="PHLEBOTOMIES"
          :dashes="8"
        >
          <span class="text-label text-muted normal-case">blood out · the draw before against the first after</span>
        </TuiHeader>
        <p
          v-if="!effects.length"
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
      </section>

      <!-- Iron: the campaign's cost against what the protocol puts back -->
      <section>
        <TuiHeader
          label="IRON"
          :dashes="15"
        >
          <span class="text-label text-muted normal-case">last {{ IRON_WINDOW_DAYS }} days · estimates: {{ IRON_MG_PER_ML_BLOOD }} mg per mL out, {{ Math.round(ORAL_IRON_ABSORBED * 100) }} % of oral iron absorbed</span>
        </TuiHeader>
        <div class="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div
            v-for="stat in ironStats"
            :key="stat.label"
            class="bg-raised border border-line-soft px-3.5 py-3"
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
          class="mt-2 text-small text-muted"
        >
          Oral iron in the window: {{ ledger.sources.map(s => `${s.label} — ${s.mg} mg over ${s.days} d`).join(' · ') }}
        </p>
        <p
          v-else
          class="mt-2 text-small text-muted"
        >
          No oral iron on the protocol in the window — a standing iron item or an iron cycle would count here.
        </p>
      </section>

      <!-- Transitional draws: the ones that cannot show the change yet -->
      <section v-if="transitionalDraws.length">
        <TuiHeader
          label="TRANSITIONAL DRAWS"
          :dashes="4"
        >
          <span class="text-label text-muted normal-case">inside the {{ RBC_TURNOVER_DAYS }}-day window after a change</span>
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
      </section>
    </div>

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
import type { PlacedAnnotation } from '#shared/utils/chartAnnotations'
import { placeAnnotations, ruleAnnotations } from '#shared/utils/chartAnnotations'
import { cycleRules } from '#shared/utils/cycles'
import { shiftDays } from '#shared/utils/dates'
import type { Phlebotomy, PhlebotomyKind, IronSpan } from '#shared/utils/hematocrit'
import {
  DEFAULT_DONATION_ML, HCT_LADDER, IRON_MG_PER_ML_BLOOD, ORAL_IRON_ABSORBED, PHLEBOTOMY_KINDS, RBC_DRIVERS, RBC_TURNOVER_DAYS,
  hctDraws, hctHeadline, ironLedger, ironMgOf, phlebotomyEffects, transitionalFor, transitionalWindows
} from '#shared/utils/hematocrit'
import { fmtMarkerValue } from '#shared/utils/markerValue'
import { effectiveRules } from '~/utils/adherence'
import { CHART_ACCENT, CHART_INDIGO } from '~/utils/chartTheme'

useSeoMeta({ title: 'Labs · Hematocrit' })

// The hematocrit campaign (audit #43 item 59): the action ladder, the ~120-day red-cell turnover
// window after each dose change (a draw inside it is "transitional"), the phlebotomies and what
// each bought, and the iron they cost against the protocol's standing iron and loading rounds.
// Reads the same stores the labs page does; its own table is the phlebotomy log.

const IRON_WINDOW_DAYS = 180

const { canEdit } = await useAuth()
const today = useToday()
const [{ data: labsData, error, refresh }, { data: phlebData, refresh: refreshPhlebs }, { rules: protocolRules, standing }, { data: cyclesData }] = await Promise.all([
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

// --- chart ---
const chartRows = computed(() => draws.value.map(d => ({ date: d.date, hematocrit: d.hematocrit, hemoglobin: d.hemoglobin })))
const chartCategories = {
  hematocrit: { name: 'Hct %', color: CHART_ACCENT },
  hemoglobin: { name: 'Hgb g/dL', color: CHART_INDIGO }
}
const phlebotomyDates = computed(() => phlebotomies.value.map(p => p.date))
// Dose lines for the erythropoietic compounds and each turnover window as a band, placed on
// the draw dates the chart actually has (placeAnnotations snaps and clips).
const placedAnnotations = computed<PlacedAnnotation[]>(() => placeAnnotations([
  ...ruleAnnotations(rules.value.filter(r => RBC_DRIVERS.test(r.compound))),
  ...windows.value.map(w => ({ kind: 'event' as const, from: w.from, to: w.to, text: `turnover window · ${w.change}` }))
], draws.value.map(d => d.date)))

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
const ironStats = computed(() => [
  { label: 'Iron out', value: String(ledger.value.lostMg), unit: 'mg', class: ledger.value.lostMg ? 'text-warn' : 'text-muted', note: `${ledger.value.phlebotomies} phlebotom${ledger.value.phlebotomies === 1 ? 'y' : 'ies'}` },
  { label: 'Oral iron taken', value: String(ledger.value.takenMg), unit: 'mg', class: 'text-hi', note: 'elemental, as the protocol lists it' },
  { label: 'Absorbed ≈', value: String(ledger.value.absorbedMg), unit: 'mg', class: 'text-hi', note: `at ${Math.round(ORAL_IRON_ABSORBED * 100)} % — the usual repleted-adult fraction` },
  { label: 'Ferritin', value: latestFerritin.value ? fmt(latestFerritin.value.ferritin!) : '—', unit: 'ng/mL', class: latestFerritin.value && latestFerritin.value.ferritin! < 30 ? 'text-warn' : 'text-accent', note: latestFerritin.value ? `${formatDate(latestFerritin.value.date, 'monthDay')} · net ≈ ${ledger.value.netMg > 0 ? '+' : ''}${ledger.value.netMg} mg in the window` : 'no reading' }
])

// --- the log's form ---
const SELECT_DEFAULT: PhlebotomyKind = 'donation'

interface PhlebotomyForm {
  id?: number
  date: string
  kind: PhlebotomyKind
  ml: number | ''
  pre_hgb: number | ''
  notes: string
}

function emptyForm(): PhlebotomyForm {
  return { id: undefined, date: today.value, kind: SELECT_DEFAULT, ml: '', pre_hgb: '', notes: '' }
}

const formModalRaw = ref(false)
const form = reactive<PhlebotomyForm>(emptyForm())
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

const { run: confirmDelete } = useSaveAction(async (p: Phlebotomy) => {
  if (!confirm(`Delete the ${kindLabel(p.kind).toLowerCase()} on ${p.date}?`)) return
  await $fetch('/api/labs/phlebotomies/delete', { method: 'POST', body: { id: p.id } })
  await refreshPhlebs()
}, { success: () => 'Phlebotomy deleted' })
</script>
