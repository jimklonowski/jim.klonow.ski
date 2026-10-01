<template>
  <div>
    <!-- Breadcrumb title row -->
    <div class="flex flex-wrap items-baseline gap-x-4 gap-y-2 px-4 sm:px-6 pt-4 pb-3.5">
      <h1 class="flex items-baseline gap-2.5 min-w-0">
        <span class="text-[11px] text-muted tracking-[0.06em] uppercase">
          <NuxtLink
            to="/labs"
            class="hover:text-accent"
          >labs</NuxtLink> /
        </span>
        <span class="num-display text-hi text-[26px] leading-none">BODY COMPOSITION</span>
      </h1>

      <p
        v-if="latest"
        class="text-[11px] text-muted tracking-[0.06em] uppercase"
      >
        {{ titleMeta }}
      </p>

      <div class="flex flex-wrap items-center gap-2 ml-auto">
        <SourcePdfsPopover
          v-if="allSources.length"
          :sources="allSources"
          align="end"
        />
        <NuxtLink
          v-if="isOwner"
          to="/labs/upload"
          class="tui-btn tui-btn-accent"
        >
          ↑ UPLOAD SCAN
        </NuxtLink>
      </div>
    </div>

    <TuiDataState
      :error="error"
      :empty="!latest"
      empty-title="No DEXA scans yet"
      empty-description="Upload a scan PDF and the body-comp trends land here."
      @retry="refresh"
    />

    <template v-if="latest">
      <!-- AI summary readout — written after an upload, regenerable by the owner -->
      <LabsAiSummaryPanel
        class="mx-4 sm:mx-6 mb-4"
        :summary="latestSummary"
        :latest-date="latest.date"
        endpoint="/api/dexa/generate-summary"
        noun="scan"
        :can-regenerate="isOwner"
        :default-open="false"
        @regenerated="refresh"
      />

      <!-- Headline readouts with the move since the previous scan — click a cell for its history -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line border-y border-line">
        <button
          v-for="cell in statCells"
          :key="cell.key"
          type="button"
          class="bg-bg px-4 py-3.5 text-left cursor-pointer transition-colors hover:bg-row-hover"
          @click="openModal(cell.key)"
        >
          <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
            {{ cell.label }}
          </p>
          <p
            class="num-display text-[32px] leading-none mt-1.5 whitespace-nowrap"
            :class="cell.accent ? 'text-accent' : ''"
          >
            {{ cell.value }}<span
              v-if="cell.unit"
              class="text-[10.5px] text-muted ml-1"
            >{{ cell.unit }}</span>
          </p>
          <p
            v-if="cell.delta"
            class="mt-1.5 text-[10.5px] tracking-[0.04em] tabular-nums"
            :class="cell.delta.class"
          >
            {{ cell.delta.text }}
          </p>
          <p
            v-if="cell.caption"
            class="text-[10.5px] tracking-[0.08em] uppercase"
            :class="[cell.captionClass, cell.delta ? 'mt-1' : 'mt-1.5']"
          >
            {{ cell.caption }}
          </p>
        </button>
      </div>

      <!-- Body map beside the regional table; hovering either lights the other -->
      <section class="px-4 sm:px-6 py-4">
        <TuiHeader label="BODY MAP · FAT % BY REGION">
          <span class="hidden sm:inline text-[10.5px] text-muted">hover a region or a row</span>
        </TuiHeader>

        <div class="grid grid-cols-1 lg:grid-cols-[minmax(320px,460px)_1fr] gap-x-8 gap-y-5 mt-3 items-start">
          <!-- The figure: the body mesh, turning or locked to a front view; the hand-drawn map only without WebGL -->
          <div class="w-full max-w-115 mx-auto lg:mx-0">
            <TuiTabs
              v-if="webgl"
              v-model="bodyView"
              :items="BODY_VIEWS"
              cols="grid-cols-2"
              class="mb-3"
            />
            <ClientOnly v-if="webgl">
              <LabsBodyMesh
                :key="bodyView"
                v-model:highlight="highlightRegion"
                :mode="bodyView === '3d' ? 'turn' : 'flat'"
                :regions="latest.regions"
                :previous-regions="previous?.regions ?? null"
                :symmetry="latest.symmetry"
                :previous-symmetry="previous?.symmetry"
                :dates="{ latest: latest.date, previous: previous?.date ?? null }"
                @unsupported="webgl = false"
              />
              <template #fallback>
                <div class="aspect-3/4 bg-inset border border-line-soft" />
              </template>
            </ClientOnly>
            <LabsBodyMap
              v-else
              v-model:highlight="highlightRegion"
              :regions="latest.regions"
              :symmetry="latest.symmetry"
            />
          </div>

          <div class="min-w-0 space-y-5">
            <!-- Regional table -->
            <div class="border border-line text-[12.5px]">
              <div class="grid grid-cols-[1fr_repeat(4,auto)] gap-x-4 px-2.5 py-1.5 border-b border-line text-right">
                <span class="tui-label text-left">region</span>
                <span class="tui-label">fat %</span>
                <span class="tui-label">fat lbs</span>
                <span class="tui-label">lean lbs</span>
                <span class="tui-label">Δ fat %</span>
              </div>
              <div
                v-for="(row, i) in regionRows"
                :key="row.key"
                class="grid grid-cols-[1fr_repeat(4,auto)] gap-x-4 px-2.5 py-1.5 text-right tabular-nums cursor-default transition-colors"
                :class="[
                  highlightRegion === row.key ? 'bg-nav-active' : i % 2 ? 'bg-inset' : '',
                  row.spaced ? 'border-t border-line-soft' : ''
                ]"
                @mouseenter="highlightRegion = row.key"
                @mouseleave="highlightRegion = null"
              >
                <span
                  class="text-left tracking-[0.04em]"
                  :class="highlightRegion === row.key ? 'text-hi' : 'text-dim'"
                >{{ row.label }}</span>
                <span class="text-hi">{{ row.pct }}</span>
                <span class="text-body">{{ row.fat }}</span>
                <span class="text-body">{{ row.lean }}</span>
                <span :class="row.deltaClass">{{ row.delta }}</span>
              </div>
            </div>

            <!-- Lean symmetry -->
            <div v-if="symmetryRows.length">
              <TuiHeader
                label="LEAN SYMMETRY · RIGHT vs LEFT"
                :dashes="6"
              >
                <span class="hidden sm:inline text-[10.5px] text-muted">typical gap ≤ {{ ARM_TYPICAL_GAP_LBS }} lbs arms · ≤ {{ LEG_TYPICAL_GAP_LBS }} lbs legs</span>
              </TuiHeader>
              <div class="mt-2.5 space-y-2.5 text-[12px]">
                <div
                  v-for="row in symmetryRows"
                  :key="row.label"
                  class="grid grid-cols-[3rem_1fr] sm:grid-cols-[3.5rem_1fr_16rem] items-center gap-x-3 gap-y-1"
                >
                  <span class="text-dim tracking-[0.04em]">{{ row.label }}</span>
                  <!-- Mirrored bars grow out from a centre rule; the figures keep a fixed slot so a long bar can't squeeze them onto two lines. -->
                  <div class="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-x-2 tabular-nums">
                    <span class="w-14 text-right text-hi whitespace-nowrap">R {{ row.right }}</span>
                    <div class="relative h-2.5">
                      <div
                        class="absolute inset-y-0 right-0 bg-band"
                        :style="{ width: row.rightWidth }"
                      />
                    </div>
                    <span class="w-px h-4 bg-line-field" />
                    <div class="relative h-2.5">
                      <div
                        class="absolute inset-y-0 left-0 bg-band"
                        :style="{ width: row.leftWidth }"
                      />
                    </div>
                    <span class="w-14 text-hi whitespace-nowrap">L {{ row.left }}</span>
                  </div>
                  <span
                    class="col-start-2 sm:col-start-3 text-[10.5px] tracking-[0.06em] uppercase sm:text-right whitespace-nowrap"
                    :class="row.toneClass"
                  >{{ row.caption }}</span>
                </div>
                <p class="text-[10.5px] text-faint leading-[1.6]">
                  Right on the left, as the report prints it. Each row's bars share one scale; a typical gap is ≤ {{ ARM_TYPICAL_GAP_LBS }} lbs for arms and ≤ {{ LEG_TYPICAL_GAP_LBS }} lbs for legs.
                </p>
              </div>
            </div>

            <!-- Distribution and bone: which band each reading sits in -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-px bg-line border border-line">
              <div
                v-for="m in meters"
                :key="m.key"
                class="bg-bg px-3.5 py-3"
              >
                <div class="flex items-baseline justify-between gap-3">
                  <p class="text-[10.5px] text-muted uppercase tracking-[0.12em]">
                    {{ m.label }}
                  </p>
                  <p
                    class="text-[10.5px] tracking-[0.08em] uppercase"
                    :class="m.toneClass"
                  >
                    {{ m.caption }}
                  </p>
                </div>
                <p class="num-display text-[24px] leading-none mt-1.5 whitespace-nowrap">
                  {{ m.value }}<span
                    v-if="m.unit"
                    class="text-[10.5px] text-muted ml-1"
                  >{{ m.unit }}</span>
                </p>
                <LabsTierMeter
                  class="mt-3"
                  :value="m.raw"
                  :min="m.min"
                  :max="m.max"
                  :bands="m.bands"
                  :ticks="m.ticks"
                />
                <p class="mt-1.5 text-[10.5px] text-muted leading-[1.6]">
                  {{ m.note }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Every scan side by side -->
      <section class="px-4 sm:px-6 py-4 border-t border-line">
        <TuiHeader label="SCAN OVER SCAN">
          <span
            v-if="previous"
            class="text-[10.5px] text-muted"
          >Δ = {{ scanHeader(latest.date) }} vs {{ scanHeader(previous.date) }}</span>
        </TuiHeader>
        <UTable
          :data="scanTableRows"
          :columns="scanTableColumns"
          class="mt-2.5 border border-line"
        >
          <template #metric-cell="{ row }">
            <span class="text-dim">{{ row.original.metric }}</span>
          </template>
          <template #delta-cell="{ row }">
            <span :class="row.original.deltaClass">{{ row.original.delta }}</span>
          </template>
        </UTable>
      </section>

      <!-- Trends across scans — a line needs more than two points to be one -->
      <section
        v-if="entries.length >= MIN_SCANS_FOR_TRENDS && trendCards.length"
        class="px-4 sm:px-6 py-4 border-t border-line"
      >
        <TuiHeader label="TRENDS" />
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-2.5">
          <TrendCard
            v-for="card in trendCards"
            :key="card.key"
            :label="card.label"
            :unit="card.unit"
            :data="card.data"
          />
        </div>
      </section>
      <p
        v-else-if="trendCards.length"
        class="px-4 sm:px-6 pb-4 text-[10.5px] text-faint tracking-[0.04em]"
      >
        Trend charts open at {{ MIN_SCANS_FOR_TRENDS }} scans — until then the table above is the trend.
      </p>
    </template>

    <!-- Per-metric scan history -->
    <UModal
      v-model:open="modalOpen"
      :title="modalMeta?.label ?? 'Scan history'"
      :description="modalMeta?.description"
    >
      <template #body>
        <div>
          <TuiHeader
            label="ALL SCANS"
            :dashes="6"
          />
          <div class="mt-2 text-[12px]">
            <div
              v-for="(row, i) in historyRows"
              :key="row.date"
              class="flex items-baseline justify-between gap-4 px-2 py-1.5"
              :class="i % 2 ? 'bg-inset' : ''"
            >
              <span class="text-muted">{{ row.date }}</span>
              <span class="text-hi">{{ row.value }}</span>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { diffDays } from '#shared/utils/dates'
import { DEXA_OTHER_METRICS, DEXA_TOTAL_METRICS, REGION_LABELS, formatLbs } from '~/data/dexa'
import type { DexaEntry, DexaRegion } from '~/composables/useDexaEntries'
import { bandTone, type MeterBand, type MeterTick, type MeterTone } from '~/components/labs/TierMeter.vue'

useSeoMeta({ title: () => 'Labs · DEXA' })

const { data, refresh, error } = await useDexaEntries()
const { isOwner } = await useAuth()

const entries = computed(() => data.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)
const previous = computed(() => entries.value.at(-2) ?? null)

const titleMeta = computed(() => {
  const e = latest.value
  if (!e) return ''
  const parts = [`latest scan ${formatDateTerse(e.date)}`, `${e.weight_lbs} lbs weighed`]
  if (previous.value) parts.push(`${diffDays(previous.value.date, e.date)} days since ${formatDateTerse(previous.value.date)}`)
  return parts.join(' · ')
})

const allSources = computed(() =>
  entries.value.flatMap(e => e.sources ?? []).filter(Boolean)
)

// --- AI summary -----------------------------------------------------------------------------
// Newest scan that has one — scans uploaded before the feature have none.
const latestSummary = computed(() => {
  const entry = [...entries.value].reverse().find(e => e.ai_summary)
  return entry
    ? {
        date: entry.date,
        text: entry.ai_summary as string,
        model: entry.ai_summary_model ?? null,
        promptHash: entry.ai_summary_prompt_hash ?? null,
        at: entry.ai_summary_at ?? null
      }
    : null
})
// --- deltas ---------------------------------------------------------------------------------
/** Which way a metric should move: body fat down, lean up, total mass neither. */
type Direction = 'up' | 'down' | 'neutral'

interface Delta {
  text: string
  class: string
}

// Rough scan-to-scan repeatability of a GE Lunar DEXA, so a move smaller than this reads as
// noise (muted) rather than as a trend: about half a pound on a tissue mass, a few tenths of a
// point on a fat %, ~1 % on BMD, a few cubic inches of VAT. Jim's Sep 2026 scan moved BMD by
// 0.007 g/cm² and VAT by 1.4 in³ — both well inside the scanner's wobble.
const NOISE = { mass: 0.5, pct: 0.3, regionPct: 0.5, vat: 3, bmd: 0.01, tScore: 0.1, ag: 0.02 }

// Signed change with its direction glyph, coloured by direction × whether that way is good:
// accent when it moved the right way, warn when it didn't, muted when it's neither, didn't move,
// or moved by less than the scanner can tell apart.
function deltaInfo(now: number | null | undefined, before: number | null | undefined, decimals: number, good: Direction, noise = 0): Delta | null {
  if (now == null || before == null) return null
  const d = now - before
  if (Math.abs(d) < 0.5 * 10 ** -decimals) return { text: '± 0', class: 'text-muted' }
  const text = `${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d).toFixed(decimals)}`
  const cls = good === 'neutral' || Math.abs(d) < noise
    ? 'text-muted'
    : (d > 0) === (good === 'up') ? 'text-accent' : 'text-warn'
  return { text, class: cls }
}

const prevLabel = computed(() => (previous.value ? formatDate(previous.value.date, 'monthDay').toUpperCase() : ''))

// --- headline cells ---------------------------------------------------------------------------
// One accessor per cell so VAT and bone density — which live outside `total` — read, diff and
// click through to their scan history exactly like the mass metrics.
const CELL_ACCESSORS: Record<string, (e: DexaEntry) => number | null> = {
  body_fat_pct: e => e.total.body_fat_pct,
  lean_mass_lbs: e => e.total.lean_mass_lbs,
  fat_mass_lbs: e => e.total.fat_mass_lbs,
  total_mass_lbs: e => e.total.total_mass_lbs,
  vat_volume: e => e.vat?.volume_in3 ?? null,
  bmd_total: e => e.bone_density?.total_bmd ?? null
}

interface CellSpec {
  key: string
  /** Short display label — the metric metadata labels are too long for a 6-wide row. */
  label: string
  unit?: string
  /** Significant decimals: VAT reads to hundredths, BMD to thousandths. */
  decimals: number
  good: Direction
  noise: number
}

const CELL_SPECS: CellSpec[] = [
  { key: 'body_fat_pct', label: 'Body fat %', decimals: 1, good: 'down', noise: NOISE.pct },
  { key: 'lean_mass_lbs', label: 'Lean mass', unit: 'lbs', decimals: 1, good: 'up', noise: NOISE.mass },
  { key: 'fat_mass_lbs', label: 'Fat mass', unit: 'lbs', decimals: 1, good: 'down', noise: NOISE.mass },
  { key: 'total_mass_lbs', label: 'Total (DEXA)', unit: 'lbs', decimals: 1, good: 'neutral', noise: NOISE.mass },
  { key: 'vat_volume', label: 'VAT volume', unit: 'in³', decimals: 2, good: 'down', noise: NOISE.vat },
  { key: 'bmd_total', label: 'Bone density', unit: 'g/cm²', decimals: 3, good: 'up', noise: NOISE.bmd }
]

const CELL_META: Record<string, typeof DEXA_TOTAL_METRICS[string]> = {
  ...DEXA_TOTAL_METRICS,
  ...DEXA_OTHER_METRICS
}

// Accent = the reading sits in its ideal band. VAT and A/G take their cutoffs from the metric
// metadata; body fat has none, and the report's "fit" band for men runs to ~21%.
const BODY_FAT_IDEAL_MAX = 21
const VAT_IDEAL_MAX = DEXA_OTHER_METRICS.vat_volume?.refMax ?? 52
const VAT_ELEVATED_MAX = 112
const AG_OPTIMAL_MAX = DEXA_OTHER_METRICS.ag_ratio?.refMax ?? 1

const TONE_CLASS: Record<MeterTone, string> = { good: 'text-accent', warn: 'text-warn', danger: 'text-danger', neutral: 'text-muted' }

const VAT_BANDS: MeterBand[] = [
  { from: 0, to: VAT_IDEAL_MAX, tone: 'good' },
  { from: VAT_IDEAL_MAX, to: VAT_ELEVATED_MAX, tone: 'warn' },
  { from: VAT_ELEVATED_MAX, to: 160, tone: 'danger' }
]
const VAT_CAPTIONS: Record<MeterTone, string> = { good: 'IDEAL', warn: 'ELEVATED', danger: 'HIGH RISK', neutral: '' }

const statCells = computed(() =>
  CELL_SPECS.map((spec) => {
    const entry = latest.value
    const raw = entry ? CELL_ACCESSORS[spec.key]?.(entry) ?? null : null
    const before = previous.value ? CELL_ACCESSORS[spec.key]?.(previous.value) ?? null : null
    const delta = deltaInfo(raw, before, spec.decimals, spec.good, spec.noise)
    const cell = {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      value: raw == null ? '—' : raw.toFixed(spec.decimals),
      accent: false,
      delta: delta ? { text: `${delta.text} vs ${prevLabel.value}`, class: delta.class } : null,
      caption: '',
      captionClass: 'text-muted'
    }
    if (raw == null || !entry) return cell

    if (spec.key === 'body_fat_pct') {
      cell.accent = raw <= BODY_FAT_IDEAL_MAX
    }
    else if (spec.key === 'vat_volume') {
      const tone = bandTone(raw, VAT_BANDS)
      cell.accent = tone === 'good'
      cell.caption = VAT_CAPTIONS[tone]
      cell.captionClass = TONE_CLASS[tone]
    }
    else if (spec.key === 'bmd_total' && entry.bone_density) {
      cell.caption = `T-score ${entry.bone_density.t_score}`
    }
    else if (spec.key === 'total_mass_lbs') {
      // Fat-free mass and BMC have no cell of their own in this layout.
      cell.caption = `fat-free ${formatLbs(entry.total.fat_free_lbs)} · bmc ${formatLbs(entry.total.bmc_lbs)}`
    }
    return cell
  })
)

// --- body map + regional table ----------------------------------------------------------------
const highlightRegion = ref<string | null>(null)

// The body mesh carries both views — turning in 3D, or locked to a straight-on front as the
// flat map — and three.js loads lazily, only here. The hand-drawn SVG map remains for the one
// case the mesh can't cover: no WebGL, which the mesh component reports and this flag records.
const BODY_VIEWS = [
  { value: '3d', label: '3D' },
  { value: '2d', label: 'FLAT' }
] as const
const bodyView = ref<'3d' | '2d'>('3d')
const webgl = ref(true)

const REGION_ORDER = ['arms', 'legs', 'trunk', 'android', 'gynoid']
// Android/gynoid are sub-regions of the trunk, so they sit slightly apart.
const SUBREGIONS = new Set(['android', 'gynoid'])
const REGION_SHORT: Record<string, string> = {
  android: 'ANDROID · ABD',
  gynoid: 'GYNOID · HIPS'
}

const regionRows = computed(() => {
  const current = (latest.value?.regions ?? {}) as Record<string, DexaRegion | undefined>
  const prior = (previous.value?.regions ?? {}) as Record<string, DexaRegion | undefined>
  const rows = REGION_ORDER.flatMap((key) => {
    const r = current[key]
    if (!r) return []
    const delta = deltaInfo(r.fat_pct, prior[key]?.fat_pct, 1, 'down', NOISE.regionPct)
    return [{
      key,
      label: REGION_SHORT[key] ?? REGION_LABELS[key]?.toUpperCase() ?? key.toUpperCase(),
      pct: `${r.fat_pct.toFixed(1)}%`,
      fat: formatLbs(r.fat_lbs),
      lean: r.lean_lbs != null ? formatLbs(r.lean_lbs) : '—',
      delta: delta?.text ?? '—',
      deltaClass: delta?.class ?? 'text-faint',
      subregion: SUBREGIONS.has(key)
    }]
  })

  // The list breaks once, where the trunk sub-regions start.
  return rows.map((row, i) => ({
    ...row,
    spaced: i > 0 && row.subregion && !rows[i - 1]?.subregion
  }))
})

// Live Lean Rx's own guidance on the symmetry page: arms often differ by up to 0.5 lbs of lean
// tissue and legs by up to 1.5 before it reads as an imbalance worth training around.
const ARM_TYPICAL_GAP_LBS = 0.5
const LEG_TYPICAL_GAP_LBS = 1.5

const symmetryRows = computed(() => {
  const s = latest.value?.symmetry
  if (!s) return []
  const row = (label: string, right: number, left: number, typical: number) => {
    const max = Math.max(right, left) || 1
    const gap = Math.abs(right - left)
    // The report expresses the gap against the smaller side.
    const gapPct = Math.min(right, left) ? (gap / Math.min(right, left)) * 100 : 0
    const within = gap <= typical
    return {
      label,
      right: right.toFixed(1),
      left: left.toFixed(1),
      rightWidth: `${(right / max) * 100}%`,
      leftWidth: `${(left / max) * 100}%`,
      caption: `${within ? 'within typical' : 'above typical'} · Δ ${gap.toFixed(1)} lbs · ${gapPct.toFixed(1)}%`,
      toneClass: within ? 'text-accent' : 'text-warn'
    }
  }
  return [
    row('ARMS', s.right_arm_lean, s.left_arm_lean, ARM_TYPICAL_GAP_LBS),
    row('LEGS', s.right_leg_lean, s.left_leg_lean, LEG_TYPICAL_GAP_LBS)
  ]
})

// --- distribution & bone meters -------------------------------------------------------------
interface MeterSpec {
  key: string
  label: string
  unit?: string
  raw: number | null
  decimals: number
  min: number
  max: number
  bands: MeterBand[]
  ticks: MeterTick[]
  captions: Record<MeterTone, string>
  note: string
}

const meters = computed(() => {
  const e = latest.value
  if (!e) return []
  const specs: MeterSpec[] = [
    {
      key: 'ag_ratio',
      label: 'A/G ratio',
      raw: e.ag_ratio ?? null,
      decimals: 2,
      min: 0.4,
      max: 1.4,
      bands: [{ from: 0.4, to: AG_OPTIMAL_MAX, tone: 'good' }, { from: AG_OPTIMAL_MAX, to: 1.4, tone: 'warn' }],
      ticks: [{ at: 0.4, label: '0.4' }, { at: AG_OPTIMAL_MAX, label: AG_OPTIMAL_MAX.toFixed(1) }, { at: 1.4, label: '1.4' }],
      captions: { good: 'OPTIMAL', warn: 'ELEVATED', danger: 'HIGH', neutral: '—' },
      note: `Android fat % over gynoid fat %. Under ${AG_OPTIMAL_MAX.toFixed(1)} means the fat sits away from the abdomen.`
    },
    {
      key: 'vat_volume',
      label: 'VAT volume',
      unit: 'in³',
      raw: e.vat?.volume_in3 ?? null,
      decimals: 2,
      min: 0,
      max: 160,
      bands: VAT_BANDS,
      ticks: [{ at: 0, label: '0' }, { at: VAT_IDEAL_MAX, label: `${VAT_IDEAL_MAX}` }, { at: VAT_ELEVATED_MAX, label: `${VAT_ELEVATED_MAX}` }, { at: 160, label: '160+' }],
      captions: VAT_CAPTIONS,
      note: e.vat ? `Visceral fat inside the android region · ${formatLbs(e.vat.fat_mass_lbs)} lbs of VAT mass.` : 'Visceral fat inside the android region.'
    },
    {
      key: 't_score',
      label: 'BMD T-score',
      raw: e.bone_density?.t_score ?? null,
      decimals: 1,
      min: -3.5,
      max: 1.5,
      bands: [{ from: -3.5, to: -2.5, tone: 'danger' }, { from: -2.5, to: -1, tone: 'warn' }, { from: -1, to: 1.5, tone: 'good' }],
      ticks: [{ at: -3.5, label: '-3.5' }, { at: -2.5, label: '-2.5' }, { at: -1, label: '-1.0' }, { at: 1.5, label: '+1.5' }],
      captions: { good: 'NORMAL', warn: 'OSTEOPENIA', danger: 'OSTEOPOROSIS', neutral: '—' },
      note: e.bone_density
        ? `Total-body BMD ${e.bone_density.total_bmd} g/cm² · Z ${e.bone_density.z_score}. Not the hip/spine screening DEXA.`
        : 'Total-body bone density against a young-adult reference.'
    }
  ]
  return specs.map((spec) => {
    const tone = bandTone(spec.raw, spec.bands)
    return {
      ...spec,
      value: spec.raw == null ? '—' : spec.raw.toFixed(spec.decimals),
      caption: spec.captions[tone],
      toneClass: TONE_CLASS[tone]
    }
  })
})

// --- scan-over-scan table ---------------------------------------------------------------------
interface ScanMetric {
  label: string
  decimals: number
  good: Direction
  noise: number
  read: (e: DexaEntry) => number | null | undefined
}

// Labels are kept short so the table fits a phone with two scan columns and the move.
const SCAN_METRICS: ScanMetric[] = [
  { label: 'Body fat %', decimals: 1, good: 'down', noise: NOISE.pct, read: e => e.total.body_fat_pct },
  { label: 'Total (DEXA) lbs', decimals: 1, good: 'neutral', noise: NOISE.mass, read: e => e.total.total_mass_lbs },
  { label: 'Fat mass lbs', decimals: 1, good: 'down', noise: NOISE.mass, read: e => e.total.fat_mass_lbs },
  { label: 'Lean mass lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.total.lean_mass_lbs },
  { label: 'Fat-free lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.total.fat_free_lbs },
  { label: 'BMC lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.total.bmc_lbs },
  { label: 'Arms fat %', decimals: 1, good: 'down', noise: NOISE.regionPct, read: e => e.regions.arms?.fat_pct },
  { label: 'Arms lean lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.regions.arms?.lean_lbs },
  { label: 'Legs fat %', decimals: 1, good: 'down', noise: NOISE.regionPct, read: e => e.regions.legs?.fat_pct },
  { label: 'Legs lean lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.regions.legs?.lean_lbs },
  { label: 'Trunk fat %', decimals: 1, good: 'down', noise: NOISE.regionPct, read: e => e.regions.trunk?.fat_pct },
  { label: 'Trunk lean lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.regions.trunk?.lean_lbs },
  { label: 'Android fat %', decimals: 1, good: 'down', noise: NOISE.regionPct, read: e => e.regions.android?.fat_pct },
  { label: 'Gynoid fat %', decimals: 1, good: 'down', noise: NOISE.regionPct, read: e => e.regions.gynoid?.fat_pct },
  { label: 'A/G ratio', decimals: 2, good: 'down', noise: NOISE.ag, read: e => e.ag_ratio },
  { label: 'VAT volume in³', decimals: 2, good: 'down', noise: NOISE.vat, read: e => e.vat?.volume_in3 },
  { label: 'BMD g/cm²', decimals: 3, good: 'up', noise: NOISE.bmd, read: e => e.bone_density?.total_bmd },
  { label: 'BMD T-score', decimals: 1, good: 'up', noise: NOISE.tScore, read: e => e.bone_density?.t_score },
  { label: 'R arm lean lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.symmetry?.right_arm_lean },
  { label: 'L arm lean lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.symmetry?.left_arm_lean },
  { label: 'R leg lean lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.symmetry?.right_leg_lean },
  { label: 'L leg lean lbs', decimals: 1, good: 'up', noise: NOISE.mass, read: e => e.symmetry?.left_leg_lean },
  { label: 'Scale weight lbs', decimals: 1, good: 'neutral', noise: NOISE.mass, read: e => e.weight_lbs }
]

type ScanTableRow = { metric: string, delta: string, deltaClass: string } & Record<string, string>

const NUMERIC_COL = { class: { th: 'text-right', td: 'text-right tabular-nums' } }

// Column headers drop the year while every scan is in the same one — three dated columns plus
// the move have to fit a phone.
const multiYear = computed(() => new Set(entries.value.map(e => e.date.slice(0, 4))).size > 1)
const scanHeader = (date: string) => (multiYear.value ? formatDateTerse(date) : formatDate(date, 'monthDay').toUpperCase())

// One column per scan, oldest first like the report, then the latest-vs-previous move.
const scanTableColumns = computed<TableColumn<ScanTableRow>[]>(() => [
  { accessorKey: 'metric', header: 'Metric' },
  ...entries.value.map(e => ({ accessorKey: e.date, header: scanHeader(e.date), meta: NUMERIC_COL })),
  ...(previous.value ? [{ accessorKey: 'delta', header: 'Δ', meta: NUMERIC_COL }] : [])
])

const scanTableRows = computed<ScanTableRow[]>(() =>
  SCAN_METRICS.flatMap((m) => {
    const values = entries.value.map(e => m.read(e) ?? null)
    if (values.every(v => v == null)) return []
    const row: ScanTableRow = { metric: m.label, delta: '', deltaClass: 'text-muted' }
    entries.value.forEach((e, i) => {
      const v = values[i]
      row[e.date] = v == null ? '—' : v.toFixed(m.decimals)
    })
    const delta = deltaInfo(values.at(-1), values.at(-2), m.decimals, m.good, m.noise)
    if (delta) {
      row.delta = delta.text
      row.deltaClass = delta.class
    }
    return [row]
  })
)

// --- trends -----------------------------------------------------------------------------------
// Two scans make a line chart that is all slope and no shape; the table carries them until then.
const MIN_SCANS_FOR_TRENDS = 3
const TREND_KEYS = ['body_fat_pct', 'lean_mass_lbs', 'fat_mass_lbs']

const trendCards = computed(() =>
  TREND_KEYS.map(key => ({
    key,
    label: CELL_META[key]?.label ?? key,
    unit: CELL_META[key]?.unit,
    data: entries.value
      .map(e => ({ date: formatDate(e.date, 'monthDay'), value: CELL_ACCESSORS[key]?.(e) ?? null }))
      .filter((p): p is { date: string, value: number } => p.value !== null)
  })).filter(card => card.data.length >= 2)
)

// --- scan-history modal -----------------------------------------------------------------------
const modalOpen = ref(false)
const modalKey = ref('')
const modalMeta = computed(() => modalKey.value ? CELL_META[modalKey.value] : null)

const historyRows = computed(() => {
  const spec = CELL_SPECS.find(s => s.key === modalKey.value)
  const read = CELL_ACCESSORS[modalKey.value]
  if (!spec || !read) return []
  return [...entries.value]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((e) => {
      const v = read(e)
      const unit = spec.unit ? ` ${spec.unit}` : ''
      return { date: formatDateTerse(e.date), value: v == null ? '—' : `${v.toFixed(spec.decimals)}${unit}` }
    })
})

function openModal(key: string) {
  modalKey.value = key
  modalOpen.value = true
}
</script>
