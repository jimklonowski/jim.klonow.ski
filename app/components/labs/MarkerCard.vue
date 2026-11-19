<template>
  <button
    type="button"
    class="w-full text-left bg-raised px-3.5 py-3 border border-line-soft border-t-2 hover:bg-row-hover transition-colors cursor-pointer"
    :style="{ borderTopColor: statusColor }"
    :data-marker-card="biomarkerKey"
    @click="open = true"
  >
    <div class="flex items-start justify-between gap-2">
      <span class="text-row text-hi leading-tight flex items-center gap-1 min-w-0">
        <UIcon
          v-if="meta.computed"
          name="i-lucide-calculator"
          class="w-3 h-3 shrink-0 text-faint"
          title="Computed from other markers"
        />
        <span class="truncate">{{ title }}{{ caveatCompound ? '*' : '' }}{{ readingNote ? '†' : '' }}</span>
        <span
          v-if="caveatCompound"
          class="shrink-0 text-nano leading-none px-1 py-0.5 border border-warn text-warn uppercase tracking-[0.08em]"
          :title="`Taken while on ${caveatCompound} — see the note inside`"
        >on {{ caveatCompound }}</span>
        <!-- Which assay the face is reading, once the history holds both (the estradiol pair). -->
        <span
          v-if="assayChip"
          class="shrink-0 text-nano leading-none px-1 py-0.5 border border-line-soft text-dim uppercase tracking-[0.08em]"
          :title="assayChip.title"
          data-assay-chip
        >{{ assayChip.short }}</span>
        <span
          v-for="t in currentTags"
          :key="t.kind"
          class="shrink-0 text-nano leading-none px-1 py-0.5 border border-line-soft text-dim uppercase tracking-[0.08em]"
          :title="t.text"
        >{{ t.short }}</span>
      </span>
      <span
        class="text-meta shrink-0"
        :style="{ color: statusColor }"
      >{{ label }}</span>
    </div>

    <div class="flex items-baseline gap-1.5 mt-2">
      <span
        class="num-display text-tile leading-none"
        :class="carried ? 'text-dim' : ''"
      ><TuiRollingNumber :value="displayValue" /></span>
      <span
        v-if="meta.unit"
        class="text-label text-muted"
      >{{ meta.unit }}</span>
    </div>

    <TuiRangeBar
      v-if="hasRange"
      :value="current"
      :meta="meta"
      :height="5"
      :ghost="ghost"
      class="mt-3"
    />

    <div class="flex items-baseline justify-between gap-2 mt-2 text-label">
      <span class="text-muted truncate">{{ rangeCaption }}</span>
      <span
        v-if="carried && carriedFrom"
        class="shrink-0 text-faint"
      >as of {{ formatDate(carriedFrom, 'monthDay') }}</span>
      <span
        v-else-if="boundNote"
        class="shrink-0 text-faint"
        title="A bound, not a measurement: the report printed it with < or >, so no change is computed from it"
        data-bound-note
      >{{ boundNote }}</span>
      <span
        v-else-if="deltaText"
        class="shrink-0"
        :class="deltaClass"
      >{{ deltaText }}</span>
    </div>
  </button>

  <UModal
    v-model:open="open"
    :title="title"
  >
    <template #body>
      <div
        class="space-y-5"
        :data-marker-detail="biomarkerKey"
      >
        <p
          v-if="description"
          class="text-row leading-[1.7] text-dim"
        >
          {{ description }}
        </p>

        <!-- The one marker with a campaign of its own: the ladder, the turnover windows after a
             dose change, phlebotomies and their iron cost live on /labs/hematocrit (item 59). -->
        <NuxtLink
          v-if="biomarkerKey === 'hematocrit'"
          to="/labs/hematocrit"
          class="tui-btn tui-btn-accent inline-flex"
        >
          CONTROL PANEL →
        </NuxtLink>

        <p
          v-if="showCaveat"
          class="text-small leading-[1.7] text-warn border-l-2 border-warn pl-2.5"
        >
          * {{ caveat!.note }}
        </p>

        <p
          v-for="n in readingNotes"
          :key="`${n.key}-${n.date}`"
          class="text-small leading-[1.7] text-warn border-l-2 border-warn pl-2.5"
        >
          † {{ n.dateLabel }} — {{ n.note }}
        </p>

        <p
          v-if="meta.computed"
          class="text-meta text-faint"
        >
          ⚙ computed from other markers
        </p>

        <!-- One reference line per assay on the paired card, swatched in its line's colour. -->
        <div
          v-if="series.length > 1"
          class="space-y-1.5 text-small"
          data-assay-ranges
        >
          <div
            v-for="s in series"
            :key="s.key"
            class="flex items-center gap-2"
          >
            <span
              class="inline-block w-3 h-0.5 shrink-0"
              :style="{ background: s.color }"
            />
            <span class="text-muted">{{ s.name }} · reference</span>
            <span class="text-hi">{{ s.refText || '—' }} {{ s.meta.unit }}</span>
          </div>
        </div>
        <div
          v-else
          class="space-y-1.5 text-small"
        >
          <div
            v-if="hasRange"
            class="flex items-center gap-2"
          >
            <span class="inline-block w-3 h-1.5 shrink-0 bg-band-outer" />
            <span class="text-muted">reference</span>
            <span class="text-hi">{{ refText }} {{ meta.unit }}</span>
          </div>
          <div
            v-if="meta.optimalMin !== undefined || meta.optimalMax !== undefined"
            class="flex items-center gap-2"
          >
            <span class="inline-block w-3 h-1.5 shrink-0 bg-band" />
            <span class="text-muted">optimal</span>
            <span class="text-hi">{{ optText }} {{ meta.unit }}</span>
          </div>
        </div>

        <!-- Two assays on file: one chart, one line each on a shared axis, never joined to each
             other, each with its own reference limit dashed in its colour. -->
        <TrendCard
          v-if="series.length > 1 && chartPoints.length >= 2"
          :label="title"
          :unit="meta.unit"
          :data="chartPoints"
          :categories="chartCategories"
          :y-rules="chartRules"
          :height="160"
          show-legend
          connect-nulls
          marker-key="marker"
        />
        <TrendCard
          v-else-if="chartPoints.length >= 2"
          :label="title"
          :unit="meta.unit"
          :data="chartPoints"
          :height="140"
          marker-key="marker"
        />

        <div>
          <TuiHeader label="ALL READINGS">
            <span
              v-if="series.length > 1"
              class="text-label text-muted normal-case"
            >{{ meta.unit }}</span>
          </TuiHeader>
          <div
            v-if="history.length"
            class="mt-2"
          >
            <div
              v-if="series.length > 1"
              class="flex items-center justify-end gap-3 px-2 pb-1 text-nano uppercase tracking-[0.08em] text-faint"
            >
              <span
                v-for="s in series"
                :key="s.key"
                class="w-24 text-right"
              >{{ s.name }}</span>
            </div>
            <div
              v-for="(row, i) in history"
              :key="row.date"
              class="flex items-center justify-between gap-3 px-2 py-1.5 text-small"
              :class="i % 2 ? 'bg-inset' : ''"
              :data-reading-row="row.date"
            >
              <span class="flex items-center gap-1.5 min-w-0">
                <span class="text-muted">{{ row.dateLabel }}</span>
                <span
                  v-if="row.oddLab"
                  class="shrink-0 text-nano leading-none px-1 py-0.5 border border-line-soft text-dim uppercase tracking-[0.08em]"
                  :title="`Run by ${row.oddLab}, not the usual lab — its range and assay may differ`"
                >{{ row.oddLab }}</span>
                <span
                  v-for="t in row.tags"
                  :key="t.kind"
                  class="shrink-0 text-nano leading-none px-1 py-0.5 border border-line-soft text-dim uppercase tracking-[0.08em]"
                  :title="t.text"
                >{{ t.short }}</span>
              </span>
              <span class="flex items-baseline gap-3">
                <span
                  v-for="r in row.readings"
                  :key="r.key"
                  class="flex items-baseline justify-end gap-2"
                  :class="series.length > 1 ? 'w-24' : ''"
                  :title="r.provenance || undefined"
                >
                  <template v-if="r.value != null">
                    <span class="text-hi">{{ r.value }}<span
                      v-if="r.flagged"
                      class="text-warn"
                    >*</span><span
                      v-if="r.noted"
                      class="text-warn"
                    >†</span></span>
                    <span
                      v-if="series.length === 1"
                      class="text-label text-muted"
                    >{{ meta.unit }}</span>
                    <span
                      class="text-label w-9 text-right"
                      :style="{ color: r.color }"
                    >{{ r.label }}</span>
                  </template>
                  <span
                    v-else
                    class="text-faint"
                  >—</span>
                </span>
              </span>
            </div>
          </div>
          <p
            v-else
            class="mt-2 text-small text-muted"
          >
            No readings recorded yet.
          </p>
          <p
            v-if="tagLegend"
            class="mt-2 text-meta text-faint leading-[1.6]"
          >
            {{ tagLegend }}
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { CHART_ACCENT, CHART_INDIGO, STATUS_COLORS } from '~/utils/chartTheme'
import { fmtMarkerValue } from '#shared/utils/markerValue'
import { BIOMARKERS, getStatus, statusLabel } from '~/data/biomarkers'
import type { BiomarkerMeta } from '~/data/biomarkers'
import { courseCaveatSpans } from '#shared/utils/accutane'
import { E2_IMMUNOASSAY, E2_SENSITIVE, ESTRADIOL_ASSAYS, ESTRADIOL_DESCRIPTION, ESTRADIOL_LABEL, estradiolKeyOn, isEstradiolKey } from '#shared/utils/estradiol'
import { boundKind, boundPhrase, boundValueText, caveatCompoundOn, isCensored, readingNoteOn } from '#shared/utils/labNotes'
import type { ReadingNote } from '#shared/utils/labNotes'
import { readingOn, readingProvenanceText, readingValueText, usualLab, type Readings } from '#shared/utils/labReadings'
import { PHLEBOTOMY_EFFECT_DAYS, PHLEBOTOMY_MARKERS, RBC_MASS_MARKERS, RBC_TURNOVER_DAYS, readingTags, transitionalWindows } from '#shared/utils/hematocrit'
import { effectiveRules } from '~/utils/adherence'

