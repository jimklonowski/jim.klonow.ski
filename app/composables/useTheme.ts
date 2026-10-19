import { DEFAULT_THEME, PRESETS, THEME_LIST, isThemeId } from '#shared/utils/themePresets'
import type { ThemeId } from '#shared/utils/themePresets'
import { DEFAULT_FONT, FONTS, FONT_LIST, isFontId } from '#shared/utils/displayFonts'
import type { FontId } from '#shared/utils/displayFonts'

/**
 * The `display` cookie. A cookie rather than localStorage so the server can render
 * `<html data-theme data-font>` on the first paint — a client-side pick would flash phosphor on
 * every load — and rather than a table so demo guests get it too and nothing follows the owner
 * between devices. One object so the type scale can join it without another cookie.
 */
interface DisplayPrefs {
  theme?: string
  font?: string
}

const YEAR = 60 * 60 * 24 * 365

/**
 * The display preset and face. `theme`/`font` are the kept choices (always valid ids — an unknown
 * or absent cookie value is the default), `preview`/`fontPreview` transient ones the picker sets
 * while a row is hovered, and `active`/`activeFont` whichever applies: app.vue puts them on
 * `<html>` and the CSS does the rest, since every color is a `--color-*` token and every face a
 * `--font-*` one, and app/assets/css/themes.css redefines them per `[data-theme]`/`[data-font]`.
 * State lives in useState so the header's picker and app.vue see one value; the cookie is only
 * read to seed it and written when a choice is kept.
 */
export function useTheme() {
  const cookie = useCookie<DisplayPrefs>('display', { default: () => ({}), maxAge: YEAR, sameSite: 'lax' })

  const theme = useState<ThemeId>('display-theme', () => {
    const t = cookie.value?.theme
    return isThemeId(t) ? t : DEFAULT_THEME
  })
  const preview = useState<ThemeId | null>('display-preview', () => null)
  const active = computed<ThemeId>(() => preview.value ?? theme.value)
  const preset = computed(() => PRESETS[active.value])

  const font = useState<FontId>('display-font', () => {
    const f = cookie.value?.font
    return isFontId(f) ? f : DEFAULT_FONT
  })
  const fontPreview = useState<FontId | null>('display-font-preview', () => null)
  const activeFont = computed<FontId>(() => fontPreview.value ?? font.value)
  /** The active face's `font-family` value, for script that needs the font as a string: echarts
   * measures its labels with canvas measureText, which cannot resolve a var(). */
  const fontStack = computed(() => FONTS[activeFont.value].stack)

  function setTheme(id: ThemeId) {
    theme.value = id
    cookie.value = { ...cookie.value, theme: id }
  }

  /** Show a preset without keeping it; `null` goes back to the kept one. */
  function previewTheme(id: ThemeId | null) {
    preview.value = id
  }

  function setFont(id: FontId) {
    font.value = id
    cookie.value = { ...cookie.value, font: id }
  }

  function previewFont(id: FontId | null) {
    fontPreview.value = id
  }

  return {
    theme, preview, active, preset, presets: THEME_LIST, setTheme, previewTheme,
    font, fontPreview, activeFont, fontStack, fonts: FONT_LIST, setFont, previewFont
  }
}
