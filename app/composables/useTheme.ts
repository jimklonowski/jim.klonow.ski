import { DEFAULT_THEME, PRESETS, THEME_LIST, isThemeId } from '#shared/utils/themePresets'
import type { ThemeId } from '#shared/utils/themePresets'
import { DEFAULT_FONT, FONT_LIST, isFontId } from '#shared/utils/displayFonts'
import type { FontId } from '#shared/utils/displayFonts'
import { DEFAULT_SCALE, SCALE_LIST, isScaleId } from '#shared/utils/displayScale'
import type { ScaleId } from '#shared/utils/displayScale'

/**
 * The `display` cookie. A cookie rather than localStorage so the server can render
 * `<html data-theme data-font data-scale>` on the first paint — a client-side pick would flash
 * phosphor on every load — and rather than a table so demo guests get it too and nothing follows
 * the owner between devices.
 */
interface DisplayPrefs {
  theme?: string
  font?: string
  scale?: string
}

const YEAR = 60 * 60 * 24 * 365

/**
 * The display preset, face and size. `theme`/`font`/`scale` are the kept choices (always valid
 * ids — an unknown or absent cookie value is the default), the `*Preview`s transient ones the
 * picker sets while a row is hovered, and `active*` whichever applies: app.vue puts them on
 * `<html>` and the CSS does the rest, since every color is a `--color-*` token, every face a
 * `--font-*` one and every size a `--text-*` one, and app/assets/css/themes.css redefines them
 * per `[data-theme]`/`[data-font]`/`[data-scale]`. State lives in useState so the header's picker
 * and app.vue see one value; the cookie is only read to seed it and written when a choice is kept.
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

  const scale = useState<ScaleId>('display-scale', () => {
    const s = cookie.value?.scale
    return isScaleId(s) ? s : DEFAULT_SCALE
  })
  const scalePreview = useState<ScaleId | null>('display-scale-preview', () => null)
  const activeScale = computed<ScaleId>(() => scalePreview.value ?? scale.value)

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

  function setScale(id: ScaleId) {
    scale.value = id
    cookie.value = { ...cookie.value, scale: id }
  }

  function previewScale(id: ScaleId | null) {
    scalePreview.value = id
  }

  return {
    theme, preview, active, preset, presets: THEME_LIST, setTheme, previewTheme,
    font, fontPreview, activeFont, fonts: FONT_LIST, setFont, previewFont,
    scale, scalePreview, activeScale, scales: SCALE_LIST, setScale, previewScale
  }
}
