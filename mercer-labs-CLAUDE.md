# Mercer Labs Analytics Pipeline

Read `how-we-build.md` first for universal build rules (TypeScript, quality gates, error handling, session protocol). This file covers project-specific context.

---

## What This Project Is

A data warehouse and automated analytics pipeline for Mercer Labs, an immersive art experience in New York City. The system pulls ticket sales, transaction, and check-in data from their ticketing platform (Vivenu), calculates actual net revenue by sales channel after commissions, and delivers daily reporting via Looker Studio dashboards and an AI-generated email digest.

This is a standalone data engineering project. It has no UI beyond dashboards and email. It does not share infrastructure with any other Massive Marketing project.

## The Business Problem We're Solving

Mercer sells tickets through multiple channels (direct website, hotels like Marriott, third-party platforms like Get Your Guide, Viator, Groupon). Third-party partners take 20-30% commission, but current reporting shows full face value, meaning revenue is massively over-reported. Additionally, there's no connection between when tickets are sold and when people actually show up, leading to staffing mismatches.

This pipeline fixes both problems.

---

## Architecture

### GCP Project
- **Project**: `mercer-labs-488707` (standalone, not shared with `massive-marketing`)
- **Region**: `us-east1` (closest to NYC)
- **Secrets**: Vivenu API key, Claude API key, SendGrid API key (all in Secret Manager)

### BigQuery Datasets
```
mercer-labs-488707
├── raw_vivenu          # Untransformed Vivenu API responses (contains PII, restricted access)
├── mercer_analytics    # Clean, anonymised, query-ready tables (dashboards read from here)
└── reference           # Partner configs, commission rates, event metadata
```

### Key Tables
- `raw_vivenu.raw_tickets` - one row per ticket, full PII, restricted to service account + Andy
- `raw_vivenu.raw_transactions` - one row per order, payment and fee details, full customer PII
- `raw_vivenu.raw_scans` - one row per barcode scan event, from Portier API
- `reference.partners` - maps undershop_id to commission rate and partner type (the money table)
- `reference.unknown_undershops` - auto-populated when new sales channels appear
- `mercer_analytics.tickets` - anonymised ticket data enriched with transaction fees and scan data
- `mercer_analytics.daily_revenue_summary` - net revenue by channel by day (the headline table)
- `mercer_analytics.daily_capacity_summary` - check-ins by day for staffing

### Vivenu API Endpoints (verified 2026-03-05)
Three separate APIs, all using `top`/`skip` pagination:

| Endpoint | Base URL | Response key | Primary key |
|----------|----------|-------------|-------------|
| Tickets | `vivenu.com/api/tickets` | `rows[]` | `_id` |
| Transactions | `vivenu.com/api/transactions` | `docs[]` | `_id` |
| Scans | `portier.vivenu.com/api/scans` | `docs[]` | `_id` |

- Auth: `Authorization: Bearer <api-key>` header
- Date filtering: pass `createdAt` (tickets/transactions) or `time` (scans) as JSON `{$gte, $lte}` in query params
- Scans live on a completely separate service (Portier) from tickets/transactions

### Daily Pipeline Schedule (US Eastern)
| Time | Job | What It Does |
|------|-----|-------------|
| 06:00 | `vivenu-ingest` Cloud Function | Pulls 3-day rolling window from 3 Vivenu API endpoints, MERGE upserts into BQ, flags unknown undershops |
| 06:30 | BQ scheduled transforms (3 queries) | Builds `tickets`, `daily_revenue_summary`, and `daily_capacity_summary` by joining raw tables + reference.partners |
| 07:00 | `daily-email-digest` Cloud Function | Queries summaries, sends data to Claude API for narrative, emails leadership via SendGrid |
| Always | Looker Studio dashboards | Live connection to `mercer_analytics`, self-serve |

### Cloud Functions
Two Cloud Functions in this project:

**`vivenu-ingest`** - daily data ingestion
- Triggered by Cloud Scheduler at 06:00 ET
- Reads Vivenu API key from Secret Manager
- Fetches tickets, transactions, and scans in parallel for a 3-day rolling window
- MERGE (upsert) each into their respective `raw_vivenu` tables
- Checks for unknown undershops and inserts into `reference.unknown_undershops`
- Logs record counts per table (inserted, updated)

