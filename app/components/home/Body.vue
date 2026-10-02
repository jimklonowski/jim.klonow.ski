<template>
  <div v-if="latest">
    <TuiHeader
      :label="`BODY COMPOSITION · ${formatDate(latest.date, 'monthDay').toUpperCase()} SCAN`"
      class="mt-5"
    >
      <span class="text-[10.5px] text-muted">
        <span class="hidden sm:inline">hover a region · </span>
        <NuxtLink
          to="/labs/dexa"
          class="text-accent hover:text-accent-hover"
        >full scan →</NuxtLink>
      </span>
    </TuiHeader>

    <!-- Two columns: the figure, then the numbers. On a phone the figure is a 128px thumbnail
         and only the three tiles fit beside it, so the region rows drop below and span the
         width; from sm up the figure spans both rows and everything sits to its right. -->
    <div class="grid grid-cols-[128px_minmax(0,1fr)] sm:grid-cols-[232px_minmax(0,1fr)] gap-x-4 sm:gap-x-6 gap-y-3 mt-2.5 items-start">
      <!-- The figure: the real body mesh, flat front view, mounted once it scrolls into reach
           (three.js is a separate chunk, and on a phone this row sits well below the fold).
           The hand-drawn map stands in without WebGL, as on the DEXA page. -->
      <div
        ref="stageWrap"
        class="min-w-0 sm:row-span-2"
      >
        <ClientOnly v-if="webgl">
          <LabsBodyMesh
            v-if="inReach"
            v-model:highlight="highlight"
            mode="flat"
            compact
            :regions="latest.regions"
            :symmetry="latest.symmetry"
            :dates="{ latest: latest.date, previous: previous?.date ?? null }"
            @unsupported="webgl = false"
          />
          <div
            v-else
            class="aspect-3/4 bg-inset border border-line-soft"
          />
          <template #fallback>
            <div class="aspect-3/4 bg-inset border border-line-soft" />
          </template>
        </ClientOnly>
        <LabsBodyMap
          v-else
          v-model:highlight="highlight"
          :regions="latest.regions"
          :symmetry="latest.symmetry"
        />
      </div>

      <!-- Headline tiles, the same three the DEXA page leads with -->
      <div class="min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <NuxtLink
          v-for="cell in cells"
          :key="cell.key"
          to="/labs/dexa"
          :aria-label="`${cell.label} ${cell.value}${cell.unit ? ` ${cell.unit}` : ''} — open body composition`"
          class="block bg-raised border border-line-soft px-3 py-2 hover:bg-row-hover hover:border-line-input transition-colors min-w-0"
        >
          <p class="text-[10.5px] text-muted uppercase tracking-[0.12em] truncate">
            {{ cell.label }}
          </p>
          <p
            class="num-display text-[22px] sm:text-[24px] leading-none mt-1 whitespace-nowrap"
            :class="cell.accent ? 'text-accent' : 'text-hi'"
          >
            {{ cell.value }}<span
              v-if="cell.unit"
              class="text-[10.5px] text-muted ml-1 font-sans"
            >{{ cell.unit }}</span>
          </p>
          <p
            v-if="cell.delta"
            class="text-[10.5px] mt-1 tabular-nums"
            :class="cell.delta.class"
          >
            {{ cell.delta.text }}
          </p>
        </NuxtLink>
      </div>

      <div class="min-w-0 col-span-2 sm:col-span-1 flex flex-col gap-3">
        <!-- Fat % by region. Hovering a row lights the region on the figure, and the reverse. -->
        <div class="text-[12px]">
          <div
            v-for="r in regions"
            :key="r.key"
            class="grid grid-cols-[84px_52px_minmax(0,1fr)_64px] gap-x-3 items-center py-0.5 -mx-1.5 px-1.5 transition-colors"
            :class="highlight === r.key ? 'bg-row-hover' : ''"
            @pointerenter="highlight = r.key"
            @pointerleave="highlight = null"
          >
            <span class="text-[10.5px] text-muted uppercase tracking-widest truncate">{{ r.label }}</span>
            <span
              class="text-right tabular-nums"
              :class="highlight === r.key ? 'text-accent' : 'text-hi'"
            >{{ r.pct }}</span>
            <span class="relative h-1.25 bg-line-soft min-w-0">
              <span
                class="absolute inset-y-0 left-0 bg-accent transition-opacity"
                :class="highlight === r.key ? 'opacity-90' : 'opacity-60'"
                :style="{ width: `${r.fill}%` }"
              />
            </span>
            <span
              class="text-right text-[11px] tabular-nums"
              :class="r.deltaClass"
            >{{ r.delta }}</span>
          </div>
        </div>

        <p class="text-[11px] text-muted flex flex-wrap gap-x-4 gap-y-0.5">
          <span
            v-for="f in facts"
            :key="f.text"
          >{{ f.text }} <span
            v-if="f.tag"
            :class="f.tagClass"
          >{{ f.tag }}</span></span>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DexaEntry, DexaRegion } from '~/composables/useDexaEntries'
import { DEXA_OTHER_METRICS, REGION_LABELS } from '~/data/dexa'
import { DEXA_NOISE, deltaInfo } from '~/utils/dexaDeltas'
import { diffDays } from '#shared/utils/dates'

