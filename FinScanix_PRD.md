# FinScanix — Product Requirements Document (PRD)

| Field | Detail |
|---|---|
| **Product** | FinScanix |
| **Type** | AI-powered SaaS web application |
| **Domain** | Construction & facilities-management invoice/quotation verification |
| **Owner** | Mr. Mohammad Asif |
| **Document status** | Draft v1.0 |
| **Last updated** | 14 Aug 2026 |
| **Source** | Derived from the FinScanix Scope of Work & NDA |

> This PRD translates the Scope of Work into structured product requirements: goals, users, functional and non-functional requirements, acceptance criteria, and a phased delivery plan. It is a working document — open questions are flagged at the end and should be resolved before build kick-off.

---

## 1. Overview

FinScanix is a SaaS application that automates the verification of **vendor invoices and quotations** in the construction and facilities-management sector. It ingests vendor bills (PDF/images), extracts line items via OCR, and cross-references each item against two reference sources — official **Schedule of Rates (SoR)** data from CPWD/State PWDs, and **live market pricing** scraped from B2B/e-commerce platforms. It then produces a **variance report** flagging each item as Over-priced, Under-priced, or At-par (Par).

The core value proposition: replace slow, error-prone manual quotation audits with an automated, evidence-backed valuation engine that gives estimators, auditors, and project owners a defensible view of whether they are being overcharged.

---

## 2. Problem Statement

Organisations that procure construction materials and services receive large volumes of vendor invoices and quotations. Verifying whether the quoted rates are fair requires:
- Manually reading line items off PDFs and scans,
- Looking each item up against government SoR rate books,
- Checking current market prices item by item,
- Adjusting for location-based cost differences.

This is time-consuming, inconsistent between reviewers, and hard to audit. FinScanix automates this pipeline end to end and produces a standardised, shareable report.

---

## 3. Goals & Non-Goals

### 3.1 Goals
- Automate extraction of line items from vendor invoices/quotations with high accuracy.
- Match extracted items to CPWD/State PWD SoR baselines and to live market prices.
- Generate a clear Over/Under/Par variance report per invoice.
- Apply location-aware pricing (city index factors / detected location).
- Deliver a subscription-gated, secure, multi-tenant SaaS with a usable dashboard.
- Provide a domain-restricted AI assistant for in-scope support.

### 3.2 Non-Goals (v1)
- FinScanix does **not** issue payments to vendors or act as a procurement/ERP system.
- It does **not** provide legally binding valuations — output is advisory decision-support.
- It does **not** integrate paid private market-data feeds in v1 (architected for future support).
- It does **not** support non-construction/FM domains for the AI assistant.

---

## 4. Target Users

| Persona | Description | Primary needs |
|---|---|---|
| **Estimator / Quantity Surveyor** | Reviews vendor quotations before approval. | Fast, accurate line-item verification; variance evidence. |
| **Auditor / Finance reviewer** | Audits invoices for overbilling. | Standardised reports, an audit trail, exportable output. |
| **Project Owner / Admin** | Owns the account, manages users and pricing data. | Role-based access, bulk pricing uploads, subscription control. |
| **Facilities / Procurement Manager** | Signs off on maintenance and works orders. | Confidence that rates are fair, location-adjusted. |

---

## 5. Scope

### 5.1 In scope
Full-stack SaaS build covering: invoice ingestion, OCR/extraction pipeline, SoR + market-price matching, AI valuation/variance engine, real-time pricing search, auth & RBAC, subscription-tiered UI, dashboard & reporting, admin pricing management, domain-restricted AI assistant, deployment with custom domain, and a general design overhaul to a professional SaaS standard.

### 5.2 Out of scope
Physical procurement, payment disbursement to vendors, ERP/accounting integrations, and any AI assistant capability outside the construction/FM/engineering domain.

---

## 6. Functional Requirements

Requirements are prioritised **P0** (must-have for launch), **P1** (important, fast-follow), **P2** (future). Each includes acceptance criteria (AC).

### 6.1 Invoice Upload & Image Quality Gate — P0
- **FR-1.1** Users can upload vendor bills/invoices as PDF or image.
- **FR-1.2** The system detects and rejects "dirty images," low-quality scans, and out-of-scope/non-business files *before* processing, returning a clear reason to the user.
- **AC:** A legible invoice is accepted and queued for extraction; a blurred/blank/irrelevant image is rejected with a specific message and consumes no extraction quota.

### 6.2 PDF & OCR Extraction Pipeline — P0
- **FR-2.1** Extract line items, quantities, unit rates, amounts, tables, and totals from uploaded documents.
- **FR-2.2** Preserve calculations and table structure so line items map cleanly to reference data.
- **FR-2.3** Surface a confidence indicator and allow manual correction of mis-read fields.
- **AC:** For a standard machine-generated invoice, ≥ [target %, TBD] of line items are extracted with correct description, quantity, and rate; the user can edit any field before matching.

