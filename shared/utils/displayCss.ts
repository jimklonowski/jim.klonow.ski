import { themesCss } from './themePresets.ts'
import { fontsCss } from './displayFonts.ts'
import { scalesCss } from './displayScale.ts'

/**
 * app/assets/css/themes.css in full: the color presets' `html[data-theme]` blocks, then the
 * faces' `html[data-font]` blocks, then the size steps' `html[data-scale]` blocks.
 * scripts/theme/build-themes-css.mjs writes it and tests/theme.test.mjs holds the file to it.
 */
export function displayCss(): string {
  return `${themesCss()}\n${fontsCss()}\n${scalesCss()}`
}
