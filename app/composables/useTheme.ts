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
 * The active display preset. `theme` is always a valid id (an unknown or absent cookie value is
 * the default), so callers can index PRESETS with it. app.vue puts it on `<html>`; the CSS does
 * the rest — every color on the site is a `--color-*` token, and app/assets/css/themes.css
 * redefines them per `[data-theme]`.
 */
export function useTheme() {
  const prefs = useCookie<DisplayPrefs>('display', { default: () => ({}), maxAge: YEAR, sameSite: 'lax' })
  const theme = computed<ThemeId>(() => {
    const t = prefs.value?.theme
    return isThemeId(t) ? t : DEFAULT_THEME
  })
  const preset = computed(() => PRESETS[theme.value])

  function setTheme(id: ThemeId) {
    prefs.value = { ...prefs.value, theme: id }
  }

  return { theme, preset, presets: THEME_LIST, setTheme }
}