// The home page's body-composition row: the latest scan on the real body mesh (flat, compact),
// the three headline figures with their change since the previous scan, fat % by region, and
// one line of the smaller facts. Mockup A of the Oct 2026 redesign; the DEXA page has the rest.
const props = defineProps<{
  latest: DexaEntry | null
  /** The scan before it, for the deltas. */
  previous: DexaEntry | null
}>()

const highlight = ref<string | null>(null)
const webgl = ref(true)

// Mount the mesh (and its three.js chunk) only once the row is near the viewport. On a wide
// screen that is immediately; on a phone the row sits a few screens down and may never be.
const stageWrap = useTemplateRef('stageWrap')
const inReach = ref(false)
const { stop } = useIntersectionObserver(stageWrap, (entries) => {
  if (entries.some(e => e.isIntersecting)) {
    inReach.value = true
    stop()
  }
}, { rootMargin: '240px' })

const prevLabel = computed(() => props.previous ? ` vs ${formatDate(props.previous.date, 'monthDay').toUpperCase()}` : '')

// The report's "fit" band for men runs to ~21%; the same cutoff the DEXA page's cell uses.
const BODY_FAT_IDEAL_MAX = 21

const cells = computed(() => {
  const e = props.latest
  if (!e) return []
  const p = props.previous
  const spec = [
    { key: 'body_fat_pct', label: 'Body fat %', unit: '', decimals: 1, good: 'down' as const, noise: DEXA_NOISE.pct, read: (x: DexaEntry) => x.total.body_fat_pct },
    { key: 'lean_mass_lbs', label: 'Lean mass', unit: 'lbs', decimals: 1, good: 'up' as const, noise: DEXA_NOISE.mass, read: (x: DexaEntry) => x.total.lean_mass_lbs },
    { key: 'fat_mass_lbs', label: 'Fat mass', unit: 'lbs', decimals: 1, good: 'down' as const, noise: DEXA_NOISE.mass, read: (x: DexaEntry) => x.total.fat_mass_lbs }
  ]
  return spec.map((s) => {
    const raw = s.read(e)
    const delta = deltaInfo(raw, p ? s.read(p) : null, s.decimals, s.good, s.noise)
    return {
      key: s.key,
      label: s.label,
      unit: s.unit,
      value: raw.toFixed(s.decimals),
      accent: s.key === 'body_fat_pct' && raw <= BODY_FAT_IDEAL_MAX,
      delta: delta ? { text: `${delta.text}${prevLabel.value}`, class: delta.class } : null
    }
  })
})

const REGION_ORDER = ['arms', 'legs', 'trunk', 'android', 'gynoid']

// Bar fill follows the mesh shader's wash: 8% fat is empty, 35% is full.
const fillPct = (fat: number) => Math.round(Math.max(0, Math.min(1, (fat - 8) / 27)) * 100)

const regions = computed(() => {
  const current = (props.latest?.regions ?? {}) as Record<string, DexaRegion | undefined>
  const prior = (props.previous?.regions ?? {}) as Record<string, DexaRegion | undefined>
  return REGION_ORDER.flatMap((key) => {
    const r = current[key]
    if (!r) return []
    const delta = deltaInfo(r.fat_pct, prior[key]?.fat_pct, 1, 'down', DEXA_NOISE.regionPct)
    return [{
      key,
      label: REGION_LABELS[key] ?? key,
      pct: `${r.fat_pct.toFixed(1)}%`,
      fill: fillPct(r.fat_pct),
      delta: delta?.text ?? '—',
      deltaClass: delta?.class ?? 'text-faint'
    }]
  })
})

const AG_OPTIMAL_MAX = DEXA_OTHER_METRICS.ag_ratio?.refMax ?? 1
const VAT_IDEAL_MAX = DEXA_OTHER_METRICS.vat_volume?.refMax ?? 52

/** "A/G 0.83 optimal · VAT 2.61 in³ ideal · BMD 1.147 g/cm² · 110 days between scans" */
const facts = computed(() => {
  const e = props.latest
  if (!e) return []
  const out: Array<{ text: string, tag?: string, tagClass?: string }> = []
  if (e.ag_ratio != null) {
    const ok = e.ag_ratio <= AG_OPTIMAL_MAX
    out.push({ text: `A/G ${e.ag_ratio.toFixed(2)}`, tag: ok ? 'optimal' : 'high', tagClass: ok ? 'text-accent' : 'text-warn' })
  }
  if (e.vat) {
    const ok = e.vat.volume_in3 <= VAT_IDEAL_MAX
    out.push({ text: `VAT ${e.vat.volume_in3.toFixed(2)} in³`, tag: ok ? 'ideal' : 'elevated', tagClass: ok ? 'text-accent' : 'text-warn' })
  }
  if (e.bone_density) out.push({ text: `BMD ${e.bone_density.total_bmd.toFixed(3)} g/cm² · T ${e.bone_density.t_score}` })
  if (props.previous) out.push({ text: `${diffDays(props.previous.date, e.date)} days between scans` })
  return out
})
</script>
