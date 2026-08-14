# FinScanix

AI-powered verification of vendor invoices and quotations for construction and
facilities management. Line items are extracted from uploaded documents,
benchmarked against government Schedule of Rates and live market pricing, and
reported as **over-priced, under-priced or at par** with the evidence attached.

Built to the [FinScanix PRD](./FinScanix_PRD.md).

> **Status: clickable UI prototype.** Every screen in the product is built and
> navigable against realistic fixture data. The verification pipeline itself is
> not connected to real OCR, pricing or payment providers — those sit behind
> adapter interfaces with working mock implementations. See
> [What is real vs mocked](#what-is-real-vs-mocked).

---

## Running it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>. No environment variables or database are
needed — the prototype runs entirely on fixtures.

Other scripts:

```bash
npm run build
```

```bash
npm run typecheck
```

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) + React 19 | One codebase for marketing site, app and API routes; static where possible, server-rendered where needed. |
| Language | TypeScript (strict) | The domain model is the contract between the data layer and every screen. |
| Styling | Tailwind CSS v4 with CSS-variable tokens | Light/dark themes from one token set; no runtime theme library. |
| Icons | lucide-react | |
| Charts | Hand-built SVG | The shapes needed are simple; avoids a charting dependency and keeps chart colours bound to the same theme tokens. |

No database yet — the data layer is fixture-backed and typed, so swapping in
Prisma/Postgres means replacing the functions in `src/lib/data/`, not the
screens.

---

## Where things live

```
src/
  app/
    (marketing)/          landing, pricing, security
    (auth)/               login, register
    app/                  the authenticated product
      dashboard/
      invoices/           list, upload, detail + variance report
      reports/
      admin/              rate library, bulk upload, scheduled jobs, integrations
      settings/           profile, team & roles, billing
  components/
    app/                  shell, gates, charts, workbenches
    ui/                   button, card, badge, table, field primitives
  lib/
    types.ts              the domain model
    variance.ts           the valuation & variance engine
    assistant.ts          domain guard for the AI assistant
    data/                 fixtures: SoR catalogue, cities, invoices, org
    adapters/             external-service interfaces + mock and live impls
```

### The variance engine

`src/lib/variance.ts` is the heart of the product and is a **pure function** of
its inputs — the same document, SoR baseline and market quotes always produce
the same verdict. That is what makes reports reproducible for audit.

```
benchmark = 60% × (SoR base rate × city cost index) + 40% × median(market quotes)
verdict   = over  if billed > benchmark + 7%
            under if billed < benchmark − 7%
            par   otherwise
```

Where only one reference source exists, the benchmark falls back to it and the
verdict confidence drops accordingly. Where neither exists, the line is reported
as **unmatched** rather than being given a verdict, and is excluded from the
roll-up.

Weights and the par band are in `VARIANCE_CONFIG`.

---

## What is real vs mocked

**Real, working logic:**

- The variance engine — every figure on every screen is computed from the
  fixtures by the same code that would run in production. The marketing page's
  hero card is rendered from it too, so the pitch cannot drift from the product.
- The assistant's domain guard (`src/lib/assistant.ts`). Off-domain questions
  return the exact required string, verbatim. Answers themselves are canned.
- Role-based access control and subscription-tier gating — the same predicates
  the server would use, applied to the interface.
- The image quality gate's decision logic, over filename/size/type heuristics.
- Live recalculation: correcting a line item's quantity or rate on the report
  re-runs the engine and updates the verdict and roll-up immediately.

**Mocked behind an interface** (`src/lib/adapters/`):

| Service | PRD | Mock | Live seam |
|---|---|---|---|
| Quality gate | FR-1.2 | Heuristic classifier | Model-backed classifier |
| OCR / extraction | FR-2.1 | Fixture replay | Vision model |
| Market pricing | FR-4.1 | Synthesised quotes around the SoR baseline | Serper (`SERPER_API_KEY`) |
| Payments | FR-8.2 | Local redirect, no card fields anywhere | Razorpay (`RAZORPAY_KEY_*`) |
| Assistant | FR-10 | Domain guard + canned answers | Claude (`ANTHROPIC_API_KEY`) |

Each adapter is selected by credential availability in
`src/lib/adapters/index.ts`: set the env var and that one service goes live,
with everything else untouched. A missing key degrades to the mock rather than
failing the request. Copy `.env.example` to `.env.local` to configure.

**Not built yet:** persistence, real authentication, PDF/Excel export
generation, and the scheduled jobs themselves (the admin screen manages them,
but no cron runs).

---

## Demonstrating the requirements

A **Prototype controls** panel (the sliders icon in the top bar) switches the
signed-in role and the active subscription tier. It is not part of the product —
it exists so RBAC and tier gating can be seen without seeding accounts.

| To see | Do this |
|---|---|
| Variance report with evidence | Open any analysed document, expand a line item |
| Over / Under / Par / Unmatched | `INV-2026-0842` has all four |
| Correction re-running the engine | Edit a rate with the pencil icon and watch the verdict and roll-up move |
| Quality gate rejection (FR-1.2) | Upload → run the "Blurred phone photo" or "Not a business document" sample |
| Low-confidence review (FR-2.3) | Open `INV-2026-0839` |
| RBAC (FR-7.2) | Prototype controls → role *Estimator* or *Viewer*; Administration disappears |
| Tier gating (FR-8.1) | Prototype controls → tier *Starter*; bulk upload, scheduled jobs, Excel export and the assistant lock |
| Subscription checkout (FR-8.2) | Billing → change plan; the mock gateway returns and activates the tier |
| Assistant refusal (FR-10.3) | Assistant → ask something off-topic |
| Location adjustment (FR-3.3) | Change the city in the top bar, then open the Rate library |

---

## Decisions taken, and what still needs the owner

The PRD closes with ten open questions. These were resolved to keep the build
moving; all are cheap to change and each is isolated to one place in the code.

| # | Question | Assumed | Where it lives |
|---|---|---|---|
| 1 | Tech stack | Next.js + TypeScript, deployable to any Node host | — |
| 3 | Pricing API | Serper, adapter-swappable | `adapters/live.ts` |
| 4 | Payment gateway | Razorpay, INR | `adapters/live.ts` |
| 5 | Subscription tiers | 3 tiers: ₹4,999 / ₹14,999 / custom | `data/org.ts` |
| 6 | Accuracy targets | Not set; confidence is surfaced per field instead | `types.ts` |
| 7 | Export formats | PDF on all tiers, Excel from Professional | `data/org.ts` |
| 8 | Location handling | User-selected city, per document, with an org default | `data/reference.ts` |
| 10 | Retention | Stated as policy, not enforced by code | `(marketing)/security` |

**Still genuinely blocking, and needing Mr. Asif's input:**

1. **SoR source and licensing (Q2).** The 27 seeded rates are illustrative
   figures in the real CPWD DSR structure. Real rate books must be licensed and
   loaded before any output is defensible — this is the single biggest gap
   between this prototype and a usable product.
2. **Compliance jurisdiction (Q9).** Which specific cybersecurity and
   data-protection rules apply determines hosting region, audit logging and
   retention windows.
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
belong in `.env.local`, which is git-ignored and must never be committed.
