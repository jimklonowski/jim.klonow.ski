<template>
  <!-- The DISPLAY chip in the header and its popover: one row per preset, each drawn in its own
       colors so the choice can be read before it is made. Hovering a row previews it on the whole
       page (useTheme's `preview`), clicking keeps it (the `display` cookie, per device). -->
  <div class="shrink-0">
    <UPopover
      v-model:open="open"
      :content="{ side: 'bottom', align: 'end', sideOffset: 8, collisionPadding: 12 }"
      :ui="{ content: 'p-0' }"
    >
      <button
        type="button"
        class="flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-faint border border-line-input px-2 py-1.5 hover:text-accent hover:border-line-accent transition-colors"
        title="Display preset"
      >
        <span
          class="w-2 h-2 bg-accent shrink-0"
          aria-hidden="true"
        />
        DISPLAY
      </button>

      <template #content>
        <div
          class="w-92 max-w-[calc(100vw-1.5rem)] px-3.5 py-3"
          @mouseleave="previewTheme(null)"
        >
          <TuiHeader
            label="DISPLAY"
            :dashes="10"
          >
            <span class="text-[10px] text-faint">{{ items.length }} presets</span>
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
            :ui="{
              legend: 'sr-only',
              // min-w-0: a <fieldset> refuses to shrink below its widest nowrap child by default,
              // which would let the rows run past the panel instead of the blurbs truncating.
              fieldset: 'gap-y-0 -mx-2 min-w-0',
              item: 'w-full has-data-[state=checked]:bg-nav-active hover:bg-row-hover transition-colors',
              // The radio itself is sr-only (indicator hidden); the label block is the whole row.
              // text-left undoes the centring the hidden-indicator variant applies.
              wrapper: 'block w-full min-w-0 text-left',
              label: 'block w-full cursor-pointer',
              description: 'hidden'
            }"
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
                <!-- A fixed name column (EMKAY INVERTED at 11px tracked = 105px) so the blurbs
                     line up as a column too. -->
                <span
                  class="w-27 shrink-0 text-[11px] font-medium tracking-[0.08em] uppercase"
                  :class="modelValue === item.value ? 'text-accent' : 'text-body'"
                >{{ item.label }}</span>
                <span class="text-[10px] text-muted truncate min-w-0">{{ item.description }}</span>
                <span
                  class="ml-auto shrink-0 text-[10px]"
                  :class="modelValue === item.value ? 'text-accent' : 'text-ghost'"
                  aria-hidden="true"
                >{{ modelValue === item.value ? '●' : '○' }}</span>
              </span>
            </template>
          </URadioGroup>

          <p class="mt-2.5 text-[10px] text-faint">
            hover or ↑↓ previews · click or space keeps · saved on this device
          </p>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
import type { ThemeId, TokenKey } from '#shared/utils/themePresets'

const { theme, presets, setTheme, previewTheme } = useTheme()

const open = ref(false)
// Closing by any route (Escape, outside click, a pick) must drop a hover preview, or the page
// would stay on a preset the cookie never got.
watch(open, (isOpen) => {
  if (!isOpen) previewTheme(null)
})

const SWATCH: TokenKey[] = ['accent', 'warn', 'danger']

const items = computed(() => presets.map(p => ({
  value: p.id,
  label: p.label,
  description: p.blurb,
  tokens: p.tokens
})))

function choose(value: unknown) {
  setTheme(value as ThemeId)
  previewTheme(null)
}

/** A radio taking focus (arrow keys, Tab) previews its preset; the radio carries the id as `value`. */
function onFocusIn(e: FocusEvent) {
  const value = (e.target as HTMLElement | null)?.getAttribute('value')
  if (value && value !== theme.value) previewTheme(value as ThemeId)
}
</script>