type Entry = { date: string, markers: Record<string, number | null>, notes?: Record<string, ReadingNote>, readings?: Readings }

const props = defineProps<{
  /** The marker — or, for estradiol, either of its two assay keys: the card then stands for both
   * (shared/utils/estradiol.ts). */
  biomarkerKey: string
  /** Draws, each with the owner's assay notes the list attached to it (LabsEntry.notes) and its
   * per-reading provenance (LabsEntry.readings, item 72). */
  entries: Entry[]
  /** Open the detail modal on mount — set when a ?marker= deep link targets this card. */
  autoOpen?: boolean
  /**
   * The newest draw's markers, when `entries` has been cut off at an older one by the time
   * scrubber. This card's reading there is drawn as a hollow ring on the range bar so you can
   * see where you've come from. Leave unset when the card is showing the present.
   */
  latestMarkers?: Record<string, number | null> | null
}>()

// Hormones the protocol is expected to suppress — annotated so a LOW reading reads as
// "as designed" rather than as an unexplained flag.
const EXPECTED_SUPPRESSED = new Set(['fsh', 'lh'])

// Opened on mount rather than initialized true so SSR never renders the modal mid-hydration.
// The watch covers a deep link retargeting an already-mounted card (palette → same tab).
const open = ref(false)
onMounted(() => {
  if (props.autoOpen) open.value = true
})
watch(() => props.autoOpen, (v) => {
  if (v) open.value = true
})

