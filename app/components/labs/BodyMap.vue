<script setup lang="ts">
import { THEME } from '~/utils/chartTheme'
import type { DexaEntry } from '~/composables/useDexaEntries'

// The scan as a figure: a front-view silhouette (subject's right on the viewer's left, as on
// the report) whose arms, legs and trunk are washed in one hue by fat %, with the android and
// gynoid ROIs drawn as the dashed boxes DEXA printouts use. The trunk and the two ROIs carry
// their fat % on the figure itself; the arms and legs — too narrow for text — get a callout on a
// leader in the margin, and the limb ends carry the right/left lean split. Hovering a region (or
// the table row beside the figure, through `highlight`) lights its outline so the two stay in step.
//
// The wash is a single-hue sequential scale on a FIXED 8–35 % range — not stretched to this
// scan's own spread — so a leaner scan reads lighter next time instead of being renormalised,
// and two scans can be compared by eye.

const props = defineProps<{
  regions: DexaEntry['regions']
  symmetry?: DexaEntry['symmetry']
}>()
const highlight = defineModel<string | null>('highlight', { default: null })

type RegionKey = 'arms' | 'legs' | 'trunk' | 'android' | 'gynoid'
type RegionFigures = { fat_pct?: number, fat_lbs?: number, lean_lbs?: number }

// --- geometry (viewBox units) -----------------------------------------------------------------
// The figure is symmetric about C. The margins either side hold the arm and leg callouts.
const W = 320
const H = 444
const C = 160
const mirror = (pts: number[][]) => pts.map(([x, y]) => [2 * C - x!, y!])
const points = (pts: number[][]) => pts.map(p => p.join(',')).join(' ')

const TRUNK = [[C - 42, 76], [C + 42, 76], [C + 36, 120], [C + 30, 178], [C + 36, 230], [C - 36, 230], [C - 30, 178], [C - 36, 120]]
// Hangs from the shoulder corner, angled slightly out, a clear gap off the trunk the whole way.
const RIGHT_ARM = [[C - 44, 80], [C - 62, 86], [C - 74, 228], [C - 56, 232]]
const RIGHT_LEG = [[C - 34, 232], [C - 2, 232], [C - 6, 420], [C - 38, 420]]
// DEXA ROIs: android is the lower abdomen band, gynoid the hips/upper thighs. Outline only — a
// second wash over the trunk would darken the compound and misstate both.
const ANDROID = [[C - 29, 150], [C + 29, 150], [C + 31, 200], [C - 31, 200]]
const GYNOID = [[C - 36, 212], [C + 36, 212], [C + 37, 275], [C - 37, 275]]

const LIMBS: Array<{ key: RegionKey, polys: number[][][] }> = [
  { key: 'arms', polys: [RIGHT_ARM, mirror(RIGHT_ARM)] },
  { key: 'legs', polys: [RIGHT_LEG, mirror(RIGHT_LEG)] }
]

// On-figure labels for the regions wide enough to hold one.
const INSET_LABELS: Array<{ key: RegionKey, label: string, y: number, size: number }> = [
  { key: 'trunk', label: 'TRUNK', y: 100, size: 13 },
  { key: 'android', label: 'ANDROID', y: 167, size: 12 },
  { key: 'gynoid', label: 'GYNOID', y: 239, size: 12 }
]

// Margin callouts: a dot on the region's edge, a leader to the margin, four lines of text.
interface Callout { key: RegionKey, label: string, side: 'left' | 'right', y: number, anchor: [number, number] }
const CALLOUTS: Callout[] = [
  { key: 'arms', label: 'ARMS', side: 'left', y: 152, anchor: [C - 69, 152] },
  { key: 'legs', label: 'LEGS', side: 'right', y: 330, anchor: [C + 37, 330] }
]
const TEXT_X = { left: C - 82, right: C + 82 }
const LEADER_END_X = { left: C - 78, right: C + 78 }

// --- data -----------------------------------------------------------------------------------
const WARN = THEME.warn
// Fixed 8–35 % fat → 0.18–0.90 opacity of the warn hue.
const WASH_MIN_PCT = 8
const WASH_MAX_PCT = 35
function washOpacity(fatPct: number) {
  const t = Math.min(1, Math.max(0, (fatPct - WASH_MIN_PCT) / (WASH_MAX_PCT - WASH_MIN_PCT)))
  return 0.18 + 0.72 * t
}