### 6.3 SoR (Schedule of Rates) Baseline Matching — P0
- **FR-3.1** Seed the system with CPWD/State PWD SoR data as the base rate database.
- **FR-3.2** Match each extracted line item to the closest SoR entry (description/keyword matching).
- **FR-3.3** Apply **city index factors** based on detected/selected location to adjust SoR base rates.
- **AC:** A matched item shows its SoR reference rate, the applied city index factor, and the location-adjusted baseline.

### 6.4 Real-Time Market Pricing Module — P0
- **FR-4.1** Fetch live online pricing via a web-search/pricing API (e.g. Serper, Google Search API, or equivalent) from B2B/e-commerce platforms (e.g. IndiaMART, Moglix).
- **FR-4.2** Adapt fetched pricing to the user's detected location (City / PIN code).
- **FR-4.3** Continuously refresh prices to reflect market fluctuations.
- **AC:** For a given item and location, the system returns at least one current market price with source attribution and a fetch timestamp.

### 6.5 AI Valuation & Variance Engine — P0
- **FR-5.1** Compare each invoice line item against the SoR baseline and live market price.
- **FR-5.2** Classify each item as **Over / Under / Par** and compute the variance amount and percentage.
- **FR-5.3** Aggregate into a per-invoice variance summary.
- **AC:** Each line item shows invoice rate, reference rate(s), variance value/%, and an Over/Under/Par flag; the report rolls these up to an invoice-level total.

### 6.6 Dashboard & Reporting — P0
- **FR-6.1** Comprehensive user dashboard summarising invoices processed, variance trends, and recent activity.
- **FR-6.2** Structured report-generation module for quotation analysis and audits.
- **FR-6.3** Reports are exportable (format TBD — e.g. PDF/Excel).
- **AC:** A user can open a processed invoice, view its full variance report, and export it.

### 6.7 Authentication, Users & RBAC — P0
- **FR-7.1** Secure registration and login.
- **FR-7.2** Role-based access control (at minimum: Admin / Owner and standard User).
- **FR-7.3** Session security and password best practices.
- **AC:** A standard user cannot access admin-only functions (pricing uploads, user management, subscription config).

### 6.8 Subscription-Based UI & Payment — P0
- **FR-8.1** The UI dynamically adapts and gates features strictly by the user's **active subscription tier**.
- **FR-8.2** Integrate a secure payment gateway for subscription checkout.
- **FR-8.3** Enforce tier limits (e.g. usage caps) server-side, not just in the UI.
- **AC:** Downgrading/expiring a subscription immediately restricts gated features; checkout completes through the gateway and activates the correct tier.

### 6.9 Admin Panel & Hybrid Pricing Updates — P0/P1
- **FR-9.1 (P0)** Admin bulk upload of pricing via Excel/CSV.
- **FR-9.2 (P1)** Automated fetching of pricing via scheduled Cron jobs (hybrid update model).
- **FR-9.3 (P1)** Modular pricing architecture to allow **future** integration of private market-data feeds.
- **AC:** An admin can upload a validated CSV and see rates updated; scheduled jobs refresh prices without manual action.

### 6.10 Domain-Restricted AI Assistant — P1
- **FR-10.1** Interactive AI assistant button available across the platform.
- **FR-10.2** The assistant answers **only** questions related to construction, facilities management, engineering, hospitality, commercial buildings, building maintenance, industrial projects, and related technical tasks.
- **FR-10.3** Out-of-domain questions return the exact fallback: *"I'm sorry, I can only assist with construction and facilities management-related queries."*
- **AC:** In-domain queries get useful answers; an off-topic query (e.g. cooking, politics) returns the fallback verbatim.

### 6.11 Data Retention & Caching — P1
- **FR-11.1** Cache to reduce data load during processing.
- **FR-11.2** On file deletion, delete **only** that file's data — never cascade to the whole tenant's data.
- **FR-11.3** Retention policy: keep only data directly linked to active subscriptions and core usage.
- **AC:** Deleting one invoice removes only its records/artifacts; other invoices and account data remain intact.

### 6.12 Page Structuring & Deployment — P0
- **FR-12.1** All pages are functional and aligned to their designated purpose.
- **FR-12.2** Deploy to the hosting server and map the external custom domain via correct DNS configuration.
- **AC:** The app is reachable on the custom domain over HTTPS with all core pages working.

---

## 7. Non-Functional Requirements

