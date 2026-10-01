<script lang="ts">
import { STATUS_COLORS } from '~/utils/chartTheme'

// A thin tiered meter for "which band am I in" readouts — VAT volume, A/G ratio, the BMD
// T-score. The track is split into bands, hairline ticks mark the cutoffs, and a dot marks the
// reading in its band's status colour. The good band is the same fill TuiRangeBar uses for a
// reference range; the warn and danger bands are washes of their status hue, so the whole track
// reads as "where the trouble starts" rather than a bare line with a dot on it.
//
// The types and bandTone() are exported from this plain script block (script setup can't
// export) so the page can build its band specs and caption the tone the dot will show.
export type MeterTone = 'good' | 'warn' | 'danger' | 'neutral'
export interface MeterBand {
  from: number
  to: number
  tone: MeterTone
}
export interface MeterTick {
  at: number
  label: string
}

/** The band a reading falls in; past the last cutoff it belongs to the last band. */
export function bandTone(value: number | null, bands: MeterBand[]): MeterTone {
  if (value == null) return 'neutral'
  return bands.find(b => value >= b.from && value < b.to)?.tone
    ?? (value >= (bands.at(-1)?.to ?? Infinity) ? bands.at(-1)?.tone : bands[0]?.tone)
    ?? 'neutral'
}
</script>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  value: number | null
  min: number
  max: number
  bands: MeterBand[]
  ticks?: MeterTick[]
  height?: number
  dotSize?: number
}>(), { ticks: () => [], height: 6, dotSize: 10 })

const BAND_CLASS: Record<MeterTone, string> = {
  good: 'bg-band',
  warn: 'bg-warn/15',
  danger: 'bg-danger/15',
  neutral: 'bg-line-soft'
}
const DOT_COLOR: Record<MeterTone, string> = {
  good: STATUS_COLORS.optimal,
  warn: STATUS_COLORS.low,
  danger: STATUS_COLORS.high,
  neutral: STATUS_COLORS.unknown
}

function pct(v: number) {
  const span = props.max - props.min
  return span ? Math.min(100, Math.max(0, ((v - props.min) / span) * 100)) : 0
}

const bandStyles = computed(() => props.bands.map(b => ({ left: `${pct(b.from)}%`, width: `${Math.max(0, pct(b.to) - pct(b.from))}%` })))

// A tick at either end sits flush instead of hanging half outside the track.
const tickStyles = computed(() => props.ticks.map((t) => {
  const p = pct(t.at)
  return { left: `${p}%`, transform: p <= 0 ? 'none' : p >= 100 ? 'translateX(-100%)' : 'translateX(-50%)' }
}))

const dotStyle = computed(() => {
  if (props.value == null) return null
  return {
    left: `${pct(props.value)}%`,
    top: `${(props.height - props.dotSize) / 2}px`,
    width: `${props.dotSize}px`,
    height: `${props.dotSize}px`,
    background: DOT_COLOR[bandTone(props.value, props.bands)]
  }
})
</script>

<template>
  <div>
    <div
      class="relative w-full bg-line-soft"
      :style="{ height: `${height}px` }"
    >
      <div
        v-for="(band, i) in bands"
        :key="`${band.from}-${band.to}`"
        class="absolute inset-y-0"
        :class="BAND_CLASS[band.tone]"
        :style="bandStyles[i]"
      />
      <div
        v-for="tick in ticks"
        :key="tick.at"
        class="absolute inset-y-0 w-px bg-line-field"
        :style="{ left: `${pct(tick.at)}%` }"
      />
      <!-- 2px surface ring so the dot stays legible over a band edge -->
      <div
        v-if="dotStyle"
        class="absolute rounded-full -translate-x-1/2 ring-2 ring-bg"
        :style="dotStyle"
      />
    </div>
    <div
      v-if="ticks.length"
      class="relative h-3.5 mt-1 text-[9.5px] text-faint tracking-[0.06em] tabular-nums"
    >
      <span
        v-for="(tick, i) in ticks"
        :key="tick.at"
        class="absolute top-0 whitespace-nowrap"
        :style="tickStyles[i]"
      >{{ tick.label }}</span>
    </div>
  </div>
</template>