const fmt = (v: number | undefined, decimals = 1) => (v == null ? '—' : v.toFixed(decimals))
const region = (key: RegionKey) => (props.regions as Record<string, RegionFigures | undefined>)[key]
const wash = (key: RegionKey) => {
  const r = region(key)
  return r?.fat_pct != null ? washOpacity(r.fat_pct) : 0
}
const pctText = (key: RegionKey) => {
  const r = region(key)
  return r ? `${fmt(r.fat_pct)}%` : '—'
}

const callouts = computed(() => CALLOUTS.flatMap((c) => {
  const r = region(c.key)
  if (!r) return []
  return [{
    ...c,
    textX: TEXT_X[c.side],
    leaderEndX: LEADER_END_X[c.side],
    pct: r.fat_pct != null ? `${fmt(r.fat_pct)}%` : '—',
    fat: r.fat_lbs != null ? `${fmt(r.fat_lbs)} fat` : '',
    lean: r.lean_lbs != null ? `${fmt(r.lean_lbs)} lean` : ''
  }]
}))

// Lean lbs at each limb end — right-hand figures on the viewer's left, as on the report.
const limbFigures = computed(() => {
  const s = props.symmetry
  if (!s) return []
  return [
    { x: C - 65, y: 246, text: `R ${fmt(s.right_arm_lean)}` },
    { x: C + 65, y: 246, text: `L ${fmt(s.left_arm_lean)}` },
    { x: C - 22, y: 434, text: `R ${fmt(s.right_leg_lean)}` },
    { x: C + 22, y: 434, text: `L ${fmt(s.left_leg_lean)}` }
  ]
})

const lit = (key: RegionKey) => highlight.value === key
const set = (key: RegionKey | null) => {
  highlight.value = key
}

const REGION_NAMES: Record<RegionKey, string> = { arms: 'Arms', legs: 'Legs', trunk: 'Trunk', android: 'Android (abdomen)', gynoid: 'Gynoid (hips)' }
const describe = (key: RegionKey) => {
  const r = region(key)
  if (!r) return REGION_NAMES[key]
  return `${REGION_NAMES[key]}: ${fmt(r.fat_pct)}% fat, ${fmt(r.fat_lbs)} lbs fat${r.lean_lbs != null ? `, ${fmt(r.lean_lbs)} lbs lean` : ''}`
}

// Text drawn over a wash gets a surface-colour halo so it clears contrast on any shade.
const HALO = { paintOrder: 'stroke', stroke: THEME.raised, strokeWidth: 3, strokeLinejoin: 'round' } as const
</script>