// Estradiol is one card for its two assays. Per draw the card reads the LC/MS/MS reading when
// the draw has it, else the immunoassay (estradiolKeyOn); the face is the newest such reading,
// judged against its own assay's range, and its change is against the previous reading of that
// same assay — the two are different numbers on the same blood and are never diffed. Every
// other marker reads its own key on every draw.
const paired = isEstradiolKey(props.biomarkerKey)
const keyOn = (e: Entry | undefined) => (paired ? estradiolKeyOn(e) : props.biomarkerKey)

const sorted = computed(() => [...props.entries].sort((a, b) => a.date.localeCompare(b.date)))
const withValue = computed(() => sorted.value.filter((e) => {
  const key = keyOn(e)
  return key != null && e.markers[key] != null
}))
/** The key the reading on the face was read from. */
const faceKey = computed(() => keyOn(withValue.value.at(-1)) ?? props.biomarkerKey)

const meta = computed(() => (
  BIOMARKERS[faceKey.value]
  ?? { label: props.biomarkerKey, unit: '', category: 'metabolic' as const }
) as BiomarkerMeta)
const title = computed(() => (paired ? ESTRADIOL_LABEL : meta.value.label))
const description = computed(() => (paired ? ESTRADIOL_DESCRIPTION : meta.value.description))

