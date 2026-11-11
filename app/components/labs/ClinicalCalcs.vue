<template>
  <section
    v-if="rows.length"
    data-calcs
  >
    <TuiHeader
      label="CALCULATORS"
      :dashes="6"
    >
      <span class="text-label text-muted normal-case">as of {{ formatDate(draw.date, 'monthDay') }}</span>
    </TuiHeader>
    <div class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div
        v-for="r in rows"
        :key="r.key"
        class="border border-line-soft bg-raised px-3 py-2.5"
      >
        <div class="flex items-baseline justify-between gap-2">
          <span class="text-row text-hi">{{ r.label }}</span>
          <span
            v-if="r.value != null"
            class="num-display text-figure leading-none"
            :class="toneClass(r.tone)"
          >{{ r.value }}<span
            v-if="r.unit"
            class="text-label text-muted ml-1"
          >{{ r.unit }}</span></span>
          <span
            v-else
            class="text-label text-faint"
          >—</span>
        </div>
        <p
          v-if="r.value != null"
          class="mt-1 text-meta text-dim leading-[1.5]"
        >
          {{ r.reading }}
        </p>
        <p
          v-if="r.value != null"
          class="mt-0.5 text-micro text-faint leading-[1.5]"
        >
          {{ r.inputs }}
        </p>
        <p
          v-else
          class="mt-1 text-meta text-muted leading-[1.5]"
        >
          {{ r.missing }}<template v-if="/date of birth/.test(r.missing ?? '') && isOwner">
            — <NuxtLink
              to="/journal/vaccines"
              class="text-accent hover:text-accent-hover"
            >set it on the profile card</NuxtLink>
          </template>
        </p>
      </div>
    </div>
    <p class="mt-1.5 text-micro text-faint leading-[1.5]">
      Desk arithmetic from the draw, the profile's date of birth and the schedule: PSA ×2 while on a 5-ARI, FIB-4 (age, AST, ALT, platelets), CKD-EPI 2012 cystatin C eGFR. Not stored; never written by a model.
    </p>
  </section>
</template>

<script setup lang="ts">
import { FIVE_ARI, clinicalCalcs, type CalcDraw } from '#shared/utils/clinicalCalcs'
import type { CaveatSpan } from '#shared/utils/labNotes'
import { ruleActiveOn } from '#shared/utils/protocolRules'

// The clinical calculators (audit #43 item 77) for the viewed draw: /labs under the planned
// draws, and the clinical summary. The 5-ARI question is answered from the schedule's spans
// (scored rules and the standing list), the age from the profile's birth date.
const props = defineProps<{
  /** Every blood draw (any order) — the PSA velocity reads the earlier ones. */
  draws: CalcDraw[]
  /** The draw the figures are computed for. */
  draw: CalcDraw
  birthDate: string | null | undefined
  /** The protocol's rules plus its standing meds (useProtocol: `[...rules, ...standing]`). */
  spans: CaveatSpan[]
  isOwner?: boolean
}>()

const fiveAriFrom = (date: string) => props.spans.find(s => FIVE_ARI.test(s.compound) && ruleActiveOn(s, date))?.from ?? null
const rows = computed(() => clinicalCalcs(props.draws, props.draw, { birthDate: props.birthDate, fiveAriFrom }))

function toneClass(tone: string) {
  return tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-accent' : 'text-muted'
}
</script>