| Area | Requirement |
|---|---|
| **Security** | Secure handling of API keys, DB credentials, and business logic; encryption in transit (HTTPS) and at rest for sensitive data; follow applicable government cybersecurity guidelines. |
| **Privacy & consent** | Collect and process user data only with clear permission; provide a privacy policy; support data deletion per retention policy. |
| **Performance** | OCR/pricing pipeline should return results within an acceptable time budget [target TBD]; caching used to manage load. |
| **Scalability** | Multi-tenant; pricing module modular for future data feeds; architecture supports growth in users and document volume. |
| **Reliability** | Graceful handling of failed extractions, pricing-API errors, and rejected uploads with clear user messaging. |
| **Auditability** | Reports and variance decisions are reproducible and exportable for audit purposes. |
| **Complaint handling** | A defined process/channel to handle user complaints quickly. |
| **Compliance** | Adhere to government cybersecurity rules and data-protection obligations to avoid legal exposure. |

---

## 8. High-Level Architecture (indicative)

- **Frontend:** Modern SPA framework, responsive, subscription-aware UI.
- **Backend:** API server handling auth, orchestration, and business logic.
- **OCR/Extraction service:** PDF + image parsing → structured line items.
- **Pricing services:** (a) SoR reference DB with city-index logic; (b) real-time market-price fetcher via search/pricing API.
- **AI layer:** Valuation/variance reasoning + domain-restricted assistant.
- **Data stores:** Relational DB for tenants/users/invoices/rates; cache layer.
- **Integrations:** Payment gateway; pricing/search API; email.
- **Infra:** Hosting server, custom domain via DNS, scheduled Cron jobs.

> Exact stack choices are the developer's to propose; the SoW specifies "modern frameworks" without mandating a specific one.

---

## 9. Key User Flows

1. **Verify an invoice:** Upload → quality gate → OCR extract → review/correct line items → match to SoR + market price (location-aware) → variance report → export.
2. **Subscribe:** Register → choose tier → pay via gateway → tier features unlock.
3. **Admin updates pricing:** Log in as admin → upload CSV/Excel or rely on Cron refresh → validate → rates live.
4. **Ask the assistant:** Click assistant → in-domain question → answer; off-domain question → fallback message.

---

## 10. Success Metrics (proposed)

- Line-item extraction accuracy (%) on a benchmark set.
- Median time to produce a variance report per invoice.
- % of invoices successfully matched to an SoR baseline and a market price.
- Assistant containment: % of off-domain queries correctly returning the fallback.
- Subscription conversion and active-subscription retention.

*(Targets to be set with the owner — see Open Questions.)*

---

## 11. Delivery Phases (suggested)

**Phase 1 — Core pipeline (P0):** Auth/RBAC, upload + quality gate, OCR extraction, SoR matching with city index, real-time market pricing, variance engine, basic dashboard/report, deployment on custom domain.

**Phase 2 — Monetisation & admin (P0/P1):** Subscription tiers + payment gateway, admin CSV/Excel pricing upload, Cron-based auto-refresh, caching + retention policy, design overhaul.

**Phase 3 — Assistant & polish (P1/P2):** Domain-restricted AI assistant + fallback, richer reporting/exports, modular hooks for private data feeds, hardening and QA.

---

## 12. IP, Confidentiality & Handover (from NDA)

These product-relevant constraints flow from the SoW/NDA and shape delivery:
- **Ownership:** All source code, logic, database structures, designs, and documentation are the sole property of the project owner.
- **Confidentiality:** Project files, API keys, DB credentials, and business logic are strictly confidential; no third-party sharing without written consent.
- **Non-compete/non-copy:** The build may not be reused, resold, or replicated for other projects.
- **Handover:** On completion or termination, all repositories, credentials, and assets are transferred to the owner and local copies securely deleted.

*(This section summarises the legal terms for context; the signed SoW/NDA is the governing document.)*

---

## 13. Assumptions

- CPWD/State PWD SoR data is available and licensable for seeding the base database.
- A pricing/search API (Serper, Google Search, or similar) and a payment gateway are available and budgeted.
- The owner will provide branding assets for the design overhaul.
- Location detection (city/PIN) is permitted and available for pricing adjustment.

---

## 14. Open Questions (resolve before kick-off)

1. **Tech stack:** Any mandated frameworks/hosting, or developer's choice?
2. **SoR source & licensing:** Which specific CPWD/State PWD rate books, and how are updates obtained?
3. **Pricing API:** Which provider, and what is the query budget/rate limit?
4. **Payment gateway:** Which provider and supported regions/currencies?
5. **Subscription tiers:** How many tiers, and what features/usage caps per tier?
6. **Accuracy targets:** Minimum acceptable OCR extraction accuracy and pricing-match rate?
7. **Report export formats:** PDF, Excel, or both?
8. **Location handling:** Auto-detect via IP/geolocation, user-selected, or both?
9. **Compliance scope:** Which specific government cybersecurity/data-protection rules apply (jurisdiction)?
10. **Data retention specifics:** Exact retention windows and deletion SLAs.

---

*End of document.*
