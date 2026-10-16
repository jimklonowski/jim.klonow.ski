// Writes app/assets/css/themes.css — one `html[data-theme]` block per non-default preset — from
// shared/utils/themePresets.ts. Run it as `pnpm theme:css` after editing a preset. The file is
// committed (Tailwind needs a real file to @import), and tests/theme.test.mjs compares it to the
// generator, so a stale copy fails `pnpm check` rather than shipping.
import { readFileSync, writeFileSync } from 'node:fs'
import { themesCss } from '../../shared/utils/themePresets.ts'

const target = new URL('../../app/assets/css/themes.css', import.meta.url)
const next = themesCss()

let current = ''
try {
  current = readFileSync(target, 'utf8')
}
catch {
  // first run
}

// Compared with line endings normalised: git's autocrlf gives a Windows checkout CRLF, and that
// must not read as a stale file (or rewrite it to LF on every run).
if (current.replace(/\r\n/g, '\n') === next) {
  console.log('app/assets/css/themes.css is up to date')
}
else {
  writeFileSync(target, next)
  console.log('wrote app/assets/css/themes.css')
}
