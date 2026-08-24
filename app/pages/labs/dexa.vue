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
        latest scan <span class="text-hi font-medium">{{ formatDateTerse(latest.date) }}</span> · {{ latest.weight_lbs }} lbs weighed
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

    <p
      v-if="!latest"
      class="px-4 sm:px-6 py-6 text-[12px] text-muted border-t border-line"
    >
      No DEXA scans on file yet.
    </p>

    <template v-else>
      <!-- Headline readouts — 1px-gap cell row, click a cell for its scan history -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-line border-y border-line">
        <button
          v-for="cell in statCells"
          :key="cell.key"
          type="button"
          class="bg-bg px-4 py-3.5 text-left cursor-pointer transition-colors hover:bg-[#101a15]"
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
            v-if="cell.caption"
            class="mt-1.5 text-[10.5px] tracking-[0.08em] uppercase"
            :class="cell.captionClass"
          >
            {{ cell.caption }}
          </p>
        </button>
      </div>

      <!-- Regional fat/lean split -->
      <section class="px-4 sm:px-6 py-4">
        <TuiHeader label="REGIONAL · FAT% AND FAT/LEAN LBS" />

        <div class="flex flex-col gap-2 mt-3 text-[12px]">
          <div
            v-for="row in regionRows"
            :key="row.key"
            class="flex items-center gap-3"
            :class="row.spaced ? 'mt-1' : ''"
          >
            <span class="w-[92px] sm:w-[150px] shrink-0 text-right text-dim">{{ row.label }}</span>
            <div class="relative flex-1 min-w-[40px] h-3 bg-raised">
              <div
                class="absolute inset-y-0 left-0 bg-warn"
                :style="{ width: row.fatWidth }"
              />
              <div
                class="absolute inset-y-0 bg-[#1e3a2e]"
                :style="{ left: row.fatWidth, width: row.leanWidth }"
              />
            </div>
            <span class="w-[48px] shrink-0 text-hi">{{ row.pct }}</span>
            <span class="w-[128px] sm:w-[180px] shrink-0 text-muted">{{ row.detail }}</span>
          </div>
        </div>

        <!-- Lean-balance footer -->
        <div class="flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-3.5 pt-3 border-t border-line-soft text-[11px]">
          <p
            v-if="leanBalance.length"
            class="flex flex-wrap items-baseline gap-x-1.5 text-muted tracking-[0.04em]"
          >
            <span>LEAN BALANCE ·</span>
            <template
              v-for="(part, i) in leanBalance"
              :key="i"
            >
              <span>{{ part.label }}</span>
              <span class="text-hi font-medium">{{ part.value }}</span>
            </template>
            <span>lbs</span>
          </p>
          <p class="flex items-baseline gap-2 ml-auto">
            <button
              type="button"
              class="text-accent hover:text-accent-hover cursor-pointer"
              @click="openModal('body_fat_pct')"
            >
              scan history →
            </button>
            <span class="text-faint">·</span>
            <NuxtLink
              to="/journal/trends"
              class="text-accent hover:text-accent-hover"
            >
              vs withings daily →
            </NuxtLink>
          </p>
        </div>
      </section>

      <!-- Trends across scans -->
      <section
        v-if="trendCards.length"
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
    </template>

    <!-- Per-metric scan history -->
    <UModal
      v-model:open="modalOpen"
      :title="modalMeta?.label ?? 'Scan history'"
      :description="modalMeta?.description"
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
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
import { DEXA_OTHER_METRICS, DEXA_TOTAL_METRICS, REGION_LABELS, formatLbs } from '~/data/dexa'
import type { DexaEntry, DexaRegion } from '~/composables/useDexaEntries'

definePageMeta({ middleware: 'labs-auth' })

const { data, refresh } = await useDexaEntries()
const { isOwner } = await useAuth()

// Re-fetch on every mount so back-navigation doesn't show stale/empty data
if (import.meta.client) {
  onMounted(refresh)
}

const entries = computed(() => data.value ?? [])
const latest = computed(() => entries.value.at(-1) ?? null)

const allSources = computed(() =>
  entries.value.flatMap(e => e.sources ?? []).filter(Boolean)
)

// --- headline cells ---------------------------------------------------------
// One accessor per cell so VAT and bone density — which live outside `total` —
// read and click through to their scan history exactly like the mass metrics.
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
}

const CELL_SPECS: CellSpec[] = [
  { key: 'body_fat_pct', label: 'Body fat %', decimals: 1 },
  { key: 'lean_mass_lbs', label: 'Lean mass', unit: 'lbs', decimals: 1 },
  { key: 'fat_mass_lbs', label: 'Fat mass', unit: 'lbs', decimals: 1 },
  { key: 'total_mass_lbs', label: 'Total (DEXA)', unit: 'lbs', decimals: 1 },
  { key: 'vat_volume', label: 'VAT volume', unit: 'in³', decimals: 2 },
  { key: 'bmd_total', label: 'Bone density', decimals: 3 }
]

