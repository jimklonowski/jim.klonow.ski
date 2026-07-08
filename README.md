# jim.klonow.ski

Personal health tracking site. Bloodwork trends, peptide journal, body composition — all in one place.

## Stack

- **Nuxt 4** + Vue 3 + TypeScript
- **Nuxt UI v4** + Tailwind CSS v4
- **@nuxt/content** — JSON data files for labs, DEXA, and journal entries
- **nuxt-charts** — trend charts
- **Anthropic SDK** — server-side PDF parsing for lab uploads
- **Cloudflare Workers** — deployed via Wrangler

## Sections

| Route | Description |
|---|---|
| `/labs` | Bloodwork tracker — biomarker panels, trend charts, PDF uploads |
| `/labs/dexa` | DEXA body composition scans |
| `/journal` | Daily vitals, peptide dosing, streaks, 30/60/90d charts |
| `/journal/calculator` | Peptide reconstitution & syringe unit calculator |

## Dev

```bash
pnpm install
pnpm dev        # https://local.emkay.com:3000 (requires local TLS cert in certs/)
pnpm typecheck
pnpm lint
```

## Deploy

```bash
pnpm deploy     # nuxt build + wrangler deploy
pnpm preview    # local Wrangler Workers emulator
```
