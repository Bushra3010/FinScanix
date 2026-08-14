# FinScanix

AI-powered verification of vendor invoices and quotations for construction and
facilities management. Line items are extracted from uploaded documents,
benchmarked against government Schedule of Rates and live market pricing, and
reported as **over-priced, under-priced or at par** with the evidence attached.

Built to the [FinScanix PRD](./FinScanix_PRD.md).

> **Status.** Every screen is built and navigable, backed by a real database and
> real session authentication with server-enforced roles. The *verification
> pipeline* — OCR, live pricing, payments — still runs on mocks behind adapter
> interfaces. See [What is real vs mocked](#what-is-real-vs-mocked).

---

## Deployed

<https://finscanix-production.up.railway.app>

Running on Railway: a `finscanix` web service and a dedicated `finscanix-db`
Postgres, both in the `harmonious-simplicity` project. Migrations run on every
release via the start command in [railway.json](./railway.json).

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

Point `DATABASE_URL` at a Postgres instance. There is no local SQLite fallback:
the deployment target's filesystem is ephemeral, so the schema targets Postgres
everywhere to keep dev and production honest.

```bash
npx prisma migrate dev
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Then open <http://localhost:3000>. SQLite is used locally, so there is no
database server to install.

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
| Database | Prisma + SQLite (dev) | No server to install locally. Postgres-portable — see below. |
| Auth | Hand-rolled sessions, scrypt hashing | No dependency, no JWT revocation problem; sessions are rows, so sign-out really signs out. |
| Styling | Tailwind CSS v4 with CSS-variable tokens | Light/dark from one token set. |
| Charts | Hand-built SVG | Simple shapes; no charting dependency, colours bound to the theme tokens. |

### Moving to Postgres

Change `provider` in [prisma/schema.prisma](prisma/schema.prisma) from `sqlite`
to `postgresql`, point `DATABASE_URL` at the instance, and re-run
`prisma migrate dev`. The schema uses no SQLite-only features: enum-like columns
are plain strings (documented against the TypeScript unions), and there are no
JSON or array columns.

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

## What is real vs mocked

**Real, working:**

- **Persistence.** Everything is read from the database through
  [lib/db/queries.ts](src/lib/db/queries.ts), which maps rows back to the types
  in `types.ts`. Every query is scoped by `organisationId`, so tenant isolation
  is enforced in one place rather than left to callers.
- **Authentication.** Registration and login hash with scrypt (memory-hard,
  from Node's standard library — no native dependency). Sessions are database
  rows; only the SHA-256 of the token is stored, so a database leak cannot be
  replayed. Unknown emails still run a verify against a dummy hash so response
  timing does not reveal which addresses are registered.
- **Role-based access control**, enforced server-side before any query runs.
- **The variance engine** — every figure on every screen is computed by it.
- **The assistant's domain guard.** Off-domain questions return the exact
  required string, verbatim. Answers themselves are canned.
- **Live recalculation** — correcting a line item's rate re-runs the engine and
  updates the verdict and roll-up immediately.
- **Subscription changes** write to the database, so entitlements move across
  the whole app at once.

**Mocked behind an interface** ([src/lib/adapters/](src/lib/adapters/)):

| Service | PRD | Mock | Live seam |
|---|---|---|---|
| Quality gate | FR-1.2 | Heuristic classifier | Model-backed classifier |
| OCR / extraction | FR-2.1 | Fixture replay | Vision model |
| Market pricing | FR-4.1 | Synthesised quotes around the SoR baseline | Serper (`SERPER_API_KEY`) |
| Payments | FR-8.2 | Applies the change directly, no card fields anywhere | Razorpay (`RAZORPAY_KEY_*`) |
| Assistant | FR-10 | Domain guard + canned answers | Claude (`ANTHROPIC_API_KEY`) |

Each adapter is selected by credential availability in
[adapters/index.ts](src/lib/adapters/index.ts): set the env var and that one
service goes live. A missing key degrades to the mock rather than failing.

With a live gateway, plan activation moves to the payment webhook — the browser
returning from checkout must never be what unlocks a tier. That split is already
written into [lib/billing/actions.ts](src/lib/billing/actions.ts).

**Not built yet:** uploaded files are not stored or extracted for real, PDF and
Excel export do not generate files, scheduled jobs are managed but nothing runs
them, and team/profile edits are not yet persisted.

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
| 6 | Accuracy targets | Not set; confidence surfaced per field instead | `types.ts` |
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

Fixture rates, vendors, projects and organisations are invented for
demonstration. Rate figures are plausible for the Delhi baseline but are **not**
real CPWD DSR values, and market quotes are synthesised around the baseline
rather than fetched. Nothing in this repository should be quoted to a vendor.

---

## Confidentiality

Per the SoW/NDA: all source code, logic, database structures, designs and
documentation are the property of the project owner. API keys and credentials
belong in `.env`, which is git-ignored and must never be committed. The local
SQLite database is git-ignored for the same reason.