**`daily-email-digest`** - AI-generated morning briefing
- Triggered by Cloud Scheduler at 07:00 ET
- Queries yesterday's revenue summary, same day last week, 7-day trailing averages, unresolved undershops
- Sends structured data payload to Claude API (Sonnet) with system prompt
- Claude generates a sub-200-word narrative with RAG coding (green/yellow/red)
- Formats as HTML email, sends via SendGrid
- Falls back to raw numbers if Claude API fails

---

## Deploy

Region and project for all deploys:
```bash
--region=us-east1 --project=mercer-labs-488707
```

Full deploy command pattern:
```bash
npm run check && npm run build
gcloud functions deploy <functionName> \
  --runtime=nodejs20 \
  --trigger-http \
  --source=./dist \
  --entry-point=<functionName> \
  --region=us-east1 \
  --project=mercer-labs-488707 \
  --memory=512Mi
```

---

## Repo Structure

```
/mercerDataPipeline
├── how-we-build.md                        # Universal build rules (DO NOT EDIT per-project)
├── mercer-labs-CLAUDE.md                   # This file
├── Docs/
│   └── mercer-labs-analytics-plan.md      # Full implementation plan with schemas, queries, specs
├── functions/
│   ├── vivenu-ingest/
│   │   ├── index.ts                       # Main Cloud Function (orchestrates 3-source ingestion)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vivenu-client.ts               # Vivenu API wrapper (fetchTickets, fetchTransactions, fetchScans)
│   │   ├── bigquery-writer.ts             # BQ MERGE logic for 3 tables
│   │   └── undershop-checker.ts           # New undershop detection
│   ├── daily-email-digest/
│   │   ├── index.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bq-queries.ts                  # BigQuery data fetching
│   │   ├── claude-client.ts               # Claude API wrapper
│   │   └── email-sender.ts               # SendGrid email delivery
│   └── shared/
│       └── types.ts                       # Shared TypeScript types (all API + BQ row shapes)
├── sql/
│   ├── schemas/                           # CREATE TABLE statements
│   ├── transforms/                        # Scheduled transform queries
│   └── reports/                           # Ad-hoc report queries
├── config/
│   ├── partners-seed.json                 # Initial partner/commission data
│   ├── events-seed.json                   # Initial event metadata
│   ├── email-recipients.json              # Digest recipient list
│   └── email-digest-system-prompt.txt     # Claude API system prompt
├── scripts/
│   ├── setup-gcp.sh                       # GCP project setup
│   ├── deploy-function.sh                 # Deploy Cloud Function
│   ├── schedule-jobs.sh                   # Set up Cloud Scheduler
│   └── backfill.sh                        # One-time historical data pull
└── .gitignore
```

---

## Shared Types (functions/shared/types.ts)

Both Cloud Functions import from here. Types cover:

**API response types:**
- `VivenuTicket` - ticket from `vivenu.com/api/tickets` (uses `_id`, `realPrice`, `regularPrice`, `categoryName`)
- `VivenuTransaction` - order from `vivenu.com/api/transactions` (fees: `innerCharge`, `outerCharge`, `paymentMethod`, `taxRate`)
- `VivenuScan` - scan from `portier.vivenu.com/api/scans` (uses `ticketId`, `time`, `type: 'checkin' | 'checkout'`)
- Paginated response wrappers: `VivenuTicketsResponse` (`.rows`), `VivenuTransactionsResponse` (`.docs`), `VivenuScansResponse` (`.docs`)

**BQ row types:**
- `RawTicketRow`, `RawTransactionRow`, `RawScanRow` - mirror the 3 raw tables
- `CleanTicketRow` - `mercer_analytics.tickets` (enriched with transaction fees + scan data)
- `PartnerConfig`, `UnknownUndershop` - reference tables
- `DailyRevenueSummary`, `DailyCapacitySummary` - analytics summaries

**Other:**
- `EmailDigestPayload`, `ChannelSummary` - email digest data structures
- `IngestionResult` - tracks counts for all 3 sources separately

---

## Key Patterns

### BigQuery access
Use `@google-cloud/bigquery` library. All queries go through the BQ client, not raw REST.

```typescript
import { BigQuery } from '@google-cloud/bigquery';
const bq = new BigQuery({ projectId: 'mercer-labs-488707' });
```