const current = computed(() => withValue.value.at(-1)?.markers[faceKey.value] ?? null)
// A change runs between two measurements: a censored reading (the Sep 9 immunoassay ceiling) is
// neither end — on the face of the card there is no delta, and the draw after it compares with
// the last real measurement before it (audit #43 item 15).
const prev = computed(() => {
  const last = withValue.value.at(-1)
  const key = faceKey.value
  if (!last || isCensored(last, key)) return null
  return sorted.value.findLast(e => e.date < last.date && e.markers[key] != null && !isCensored(e, key))?.markers[key] ?? null
})

// The newest entry passed in is the draw being viewed. A marker that wasn't on that panel still
// shows its most recent reading, but as carried forward — dimmed, dated, and without a delta
// that would otherwise compare two draws neither of which is the one on screen.
const carriedFrom = computed(() => withValue.value.at(-1)?.date ?? null)
const carried = computed(() => current.value != null && carriedFrom.value !== sorted.value.at(-1)?.date)

const hasRange = computed(() => meta.value.refMin !== undefined || meta.value.refMax !== undefined)
/** Where the newest draw's reading sits, while scrubbed back: the same key's, so the same assay's. */
const ghost = computed(() => props.latestMarkers?.[faceKey.value] ?? null)

// Medication caveat (PSA on finasteride): decided per reading off the protocol dates, so the
// badge follows the reading actually on screen and pre-treatment history stays unstarred. The
// schedule comes from useProtocol: the scored rules AND the standing meds, since a 5-ARI taken
// daily without being logged (finasteride since Oct 2026) skews PSA just the same. The caveats
// themselves come from /api/labs/notes (useLabNotes): none before it answers, none in the demo.
const { rules: protocolRules, standing: protocolStanding } = useProtocol()
const { data: labNotes } = useLabNotes()
// The isotretinoin course stars its draws from the cycle row and the dose log too (item 97), not
// only from the protocol row's dates.
const { data: cyclesData } = useCycles()
const { data: journalData } = useJournalEntries()
const caveatSpans = computed(() => [...protocolRules.value, ...protocolStanding.value, ...courseCaveatSpans(cyclesData.value ?? [], journalData.value ?? [])])
const caveats = computed(() => labNotes.value?.caveats ?? {})
const caveat = computed(() => caveats.value[faceKey.value])
const caveatCompound = computed(() =>
  carriedFrom.value ? caveatCompoundOn(caveats.value, faceKey.value, carriedFrom.value, caveatSpans.value) : null
)

// Reading tags (item 101): a red-cell marker inside the turnover window after a dose change, or
// any CBC/ferritin reading within weeks of a phlebotomy, says so on the card and in every history
// row — the control panel's two caveats, carried to where the number is read. The windows come
// from the schedule with planned cycles folded in, as /labs/hematocrit builds them; the visits
// from the phlebotomy log (every role may read it). Both lists stay empty for other markers.
const tagged = PHLEBOTOMY_MARKERS.has(props.biomarkerKey) || RBC_MASS_MARKERS.has(props.biomarkerKey)
const { data: phlebData } = usePhlebotomies()
const windows = computed(() => (tagged ? transitionalWindows(effectiveRules(cyclesData.value ?? [], protocolRules.value)) : []))
const tagsOn = (date: string) => (tagged ? readingTags(props.biomarkerKey, date, windows.value, phlebData.value ?? []) : [])
const currentTags = computed(() => (carriedFrom.value ? tagsOn(carriedFrom.value) : []))

// A reading's own note (the censored 2026-09-09 immunoassay testosterone): it belongs to one draw
// rather than to a medication. On the paired card a note that only says which assay a reading is
// has nothing left to add — the card names the assay itself — so only a bound is daggered there.
const noteOn = (e: Entry | undefined, key: string) => {
  const n = readingNoteOn(e, key)
  return n && paired && !n.censored ? null : n
}
const readingNote = computed(() => noteOn(withValue.value.at(-1), faceKey.value))

