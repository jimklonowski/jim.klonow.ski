// Nuxt UI's `outline` fields default to `bg-default`, which is the same near-black as the
// page — so a field only became visible on hover. Giving them the raised surface makes them
// read as wells; the brighter ring comes from --ui-border-accented in main.css.
const FIELD_OUTLINE = 'text-highlighted bg-raised ring ring-inset ring-accented'

// Every floating panel (modals, menus, popovers, select dropdowns) is the raised surface with
// the accent border. Nuxt UI's default is `bg-default`, the page's own near-black, plus a soft
// ring, so an open menu barely separated from the page behind it. This was pasted onto 24
// components one `:ui` prop at a time; 17 selects never got it and still had the flat look.
const PANEL = 'bg-raised border border-line-accent ring-0'

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'phosphor',
      secondary: 'indigo',
      warning: 'amber',
      error: 'red',
      neutral: 'mist',
      success: 'phosphor'
    },
    contextMenu: { slots: { content: PANEL } },
    // Menus read at 12px across the site; the md size's text-sm lives in the size variant.
    dropdownMenu: { slots: { content: PANEL }, variants: { size: { md: { item: 'text-[12px]' } } } },
    // Every form label is the uppercase TUI label.
    formField: { slots: { label: 'tui-label' } },
    input: { variants: { variant: { outline: FIELD_OUTLINE } } },
    inputMenu: { slots: { content: PANEL }, variants: { variant: { outline: FIELD_OUTLINE } } },
    inputNumber: { variants: { variant: { outline: FIELD_OUTLINE } } },
    // The modal's ring comes from its `fullscreen: false` variant, which lands after the slot
    // classes, so `ring-0` has to be restated there or the variant's `ring` would win.
    modal: { slots: { content: PANEL }, variants: { fullscreen: { false: { content: 'ring-0' } } } },
    popover: { slots: { content: PANEL } },
    select: { slots: { content: PANEL }, variants: { variant: { outline: FIELD_OUTLINE } } },
    selectMenu: { slots: { content: PANEL }, variants: { variant: { outline: FIELD_OUTLINE } } },
    textarea: { variants: { variant: { outline: FIELD_OUTLINE } } }
  }
})
