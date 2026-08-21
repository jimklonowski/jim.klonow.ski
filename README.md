# jim.klonow.ski

Personal health tracking site. Bloodwork trends, body composition, and a daily peptide/TRT journal, with AI-generated recaps, Whoop sync, and role-based sharing — all in one place.

## Stack

- **Nuxt 4** + Vue 3 + TypeScript
- **Nuxt UI v4** + Tailwind CSS v4
- **Cloudflare Workers** — deployed via Wrangler (nodejs_compat)
- **Cloudflare D1** — primary data store (journal, labs, DEXA, health metrics, workouts, digests, share invites)
- **Cloudflare R2** — lab PDF and progress photo storage
- **Cloudflare KV** — rate limiting
- **nuxt-echarts** — trend charts
- **Anthropic SDK** — server-side lab PDF parsing, protocol-aware lab summaries, and daily/weekly health digests
- **Whoop API** — OAuth sync for recovery, sleep, and workout data

## Sections

| Route | Description |
|---|---|
| `/labs` | Bloodwork tracker — biomarker panels, trend charts, PDF sources, regenerable AI summaries |
| `/labs/dexa` | DEXA body composition scans |
| `/labs/upload` | Upload a new lab PDF (parsed server-side into structured markers) — owner only |
| `/labs/sharing` | Mint, list, and revoke share links — owner only |
| `/share/[token]` | Public landing that exchanges a share link for a role session |
| `/journal` | Daily vitals, peptide dosing, streaks, 30/60/90d charts, section jump-nav, digest panel |
| `/journal/[date]` | Create or edit a day's entry (read-only for guests) |
| `/journal/calendar` | Month view with compound-colored dots + protocol timeline |
| `/journal/photos` | Progress photos — bulk upload, before/after compare slider, reframing |
| `/journal/compound/[name]` | Dosing history for a single compound |
| `/journal/calculator` | Peptide reconstitution & syringe unit calculator |
| `/journal/import` | One-time Apple Health XML import + Health Auto Export auto-sync webhook — owner only |
| `/journal/inventory` | Peptide vial inventory (parked — page exists but is unlinked) |

## Auth & sharing

Cookie sessions are HMAC-signed tokens (key: `LABS_SECRET`) carrying one of three roles:

- **owner** — logs in with `LABS_PASSWORD`; full read/write. Writes to lab data additionally require a 9-digit `LABS_UPLOAD_PIN` (second-factor cookie, 12h).
- **friend** — read-only mirror of the whole site.
- **doctor** — clinical slice only: labs, DEXA, vitals/protocol trends. Daily entries, notes, sodas, photos, and digests are blocked (notes/sodas are stripped server-side).

Guests never get a password: the owner mints **share links** (`/share/<token>`) from `/labs/sharing`, each with a role, redemption expiry, and use limit, backed by the `invites` D1 table. Revoking a link also invalidates every session minted from it — guest requests re-check invite liveness. Sign-out lives in the header.

Enforcement is layered: `server/middleware/auth.ts` verifies the cookie once per request and gates page navigation, `shared/utils/access.ts` holds the role→page policy shared with the client route middleware, and every API handler asserts its own requirement (`requireLabsAuth` / `requireOwner` / `requireRole` in `server/utils/auth.ts`).

The Apple Health webhook authenticates with a `WEBHOOK_TOKEN` bearer token (falls back to `LABS_SECRET` until set).

## Data & integrations

- All entries (journal, labs, DEXA, health metrics, workouts, vials, digests, invites) live in **D1** — see `server/database/schema.sql`.
- Lab PDFs and progress photos are stored in **R2**, served through authenticated proxy routes; parsed marker data is written to D1 alongside a Claude-generated summary.
- **Whoop** OAuth sync (`server/api/whoop/*`, `server/tasks/whoop/sync.ts`) pulls recovery/sleep/workout data on a schedule into `health_metrics` and `workouts`.
- Scheduled **digests** (`server/tasks/digest/daily.ts`, `weekly.ts`) have Claude summarize the period's vitals, doses, sleep, and workouts — anchored to protocol change-points detected from the dose log (`server/utils/trends.ts`) — into a short recap stored in the `digests` table and surfaced via `DigestPanel.vue`.
- The **AI lab summary** (`server/api/labs/generate-summary.post.ts`) compares each draw against prior draws with protocol context (current compounds + recent start/stop events) and can be regenerated from the labs dashboard.

## Dev

```bash
pnpm install
pnpm dev            # https://local.emkay.com:3000 (requires local TLS cert in certs/)
pnpm typecheck
pnpm lint
pnpm sync:local     # mirror prod -> local: D1 dump/import + R2 objects (stop dev server first)
pnpm sync:local:r2  # top up local R2 objects only (PDFs/photos referenced by local D1)
```

## Deploy

```bash
pnpm deploy     # nuxt build + wrangler deploy
pnpm preview    # local Wrangler Workers emulator
```

Schema changes (new tables in `server/database/schema.sql`) must be applied to remote D1 before deploying:

```bash
npx wrangler d1 execute jim-klonow-ski-db --remote --file server/database/schema.sql
```