// The face prints the reading as the report did: "<0.3" for a floor, ">1500" for a ceiling. It
// used to print the bare figure, so a bound read as a measurement everywhere but the history row
// (audit #44 item 23). A bound has no change to show, so the corner says which bound it is.
const faceBound = computed(() => boundKind(withValue.value.at(-1), faceKey.value))
const displayValue = computed(() => {
  const v = current.value
  return v == null ? '—' : boundValueText(fmtMarkerValue(v), withValue.value.at(-1), faceKey.value)
})
const boundNote = computed(() => (faceBound.value ? `${boundPhrase(faceBound.value)}` : null))

const status = computed(() => getStatus(current.value, meta.value))
const statusColor = computed(() => STATUS_COLORS[status.value])
// OPT only inside the optimal band; in range otherwise is IN (statusLabel in biomarkers.ts).
const label = computed(() => statusLabel(current.value, meta.value))

// One rule for every printed reading, shared with the home watch tile (shared/utils/markerValue.ts).
const num = fmtMarkerValue

function bounds(min?: number, max?: number) {
  if (min !== undefined && max !== undefined) return `${num(min)}-${num(max)}`
  if (min !== undefined) return `>${num(min)}`
  if (max !== undefined) return `<${num(max)}`
  return ''
}

const refText = computed(() => bounds(meta.value.refMin, meta.value.refMax))
const optText = computed(() => bounds(meta.value.optimalMin, meta.value.optimalMax))

/** e.g. "ref 250-1100 · opt 600-1000 · suppressed" */
const rangeCaption = computed(() => {
  const parts: string[] = []
  if (refText.value) parts.push(`ref ${refText.value}`)
  if (optText.value) parts.push(`opt ${optText.value}`)
  if (status.value === 'low' && EXPECTED_SUPPRESSED.has(props.biomarkerKey)) parts.push('suppressed')
  return parts.join(' · ')
})

const delta = computed(() =>
  current.value != null && prev.value != null ? current.value - prev.value : null
)

const deltaText = computed(() => {
  const d = delta.value
  if (d == null || Math.abs(d) < 0.05) return null
  const magnitude = Math.abs(d) >= 10 ? Math.round(Math.abs(d)).toString() : Math.abs(d).toFixed(1)
  return `${d > 0 ? '▲ +' : '▼ -'}${magnitude}`
})

// Direction is only meaningful when the marker declares a "better" direction (BIOMARKERS
// `higherIsBetter`); otherwise the delta is reported in the neutral colour — a rise in
// estradiol or LDL is not good news just because it points up (audit #42 item 26: the code
// coloured up accent / down warn for every undeclared marker, against this very comment).
const deltaClass = computed(() => {
  const d = delta.value
  const better = meta.value.higherIsBetter
  if (d == null || better === undefined) return 'text-muted'
  return (better ? d > 0 : d < 0) ? 'text-accent' : 'text-danger'
})

// The series the detail draws and lists: the marker's own, or — on the paired card — one per
// assay that has a reading among the draws shown, the LC/MS/MS first in the accent.
const PAIR_COLORS: Record<string, string> = { [E2_SENSITIVE]: CHART_ACCENT, [E2_IMMUNOASSAY]: CHART_INDIGO }
const series = computed(() => {
  const keys = paired
    ? [E2_SENSITIVE, E2_IMMUNOASSAY].filter(k => sorted.value.some(e => e.markers[k] != null))
    : [props.biomarkerKey]
  return keys.map((key) => {
    const m = (BIOMARKERS[key] ?? meta.value) as BiomarkerMeta
    return { key, meta: m, name: paired ? ESTRADIOL_ASSAYS[key]!.short : m.label, color: PAIR_COLORS[key] ?? CHART_ACCENT, refText: bounds(m.refMin, m.refMax) }
  })
})

/** "LC/MS/MS" on the face once the history holds both assays; nothing for any other card. */
const assayChip = computed(() => {
  if (series.value.length < 2 || current.value == null) return null
  const a = ESTRADIOL_ASSAYS[faceKey.value]!
  return { short: a.short, title: `Read by the ${a.name} — each assay is compared only with its own readings` }
})

