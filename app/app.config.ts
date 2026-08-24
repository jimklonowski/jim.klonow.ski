// Nuxt UI's `outline` fields default to `bg-default`, which is the same near-black as the
// page — so a field only became visible on hover. Giving them the raised surface makes them
// read as wells; the brighter ring comes from --ui-border-accented in main.css.
const FIELD_OUTLINE = 'text-highlighted bg-raised ring ring-inset ring-accented'

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
    input: { variants: { variant: { outline: FIELD_OUTLINE } } },
    textarea: { variants: { variant: { outline: FIELD_OUTLINE } } },
    select: { variants: { variant: { outline: FIELD_OUTLINE } } },
    selectMenu: { variants: { variant: { outline: FIELD_OUTLINE } } },
    inputMenu: { variants: { variant: { outline: FIELD_OUTLINE } } },
    inputNumber: { variants: { variant: { outline: FIELD_OUTLINE } } }
  }
})
