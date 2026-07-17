# jim.klonow.ski

Personal health tracking site. Bloodwork trends, body composition, and a daily peptide/TRT journal, with AI-generated recaps and Whoop sync — all in one place.

## Stack

- **Nuxt 4** + Vue 3 + TypeScript
- **Nuxt UI v4** + Tailwind CSS v4
- **Cloudflare Workers** — deployed via Wrangler (nodejs_compat)
- **Cloudflare D1** — primary data store (journal, labs, DEXA, health metrics, workouts, vial inventory, digests)
- **Cloudflare R2** — original lab PDF storage
- **Cloudflare KV** — rate limiting
- **nuxt-charts** — trend charts
- **Anthropic SDK** — server-side lab PDF parsing, lab summaries, and daily/weekly health digests
- **Whoop API** — OAuth sync for recovery, sleep, and workout data

## Sections

| Route | Description |
|---|---|
| `/labs` | Bloodwork tracker — biomarker panels, trend charts, PDF uploads, AI-generated summaries |
| `/labs/dexa` | DEXA body composition scans |
| `/labs/upload` | Upload a new lab PDF (parsed server-side into structured markers) |
| `/journal` | Daily vitals, peptide dosing, streaks, 30/60/90d charts, digest panel |
| `/journal/[date]` | Create or edit a day's entry |
| `/journal/calendar` | Month view with compound-colored dots per day |
| `/journal/compound/[name]` | Dosing history for a single compound |
| `/journal/inventory` | Peptide vial inventory — sealed stock, active reconstitutions, remaining mg |
| `/journal/calculator` | Peptide reconstitution & syringe unit calculator |
| `/journal/import` | One-time Apple Health XML import + Health Auto Export auto-sync webhook |

## Data & integrations

- All entries (journal, labs, DEXA, health metrics, workouts, vials, digests) live in **D1** — see `server/database/schema.sql`.
- Lab PDFs are stored in **R2**; parsed marker data is written to D1 alongside a Claude-generated summary.
- **Whoop** OAuth sync (`server/api/whoop/*`, `server/tasks/whoop/sync.ts`) pulls recovery/sleep/workout data on a schedule into `health_metrics` and `workouts`.
- Scheduled **digests** (`server/tasks/digest/daily.ts`, `weekly.ts`) have Claude summarize the period's vitals, doses, sleep, and workouts into a short recap stored in the `digests` table and surfaced via `DigestPanel.vue`.
- Auth for `/labs/*` and `/journal/*` is a shared `labs-auth` cookie backed by `LABS_PASSWORD` / `LABS_SECRET` env vars (`server/middleware/labs-protect.ts`, `journal-protect.ts`).

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
