<template>
  <!-- The DISPLAY chip in the header and its popover: a row per color preset, each drawn in its
       own colors, and a row per face, each set in its own face, so a choice can be read before it
       is made. Hovering a row previews it on the whole page (useTheme's previews), clicking keeps
       it (the `display` cookie, per device). -->
  <!-- Pinned to type scale 1 like the panel: the chip is the popover's anchor, and if it grew with
       a SIZE preview the whole panel would shift under the pointer. -->
  <div class="shrink-0 [--type-scale:1] [--type-scale-display:1]">
    <UPopover
      v-model:open="open"
      :content="{ side: 'bottom', align: 'end', sideOffset: 8, collisionPadding: 12 }"
      :ui="{ content: 'p-0' }"
    >
      <button
        type="button"
        class="flex items-center gap-1.5 text-micro tracking-[0.08em] text-faint border border-line-input px-2 py-1.5 hover:text-accent hover:border-line-accent transition-colors"
        title="Display preset"
      >
        <span
          class="w-2 h-2 bg-accent shrink-0"
          aria-hidden="true"
        />
        DISPLAY
      </button>

      <template #content>
        <!-- Capped at the popper's available height so a landscape phone scrolls the list rather
             than losing the bottom of it. The panel pins its own type scale to 1: previewing a
             SIZE must change the page behind it, not the rows under the pointer — otherwise a
             hover re-flows the list, the row under the cursor changes, and the pick lands on the
             wrong step (or the preview oscillates at a row boundary). -->
        <div
          class="w-92 max-w-[calc(100vw-1.5rem)] max-h-(--reka-popper-available-height) overflow-y-auto px-3.5 py-3 [--type-scale:1] [--type-scale-display:1]"
          @mouseleave="clearPreviews"
        >
          <TuiHeader
            label="DISPLAY"
            :dashes="10"
          >
            <span class="text-micro text-faint">{{ items.length }} presets</span>
          </TuiHeader>

          <!-- Keyboard: the arrow keys move focus between the (sr-only) radios without checking
               them, so a focused row previews like a hovered one; Space or Enter keeps it. -->
          <URadioGroup
            :model-value="theme"
            :items="items"
            legend="Display preset"
            variant="list"
            indicator="hidden"
            size="sm"
            class="mt-2"
            :ui="RADIO_UI"
            @focusin="onFocusIn"
            @update:model-value="choose"
          >
            <template #label="{ item, modelValue }">
              <span
                class="flex items-center gap-2.5 px-2 py-1.5"
                @mouseenter="previewTheme(item.value)"
              >
                <!-- The preset's own surface, border and status trio, whatever the page is showing. -->
                <span
                  class="flex items-center justify-center gap-0.5 w-7 h-3.5 border shrink-0"
                  :style="{ background: item.tokens.bg, borderColor: item.tokens['line-accent'] }"
                  aria-hidden="true"
                >
                  <span
                    v-for="k in SWATCH"
                    :key="k"
                    class="w-1.5 h-1.5"
                    :style="{ background: item.tokens[k] }"
                  />
                </span>
                <!-- A fixed name column (SOURCE CODE PRO at 11px tracked = 112px) so the blurbs
                     line up as a column too, across both groups. -->
                <span
                  class="w-29 shrink-0 text-meta font-medium tracking-[0.08em] uppercase"
                  :class="modelValue === item.value ? 'text-accent' : 'text-body'"
                >{{ item.label }}</span>
                <span class="text-micro text-muted truncate min-w-0">{{ item.description }}</span>
                <span
                  class="ml-auto shrink-0 text-micro"
                  :class="modelValue === item.value ? 'text-accent' : 'text-ghost'"
                  aria-hidden="true"
                >{{ modelValue === item.value ? '●' : '○' }}</span>
              </span>
            </template>
          </URadioGroup>

          <TuiHeader
            label="FONT"
            :dashes="10"
            class="mt-3.5"
          >
            <span class="text-micro text-faint">{{ fontItems.length }} faces</span>
          </TuiHeader>

          <URadioGroup
            :model-value="font"
            :items="fontItems"
            legend="Font"
            variant="list"
            indicator="hidden"
            size="sm"
            class="mt-2"
            :ui="RADIO_UI"
            @focusin="onFontFocusIn"
            @update:model-value="chooseFont"
          >
            <template #label="{ item, modelValue }">
              <!-- Set in its own face, so the row is its own specimen (and the alternates only
                   download when this panel is open). -->
              <span
                class="flex items-center gap-2.5 px-2 py-1.5"
                :style="{ fontFamily: item.stack }"
                @mouseenter="previewFont(item.value)"
              >
                <span
                  class="w-7 shrink-0 text-center text-small text-hi"
                  aria-hidden="true"
                >Aa</span>
                <span
                  class="w-29 shrink-0 text-meta font-medium tracking-[0.08em] uppercase"
                  :class="modelValue === item.value ? 'text-accent' : 'text-body'"
                >{{ item.label }}</span>
                <span class="text-micro text-muted truncate min-w-0">{{ item.description }}</span>
                <span
                  class="ml-auto shrink-0 text-micro"
                  :class="modelValue === item.value ? 'text-accent' : 'text-ghost'"
                  aria-hidden="true"
                >{{ modelValue === item.value ? '●' : '○' }}</span>
              </span>
            </template>
          </URadioGroup>

          <TuiHeader
            label="SIZE"
            :dashes="10"
            class="mt-3.5"
          >
            <span class="text-micro text-faint">{{ scaleItems.length }} steps</span>
          </TuiHeader>

          <URadioGroup
            :model-value="scale"
            :items="scaleItems"
            legend="Text size"
            variant="list"
            indicator="hidden"
            size="sm"
            class="mt-2"
            :ui="RADIO_UI"
            @focusin="onScaleFocusIn"
            @update:model-value="chooseScale"
          >
            <template #label="{ item, modelValue }">
              <span
                class="flex items-center gap-2.5 px-2 py-1.5"
                @mouseenter="previewScale(item.value)"
              >
                <!-- The specimen at the step's own size: the body size times its factor. -->
                <span
                  class="w-7 shrink-0 text-center text-hi leading-none"
                  :style="{ fontSize: `${13 * item.factor}px` }"
                  aria-hidden="true"
                >Aa</span>
                <span
                  class="w-29 shrink-0 text-meta font-medium tracking-[0.08em] uppercase"
                  :class="modelValue === item.value ? 'text-accent' : 'text-body'"
                >{{ item.label }}</span>
                <span class="text-micro text-muted truncate min-w-0">{{ item.description }}</span>
                <span
                  class="ml-auto shrink-0 text-micro"
                  :class="modelValue === item.value ? 'text-accent' : 'text-ghost'"
                  aria-hidden="true"
                >{{ modelValue === item.value ? '●' : '○' }}</span>
              </span>
            </template>
          </URadioGroup>

          <p class="mt-2.5 text-micro text-faint">
            hover or ↑↓ previews · click or space keeps · saved on this device
          </p>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
import type { ThemeId, TokenKey } from '#shared/utils/themePresets'
import type { FontId } from '#shared/utils/displayFonts'
import type { ScaleId } from '#shared/utils/displayScale'

const {
  theme, presets, setTheme, previewTheme,
  font, fonts, setFont, previewFont,
  scale, scales, setScale, previewScale
} = useTheme()

const open = ref(false)
// Closing by any route (Escape, outside click, a pick) must drop a hover preview, or the page
// would stay on a preset the cookie never got.
watch(open, (isOpen) => {
  if (!isOpen) clearPreviews()
})

function clearPreviews() {
  previewTheme(null)
  previewFont(null)
  previewScale(null)
}

// Both groups as TUI lists. The radio itself is sr-only (indicator hidden) and the label block is
// the whole row. min-w-0 on the fieldset: a <fieldset> refuses to shrink below its widest nowrap
// child by default, which would let the rows run past the panel instead of the blurbs truncating.
// text-left undoes the centring the hidden-indicator variant applies.
const RADIO_UI = {
  legend: 'sr-only',
  fieldset: 'gap-y-0 -mx-2 min-w-0',
  item: 'w-full has-data-[state=checked]:bg-nav-active hover:bg-row-hover transition-colors',
  wrapper: 'block w-full min-w-0 text-left',
  label: 'block w-full cursor-pointer',
  description: 'hidden'
}

const SWATCH: TokenKey[] = ['accent', 'warn', 'danger']

const items = computed(() => presets.map(p => ({
  value: p.id,
  label: p.label,
  description: p.blurb,
  tokens: p.tokens
})))

const fontItems = computed(() => fonts.map(f => ({
  value: f.id,
  label: f.label,
  description: f.blurb,
  stack: f.stack
})))

const scaleItems = computed(() => scales.map(s => ({
  value: s.id,
  label: s.label,
  description: s.blurb,
  factor: s.factor
})))

function choose(value: unknown) {
  setTheme(value as ThemeId)
  previewTheme(null)
}

function chooseFont(value: unknown) {
  setFont(value as FontId)
  previewFont(null)
}

/** A radio taking focus (arrow keys, Tab) previews its preset; the radio carries the id as `value`. */
function onFocusIn(e: FocusEvent) {
  const value = (e.target as HTMLElement | null)?.getAttribute('value')
  if (value && value !== theme.value) previewTheme(value as ThemeId)
}

function onFontFocusIn(e: FocusEvent) {
  const value = (e.target as HTMLElement | null)?.getAttribute('value')
  if (value && value !== font.value) previewFont(value as FontId)
}

function chooseScale(value: unknown) {
  setScale(value as ScaleId)
  previewScale(null)
}

function onScaleFocusIn(e: FocusEvent) {
  const value = (e.target as HTMLElement | null)?.getAttribute('value')
  if (value && value !== scale.value) previewScale(value as ScaleId)
}
</script>