const CELL_META: Record<string, typeof DEXA_TOTAL_METRICS[string]> = {
  ...DEXA_TOTAL_METRICS,
  ...DEXA_OTHER_METRICS
}

// Accent = the reading sits in its ideal band. VAT and A/G take their cutoffs from the
// metric metadata; body fat has none, and the report's "fit" band for men runs to ~21%.
const BODY_FAT_IDEAL_MAX = 21
const VAT_IDEAL_MAX = DEXA_OTHER_METRICS.vat_volume?.refMax ?? 52
const VAT_ELEVATED_MAX = 112
const AG_OPTIMAL_MAX = DEXA_OTHER_METRICS.ag_ratio?.refMax ?? 1

function vatTier(v: number) {
  if (v < VAT_IDEAL_MAX) return { caption: 'IDEAL', captionClass: 'text-accent', accent: true }
  if (v < VAT_ELEVATED_MAX) return { caption: 'ELEVATED', captionClass: 'text-warn', accent: false }
  return { caption: 'HIGH RISK', captionClass: 'text-danger', accent: false }
}

const statCells = computed(() =>
  CELL_SPECS.map((spec) => {
    const entry = latest.value
    const raw = entry ? CELL_ACCESSORS[spec.key]?.(entry) ?? null : null
    const cell = {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      value: raw == null ? '—' : raw.toFixed(spec.decimals),
      accent: false,
      caption: '',
      captionClass: 'text-muted'
    }
    if (raw == null || !entry) return cell

    if (spec.key === 'body_fat_pct') {
      cell.accent = raw <= BODY_FAT_IDEAL_MAX
    }
    else if (spec.key === 'vat_volume') {
      Object.assign(cell, vatTier(raw))
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

// --- regional rows ---------------------------------------------------------
const REGION_ORDER = ['arms', 'legs', 'trunk', 'android', 'gynoid']
// Android/gynoid are sub-regions of the trunk, so they sit slightly apart.
const SUBREGIONS = new Set(['android', 'gynoid'])
const REGION_SHORT: Record<string, string> = {
  android: 'ANDROID (ABD)',
  gynoid: 'GYNOID (HIPS)'
}
// The stacked bar leaves this much bare track at the right edge so it reads as a
// measurement rather than a full-width block.
const TRACK_TAIL_PCT = 2.5

/** "3.3 fat / 16.3 lean" — built here because Vue's whitespace condensing eats
 *  the separators when these are stitched together from template fragments. */
function regionDetail(region: string, r: DexaRegion): string {
  const fat = `${formatLbs(r.fat_lbs)} fat`
  if (r.lean_lbs !== undefined) return `${fat} / ${formatLbs(r.lean_lbs)} lean`

  const ag = latest.value?.ag_ratio
  if (region === 'android' && ag !== undefined) {
    return `${fat} · A/G ${ag.toFixed(2)} ${ag < AG_OPTIMAL_MAX ? 'opt' : 'elev'}`
  }
  return fat
}

const regionRows = computed(() => {
  const regions = (latest.value?.regions ?? {}) as Record<string, DexaRegion | undefined>
  const rows = REGION_ORDER.flatMap((key) => {
    const r = regions[key]
    if (!r) return []
    return [{
      key,
      label: REGION_SHORT[key] ?? REGION_LABELS[key]?.toUpperCase() ?? key.toUpperCase(),
      pct: `${r.fat_pct.toFixed(1)}%`,
      fatWidth: `${Math.min(Math.max(r.fat_pct, 0), 100)}%`,
      leanWidth: `${Math.max(100 - r.fat_pct - TRACK_TAIL_PCT, 0)}%`,
      detail: regionDetail(key, r),
      subregion: SUBREGIONS.has(key)
    }]
  })

  // The list breaks once, where the trunk sub-regions start.
  return rows.map((row, i) => ({
    ...row,
    spaced: i > 0 && row.subregion && !rows[i - 1]?.subregion
  }))
})

const leanBalance = computed(() => {
  const s = latest.value?.symmetry
  if (!s) return []
  return [
    { label: 'ARM R', value: s.right_arm_lean.toFixed(1) },
    { label: '/ L', value: s.left_arm_lean.toFixed(1) },
    { label: '· LEG R', value: s.right_leg_lean.toFixed(1) },
    { label: '/ L', value: s.left_leg_lean.toFixed(1) }
  ]
})

// --- trends ---------------------------------------------------------------
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

// --- scan-history modal ----------------------------------------------------
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