<template>
  <figure class="m-0">
    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="block w-full h-auto select-none"
      role="img"
      aria-label="Body map of the latest DEXA scan: fat percentage by region, lean mass by limb"
    >
      <!-- head and neck: outline only, no data -->
      <circle
        :cx="C"
        cy="36"
        r="24"
        class="fill-inset stroke-line-field"
        stroke-width="1"
      />
      <polygon
        :points="points([[C - 10, 60], [C + 10, 60], [C + 12, 76], [C - 12, 76]])"
        class="fill-inset stroke-line-field"
        stroke-width="1"
      />

      <!-- trunk -->
      <g
        tabindex="0"
        class="cursor-pointer outline-none"
        @mouseenter="set('trunk')"
        @mouseleave="set(null)"
        @focus="set('trunk')"
        @blur="set(null)"
      >
        <title>{{ describe('trunk') }}</title>
        <polygon
          :points="points(TRUNK)"
          :fill="WARN"
          :fill-opacity="wash('trunk')"
          :class="lit('trunk') ? 'stroke-accent' : 'stroke-line-field'"
          :stroke-width="lit('trunk') ? 1.5 : 1"
          stroke-linejoin="round"
          class="transition-[stroke] duration-200"
        />
      </g>

      <!-- arms and legs: one region each, both limbs washed alike -->
      <g
        v-for="limb in LIMBS"
        :key="limb.key"
        tabindex="0"
        class="cursor-pointer outline-none"
        @mouseenter="set(limb.key)"
        @mouseleave="set(null)"
        @focus="set(limb.key)"
        @blur="set(null)"
      >
        <title>{{ describe(limb.key) }}</title>
        <polygon
          v-for="(poly, i) in limb.polys"
          :key="i"
          :points="points(poly)"
          :fill="WARN"
          :fill-opacity="wash(limb.key)"
          :class="lit(limb.key) ? 'stroke-accent' : 'stroke-line-field'"
          :stroke-width="lit(limb.key) ? 1.5 : 1"
          stroke-linejoin="round"
          class="transition-[stroke] duration-200"
        />
      </g>

      <!-- android / gynoid ROIs: dashed boxes over the trunk and hips -->
      <g
        v-for="roi in [{ key: 'android' as const, poly: ANDROID }, { key: 'gynoid' as const, poly: GYNOID }]"
        :key="roi.key"
        tabindex="0"
        class="cursor-pointer outline-none"
        @mouseenter="set(roi.key)"
        @mouseleave="set(null)"
        @focus="set(roi.key)"
        @blur="set(null)"
      >
        <title>{{ describe(roi.key) }}</title>
        <polygon
          :points="points(roi.poly)"
          :fill="WARN"
          fill-opacity="0"
          pointer-events="all"
          :class="lit(roi.key) ? 'stroke-accent' : 'stroke-mark'"
          :stroke-width="lit(roi.key) ? 1.5 : 1"
          stroke-dasharray="3 2"
          stroke-linejoin="round"
          class="transition-[stroke] duration-200"
        />
      </g>

      <!-- on-figure labels -->
      <g
        v-for="inset in INSET_LABELS"
        :key="inset.key"
        class="pointer-events-none"
      >
        <text
          :x="C"
          :y="inset.y"
          text-anchor="middle"
          font-size="7"
          class="tracking-[0.14em] transition-colors duration-200"
          :class="lit(inset.key) ? 'fill-hi' : 'fill-faint'"
          :style="HALO"
        >{{ inset.label }}</text>
        <text
          :x="C"
          :y="inset.y + inset.size + 3"
          text-anchor="middle"
          :font-size="inset.size"
          class="font-display fill-hi"
          :style="HALO"
        >{{ pctText(inset.key) }}</text>
      </g>

      <!-- margin callouts for the limbs -->
      <g
        v-for="c in callouts"
        :key="c.key"
        class="pointer-events-none"
      >
        <line
          :x1="c.anchor[0]"
          :y1="c.anchor[1]"
          :x2="c.leaderEndX"
          :y2="c.y"
          class="transition-[stroke] duration-200"
          :class="lit(c.key) ? 'stroke-accent' : 'stroke-line-field'"
          stroke-width="1"
        />
        <circle
          :cx="c.anchor[0]"
          :cy="c.anchor[1]"
          r="1.6"
          :class="lit(c.key) ? 'fill-accent' : 'fill-faint'"
        />
        <text
          :x="c.textX"
          :y="c.y - 7"
          :text-anchor="c.side === 'left' ? 'end' : 'start'"
          font-size="7"
          class="tracking-[0.14em]"
          :class="lit(c.key) ? 'fill-hi' : 'fill-faint'"
        >{{ c.label }}</text>
        <text
          :x="c.textX"
          :y="c.y + 9"
          :text-anchor="c.side === 'left' ? 'end' : 'start'"
          font-size="14"
          class="font-display fill-hi"
        >{{ c.pct }}</text>
        <text
          :x="c.textX"
          :y="c.y + 21"
          :text-anchor="c.side === 'left' ? 'end' : 'start'"
          font-size="7.5"
          class="fill-dim"
        >{{ c.fat }}</text>
        <text
          v-if="c.lean"
          :x="c.textX"
          :y="c.y + 32"
          :text-anchor="c.side === 'left' ? 'end' : 'start'"
          font-size="7.5"
          class="fill-dim"
        >{{ c.lean }}</text>
      </g>

      <!-- lean lbs at the limb ends -->
      <text
        v-for="f in limbFigures"
        :key="f.text"
        :x="f.x"
        :y="f.y"
        text-anchor="middle"
        font-size="7.5"
        class="fill-dim pointer-events-none"
      >{{ f.text }}</text>
    </svg>

    <figcaption class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 mt-2 text-[9.5px] text-faint tracking-[0.06em] uppercase">
      <span class="flex items-center gap-1.5">
        <span>fat %</span>
        <span>{{ WASH_MIN_PCT }}</span>
        <span
          class="inline-block w-14 h-1.5"
          :style="{ background: `linear-gradient(90deg, rgba(232,179,75,${washOpacity(WASH_MIN_PCT)}), rgba(232,179,75,${washOpacity(WASH_MAX_PCT)}))` }"
        />
        <span>{{ WASH_MAX_PCT }}+</span>
      </span>
      <span>R / L figures · lean lbs</span>
    </figcaption>
  </figure>
</template>
