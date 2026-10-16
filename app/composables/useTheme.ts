import { DEFAULT_THEME, PRESETS, THEME_LIST, isThemeId } from '#shared/utils/themePresets'
import type { ThemeId } from '#shared/utils/themePresets'

/**
 * The `display` cookie. A cookie rather than localStorage so the server can render
 * `<html data-theme>` on the first paint — a client-side pick would flash phosphor on every load —
 * and rather than a table so demo guests get it too and nothing follows the owner between devices.
 * One object so the font and type scale can join it without another cookie.
 */
interface DisplayPrefs {
  theme?: string
}

const YEAR = 60 * 60 * 24 * 365

/**
 * The display preset. `theme` is the kept choice (always a valid id — an unknown or absent cookie
 * value is the default), `preview` a transient one the picker sets while a row is hovered, and
 * `active` whichever applies: app.vue puts it on `<html>` and the CSS does the rest, since every
 * color on the site is a `--color-*` token and app/assets/css/themes.css redefines them per
 * `[data-theme]`. State lives in useState so the header's picker and app.vue see one value;
 * the cookie is only read to seed it and written when a choice is kept.
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

  function setTheme(id: ThemeId) {
    theme.value = id
    cookie.value = { ...cookie.value, theme: id }
  }

  /** Show a preset without keeping it; `null` goes back to the kept one. */
  function previewTheme(id: ThemeId | null) {
    preview.value = id
  }

  return { theme, preview, active, preset, presets: THEME_LIST, setTheme, previewTheme }
}