### Three-table raw layer
The Vivenu API provides data across 3 separate endpoints. We land each into its own raw table:
- **Tickets** have core ticket info (price, status, customer, undershop)
- **Transactions** have payment details (fees, payment method, tax) and group tickets into orders
- **Scans** are individual barcode scan events from the Portier service (not embedded in tickets)

The analytics transform joins all three: `raw_tickets LEFT JOIN raw_transactions ON transaction_id LEFT JOIN (aggregated scans) ON ticket_id`.

### Commission calculation
Net revenue is derived from the partners table:
```
net_price = real_price * net_revenue_multiplier
```
Where `net_revenue_multiplier = 1 - commission_rate`. Complimentary tickets have net revenue of 0 regardless of face value.

### PII handling
- `raw_vivenu` contains full PII (names, emails, addresses). Restricted access.
- `mercer_analytics.tickets` anonymises: emails are SHA-256 hashed, names are excluded entirely.
- `mercer_analytics.daily_*` tables contain no PII at all. Aggregated data only.
- Dashboard users only see `mercer_analytics`. Never expose `raw_vivenu` in any reporting layer.

### Scan deduplication
Scans are individual rows in `raw_vivenu.raw_scans` (from the Portier API). Multiple scans per ticket are possible. The analytics transform takes `MIN(scan_time) WHERE scan_type = 'checkin'` as the real check-in time. `total_scan_count` is preserved for QA.

### Unknown undershop detection
After every ingestion run, check for undershop_ids in `raw_tickets` not in `reference.partners`. Insert new ones into `reference.unknown_undershops`. Log a warning. These need manual resolution.

---

## Environment Variables

Cloud Functions need these from Secret Manager:

**vivenu-ingest:**
- `vivenu-api-key` - Vivenu API authentication

**daily-email-digest:**
- `claude-api-key` - Claude API for narrative generation
- `sendgrid-api-key` - SendGrid for email delivery

---

## Data Protection

This project processes personal data of Mercer Labs customers. Three regulatory frameworks apply:

- **NY SHIELD Act** - requires reasonable safeguards for NY resident data
- **UK GDPR** - Massive Marketing (UK processor) processing for Mercer Labs (US controller)
- **EU GDPR** - EU tourists visit Mercer Labs, data must meet GDPR standards

---

## Decision Log

| Decision | Rationale | Date |
|---|---|---|
| Separate GCP project from massive-marketing | Client data isolation, clean billing, easy handoff or teardown | 2026-02-27 |
| GCP Project ID `mercer-labs-488707` | Created by user in GCP console | 2026-03-05 |
| Three raw tables (tickets + transactions + scans) | Vivenu API serves these from 3 separate endpoints with different shapes. Transactions have fee/payment data not on tickets. Scans come from separate Portier service. | 2026-03-05 |
| TypeScript strict mode | Pipeline runs unattended at 6am. Type safety catches bugs at build time. | 2026-02-27 |
| us-east1 region | Closest GCP region to NYC where Mercer Labs operates | 2026-02-27 |
| BigQuery over Supabase | Analytics workload, SQL transforms, native Looker Studio connection | 2026-02-27 |
| 3-day rolling ingestion window | Handles Vivenu data lag. MERGE upsert prevents duplicates. | 2026-02-27 |
| Raw data first, transform second | Land everything untransformed, then build analytics tables via scheduled queries | 2026-02-27 |
| SHA-256 email hashing (not removal) | Allows repeat visitor analysis without exposing PII in analytics layer | 2026-02-27 |
| Claude Sonnet for email digest | Fast, cheap, more than capable for structured data to narrative | 2026-02-27 |
| SendGrid over Gmail API | Simpler auth, free tier covers the volume | 2026-02-27 |

---

## What NOT to Change

- Do not modify `reference.partners` schema without updating both transform queries and the `PartnerConfig` type
- Do not remove `raw_vivenu` dataset or its tables. This is the audit trail and PII source of truth.
- Do not change primary key columns (`ticket_id`, `transaction_id`, `scan_id`). MERGE upsert keys on these.
- Do not expose `raw_vivenu` tables in Looker Studio or any reporting layer. PII must stay in raw.
- Do not hardcode commission rates in transform queries. They come from `reference.partners` exclusively.
- Do not mix up the two Vivenu API hosts: `vivenu.com/api` (tickets + transactions) vs `portier.vivenu.com/api` (scans).
