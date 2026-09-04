<template>
  <div>
    <ToolsHeader
      section="INVENTORY"
      meta="sealed stock &amp; active depletion"
    >
      <template #actions>
        <span
          v-if="expiringCount"
          class="text-[11px] text-warn tracking-[0.06em] uppercase"
        >▲ {{ expiringCount }} expiring</span>
        <button
          v-if="isOwner"
          type="button"
          class="tui-btn tui-btn-accent"
          @click="dumpOpen = true"
        >
          ✦ STOCK DUMP
        </button>
        <button
          type="button"
          class="tui-btn"
          @click="openAddModal"
        >
          + ADD STOCK
        </button>
      </template>
    </ToolsHeader>
    <ToolsNav />

    <TuiDataState
      :error="error"
      @retry="refresh"
    />

    <p
      v-if="!vials.length"
      class="px-4 sm:px-6 py-5 text-[12px] text-muted"
    >
      Nothing tracked yet. Hit <span class="text-accent">✦ STOCK DUMP</span> and describe everything on hand — vials and
      pill bottles — in one sentence. It parses into rows, and the runway panel tells you whether the stockpile covers the next cycle.
    </p>

    <div class="px-4 sm:px-6 py-4 space-y-5">
      <ToolsStockRunway
        :vials="vials"
        :entries="entries"
        :today="today"
      />

      <!-- Summary -->
      <div
        v-if="vials.length"
        class="grid grid-cols-2 lg:grid-cols-4 gap-2.5"
      >
        <StatTile
          label="Active"
          :value="activeVials.length"
          unit="open"
        />
        <StatTile
          label="Sealed"
          :value="sealedCount"
          :unit="sealedNoun"
        />
        <StatTile
          label="Next to run out"
          :value="nextOutDays"
          unit="days"
          :subtext="nextToRunOut?.vial.compound ?? undefined"
        />
        <StatTile
          label="Expiring soon"
          :value="expiringCount"
          :unit="expiringNoun"
          :subtext="expiringCount ? 'check the dates below' : 'nothing in the window'"
        />
      </div>

      <!-- Active stock -->
      <section v-if="activeProjections.length">
        <TuiHeader
          :label="`ACTIVE ${activeNoun.toUpperCase()} · ${activeVials.length}`"
          :dashes="7"
        >
          <span class="text-[10.5px] text-muted normal-case">depletion projected from logged doses</span>
        </TuiHeader>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mt-2.5">
          <div
            v-for="{ vial, proj } in activeProjections"
            :key="vial.id"
            class="bg-raised border border-line-soft px-3.5 py-3"
          >
            <!-- identity -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-baseline gap-2 min-w-0">
                <span
                  class="w-1.5 h-1.5 rounded-full shrink-0"
                  :style="{ background: getCompoundColor(vial.compound) }"
                />
                <div class="min-w-0">
                  <p class="text-[13px] text-hi truncate">
                    {{ vial.compound }}
                  </p>
                  <p class="text-[11px] text-muted truncate">
                    {{ vialSpec(vial) }}
                  </p>
                </div>
              </div>
              <UDropdownMenu
                :items="activeMenu(vial)"
                :content="{ align: 'end' }"
                :ui="{ content: 'bg-raised border border-line-accent ring-0', item: 'text-[12px]' }"
              >
                <button
                  type="button"
                  class="shrink-0 px-1 text-[14px] leading-none text-faint hover:text-accent cursor-pointer"
                  :aria-label="`${vial.compound} actions`"
                >
                  ⋯
                </button>
              </UDropdownMenu>
            </div>

            <!-- depletion bar: a bottle counts down in tabs, a vial in its labeled unit -->
            <div class="mt-2.5">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-[12px]">
                  <span class="num-display text-[16px]">{{ remainingValue(vial, proj) }}</span>
                  <span class="text-muted"> / {{ remainingOf(vial) }}</span>
                </span>
                <span class="text-[11px] text-muted">{{ Math.round(proj.pct * 100) }}%</span>
              </div>
              <div class="h-1.5 bg-inset mt-1.5">
                <div
                  class="h-full transition-all"
                  :style="{ width: `${Math.max(2, proj.pct * 100)}%`, background: barColor(proj) }"
                />
              </div>
            </div>

            <!-- projection -->
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mt-2 text-[11.5px]">
              <span class="flex items-baseline gap-1.5">
                <span :class="daysLeftClass(proj)">{{ daysLeftText(proj) }}</span>
                <span
                  v-if="runOutText(proj)"
                  class="text-muted"
                >{{ runOutText(proj) }}</span>
              </span>
              <span
                v-if="rateText(vial, proj)"
                class="text-muted"
                :title="rateTitle(proj)"
              >{{ rateText(vial, proj) }}</span>
            </div>

            <p
              v-if="openedText(vial, proj)"
              class="mt-2 pt-2 border-t border-line-soft text-[11px] text-faint"
            >
              {{ openedText(vial, proj) }}
            </p>
          </div>
        </div>
      </section>

      <!-- Sealed stock -->
      <section v-if="sealedGroups.length">
        <TuiHeader
          :label="`SEALED STOCK · ${sealedCount}`"
          :dashes="3"
        >
          <span class="text-[10.5px] text-muted normal-case">open one to start tracking it</span>
        </TuiHeader>

        <div class="mt-2.5 space-y-3">
          <div
            v-for="group in sealedGroups"
            :key="group.compound"
          >
            <div class="flex items-baseline gap-2">
              <span
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :style="{ background: getCompoundColor(group.compound) }"
              />
              <span class="text-[12.5px] text-hi">{{ group.compound }}</span>
              <span class="text-[11px] text-muted">{{ group.total }} {{ group.noun }}</span>
            </div>

            <div class="mt-1.5 border border-line-soft">
              <div
                v-for="(row, i) in group.batches"
                :key="row.vial.id"
                class="group flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2.5 py-1.5 border-b border-line-soft last:border-0 hover:bg-[#101a15] transition-colors"
                :class="i % 2 ? 'bg-inset' : ''"
              >
                <span class="num-display text-[13px] shrink-0">{{ row.vial.quantity }}×</span>
                <span class="text-[12px] text-body shrink-0">{{ describeContents(row.vial) }}</span>
                <span
                  v-if="row.vial.supplier"
                  class="text-[11.5px] text-muted truncate"
                >{{ row.vial.supplier }}</span>
                <UBadge
                  v-if="row.expiryColor"
                  :color="row.expiryColor"
                  variant="subtle"
                  size="sm"
                  class="text-[10.5px] tracking-widest uppercase"
                >
                  {{ row.expiryText }}
                </UBadge>
                <span
                  v-else-if="row.expiryText"
                  class="text-[11px] text-muted"
                >{{ row.expiryText }}</span>

                <span class="ml-auto flex items-baseline gap-2.5 shrink-0">
                  <button
                    type="button"
                    class="text-[11px] text-accent hover:text-accent-hover cursor-pointer"
                    @click="openReconstituteModal(row.vial)"
                  >{{ isPillForm(row.vial.form) ? '▸ open' : '⚗ open' }}</button>
                  <button
                    type="button"
                    class="text-[11px] text-faint hover:text-accent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    :aria-label="`Edit ${row.vial.compound} ${containerNoun(row.vial.form)}`"
                    @click="openEditModal(row.vial)"
                  >edit</button>
                  <button
                    type="button"
                    class="text-[11px] text-faint hover:text-danger cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    :aria-label="`Delete ${row.vial.compound} ${containerNoun(row.vial.form)}`"
                    @click="confirmDelete(row.vial)"
                  >✕</button>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Finished -->
      <section v-if="finishedVials.length">
        <TuiHeader
          :label="`FINISHED · ${finishedVials.length}`"
          :dashes="9"
        >
          <button
            type="button"
            class="text-[11px] text-accent hover:text-accent-hover cursor-pointer"
            @click="showFinished = !showFinished"
          >
            {{ showFinished ? 'collapse ▴' : 'expand ▾' }}
          </button>
        </TuiHeader>

        <div
          v-if="showFinished"
          class="mt-1.5 border border-line-soft"
        >
          <div
            v-for="(vial, i) in finishedVials"
            :key="vial.id"
            class="group flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2.5 py-1.5 border-b border-line-soft last:border-0 hover:bg-[#101a15] transition-colors"
            :class="i % 2 ? 'bg-inset' : ''"
          >
            <span
              class="w-1.5 h-1.5 rounded-full shrink-0"
              :style="{ background: getCompoundColor(vial.compound) }"
            />
            <span class="text-[12px] text-dim truncate">{{ vial.compound }}</span>
            <span class="text-[11px] text-muted">{{ finishedMeta(vial) }}</span>

            <span class="ml-auto flex items-baseline gap-2.5 shrink-0">
              <button
                type="button"
                class="text-[11px] text-faint hover:text-accent cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                :aria-label="`Reactivate ${vial.compound} ${containerNoun(vial.form)}`"
                @click="reactivate(vial)"
              >↻ reactivate</button>
              <button
                type="button"
                class="text-[11px] text-faint hover:text-danger cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                :aria-label="`Delete ${vial.compound} ${containerNoun(vial.form)}`"
                @click="confirmDelete(vial)"
              >✕</button>
            </span>
          </div>
        </div>
      </section>

      <p class="text-[11px] text-faint">
        {{ GENERAL_DISCLAIMER }}
      </p>
    </div>

    <ToolsStockDump
      v-model:open="dumpOpen"
      @saved="refresh"
    />

    <!-- Add / Edit modal -->
    <UModal
      v-model:open="formModalOpen"
      :title="formTitle"
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="Compound"
            required
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              v-model="form.compound"
              list="inv-compounds"
              placeholder="BPC-157"
              class="w-full"
            />
            <datalist id="inv-compounds">
              <option
                v-for="c in KNOWN_COMPOUNDS"
                :key="c"
                :value="c"
              />
            </datalist>
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Form"
              :ui="{ label: 'tui-label' }"
            >
              <USelect
                v-model="form.form"
                :items="VIAL_FORMS"
                value-key="value"
                label-key="label"
                class="w-full"
                @update:model-value="formTouched = true"
              />
            </UFormField>
            <UFormField
              :label="quantityLabel"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                v-model.number="form.quantity"
                type="number"
                min="1"
                step="1"
                class="w-full"
              />
            </UFormField>
          </div>

          <!-- What one container holds. A vial is entered as its total; a pill bottle in label
               terms (strength × count), which becomes the bottle total on save. -->
          <div
            v-if="!isPill"
            class="grid grid-cols-2 gap-3"
          >
            <UFormField
              label="Vial size"
              required
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                v-model.number="form.vial_amount"
                type="number"
                min="0"
                step="0.1"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Unit"
              :ui="{ label: 'tui-label' }"
            >
              <USelect
                v-model="form.vial_unit"
                :items="DOSE_UNITS"
                value-key="value"
                label-key="label"
                class="w-full"
              />
            </UFormField>
          </div>
          <div
            v-else
            class="space-y-1.5"
          >
            <div class="grid grid-cols-3 gap-3">
              <UFormField
                :label="`Per ${pillWord}`"
                required
                :ui="{ label: 'tui-label' }"
              >
                <UInput
                  :model-value="pill.strength ?? undefined"
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="25"
                  class="w-full"
                  @update:model-value="setPillStrength"
                />
              </UFormField>
              <UFormField
                label="Unit"
                :ui="{ label: 'tui-label' }"
              >
                <USelect
                  v-model="form.vial_unit"
                  :items="DOSE_UNITS"
                  value-key="value"
                  label-key="label"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :label="`${cap(pillNoun(form.form, 2))} / bottle`"
                required
                :ui="{ label: 'tui-label' }"
              >
                <UInput
                  v-model.number="pill.count"
                  type="number"
                  min="1"
                  step="1"
                  class="w-full"
                />
              </UFormField>
            </div>
            <p class="text-[11px] text-muted leading-[1.6]">
              {{ pillHint }}
            </p>
          </div>

          <UFormField
            label="Supplier"
            :ui="{ label: 'tui-label' }"
          >
            <UInput
              :model-value="form.supplier ?? undefined"
              placeholder="e.g. Supplier X"
              class="w-full"
              @update:model-value="form.supplier = $event"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Lot #"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                :model-value="form.lot ?? undefined"
                class="w-full"
                @update:model-value="form.lot = $event"
              />
            </UFormField>
            <UFormField
              label="Expiry"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                :model-value="form.expiry ?? undefined"
                type="date"
                class="w-full"
                @update:model-value="form.expiry = $event"
              />
            </UFormField>
          </div>

          <!-- active-only fields (BAC water is a reconstitution detail — vials only) -->
          <div
            v-if="form.status === 'active'"
            class="grid grid-cols-2 gap-3"
          >
            <UFormField
              label="Opened"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                :model-value="form.opened_date ?? undefined"
                type="date"
                class="w-full"
                @update:model-value="form.opened_date = $event"
              />
            </UFormField>
            <UFormField
              v-if="!isPill"
              label="BAC water (mL)"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                :model-value="form.bac_water_ml ?? undefined"
                type="number"
                min="0"
                step="0.5"
                class="w-full"
                @update:model-value="form.bac_water_ml = $event"
              />
            </UFormField>
          </div>

          <UFormField
            label="Notes"
            :ui="{ label: 'tui-label' }"
          >
            <UTextarea
              :model-value="form.notes ?? undefined"
              :rows="2"
              class="w-full"
              @update:model-value="form.notes = $event"
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
              :disabled="!canSave"
              @click="saveVial"
            >
              Save
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Open modal: reconstitute a vial, or just start a pill bottle -->
    <UModal
      v-model:open="openModalOpen"
      :title="openTitle"
      :ui="{ content: 'bg-raised border border-line-accent ring-0' }"
    >
      <template #body>
        <div
          v-if="openTarget"
          class="space-y-4"
        >
          <p class="text-[12.5px] leading-[1.7] text-dim">
            {{ openLeadText }} <span class="text-hi">{{ openHighlight }}</span>
            {{ openTailText }}
          </p>
          <p
            v-if="reconstituteHint"
            class="text-[11.5px] text-muted border border-line-input bg-inset px-2.5 py-2"
          >
            ⚗ {{ reconstituteHint }}
          </p>

          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="Opened date"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                v-model="openForm.opened_date"
                type="date"
                class="w-full"
              />
            </UFormField>
            <UFormField
              v-if="!openIsPill"
              label="BAC water (mL)"
              :ui="{ label: 'tui-label' }"
            >
              <UInput
                v-model.number="openForm.bac_water_ml"
                type="number"
                min="0"
                step="0.5"
                class="w-full"
              />
            </UFormField>
          </div>

          <p class="text-[11.5px] text-muted leading-[1.7]">
            {{ openOutcomeText }}
          </p>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="tui-btn"
              @click="openModalOpen = false"
            >
              CANCEL
            </button>
            <UButton
              :loading="opening"
              :icon="openIsPill ? 'i-lucide-pill' : 'i-lucide-flask-conical'"
              @click="doOpen"
            >
              Open {{ containerNoun(openTarget.form) }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { getCompoundColor, KNOWN_COMPOUNDS, DOSE_UNITS, blankVial } from '~/data/journal'
import type { Vial } from '~/data/journal'
import { getCompoundInfo, GENERAL_DISCLAIMER } from '~/data/compoundInfo'
import {
  projectVial, roundAmount, isExpiringSoon, isExpired, defaultVialForm, type VialProjection
} from '~/utils/vialInventory'
import {
  VIAL_FORMS, isPillForm, containerNoun, pillNoun, pillStrength, pillTotal, pillsFromAmount,
  describeContents, stockNoun
} from '#shared/utils/vialForm'

definePageMeta({ middleware: 'journal-auth' })
useSeoMeta({ title: 'Tools · Inventory' })

const toast = useToast()
const today: string = new Date().toISOString().slice(0, 10)

// Stock-dump parsing spends Anthropic tokens — owner-only, like digests and lab summaries.
const { isOwner } = await useAuth()
const dumpOpen = ref(false)

const { data: vialsData, refresh, error } = await useVials()
const { data: journalData, refresh: refreshJournal } = await useJournalEntries()
onMounted(refresh)
onMounted(refreshJournal)

const vials = computed(() => vialsData.value ?? [])
const entries = computed(() => journalData.value ?? [])

const activeVials = computed(() => vials.value.filter(v => v.status === 'active'))
const sealedVials = computed(() => vials.value.filter(v => v.status === 'sealed'))
const finishedVials = computed(() => vials.value.filter(v => v.status === 'finished'))

const showFinished = ref(false)

const sealedCount = computed(() => sealedVials.value.reduce((s, v) => s + (v.quantity ?? 1), 0))

// Wording follows what's actually on the shelf: all vials → "vials", all pill bottles →
// "bottles", a mix → a neutral word.
const sealedNoun = computed(() => stockNoun(sealedVials.value))
const activeNoun = computed(() => stockNoun(activeVials.value, 'stock'))
const expiringNoun = computed(() => stockNoun(vials.value.filter(v => v.status !== 'finished')))

const activeProjections = computed(() =>
  activeVials.value
    .map(vial => ({ vial, proj: projectVial(vial, entries.value, today) }))
    .sort((a, b) => (a.proj.daysLeft ?? Infinity) - (b.proj.daysLeft ?? Infinity))
)

const nextToRunOut = computed(() =>
  activeProjections.value.find(p => p.proj.daysLeft != null) ?? null
)

const nextOutDays = computed(() => {
  const days = nextToRunOut.value?.proj.daysLeft
  return days == null ? null : Math.round(days)
})

const expiringCount = computed(() =>
  vials.value.filter(v => v.status !== 'finished' && (isExpired(v.expiry, today) || isExpiringSoon(v.expiry, today))).length
)

/** Expiry read-out for a sealed row: a colored badge when it needs attention, plain text otherwise. */
function expiryTag(v: Vial): { text: string, color: 'error' | 'warning' | null } {
  if (!v.expiry) return { text: '', color: null }
  if (isExpired(v.expiry, today)) return { text: 'expired', color: 'error' }
  const text = `exp ${formatDate(v.expiry, 'monthDay')}`
  return { text, color: isExpiringSoon(v.expiry, today) ? 'warning' : null }
}

const sealedGroups = computed(() => {
  const map = new Map<string, Vial[]>()
  for (const v of sealedVials.value) {
    const list = map.get(v.compound) ?? []
    list.push(v)
    map.set(v.compound, list)
  }
  return [...map.entries()]
    .map(([compound, batches]) => {
      const total = batches.reduce((s, b) => s + (b.quantity ?? 1), 0)
      return {
        compound,
        // Expiry state is resolved here so the dense rows stay free of branching markup.
        batches: batches.map(vial => ({ vial, ...expiryTagFields(vial) })),
        total,
        noun: groupNoun(batches, total)
      }
    })
    .sort((a, b) => a.compound.localeCompare(b.compound))
})

function expiryTagFields(v: Vial) {
  const { text, color } = expiryTag(v)
  return { expiryText: text, expiryColor: color }
}

// "3 vials" / "1 bottle" — or "units" when one compound is stocked both ways (oral + injectable).
function groupNoun(batches: Vial[], total: number): string {
  const mixed = new Set(batches.map(b => isPillForm(b.form))).size > 1
  if (mixed) return total === 1 ? 'unit' : 'units'
  return containerNoun(batches[0]?.form, total)
}

// --- display helpers ---
// Multi-part row strings are assembled here rather than as adjacent template blocks, which
// would lose the separating spaces to Vue's whitespace condensing.
function vialSpec(v: Vial): string {
  let spec = describeContents(v)
  if (v.bac_water_ml) spec += ` + ${v.bac_water_ml}mL`
  return v.supplier ? `${spec} · ${v.supplier}` : spec
}

// Active-row readout: a bottle counts down in tabs, a vial in its labeled unit.
function remainingValue(v: Vial, proj: VialProjection): number {
  return pillsFromAmount(v, proj.remaining) ?? roundAmount(proj.remaining)
}

function remainingOf(v: Vial): string {
  return pillStrength(v) != null
    ? `${v.unit_count} ${pillNoun(v.form, v.unit_count ?? 0)}`
    : `${v.vial_amount} ${v.vial_unit}`
}

function daysSinceOpened(v: Vial) {
  if (!v.opened_date) return 0
  return Math.floor((new Date(today + 'T12:00:00').getTime() - new Date(v.opened_date + 'T12:00:00').getTime()) / 86400000)
}

function daysLeftText(proj: VialProjection): string {
  return proj.daysLeft == null
    ? 'not enough data to project'
    : `~${Math.round(proj.daysLeft)} days left`
}

function runOutText(proj: VialProjection): string {
  return proj.runOutDate ? `· out ~${formatDate(proj.runOutDate, 'monthDay')}` : ''
}

function rateText(v: Vial, proj: VialProjection): string {
  if (!proj.dailyAmount) return ''
  const star = proj.basis === 'typical' ? '*' : ''
  const pills = pillsFromAmount(v, proj.dailyAmount)
  if (pills != null) return `${pills} ${pillNoun(v.form, pills === 1 ? 1 : 2)}/d${star}`
  return `${roundAmount(proj.dailyAmount)} ${v.vial_unit}/d${star}`
}

function openedText(v: Vial, proj: VialProjection): string {
  if (!v.opened_date) return ''
  const base = `opened ${formatDate(v.opened_date, 'monthDay')} · ${daysSinceOpened(v)}d ago`
  return proj.basis === 'typical' ? `${base} · *rate estimated from typical dosing` : base
}

function finishedMeta(v: Vial): string {
  const spec = describeContents(v)
  return v.opened_date ? `${spec} · opened ${formatDate(v.opened_date, 'monthDay')}` : spec
}

function barColor(proj: VialProjection) {
  if (proj.daysLeft != null && proj.daysLeft < 7) return '#e86a5e'
  if (proj.daysLeft != null && proj.daysLeft < 14) return '#e8b34b'
  return '#2ce8a4'
}

function daysLeftClass(proj: VialProjection) {
  if (proj.daysLeft == null) return 'text-muted'
  if (proj.daysLeft < 7) return 'text-danger'
  if (proj.daysLeft < 14) return 'text-warn'
  return 'text-accent'
}

function rateTitle(proj: VialProjection) {
  return proj.basis === 'typical'
    ? 'Estimated from typical dosing (not enough logged history yet)'
    : 'Based on your logged doses over the last 4 weeks'
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// --- add / edit ---
const formModalOpen = ref(false)
const saving = ref(false)
const form = reactive<Vial>(blankVial())
// Pill bottles are entered in label terms (strength × count) and stored as the bottle total in
// vial_amount, so the depletion/runway math never has to know about tablets.
const pill = reactive<{ strength: number | null, count: number }>({ strength: null, count: 100 })
// Once the form is picked by hand, the compound-based suggestion stops overriding it.
const formTouched = ref(false)

const isPill = computed(() => isPillForm(form.form))
const pillWord = computed(() => pillNoun(form.form))
const pillTotalAmount = computed(() =>
  pill.strength && pill.count > 0 ? pillTotal(pill.strength, pill.count) : null
)
const pillHint = computed(() =>
  pillTotalAmount.value == null
    ? `Strength printed on the label, per ${pillWord.value} — the bottle total is worked out from it.`
    : `= ${pillTotalAmount.value} ${form.vial_unit} per bottle · logged doses count it down one ${pillWord.value} at a time`
)
const quantityLabel = computed(() =>
  form.status === 'sealed' ? `${cap(containerNoun(form.form, 2))} on hand` : 'Qty'
)
const formTitle = computed(() => (form.id ? `Edit ${cap(containerNoun(form.form))}` : 'Add Stock'))
const canSave = computed(() =>
  !!form.compound && (isPill.value ? pillTotalAmount.value != null : form.vial_amount > 0)
)

// New stock: suggest the form from what the compound is (anavar → tablets) until set by hand.
watch(() => form.compound, (compound) => {
  if (form.id || formTouched.value) return
  form.form = defaultVialForm(compound)
})

function setPillStrength(value: unknown) {
  pill.strength = typeof value === 'number' && Number.isFinite(value) ? value : null
}

function openAddModal() {
  Object.assign(form, blankVial())
  delete form.id
  Object.assign(pill, { strength: null, count: 100 })
  formTouched.value = false
  formModalOpen.value = true
}
function openEditModal(v: Vial) {
  Object.assign(form, { ...blankVial(), ...v })
  Object.assign(pill, { strength: pillStrength(v) ?? v.vial_amount, count: v.unit_count ?? 1 })
  formTouched.value = true
  formModalOpen.value = true
}

// What gets saved: a bottle's vial_amount is recomputed from the label terms.
function formPayload(): Vial {
  if (!isPill.value) return { ...form, unit_count: null }
  return {
    ...form,
    unit_count: pill.count,
    vial_amount: pillTotal(pill.strength ?? 0, pill.count),
    bac_water_ml: null
  }
}

async function saveVial() {
  saving.value = true
  try {
    await $fetch('/api/journal/vials/save', { method: 'POST', body: formPayload() })
    await refresh()
    formModalOpen.value = false
    toast.add({
      title: form.id ? `${cap(containerNoun(form.form))} updated` : 'Stock added',
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// --- open / reconstitute ---
const openModalOpen = ref(false)
const opening = ref(false)
const openTarget = ref<Vial | null>(null)
const openForm = reactive<{ opened_date: string, bac_water_ml: number | null }>({ opened_date: today, bac_water_ml: 2 })

const openIsPill = computed(() => isPillForm(openTarget.value?.form))
const openTitle = computed(() => `Open ${cap(containerNoun(openTarget.value?.form))}`)

const reconstituteHint = computed(() =>
  openTarget.value && !openIsPill.value
    ? getCompoundInfo(openTarget.value.compound)?.reconstitution?.instructions ?? ''
    : ''
)

// "Reconstitute one 10mg BPC-157 vial from X." / "Start one Oxandrolone bottle (100 × 25mg tabs) from X."
const openLeadText = computed(() => (openIsPill.value ? 'Start one' : 'Reconstitute one'))

const openHighlight = computed(() => {
  const target = openTarget.value
  if (!target) return ''
  return openIsPill.value ? target.compound : `${target.vial_amount}${target.vial_unit} ${target.compound}`
})

const openTailText = computed(() => {
  const target = openTarget.value
  if (!target) return ''
  const container = openIsPill.value ? `bottle (${describeContents(target)})` : 'vial'
  return target.supplier ? `${container} from ${target.supplier}.` : `${container}.`
})

const openOutcomeText = computed(() => {
  const target = openTarget.value
  if (!target) return ''
  const remaining = (target.quantity ?? 1) > 1
    ? `${(target.quantity ?? 1) - 1} will remain sealed.`
    : 'This was your last sealed one.'
  const tracks = openIsPill.value ? `Remaining ${pillNoun(target.form, 2)} then track` : 'Remaining amount then tracks'
  return `Marks it active. ${tracks} automatically from doses of ${target.compound} you log on/after this date. ${remaining}`
})

function openReconstituteModal(v: Vial) {
  openTarget.value = v
  openForm.opened_date = today
  openForm.bac_water_ml = 2
  openModalOpen.value = true
}

async function doOpen() {
  if (!openTarget.value) return
  opening.value = true
  try {
    await $fetch('/api/journal/vials/open', {
      method: 'POST',
      body: {
        id: openTarget.value.id,
        opened_date: openForm.opened_date,
        bac_water_ml: openIsPill.value ? null : openForm.bac_water_ml
      }
    })
    await refresh()
    openModalOpen.value = false
    toast.add({
      title: `${cap(containerNoun(openTarget.value.form))} opened`,
      description: `${openTarget.value.compound} is now active`,
      color: 'success',
      icon: openIsPill.value ? 'i-lucide-pill' : 'i-lucide-flask-conical'
    })
  }
  catch (err) {
    toast.add({ title: 'Open failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
  finally {
    opening.value = false
  }
}

// --- status actions ---
const activeMenu = (v: Vial) => [
  [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEditModal(v) },
    // The calculator is a reconstitution tool — nothing to work out for a pill bottle.
    ...(isPillForm(v.form) ? [] : [{ label: 'Open in calculator', icon: 'i-lucide-calculator', to: calculatorLink(v) }])
  ],
  [
    { label: 'Mark finished', icon: 'i-lucide-check-check', onSelect: () => setStatus(v, 'finished') },
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => confirmDelete(v) }
  ]
]

function calculatorLink(v: Vial) {
  return {
    path: '/tools/calculator',
    query: { vialAmount: v.vial_amount, vialUnit: v.vial_unit, bacWaterMl: v.bac_water_ml ?? 2 }
  }
}

async function setStatus(v: Vial, status: Vial['status']) {
  try {
    await $fetch('/api/journal/vials/save', { method: 'POST', body: { ...v, status } })
    await refresh()
    toast.add({ title: status === 'finished' ? 'Marked finished' : 'Updated', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
}

function reactivate(v: Vial) {
  setStatus(v, 'active')
}

async function confirmDelete(v: Vial) {
  if (!confirm(`Delete this ${v.compound} ${containerNoun(v.form)}? This can't be undone.`)) return
  try {
    await $fetch('/api/journal/vials/delete', { method: 'POST', body: { id: v.id } })
    await refresh()
    toast.add({ title: 'Deleted', color: 'success', icon: 'i-lucide-check' })
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error', color: 'error' })
  }
}
</script>
