# FinScanix

AI-powered verification of vendor invoices and quotations for construction and
facilities management. Line items are extracted from uploaded documents,
benchmarked against government Schedule of Rates and live market pricing, and
reported as **over-priced, under-priced or at par** with the evidence attached.

Built to the [FinScanix PRD](./FinScanix_PRD.md).

> **Status.** Feature-complete against the PRD and deployed. Documents are
> really uploaded, stored, parsed, matched and priced; every action on every
> screen writes to the database. Four integrations are code-complete but
> inactive because their credentials are not set on this deployment — see
> [What is real, and what is waiting on a key](#what-is-real-and-what-is-waiting-on-a-key).

---

## Deployed

<https://finscanix-production.up.railway.app>

Running on Railway (`finscanix` web service in the `harmonious-simplicity`
project) against **Supabase Postgres** for data and **Supabase Storage** for the
uploaded documents themselves. Migrations run on every release via the start
command in [railway.json](./railway.json).

The deployment is seeded with the demo dataset. Its sign-in password is **not**
the one below — it was set separately via `SEED_PASSWORD` so a public URL does
not carry a password that is published in this file.

---

## Running it

```bash
npm install
```

```bash
cp .env.example .env
```

Point `DATABASE_URL` at a Postgres instance. There is no SQLite fallback: the
deployment target's filesystem is ephemeral, so the schema targets Postgres
everywhere to keep dev and production honest.

Against Supabase, `DATABASE_URL` is the **transaction pooler** (port 6543, with
`pgbouncer=true`) and `DIRECT_URL` is the **session pooler** (port 5432) used
only by Prisma Migrate. The pooler is not optional in deployment: Supabase's
direct endpoint is IPv6-only and most container platforms egress IPv4.

```bash
npx prisma migrate dev
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Then open <http://localhost:3000>.

### Demo accounts

The seed creates one organisation with users covering every role. **Password for
all of them: `FinScanix#Demo2026`** (override with `SEED_PASSWORD`). These are
development fixtures — they do not exist outside your local database.

| Email | Role | What it demonstrates |
|---|---|---|
| `asif@meridian-infra.in` | Owner | Everything, including billing |
| `priya.nair@meridian-infra.in` | Admin | Rate library and users, no billing |
| `rahul.verma@meridian-infra.in` | Estimator | Upload and correct; no admin screens |
| `ananya.iyer@meridian-infra.in` | Auditor | Read and export only |
| `sneha.k@meridian-infra.in` | Viewer | Read only, cannot upload or export |

### Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:seed` | Reload the demo dataset |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run db:studio` | Browse the database |

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 | One codebase for marketing site, app and server actions. |
| Language | TypeScript (strict) | The domain model is the contract between the data layer and every screen. |
| Database | Prisma + Supabase Postgres | One engine in dev and production; Supavisor pooling for container runtimes. |
| File storage | Supabase Storage over the REST API | Keyed `<org>/<invoice>/<file>`, so deletion is a safe prefix operation. Called with `fetch`, not `@supabase/supabase-js`, whose realtime client needs a `WebSocket` global Node 20 does not have. |
| Documents | `unpdf` text layer, Claude vision for scans | The text layer is exact where it exists; OCR is the fallback, and says so. |
| Exports | `exceljs`, `pdfkit` | Both declared in `serverExternalPackages` — webpack otherwise rewrites pdfkit's font paths and it cannot find Helvetica at runtime. |
| Auth | Hand-rolled sessions, scrypt hashing | No dependency, no JWT revocation problem; sessions are rows, so sign-out really signs out. |
| Styling | Tailwind CSS v4 with CSS-variable tokens | Light/dark from one token set. |
| Charts | Hand-built SVG | Simple shapes; no charting dependency, colours bound to the theme tokens. |

---

## Where things live

```
prisma/
  schema.prisma         data model
  seed.ts               demo dataset, keyed to stable ids
src/
  app/
    (marketing)/        landing, pricing, security
    (auth)/             login, register
    app/                the authenticated product
  components/
    app/                shell, session context, charts, workbenches
    ui/                 button, card, badge, table, field primitives
  lib/
    types.ts            the domain model — the contract everything speaks
    variance.ts         the valuation & variance engine
    assistant.ts        domain guard for the AI assistant
    auth/               password hashing, sessions, RBAC guards, actions
    db/                 Prisma client and the query layer
    extraction/         PDF text-layer parser, Claude vision OCR
    matching/           invoice line -> Schedule of Rates matcher
    pipeline/ingest.ts  upload -> gate -> store -> extract -> match -> price
    storage/            Supabase Storage over plain REST
    jobs/               cron reader, job runner, admin actions
    invoices/           upload, correction, deletion actions
    rates/              rate CRUD and CSV bulk import
    org/                team and organisation actions
    billing/            subscription actions
    adapters/           external-service interfaces + mock and live impls
    data/               reference config and the seed source
  middleware.ts         edge-level redirect for unauthenticated /app requests
```

### The variance engine

[src/lib/variance.ts](src/lib/variance.ts) is the heart of the product and is a
**pure function** of its inputs — the same document, SoR baseline and market
quotes always produce the same verdict. That is what makes reports reproducible
for audit.

```
benchmark = 60% × (SoR base rate × city cost index) + 40% × median(market quotes)
verdict   = over  if billed > benchmark + 7%
            under if billed < benchmark − 7%
            par   otherwise
```

Where only one reference source exists, the benchmark falls back to it and the
verdict confidence drops accordingly. Where neither exists, the line is reported
as **unmatched** rather than being given a verdict, and is excluded from the
roll-up. Weights and the par band are in `VARIANCE_CONFIG`.

### How access control is layered

Three layers, and only one of them is protection:

1. **[middleware.ts](src/middleware.ts)** — checks a session cookie exists.
   Runs on the Edge runtime, so it cannot reach the database. A redirect
   optimisation, *not* the boundary.
2. **Pages and server actions** — the actual boundary.
   `requireUser()` / `gateFor()` / `requirePermission()` in
   [lib/auth/guard.ts](src/lib/auth/guard.ts). Pages check *before they query*,
   so restricted rows never enter the response, and render `<AccessDenied />`.
3. **[components/app/gates.tsx](src/components/app/gates.tsx)** — hides buttons
   the current role cannot use. Presentation only; it runs after the payload has
   already been sent.

Getting layer 2 wrong is invisible in the interface — the page looks correctly
locked while the data sits in the RSC payload. There is a check for this in
[Verifying access control](#verifying-access-control).

---

## Scope of work — item by item

| SoW item | State | Where |
|---|---|---|
| Frontend & backend integration | Done | Next.js App Router, server actions throughout |
| PDF & OCR processing pipeline | Done for PDFs; OCR needs a key | `lib/extraction/pdf.ts`, `lib/extraction/vision.ts` |
| Database & pricing matching | SoR done; market pricing needs `SERPER_API_KEY` | `lib/matching/sor.ts`, `adapters/live.ts` |
| Valuation engine (Over/Under/Par) | Done, deterministic | `lib/variance.ts` |
| Authentication & RBAC | Done, enforced before the query | `lib/auth/` |
| Deployment | Done | Railway + Supabase |
| Custom domain mapping | **Blocked — needs your domain and DNS** | — |
| Design overhaul | Done | — |
| AI assistant, domain-restricted | Guard done; answers need `ANTHROPIC_API_KEY` | `lib/assistant.ts` |
| Fallback message, exact wording | Done | `OUT_OF_DOMAIN_REPLY` |
| Page structuring | Done | `app/` |
| Subscription-driven UI | Done, entitlement-gated server-side | `lib/data/org.ts` |
| Dashboard & reporting | Done, with PDF/Excel export | `app/app/dashboard`, `api/invoices/[id]/export` |
| Filter out dirty images | Done | `lib/extraction/image-quality.ts` |
| Cache memory | Done, tag-invalidated | `lib/db/queries.ts` |
| Delete one document, not the workspace | Done, verified | `lib/invoices/actions.ts` |
| Data retention policy | Done, nightly job | `lib/jobs/run.ts` |
| SoR seeded from CPWD/State PWD | **Illustrative figures only — needs a licensed book** | `lib/data/reference.ts` |
| Location-wise city index | Done, detected from the document | `lib/extraction/locate.ts` |
| Hybrid update: cron + bulk upload | Done, CSV and .xlsx | `lib/jobs/`, `lib/rates/actions.ts` |
| Modular pricing for future feeds | Done, adapter interface | `lib/adapters/` |
| Real-time pricing (Serper/IndiaMART/Moglix) | Written, inactive — needs `SERPER_API_KEY` | `adapters/live.ts` |
| Price updating logic | Done, scheduled | `lib/jobs/run.ts` |
| Payment gateway | Checkout + webhook done — needs Razorpay keys | `api/webhooks/razorpay` |
| Security & data protection | scrypt, DB sessions, RBAC before query, signed URLs, HMAC webhooks | — |

**Three things are not code and remain with the owner:** a licensed rate book,
a domain for DNS mapping, and the provider keys (Serper, Anthropic, Razorpay).
Everything they gate is written and switches on when the key is set.

---

## What is real, and what is waiting on a key

**Working end to end, verified against the deployment:**

- **Ingestion.** A PDF is checked at the quality gate, stored in Supabase
  Storage, parsed for its text layer, matched to the Schedule of Rates with a
  city-index adjustment, and priced — one pass, in
  [pipeline/ingest.ts](src/lib/pipeline/ingest.ts). The file is stored *before*
  extraction, so a parsing failure still leaves the original recoverable, and
  the gate runs before both, so a rejected file consumes neither storage nor
  quota.
- **Extraction.** [extraction/pdf.ts](src/lib/extraction/pdf.ts) reads the real
  text layer and reconciles each row arithmetically — quantity x rate should
  equal amount. Rows that reconcile carry high confidence; rows that do not are
  flagged for review rather than quietly trusted.
- **SoR matching.** Token containment, Jaccard and trigram similarity, plus unit
  agreement, over the tenant's rates and the shared book together.
- **Persistence.** Line corrections, document deletion, rate CRUD, CSV bulk
  import, team management and organisation settings all write to the database.
- **Authentication.** scrypt hashing (memory-hard, Node standard library, no
  native dependency). Sessions are database rows storing only the SHA-256 of the
  token, so a database leak cannot be replayed. Unknown emails still run a
  verify against a dummy hash, so response timing does not reveal which
  addresses are registered.
- **Role-based access control**, checked *before* the query runs — so restricted
  rows never enter the server-rendered payload, not merely the screen.
- **The variance engine** — every figure on every screen is computed by it, and
  correcting a line re-runs it immediately.
- **Exports.** Real PDF and XLSX files, generated server-side.
- **Scheduled jobs.** A five-field cron reader evaluated in IST, a runner for
  price refresh / stale sweep / rate-book revision / retention, and a
  bearer-authenticated `/api/cron` endpoint that runs whatever is due.
- **Image quality gate.** Uploaded photographs and scans are measured before
  OCR — resolution, focus by Laplacian variance, tonal range and ink coverage —
  from the pixels, with no model and no network call. A page that cannot be read
  is refused with the reason, rather than extracted into something plausible and
  wrong.
- **Payment webhook.** `POST /api/webhooks/razorpay`, HMAC-verified over the raw
  body, is the only thing that activates a paid tier. Redelivered captures are
  no-ops; an unconfigured secret returns 503 rather than leaving the endpoint
  open.
- **Location detection.** A PIN printed on the document decides which city index
  prices it, overriding the upload default when the two disagree, and the choice
  is correctable on the report — which re-indexes every matched line.
- **Caching.** The public rate book is cached across requests and dropped on any
  write. Only shared rows are cached; tenant rates are read fresh and merged, so
  one tenant's rates cannot be served to another.

**Code-complete, but inactive without a credential** — each is selected by
credential availability in [adapters/index.ts](src/lib/adapters/index.ts), so
setting the variable switches that one service live and a missing key degrades
to the mock rather than failing a request:

| Service | PRD | Without the key | With it |
|---|---|---|---|
| Market pricing | FR-4.1 | Quotes synthesised around the SoR baseline | Serper shopping search, India-localised (`SERPER_API_KEY`) |
| OCR for scans | FR-2.1 | Scans are refused with a clear reason, not silently accepted | Claude vision extraction (`ANTHROPIC_API_KEY`) |
| Assistant | FR-10 | Domain guard + canned answers | Claude, same guard (`ANTHROPIC_API_KEY`) |
| Payments | FR-8.2 | Applies the change directly, no card fields anywhere | Razorpay payment links (`RAZORPAY_KEY_*`) |

These four are written but **unproven** — they have never executed against a
real provider, because no keys were available. Treat them as untested code.

With a live gateway, plan activation moves to the payment webhook — the browser
returning from checkout must never be what unlocks a tier. That split is already
written into [adapters/live.ts](src/lib/adapters/live.ts): `createCheckout`
returns a link and deliberately does *not* change the subscription.

**Deliberately not built, and visible as such in the interface:**

- **Email.** No provider is connected. Invitations create the member record but
  deliver no email, so an invited person cannot sign in until a password is set
  for them; the invite screen says exactly that. Notification preferences are
  shown as the intended set and are inert.
- **Rate-book revision feed.** No machine-readable CPWD/State PWD publication
  feed exists, so the revision job reports which rates have aged past a year
  rather than pretending to download a new edition.
- **Custom domain (FR-12.2).** Needs a domain and DNS access from the owner.

---

## Scheduled jobs

Next.js has no in-process scheduler, and running one inside a web dyno would
fire once per instance. So the schedule lives outside the app: any timer calls
one endpoint, and it runs whatever is due.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron
```

Set `CRON_SECRET` and point a platform cron at it every 15 minutes; a job then
fires within 15 minutes of its cron time. Without the secret the endpoint
returns **503** rather than running unauthenticated — it triggers paid
third-party calls, so an open endpoint would be a billing hole as well as a
security one. Wrong secrets are rejected with a constant-time comparison.

Schedules are read as five-field cron **in IST**, the working day of every user
of this product; evaluating in UTC would silently shift an 03:00 job. Each job
carries a scope — the keywords it matches against line descriptions and rate
chapters — so two refresh jobs with different names do not silently do each
other's work. Runs are bounded by both a line cap and a wall-clock budget;
anything not reached is left for the next run, where its older quotes sort it to
the front.

---

## Demonstrating the requirements

| To see | Do this |
|---|---|
| Variance report with evidence | Open any analysed document, expand a line item |
| Over / Under / Par / Unmatched | `INV-2026-0842` has all four |
| Correction re-running the engine | Edit a rate with the pencil icon; the verdict and roll-up move |
| Quality gate rejection (FR-1.2) | Upload → run the "Blurred phone photo" or "Not a business document" sample |
| Low-confidence review (FR-2.3) | Open `INV-2026-0839` |
| RBAC (FR-7.2) | Sign in as the estimator or auditor — Administration and Billing disappear, and are refused if you navigate straight to them |
| Tier gating (FR-8.1) | As owner, Billing → switch to Starter; bulk upload, scheduled jobs, Excel export and the assistant lock |
| Subscription change (FR-8.2) | Billing → change plan; entitlements follow immediately |
| Assistant refusal (FR-10.3) | Assistant → ask something off-topic |
| Real extraction (FR-2.1) | Upload → drop a real vendor PDF with an itemised table; the line items come from its text layer, not a fixture |
| Bulk rate import (FR-9.1) | Administration → Bulk upload → download the template, edit it, import; bad rows are reported by line number, never dropped silently |
| Rate CRUD (FR-9.1) | Administration → Rate library → Add rate. Shared rate-book rows cannot be deleted; editing one creates your own override |
| Scheduled jobs (FR-9.2) | Administration → Scheduled jobs → Run now; the result, next run and item count all update |
| Exports (FR-6.1) | Open a document → Export PDF / Excel |
| Suspension revoking access (FR-7.2) | Team → suspend a member; their live sessions are deleted, not left to expire |
| Location adjustment (FR-3.3) | Change the city in the top bar, then open the Rate library |
| Tenant isolation | Register a second account; it sees an empty workspace, not the demo data |

### Verifying access control

Roles are checked before the query, so the check is on the payload, not the
screen. With the dev server running and a session cookie for each role:

```bash
curl -s -H "Cookie: finscanix_session=$TOKEN" localhost:3000/app/settings/team | grep -c "priya.nair@"
```

Expected: a match for owner and admin, zero for estimator, auditor and viewer.

---

## Decisions taken, and what still needs the owner

The PRD closes with ten open questions. These were resolved to keep the build
moving; each is isolated to one place in the code.

| # | Question | Assumed | Where it lives |
|---|---|---|---|
| 1 | Tech stack | Next.js + TypeScript + Prisma | — |
| 3 | Pricing API | Serper, adapter-swappable | `adapters/live.ts` |
| 4 | Payment gateway | Razorpay, INR | `adapters/live.ts` |
| 5 | Subscription tiers | 3 tiers: ₹4,999 / ₹14,999 / custom | `data/org.ts` |
| 6 | Accuracy targets | Not set; per-field confidence surfaced instead, derived from arithmetic reconciliation | `extraction/pdf.ts` |
| 7 | Export formats | PDF on all tiers, Excel from Professional | `data/org.ts` |
| 8 | Location handling | User-selected city, per document, with an org default | `prisma/seed.ts` |
| 10 | Retention | Stated as policy; per-document deletion modelled, windows not enforced | `db/queries.ts` |

**Still genuinely blocking, and needing Mr. Asif's input:**

1. **SoR source and licensing (Q2).** The 27 seeded rates are illustrative
   figures in the real CPWD DSR structure. Real rate books must be licensed and
   loaded before any output is defensible — the single biggest gap between this
   and a usable product.
2. **Compliance jurisdiction (Q9).** Determines hosting region, audit logging
   and retention windows.
3. **Accuracy targets (Q6).** Needed to know when extraction is good enough to
   ship.

---

## Notes on the data

Seeded rates, vendors, projects and organisations are invented for
demonstration. Rate figures are plausible for the Delhi baseline but are **not**
real CPWD DSR values, and without `SERPER_API_KEY` market quotes are synthesised
around that baseline rather than fetched. Nothing produced by this deployment
should be quoted to a vendor until a licensed rate book is loaded.

---

## Confidentiality

Per the SoW/NDA: all source code, logic, database structures, designs and
documentation are the property of the project owner. API keys and credentials
belong in `.env`, which is git-ignored and must never be committed.

The Supabase **anon** key must never be exposed to the browser: row-level
security is off on the Prisma-created tables, so PostgREST with that key would
read every tenant's documents. Only `NEXT_PUBLIC_SUPABASE_URL` is public; the
service-role key is server-side only and is used solely for Storage.