// A reading with its own note (a censored value), or one the report printed as a bound, gets an
// upward triangle instead of the usual dot, so the segment into it cannot be misread as a
// measured move.
const marked = (e: Entry, key: string) => noteOn(e, key) != null || isCensored(e, key)

const chartPoints = computed(() => {
  // ISO day: AreaChart formats the axis (’yy once the draws span years).
  if (series.value.length < 2) {
    return withValue.value.map((e) => {
      const key = keyOn(e)!
      return { date: e.date, value: e.markers[key] as number, marker: marked(e, key) ? 'triangle' : '' }
    })
  }
  // One row per draw that read either assay; a draw without one of them leaves that line's
  // field empty and the line runs on to its own next reading.
  return sorted.value
    .filter(e => series.value.some(s => e.markers[s.key] != null))
    .map(e => ({
      date: e.date,
      ...Object.fromEntries(series.value.map(s => [s.key, e.markers[s.key] ?? null])),
      marker: series.value.some(s => e.markers[s.key] != null && marked(e, s.key)) ? 'triangle' : ''
    }))
})
const chartCategories = computed(() => Object.fromEntries(series.value.map(s => [s.key, { name: s.name, color: s.color }])))
/** Each assay's upper reference limit, dashed in its line's colour. */
const chartRules = computed(() => series.value.flatMap(s => (s.meta.refMax != null ? [{ at: s.meta.refMax, color: s.color }] : [])))

// The lab most of this marker's readings came from (item 72): a reading from another lab wears
// its name, since its range and assay may differ.
const usual = computed(() => usualLab(withValue.value, faceKey.value))

/** One reading of one series on one draw, as a history cell. */
function readingCell(e: Entry, s: { key: string, meta: BiomarkerMeta }) {
  const value = e.markers[s.key]
  if (value == null) return { key: s.key, value: null, color: '', label: '', flagged: false, noted: false, provenance: '' }
  const prov = readingOn(e, s.key)
  return {
    key: s.key,
    // "<10" / ">1500" when the report printed a bound.
    value: readingValueText(num(value), prov),
    color: STATUS_COLORS[getStatus(value, s.meta)],
    label: statusLabel(value, s.meta),
    flagged: caveatCompoundOn(caveats.value, s.key, e.date, caveatSpans.value) != null,
    noted: marked(e, s.key),
    provenance: readingProvenanceText(prov)
  }
}

const history = computed(() =>
  sorted.value
    .filter(e => series.value.some(s => e.markers[s.key] != null))
    .reverse()
    .map((e) => {
      // The paired card names each assay in its column, so "another lab" has no one series to
      // be odd against there.
      const lab = paired ? null : readingOn(e, faceKey.value)?.lab
      return {
        date: e.date,
        dateLabel: formatDate(e.date),
        readings: series.value.map(s => readingCell(e, s)),
        oddLab: lab && lab !== usual.value ? lab : null,
        tags: tagsOn(e.date)
      }
    })
)

// One line under the readings naming the tags they wear; nothing when none does.
const tagLegend = computed(() => {
  const kinds = new Set(history.value.flatMap(r => r.tags.map(t => t.kind)))
  const parts: string[] = []
  if (kinds.has('transitional')) parts.push(`transitional · inside the ~${RBC_TURNOVER_DAYS}-day red-cell turnover window after a dose change, so the change's full effect isn't in it yet`)
  if (kinds.has('post-phlebotomy')) parts.push(`post-phlebotomy · within ${PHLEBOTOMY_EFFECT_DAYS / 7} weeks of blood taken out, so it reads the hole the visit made`)
  return parts.length ? `${parts.join('. ')}. The control panel has each window and visit.` : ''
})

const showCaveat = computed(() =>
  !!caveat.value && (caveatCompound.value != null || history.value.some(r => r.readings.some(c => c.flagged)))
)

// Every per-draw note whose reading is actually on this card, so a daggered history row keeps its
// explanation one click away even when the reading on the face of the card is a clean one.
const readingNotes = computed(() => sorted.value.flatMap(e => series.value.flatMap((s) => {
  const n = e.markers[s.key] != null ? noteOn(e, s.key) : null
  return n ? [{ ...n, key: s.key, date: e.date, dateLabel: formatDate(e.date) }] : []
})))
</script>
