# Mercer Labs Analytics Pipeline — Implementation Plan

## Project Overview

Build a data warehouse and analytics pipeline for Mercer Labs, a venue/experience in New York City. The system ingests ticket sales and check-in (redemption) data from their ticketing platform **Vivenu**, transforms it into analytics-ready tables in **Google BigQuery**, and enables reporting on actual net revenue by sales channel per day — solving their core problem of over-reporting revenue from third-party partners.

### The Core Business Problem

Mercer Labs sells tickets through multiple channels: their own website, internal bookings (hotels, group sales), and third-party platforms (Get Your Guide, Viator, Groupon). Third-party sales show full face value (e.g. $50) but Mercer only receives ~70% after commissions. Current reporting uses gross sales figures, massively over-reporting actual revenue. Additionally, they don't utilise scan/redemption data at all — leading to operational mismatches (e.g. Valentine's Day: $100k in sales but $200k worth of redemptions showing up).

### Target Outcome

A single daily-updated system where Mercer can see:
- **Net revenue by channel by day** (actual money received, not face value)
- **Redemptions matched to purchases** (who bought when vs. who showed up when)
- **Full funnel** from web traffic → purchase → redemption
- **AI-queryable** via Slack bot (future phase)

---

## GCP Project Setup

### Create New Project

This is a standalone GCP project, separate from the `massive-marketing` project used for agency analytics.

- **Project name**: `mercer-labs-488707`
- **Billing**: Link to existing billing account
- **Region**: `us-east1` (closest to NYC where Mercer Labs operates)

### Enable APIs

```bash
gcloud services enable \
  bigquery.googleapis.com \
  cloudfunctions.googleapis.com \
  cloudscheduler.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  run.googleapis.com
```

### Store Secrets

```bash
# Vivenu API credentials
gcloud secrets create vivenu-api-key --replication-policy="automatic"
echo -n "VIVENU_API_KEY_HERE" | gcloud secrets versions add vivenu-api-key --data-file=-

# Claude API key (for automated email digest)
gcloud secrets create claude-api-key --replication-policy="automatic"
echo -n "CLAUDE_API_KEY_HERE" | gcloud secrets versions add claude-api-key --data-file=-

# SendGrid API key (for email delivery)
gcloud secrets create sendgrid-api-key --replication-policy="automatic"
echo -n "SENDGRID_API_KEY_HERE" | gcloud secrets versions add sendgrid-api-key --data-file=-

# If GA4 integration is added later
gcloud secrets create ga4-credentials --replication-policy="automatic"
```

---

## TypeScript Configuration

All Cloud Functions are written in TypeScript with strict mode enabled. This catches type errors at build time rather than at 6am when the pipeline runs unattended.

### tsconfig.json (shared base)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "exclude": ["node_modules", "dist"]
}
```

### Key Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x"
  },
  "dependencies": {
    "@google-cloud/bigquery": "^7.x",
    "@google-cloud/secret-manager": "^5.x",
    "@google-cloud/functions-framework": "^3.x"
  }
}
```

The `@google-cloud/bigquery` library ships with native TypeScript definitions. No `@types` package needed.

### Shared Types (functions/shared/types.ts)

Define types for Vivenu API responses and BQ row schemas here. Both Cloud Functions import from this file so data shapes are consistent across ingestion and reporting.

Key types to define:

- `VivenuTicket` - ticket from `vivenu.com/api/tickets` (uses `_id`, `realPrice`, `regularPrice`, `categoryName`)
- `VivenuTransaction` - order from `vivenu.com/api/transactions` (fees, payment info, tax)
- `VivenuScan` - scan from `portier.vivenu.com/api/scans` (uses `ticketId`, `time`, `type`)
- Paginated response wrappers: `VivenuTicketsResponse` (`.rows`), `VivenuTransactionsResponse` (`.docs`), `VivenuScansResponse` (`.docs`)
- `RawTicketRow`, `RawTransactionRow`, `RawScanRow` - BQ rows for the 3 raw tables
- `CleanTicketRow` - BQ row for `mercer_analytics.tickets` (enriched, anonymised)
- `PartnerConfig` - partner reference table row
- `DailyRevenueSummary`, `DailyCapacitySummary` - analytics summaries
- `EmailDigestPayload` - structured data sent to Claude API for narrative generation
- `IngestionResult` - return type tracking counts for all 3 sources separately

### Build and Deploy

Cloud Functions need compiled JS for deployment. Add a build step:

```bash
# Build
cd functions/vivenu-ingest
npm run build  # runs tsc

# Deploy (points to compiled output)
gcloud functions deploy vivenu-ingest \
  --runtime nodejs20 \
  --source ./dist \
  --entry-point main \
  --trigger-http
```

In `package.json`:
```json
{
  "scripts": {
    "build": "tsc",
    "deploy": "npm run build && gcloud functions deploy ..."
  }
}
```

---

## Vivenu API Integration

### Platform Context

Vivenu is the ticketing platform Mercer Labs uses. It provides REST API access to orders, tickets, check-ins, and events. All data ingestion flows from this API.

### Key Vivenu Concepts

- **Ticket**: Individual admission — one row per person. This is the atomic unit.
- **Transaction**: A purchase/order — groups multiple tickets bought together. One transaction can contain many tickets.
- **Undershop**: Vivenu's concept for a sales channel/partner. Each partner (Get Your Guide, Marriott, Group Sales, etc.) gets their own undershop with a unique `underShopId`. This is the critical field for channel attribution and commission calculation.
- **Check-in**: A barcode scan at the venue entrance. Linked to a ticket via `barcode` or ticket `id`.
- **Event**: The experience being sold (e.g. "Mercer Labs Admission Pass"). Has start/end dates.

### Vivenu API Endpoints (verified against live API 2026-03-05)

Three separate REST API endpoints provide the data we need. Scans come from a completely separate service (Portier).

#### 1. Tickets: `GET vivenu.com/api/tickets`
- **Response**: `{ rows: VivenuTicket[], total: number }`
- **Pagination**: `top` (page size) + `skip` (offset)
- **Date filter**: `createdAt` query param as JSON `{"$gte": "...", "$lte": "..."}`
- **Key fields**: `_id`, `transactionId`, `realPrice`, `regularPrice`, `categoryName`, `underShopId`, `status`, `slotStartTime`
- **Note**: Does NOT contain check-in/scan data or payment/fee details

#### 2. Transactions: `GET vivenu.com/api/transactions`
- **Response**: `{ docs: VivenuTransaction[], total: number }`
- **Pagination**: `top` + `skip`
- **Date filter**: `createdAt` query param as JSON
- **Key fields**: `_id`, `innerCharge` (Vivenu platform fee), `outerCharge` (payment processing fee), `paymentMethod`, `paymentStatus`, `taxRate`, `tickets[]` (line items), full customer PII including address

#### 3. Scans: `GET portier.vivenu.com/api/scans`
- **Response**: `{ docs: VivenuScan[], total: number }`
- **Pagination**: `top` + `skip`
- **Date filter**: `time` query param as JSON
- **Key fields**: `_id`, `ticketId` (FK to tickets), `time`, `type` ('checkin' or 'checkout'), `scanResult`, `deviceId`
- **Note**: Separate Portier service, different base URL from tickets/transactions

#### Authentication
- `Authorization: Bearer <api-key>` header on all requests
- API key stored in GCP Secret Manager as `vivenu-api-key`

### Known Data Patterns

1. **Three-table join**: The analytics transform joins tickets + transactions (on `transaction_id`) + scans (on `ticket_id`) to build the enriched analytics view.
2. **Complimentary tickets**: Identified by undershop naming convention or `is_complimentary` flag in partners table. Track for capacity but exclude from revenue.
3. **71 undershops** discovered on the main "Mercer Labs Admission" event. Naming conventions: `OTA -` (online travel agencies), `TO -` (tour operators), `H -` (hotels), `Group Sales`, `Complimentary`, `Staff Only`.
4. **Scan deduplication**: Multiple scans per ticket are common. Take `MIN(scan_time) WHERE scan_type = 'checkin'` as the real check-in time.
5. **Ticket pricing**: `realPrice` = what customer paid, `regularPrice` = base price. Revenue calculations use `realPrice`.

---

## BigQuery Schema

### Dataset Structure

Create three datasets in the `mercer-labs-488707` project:

```
mercer-labs-488707 (GCP project)
├── raw_vivenu          # Untransformed API responses — land everything here first
├── mercer_analytics    # Clean, query-ready tables
└── reference           # Slowly-changing dimension tables (partners, pricing, events)
```

### Dataset: `raw_vivenu`

Three raw tables matching the three Vivenu API endpoints. Land everything as-is — if Vivenu changes their API or you need a field you weren't extracting, you have the raw data to reprocess.

#### Table: `raw_tickets` (from vivenu.com/api/tickets)

```sql
CREATE TABLE raw_vivenu.raw_tickets (
  ticket_id STRING NOT NULL,              -- Vivenu _id
  transaction_id STRING,
  barcode STRING,
  secret STRING,
  customer_id STRING,
  customer_name STRING,
  customer_firstname STRING,
  customer_lastname STRING,
  customer_email STRING,
  event_id STRING,
  root_event_id STRING,
  ticket_type_id STRING,
  ticket_name STRING,
  category_name STRING,
  category_ref STRING,
  real_price FLOAT64,                      -- What customer pays per ticket
  regular_price FLOAT64,                   -- Base price before fees
  currency STRING,
  status STRING,                           -- VALID, RESERVED, INVALID
  ticket_type STRING,
  delivery_type STRING,
  cart_item_id STRING,
  checkout_id STRING,
  origin STRING,
  sales_channel_id STRING,
  undershop_id STRING,
  seller_id STRING,
  slot_id STRING,
  slot_start_time STRING,
  personalized BOOL,
  claimed BOOL,
  expired BOOL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL,
  ingestion_batch_id STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY undershop_id, status;
```

#### Table: `raw_transactions` (from vivenu.com/api/transactions)

```sql
CREATE TABLE raw_vivenu.raw_transactions (
  transaction_id STRING NOT NULL,
  seller_id STRING,
  customer_id STRING,
  event_id STRING,
  customer_name STRING,
  customer_firstname STRING,
  customer_lastname STRING,
  customer_email STRING,
  customer_phone STRING,
  customer_street STRING,
  customer_city STRING,
  customer_state STRING,
  customer_country STRING,
  customer_postal STRING,
  ticket_count INT64,
  currency STRING,
  regular_price FLOAT64,
  real_price FLOAT64,
  payment_charge FLOAT64,
  inner_charge FLOAT64,                    -- Vivenu platform fee
  outer_charge FLOAT64,                    -- Payment processing fee
  payment_method STRING,
  payment_status STRING,
  status STRING,
  origin STRING,
  sales_channel_id STRING,
  undershop_id STRING,
  checkout_id STRING,
  tax_rate FLOAT64,
  tickets_json STRING,                     -- Full ticket line items as JSON
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL,
  ingestion_batch_id STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY undershop_id, status;
```

#### Table: `raw_scans` (from portier.vivenu.com/api/scans)

```sql
CREATE TABLE raw_vivenu.raw_scans (
  scan_id STRING NOT NULL,
  ticket_id STRING,                        -- FK to raw_tickets.ticket_id
  scan_time TIMESTAMP,
  event_id STRING,
  barcode STRING,
  customer_name STRING,
  ticket_type_id STRING,
  ticket_name STRING,
  device_id STRING,
  scan_type STRING,                        -- "checkin" or "checkout"
  scan_result STRING,
  seller_id STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL,
  ingestion_batch_id STRING
)
PARTITION BY DATE(scan_time)
CLUSTER BY ticket_id, scan_type;
```

**Notes:**
- All three tables use MERGE (upsert) on their primary key during ingestion
- 3-day rolling window handles data lag — MERGE prevents duplicates
- Scans are separate rows, not embedded in tickets (Portier is a separate service)

### Dataset: `reference`

#### Table: `partners`

Maps Vivenu undershops to commission rates and partner types. This is the key table for net revenue calculation.

```sql
CREATE TABLE reference.partners (
  undershop_id STRING NOT NULL,            -- FK to raw_tickets.undershop_id
  undershop_name STRING,                   -- Human-readable name from Vivenu
  partner_type STRING,                     -- Category: 'direct', 'hotel', 'third_party', 'complimentary', 'group', 'internal'
  commission_rate FLOAT64,                 -- What the partner takes (0.30 = 30%)
  net_revenue_multiplier FLOAT64,          -- What Mercer keeps (1 - commission_rate, so 0.70)
  is_complimentary BOOL DEFAULT FALSE,     -- If true, exclude from revenue calculations
  is_active BOOL DEFAULT TRUE,             -- Soft delete
  notes STRING,                            -- Any special pricing notes
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

**Initial seed data** (confirm exact rates with Mercer):

```sql
INSERT INTO reference.partners (undershop_id, undershop_name, partner_type, commission_rate, net_revenue_multiplier, is_complimentary)
VALUES
  -- Known from sample export (commission rates TBD — placeholder 0.0)
  ('687ab27e423ac1972951c0d6', 'Universal Vision / Jupiter Legend', 'third_party', 0.0, 1.0, FALSE),
  ('687ab25eaf7bc8b49c0071f5', 'Marriott Downtown', 'hotel', 0.0, 1.0, FALSE),
  ('6887a96b637e5a67d6b02920', 'Open-Ended Complimentary Tickets', 'complimentary', 0.0, 0.0, TRUE),
  ('6887c32e0f231a78d6f0ae83', 'Group Sales', 'group', 0.0, 1.0, FALSE);
  -- Add Get Your Guide, Viator, Groupon, direct web, etc. once undershop_ids are confirmed
```

#### Table: `unknown_undershops`

Auto-populated when ingestion encounters an undershop_id not in the partners table. This ensures new partners are flagged for setup rather than silently dropping revenue data.

```sql
CREATE TABLE reference.unknown_undershops (
  undershop_id STRING NOT NULL,
  undershop_name STRING,
  first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  sample_ticket_id STRING,                 -- Example ticket for investigation
  sample_price FLOAT64,                    -- Example price for context
  ticket_count INT64 DEFAULT 1,            -- How many tickets seen from this undershop
  resolved BOOL DEFAULT FALSE,             -- Set to TRUE once added to partners table
  resolved_at TIMESTAMP
);
```

#### Table: `events`

Reference table for Mercer Labs events/experiences. Useful for capacity reporting and event-level analysis.

```sql
CREATE TABLE reference.events (
  event_id STRING NOT NULL,
  event_name STRING,
  event_start TIMESTAMP,
  event_end TIMESTAMP,
  daily_capacity INT64,                    -- Max tickets per day (for utilisation reporting)
  is_active BOOL DEFAULT TRUE,
  notes STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

### Dataset: `mercer_analytics`

These are the clean, transformed tables built by scheduled queries from `raw_vivenu` data.

#### Table: `tickets`

Clean ticket data enriched with transaction fees and scan data. **PII is anonymised** — customer names excluded, emails SHA-256 hashed. Built by joining `raw_tickets + raw_transactions + raw_scans + reference.partners`.

```sql
CREATE TABLE mercer_analytics.tickets (
  -- Identifiers
  ticket_id STRING NOT NULL,
  transaction_id STRING,
  barcode STRING,

  -- Customer (anonymised)
  customer_id STRING,
  customer_email_hash STRING,              -- SHA-256 hash of email

  -- Event
  event_id STRING,
  root_event_id STRING,

  -- Ticket details
  ticket_name STRING,
  category_name STRING,
  slot_start_time STRING,

  -- Sales channel
  undershop_id STRING,
  partner_type STRING,                     -- From reference.partners

  -- Pricing
  real_price FLOAT64,                      -- What customer paid
  regular_price FLOAT64,                   -- Base price
  commission_rate FLOAT64,                 -- From reference.partners
  net_price FLOAT64,                       -- real_price * net_revenue_multiplier
  is_complimentary BOOL,

  -- Status
  status STRING,
  origin STRING,

  -- Timestamps
  purchased_at TIMESTAMP,
  purchase_date DATE,

  -- Transaction-level data (from raw_transactions)
  payment_method STRING,
  payment_status STRING,
  inner_charge_per_ticket FLOAT64,         -- Vivenu fee allocated per ticket
  outer_charge_per_ticket FLOAT64,         -- Payment fee allocated per ticket
  tax_rate FLOAT64,

  -- Redemption (from raw_scans - first checkin only)
  was_redeemed BOOL,
  first_checkin_at TIMESTAMP,
  checkin_date DATE,
  checkin_device STRING,
  total_scan_count INT64,

  -- Metadata
  ingested_at TIMESTAMP
)
PARTITION BY purchase_date
CLUSTER BY undershop_id, was_redeemed;
```

#### Table: `daily_revenue_summary`

The money table. Pre-aggregated daily revenue by channel with net vs. gross breakdown.

```sql
CREATE TABLE mercer_analytics.daily_revenue_summary (
  report_date DATE NOT NULL,
  undershop_id STRING,
  partner_type STRING,

  -- Sales metrics
  tickets_sold INT64,
  orders INT64,
  gross_revenue FLOAT64,
  net_revenue FLOAT64,
  deferred_revenue FLOAT64,
  avg_ticket_price FLOAT64,
  total_inner_charges FLOAT64,             -- Vivenu platform fees
  total_outer_charges FLOAT64,             -- Payment processing fees

  -- Redemption metrics
  tickets_redeemed INT64,
  unique_transactions_redeemed INT64,

  -- Complimentary
  comp_tickets_sold INT64,
  comp_tickets_redeemed INT64,

  -- Rates
  redemption_rate FLOAT64,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY report_date
CLUSTER BY partner_type;
```

#### Table: `daily_capacity_summary`

Operational table for staffing — how many people actually showed up each day regardless of when they bought.

```sql
CREATE TABLE mercer_analytics.daily_capacity_summary (
  checkin_date DATE NOT NULL,
  
  -- Total footfall
  total_checkins INT64,                    -- All scanned tickets
  paid_checkins INT64,                     -- Excluding complimentary
  comp_checkins INT64,                     -- Complimentary only
  
  -- By time (if slot data available)
  -- These would be STRUCT or separate rows — TBD based on slot data quality
  
  -- By channel
  checkins_direct INT64,
  checkins_hotel INT64,
  checkins_third_party INT64,
  checkins_group INT64,
  checkins_complimentary INT64,
  
  -- Revenue walking in the door
  gross_revenue_redeemed FLOAT64,          -- Face value of redeemed tickets
  net_revenue_redeemed FLOAT64,            -- Actual revenue of redeemed tickets
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY checkin_date;
```

---

## Ingestion Pipeline

### Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌───────────────────────┐
│   Cloud          │     │  Cloud Function       │     │   BigQuery raw_vivenu  │
│   Scheduler      │────▶│  vivenu-ingest        │────▶│   .raw_tickets         │
│   (06:00 daily)  │     │                       │     │   .raw_transactions    │
└─────────────────┘     │  3 API endpoints:      │     │   .raw_scans           │
                         │  - vivenu.com tickets  │     └────────┬──────────────┘
                         │  - vivenu.com txns     │              │
                         │  - portier scans       │     ┌────────▼────────┐
                         │  MERGE into 3 tables   │     │  Scheduled Query  │
                         │  Flag new undershops   │     │  (06:30 daily)   │
                         └──────────────────────┘     │  Join 3 tables → │
                                                       │  mercer_analytics │
                                                       └────────┬────────┘
                                                                │
┌─────────────────┐     ┌──────────────────────┐               │
│   Cloud          │     │  Cloud Function       │◀──────────────┘
│   Scheduler      │────▶│  daily-email-digest   │
│   (07:00 daily)  │     │                       │     ┌──────────────────┐
└─────────────────┘     │  1. Query BQ summaries │     │  Looker Studio    │
                         │  2. Claude API → text  │     │  (self-serve,     │
                         │  3. SendGrid → email   │     │   always-on)      │
                         └──────────────────────┘     └──────────────────┘
```

**Daily pipeline schedule** (all times US Eastern):

| Time | Job | Duration | Depends on |
|------|-----|----------|------------|
| 06:00 | `vivenu-ingest` Cloud Function | ~30-60s | Vivenu API |
| 06:30 | BQ scheduled transforms (3 queries) | ~10-30s | Ingestion complete |
| 07:00 | `daily-email-digest` Cloud Function | ~10-20s | Transforms complete |
| Always | Looker Studio dashboards | Real-time | Queries `mercer_analytics` live |

### Cloud Function: `vivenu-ingest`

**Runtime**: Node.js 20 with TypeScript

**Language**: TypeScript (strict mode). All Cloud Functions in this project are written in TypeScript for type safety across the Vivenu API responses, BigQuery schemas, and data transforms. The `@google-cloud/bigquery` library ships with native TypeScript definitions. Define shared types for Vivenu API responses and BQ row schemas in a `types/` directory so they're reusable across both Cloud Functions.

**Trigger**: Cloud Scheduler, daily at 06:00 US Eastern

**Logic**:

```
1. Read Vivenu API key from Secret Manager
2. Calculate date range: today minus 3 days → today (3-day window for data lag)
3. Fetch all three data sources in parallel:
   a. Tickets from vivenu.com/api/tickets (paginated with top/skip, filtered by createdAt)
   b. Transactions from vivenu.com/api/transactions (paginated with top/skip, filtered by createdAt)
   c. Scans from portier.vivenu.com/api/scans (paginated with top/skip, filtered by time)
4. MERGE each source into its respective raw table in parallel:
   a. raw_tickets on ticket_id
   b. raw_transactions on transaction_id
   c. raw_scans on scan_id
5. Check for unknown undershops:
   - Query raw_tickets for undershop_ids not in reference.partners
   - INSERT new ones into reference.unknown_undershops
   - Log a warning
6. Log summary: counts per table (inserted, updated), unknown undershops, duration
```

**Error handling**:
- Retry on API timeout (3 attempts with exponential backoff)
- If API is completely down, log error and don't update BQ (stale data > wrong data)
- If partial data received, still ingest what you have (3-day window will catch gaps next run)

### Scheduled Query: Transform to Clean Tables

**Trigger**: 06:30 US Eastern daily (30 min after ingestion to ensure it's complete)

#### Transform 1: `raw_tickets + raw_transactions + raw_scans` → `mercer_analytics.tickets`

Joins all three raw tables plus partner reference to build the enriched analytics view.

```sql
MERGE INTO mercer_analytics.tickets AS target
USING (
  SELECT
    t.ticket_id,
    t.transaction_id,
    t.barcode,
    t.customer_id,
    TO_HEX(SHA256(LOWER(TRIM(t.customer_email)))) AS customer_email_hash,
    t.event_id,
    t.root_event_id,
    t.ticket_name,
    t.category_name,
    t.slot_start_time,

    COALESCE(t.undershop_id, tx.undershop_id) AS undershop_id,
    COALESCE(p.partner_type, 'unknown') AS partner_type,

    t.real_price,
    t.regular_price,
    COALESCE(p.commission_rate, 0.0) AS commission_rate,
    CASE
      WHEN p.is_complimentary THEN 0.0
      WHEN t.real_price IS NULL THEN 0.0
      ELSE t.real_price * COALESCE(p.net_revenue_multiplier, 1.0)
    END AS net_price,
    COALESCE(p.is_complimentary, FALSE) AS is_complimentary,

    t.status,
    t.origin,
    t.created_at AS purchased_at,
    DATE(t.created_at) AS purchase_date,

    -- Transaction-level data
    tx.payment_method,
    tx.payment_status,
    SAFE_DIVIDE(tx.inner_charge, tx.ticket_count) AS inner_charge_per_ticket,
    SAFE_DIVIDE(tx.outer_charge, tx.ticket_count) AS outer_charge_per_ticket,
    tx.tax_rate,

    -- Scan data (aggregated per ticket)
    sc.first_checkin_at IS NOT NULL AS was_redeemed,
    sc.first_checkin_at,
    DATE(sc.first_checkin_at) AS checkin_date,
    sc.checkin_device,
    COALESCE(sc.total_scan_count, 0) AS total_scan_count,

    t.ingested_at

  FROM raw_vivenu.raw_tickets t
  LEFT JOIN raw_vivenu.raw_transactions tx
    ON t.transaction_id = tx.transaction_id
  LEFT JOIN reference.partners p
    ON COALESCE(t.undershop_id, tx.undershop_id) = p.undershop_id
  LEFT JOIN (
    SELECT
      ticket_id,
      MIN(CASE WHEN scan_type = 'checkin' THEN scan_time END) AS first_checkin_at,
      ARRAY_AGG(
        CASE WHEN scan_type = 'checkin' THEN device_id END
        IGNORE NULLS ORDER BY scan_time LIMIT 1
      )[SAFE_OFFSET(0)] AS checkin_device,
      COUNT(*) AS total_scan_count
    FROM raw_vivenu.raw_scans
    GROUP BY ticket_id
  ) sc ON t.ticket_id = sc.ticket_id
) AS source
ON target.ticket_id = source.ticket_id
WHEN MATCHED THEN
  UPDATE SET
    status = source.status,
    was_redeemed = source.was_redeemed,
    first_checkin_at = source.first_checkin_at,
    checkin_date = source.checkin_date,
    checkin_device = source.checkin_device,
    total_scan_count = source.total_scan_count,
    payment_method = source.payment_method,
    payment_status = source.payment_status,
    inner_charge_per_ticket = source.inner_charge_per_ticket,
    outer_charge_per_ticket = source.outer_charge_per_ticket,
    tax_rate = source.tax_rate,
    ingested_at = source.ingested_at
WHEN NOT MATCHED THEN
  INSERT ROW;
```

#### Transform 2: Build `daily_revenue_summary`

```sql
CREATE OR REPLACE TABLE mercer_analytics.daily_revenue_summary AS
SELECT
  purchase_date AS report_date,
  undershop_id,
  partner_type,

  COUNT(*) AS tickets_sold,
  COUNT(DISTINCT transaction_id) AS orders,
  SUM(CASE WHEN NOT is_complimentary THEN real_price ELSE 0 END) AS gross_revenue,
  SUM(CASE WHEN NOT is_complimentary THEN net_price ELSE 0 END) AS net_revenue,
  SUM(CASE WHEN NOT is_complimentary THEN (real_price - net_price) ELSE 0 END) AS deferred_revenue,
  SAFE_DIVIDE(
    SUM(CASE WHEN NOT is_complimentary THEN real_price ELSE 0 END),
    COUNTIF(NOT is_complimentary)
  ) AS avg_ticket_price,
  SUM(COALESCE(inner_charge_per_ticket, 0)) AS total_inner_charges,
  SUM(COALESCE(outer_charge_per_ticket, 0)) AS total_outer_charges,

  COUNTIF(was_redeemed AND NOT is_complimentary) AS tickets_redeemed,
  COUNT(DISTINCT CASE WHEN was_redeemed AND NOT is_complimentary THEN transaction_id END) AS unique_transactions_redeemed,

  COUNTIF(is_complimentary) AS comp_tickets_sold,
  COUNTIF(is_complimentary AND was_redeemed) AS comp_tickets_redeemed,

  SAFE_DIVIDE(
    COUNTIF(was_redeemed AND NOT is_complimentary),
    COUNTIF(NOT is_complimentary)
  ) AS redemption_rate,

  CURRENT_TIMESTAMP() AS updated_at

FROM mercer_analytics.tickets
GROUP BY 1, 2, 3;
```

#### Transform 3: Build `daily_capacity_summary`

```sql
CREATE OR REPLACE TABLE mercer_analytics.daily_capacity_summary AS
SELECT
  checkin_date,
  
  COUNTIF(was_redeemed) AS total_checkins,
  COUNTIF(was_redeemed AND NOT is_complimentary) AS paid_checkins,
  COUNTIF(was_redeemed AND is_complimentary) AS comp_checkins,
  
  COUNTIF(was_redeemed AND partner_type = 'direct') AS checkins_direct,
  COUNTIF(was_redeemed AND partner_type = 'hotel') AS checkins_hotel,
  COUNTIF(was_redeemed AND partner_type = 'third_party') AS checkins_third_party,
  COUNTIF(was_redeemed AND partner_type = 'group') AS checkins_group,
  COUNTIF(was_redeemed AND is_complimentary) AS checkins_complimentary,
  
  SUM(CASE WHEN was_redeemed THEN real_price ELSE 0 END) AS gross_revenue_redeemed,
  SUM(CASE WHEN was_redeemed THEN net_price ELSE 0 END) AS net_revenue_redeemed,
  
  CURRENT_TIMESTAMP() AS updated_at

FROM mercer_analytics.tickets
WHERE checkin_date IS NOT NULL
GROUP BY 1;
```

---

## Auto-Discovery of New Undershops

### Logic

Every time the ingestion function runs, it should check for undershop IDs in the incoming data that don't exist in `reference.partners`. This handles the case where Mercer adds a new partner/sales channel without telling us.

### Implementation

In the Cloud Function, after the MERGE into `raw_tickets`:

```sql
-- Find undershops in raw data that aren't in partners table
INSERT INTO reference.unknown_undershops (undershop_id, first_seen_at, sample_ticket_id, sample_price, ticket_count)
SELECT
  r.undershop_id,
  CURRENT_TIMESTAMP(),
  ANY_VALUE(r.ticket_id),
  ANY_VALUE(r.real_price),
  COUNT(*)
FROM raw_vivenu.raw_tickets r
LEFT JOIN reference.partners p ON r.undershop_id = p.undershop_id
LEFT JOIN reference.unknown_undershops u ON r.undershop_id = u.undershop_id
WHERE r.undershop_id IS NOT NULL
  AND p.undershop_id IS NULL
  AND u.undershop_id IS NULL
GROUP BY 1;
```

### Alert

When unknown undershops are found, send a notification. Options (implement whichever is easiest first):

1. **Cloud Function logs** — at minimum, log a WARNING level message
2. **Slack webhook** — post to a #mercer-analytics channel: "⚠️ New undershop detected: {name} ({id}). {count} tickets found. Please add commission rate to partners table."
3. **Email** — via SendGrid or similar (lower priority)

### Resolution Workflow

When a new undershop is identified:

1. Get commission rate from Mercer team
2. Insert into `reference.partners` with correct rates
3. Mark as resolved in `reference.unknown_undershops`
4. Next scheduled transform will pick up the new partner and recalculate net revenue for those tickets

---

## Scan Deduplication

### The Problem

Scanners at the venue can produce multiple scan events for a single ticket (rapid re-scans, multiple scanner beams). Each scan is an individual row in `raw_vivenu.raw_scans` (from the Portier API).

### The Rule

**Always use the EARLIEST (MIN) checkin timestamp as the actual check-in time.** All subsequent scans for the same ticket are ignored for reporting purposes.

### Implementation

Handled in the Transform 1 SQL via a subquery that aggregates scans per ticket:

```sql
SELECT
  ticket_id,
  MIN(CASE WHEN scan_type = 'checkin' THEN scan_time END) AS first_checkin_at,
  ARRAY_AGG(
    CASE WHEN scan_type = 'checkin' THEN device_id END
    IGNORE NULLS ORDER BY scan_time LIMIT 1
  )[SAFE_OFFSET(0)] AS checkin_device,
  COUNT(*) AS total_scan_count
FROM raw_vivenu.raw_scans
GROUP BY ticket_id
```

The `total_scan_count` field is preserved for QA — high scan counts may indicate hardware issues.

---

## Code Repository Structure

```
/mercer-labs-488707
├── README.md                              # This plan
├── /functions
│   ├── /vivenu-ingest
│   │   ├── index.ts                       # Main Cloud Function
│   │   ├── package.json                   # Dependencies
│   │   ├── tsconfig.json                  # TypeScript config (strict mode)
│   │   ├── vivenu-client.ts               # Vivenu API wrapper
│   │   ├── bigquery-writer.ts             # BQ MERGE logic
│   │   ├── undershop-checker.ts           # New undershop detection
│   │   └── DEPLOY.md                      # Deployment instructions
│   ├── /daily-email-digest
│   │   ├── index.ts                       # Main Cloud Function
│   │   ├── package.json                   # Dependencies
│   │   ├── tsconfig.json                  # TypeScript config (strict mode)
│   │   ├── bq-queries.ts                  # BigQuery data fetching (yesterday, comparisons, alerts)
│   │   ├── claude-client.ts               # Claude API wrapper for narrative generation
│   │   ├── email-sender.ts                # SendGrid/Gmail API email delivery
│   │   └── DEPLOY.md                      # Deployment instructions
│   └── /shared
│       └── types.ts                       # Shared TypeScript types (Vivenu responses, BQ row schemas, partner configs)
├── /sql
│   ├── /schemas
│   │   ├── 01-create-datasets.sql         # CREATE SCHEMA statements
│   │   ├── 02-raw-tables.sql              # raw_vivenu tables
│   │   ├── 03-reference-tables.sql        # reference tables + seed data
│   │   └── 04-analytics-tables.sql        # mercer_analytics tables
│   ├── /transforms
│   │   ├── transform-tickets.sql          # raw → clean tickets (scheduled)
│   │   ├── transform-daily-revenue.sql    # Build daily_revenue_summary (scheduled)
│   │   └── transform-daily-capacity.sql   # Build daily_capacity_summary (scheduled)
│   └── /reports
│       ├── revenue-by-channel.sql         # Ad-hoc: net revenue by channel for date range
│       ├── redemption-vs-sales.sql        # Ad-hoc: the Valentine's Day problem query
│       ├── unknown-undershops.sql         # Ad-hoc: check for unresolved partners
│       └── scanner-issues.sql             # Ad-hoc: tickets with high scan counts
├── /config
│   ├── partners-seed.json                 # Initial partner/commission data
│   ├── events-seed.json                   # Initial event metadata
│   ├── email-recipients.json              # Daily digest and alert recipient lists
│   └── email-digest-system-prompt.txt     # Claude API system prompt for narrative generation
├── /docs
│   ├── data-flow-diagram.md               # Vivenu → GCP → BQ → Looker (for DPA appendix)
│   ├── data-retention-policy.md           # Retention periods and deletion process
│   └── security-checklist.md              # IAM, audit logging, encryption verification
├── /scripts
│   ├── setup-gcp.sh                       # GCP project setup (APIs, secrets, etc.)
│   ├── deploy-function.sh                 # Deploy Cloud Function
│   ├── schedule-jobs.sh                   # Set up Cloud Scheduler
│   └── backfill.sh                        # One-time historical data pull
└── CLAUDE_CODE_CONTEXT.md                 # Handoff doc for Claude Code sessions
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)

1. **Draft and sign Data Processing Agreement with Mercer Labs** (legal prerequisite — no data pull without this)
2. Create GCP project, enable APIs, and configure security (IAM roles, audit logging, 2FA, Secret Manager)
3. Create BigQuery datasets and all tables (run schema SQL)
4. Get Vivenu API credentials from Mercer and store in Secret Manager
5. Build and test Vivenu API client locally
6. Test a manual data pull — confirm field mapping matches sample export
7. Seed the partners reference table with known undershops and placeholder commission rates
8. Run initial backfill of historical data

### Phase 2: Pipeline (Week 2)

1. Build the Cloud Function for daily ingestion
2. Implement MERGE (upsert) logic
3. Implement unknown undershop detection
4. Deploy to GCP
5. Set up Cloud Scheduler (06:00 daily)
6. Create and schedule the three transform queries (06:30 daily)
7. Test full pipeline end-to-end: ingestion → transform → verify summary tables

### Phase 3: Reporting — Looker Studio Dashboards (Week 3)

1. Build Looker Studio dashboards connected to `mercer_analytics` dataset (see Reporting section below for full spec)
2. Configure dashboard access — Mercer team gets viewer access via shared link, no direct BQ access
3. Write ad-hoc report queries for common questions
4. Test with Mercer team, iterate on dashboard layout and metrics

### Phase 4: Reporting — Automated Email Digest (Week 3-4)

1. Build the `daily-email-digest` Cloud Function (Claude API generates narrative from BQ data)
2. Configure SendGrid (or Gmail API) for email delivery
3. Set up Cloud Scheduler trigger at 07:00 US Eastern
4. Test email output with Mercer leadership — iterate on tone, metrics, and format
5. Add unknown undershop and scanner anomaly alerts to the email

### Phase 5: Enhancements (Week 5+)

1. GA4 BigQuery export integration (web funnel data)
2. Slack bot for AI-queryable analytics (reuse architecture from Massive Marketing pipeline)
3. Refund tracking (requires Vivenu transactions/orders API endpoint)
4. Timeslot-based capacity reporting (if slot data quality is sufficient)

---

## Reporting & Visualisation

### Overview

Three reporting layers, each serving a different audience and use case:

| Layer | Audience | Frequency | Purpose |
|-------|----------|-----------|---------|
| Looker Studio dashboards | Ops team, marketing, anyone who wants to dig in | Self-serve, real-time | Interactive exploration, filtering, drill-down |
| Automated email digest | Senior leadership (Alexis, founders) | Daily at 07:00 ET | AI-generated narrative summary — read in 30 seconds |
| Raw BQ access | Andy (for auditing, ad-hoc deep dives) | As needed | Direct SQL queries for specific investigations |

No Google Sheets export — data lives in BigQuery and is accessed via Looker or email. If ad-hoc spreadsheet analysis is ever needed, Mercer can export from Looker Studio or request a specific date range export from BQ.

### Looker Studio Dashboards

Looker Studio connects natively to BigQuery at no additional cost. Dashboards are shared via link — Mercer team gets viewer access without needing GCP accounts or direct BQ access. All dashboards query from `mercer_analytics` (anonymised, no PII).

#### Dashboard 1: Revenue Overview (the headline dashboard)

**Data source**: `mercer_analytics.daily_revenue_summary`

**Top-level scorecards** (yesterday's numbers with week-on-week comparison):
- Net revenue (the number that matters)
- Gross revenue (face value)
- Deferred revenue (commission gap — the money they're NOT receiving)
- Total tickets sold
- Total orders

**Charts**:
- **Net revenue by day** — time series, last 30 days. Line chart with gross revenue overlaid as a lighter line so leadership can see the gap.
- **Revenue by channel** — stacked bar chart by day showing net revenue split by `partner_type` (direct, hotel, third_party, group). This instantly shows which channels drive actual revenue.
- **Channel mix pie/donut** — percentage of net revenue by partner for selected date range. Answers "what % of our real revenue comes from Viator vs direct?"
- **Top undershops table** — ranked by net revenue for selected period. Columns: undershop name, partner type, tickets sold, gross revenue, commission rate, net revenue, % of total.
- **Commission leakage** — bar chart showing deferred revenue by channel. Highlights how much money is going to partners. Useful for renegotiation leverage.

**Filters**: Date range picker, partner type dropdown, undershop name dropdown.

#### Dashboard 2: Redemptions & Capacity (the ops dashboard)

**Data source**: `mercer_analytics.daily_capacity_summary` + `mercer_analytics.tickets`

**Top-level scorecards** (yesterday):
- Total check-ins
- Paid check-ins vs. complimentary
- Capacity utilisation % (if daily capacity is set in `reference.events`)
- Redemption rate (tickets redeemed / tickets sold)

**Charts**:
- **Daily check-ins** — time series, last 30 days. Stacked by partner type to show the mix of who's actually walking in the door.
- **Sales vs. redemptions by day** — dual-axis or side-by-side bar chart. This is the Valentine's Day chart — shows the mismatch between when tickets are sold and when people show up.
- **Redemption lag** — scatter or histogram showing the gap (in days) between `purchase_date` and `checkin_date`. Answers "how far in advance do people buy vs when they visit?"
- **Check-ins by channel** — shows which partner channels have highest redemption rates. If Groupon buyers have a 40% no-show rate, that's useful intelligence.
- **Scanner anomalies** — table of tickets with `total_scan_count > 5` in the last 7 days. Flags hardware issues or process problems at the door.

**Filters**: Date range picker, partner type, event name.

#### Dashboard 3: Partner Performance (the commercial dashboard)

**Data source**: `mercer_analytics.daily_revenue_summary` + `reference.partners`

**Purpose**: Give Mercer ammunition for partner negotiations and channel strategy.

**Charts**:
- **Net revenue per ticket by channel** — bar chart comparing average net revenue per ticket across undershops. Instantly shows which partners are most/least profitable per head.
- **Volume vs. profitability** — scatter plot with tickets sold on X axis, net revenue per ticket on Y axis, bubble size = total net revenue. Shows the trade-off between volume and margin per channel.
- **Channel trend** — time series of ticket volume by partner type over last 90 days. Spot if a channel is growing or declining.
- **Commission rate comparison** — horizontal bar chart of effective commission rates by partner.

**Filters**: Date range, partner type.

#### Dashboard 4: Alerts & Data Quality

**Data source**: `reference.unknown_undershops` + `mercer_analytics.tickets`

**Purpose**: Operational monitoring of the pipeline itself.

**Widgets**:
- **Unresolved undershops** — table showing unknown undershops with `resolved = FALSE`. Columns: undershop name, first seen, ticket count, sample price.
- **Data freshness** — scorecard showing the most recent `ingested_at` timestamp. If this is more than 26 hours old, the pipeline may have failed.
- **High scan count tickets** — table of recent tickets with abnormal scan counts.
- **Complimentary ticket volume** — trend of comp tickets to flag if they're being overused.

### Automated Email Digest (Claude API)

#### Architecture

```
┌─────────────────┐     ┌──────────────────────────────┐     ┌──────────────┐
│  Cloud           │     │  Cloud Function               │     │  SendGrid /   │
│  Scheduler       │────▶│  daily-email-digest           │     │  Gmail API    │
│  (07:00 ET)      │     │                               │────▶│              │
└─────────────────┘     │  1. Query BQ for yesterday's   │     │  → Alexis    │
                         │     data + comparisons         │     │  → Leadership│
                         │  2. Build data payload         │     └──────────────┘
                         │  3. Send to Claude API with    │
                         │     system prompt              │
                         │  4. Claude generates narrative  │
                         │  5. Format as HTML email       │
                         │  6. Send via SendGrid          │
                         └──────────────────────────────┘
```

**Trigger**: Cloud Scheduler at 07:00 US Eastern daily (1 hour after ingestion + transforms complete).

**Why 07:00**: Leadership checks email first thing. By 07:00, the 06:00 ingestion and 06:30 transforms are complete, and the email is waiting in their inbox before the workday starts.

#### Cloud Function: `daily-email-digest`

**Runtime**: Node.js 20 with TypeScript (same config as vivenu-ingest)

**Step 1: Query BigQuery**

Pull four data sets:

```sql
-- Yesterday's summary
SELECT * FROM mercer_analytics.daily_revenue_summary
WHERE report_date = CURRENT_DATE('America/New_York') - 1;

-- Same day last week (for comparison)
SELECT * FROM mercer_analytics.daily_revenue_summary
WHERE report_date = CURRENT_DATE('America/New_York') - 8;

-- Yesterday's capacity
SELECT * FROM mercer_analytics.daily_capacity_summary
WHERE checkin_date = CURRENT_DATE('America/New_York') - 1;

-- Trailing 7-day averages
SELECT
  AVG(net_revenue) AS avg_daily_net_revenue,
  AVG(tickets_sold) AS avg_daily_tickets,
  AVG(tickets_redeemed) AS avg_daily_redemptions
FROM mercer_analytics.daily_revenue_summary
WHERE report_date BETWEEN
  CURRENT_DATE('America/New_York') - 8
  AND CURRENT_DATE('America/New_York') - 2;

-- Unresolved undershops (for alerts)
SELECT * FROM reference.unknown_undershops
WHERE resolved = FALSE;
```

**Step 2: Build data payload**

Structure the query results into a clean JSON object:

```json
{
  "report_date": "2026-02-25",
  "day_of_week": "Wednesday",
  "yesterday": {
    "net_revenue": 47200,
    "gross_revenue": 62400,
    "deferred_revenue": 15200,
    "tickets_sold": 2843,
    "orders": 1891,
    "total_checkins": 3104,
    "paid_checkins": 2780,
    "comp_checkins": 324,
    "channels": [
      {"name": "Viator", "type": "third_party", "tickets": 967, "net_revenue": 14500, "commission_rate": 0.30},
      {"name": "Direct Web", "type": "direct", "tickets": 812, "net_revenue": 16240, "commission_rate": 0},
      {"name": "Marriott Downtown", "type": "hotel", "tickets": 240, "net_revenue": 4800, "commission_rate": 0.15}
    ]
  },
  "same_day_last_week": {
    "net_revenue": 42100,
    "tickets_sold": 2540
  },
  "trailing_7_day_avg": {
    "net_revenue": 44800,
    "tickets_sold": 2650,
    "redemptions": 2900
  },
  "alerts": {
    "unknown_undershops": [
      {"name": "Broadway Concierge", "ticket_count": 3, "first_seen": "2026-02-25"}
    ]
  }
}
```

**Step 3: Send to Claude API**

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': CLAUDE_API_KEY, // From Secret Manager
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: EMAIL_DIGEST_SYSTEM_PROMPT, // See below
    messages: [{
      role: 'user',
      content: `Generate the daily briefing email for this data:\n\n${JSON.stringify(dataPayload, null, 2)}`
    }]
  })
});
```

**System prompt** (store in config, not hardcoded):

```
You are a revenue analyst for Mercer Labs, an immersive art experience in New York City. 
Write a concise daily briefing email for senior leadership.

Rules:
- Keep it under 200 words
- Lead with the single most important headline (biggest change, notable milestone, or concern)
- Use 🟢🟡🔴 to flag trends:
  - 🟢 Green: metric improved >5% vs comparison period
  - 🟡 Yellow: metric within ±5% of comparison (flat/steady)
  - 🔴 Red: metric declined >5% vs comparison period
- Always show NET revenue as the primary number, not gross
- Compare to same day last week (not yesterday — day-of-week matters for venues)
- Mention the top 2-3 channels by net revenue contribution
- If redemptions significantly exceed or fall below sales, flag it with context
- If there are alerts (unknown undershops, anomalies), add a short "⚠️ Action needed" section at the end
- Do not use jargon. Write for a founder who doesn't live in spreadsheets.
- Use plain numbers ($47.2k not $47,200.00). Round appropriately.
- Format for email: use line breaks, keep paragraphs short, bold key numbers

Do not include a greeting, sign-off, or subject line — those are added by the system.
```

**Step 4: Format and send email**

```typescript
const emailHtml = `
  <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="margin-bottom: 4px;">Mercer Labs Daily Briefing</h2>
    <p style="color: #666; margin-top: 0;">${reportDate} — ${dayOfWeek}</p>
    <hr style="border: 1px solid #eee;">
    ${claudeResponse}
    <hr style="border: 1px solid #eee;">
    <p style="color: #999; font-size: 12px;">
      <a href="${LOOKER_DASHBOARD_URL}">Open full dashboard →</a><br>
      Auto-generated from Mercer Labs Analytics Pipeline. Data as of 06:30 ET.
    </p>
  </div>
`;
```

Send via SendGrid API (or Gmail API if Mercer prefers branded sending from their domain).

**Step 5: Error handling**

- If BQ query returns no data for yesterday (pipeline issue), send a short alert email instead: "⚠️ No data available for [date]. The analytics pipeline may have failed. Investigating."
- If Claude API fails, fall back to a simple template with raw numbers (no narrative)
- Log all email sends for auditability

#### Email Recipients

Configurable via environment variable or config file:

```json
{
  "daily_digest_recipients": [
    "alexis@mercerlabs.com",
    "andy@massivemarketing.co.uk"
  ],
  "alert_recipients": [
    "andy@massivemarketing.co.uk"
  ]
}
```

Mercer can add/remove recipients without code changes.

#### Example Email Output

> **Mercer Labs Daily Briefing**
> *Tuesday 25 February — Week 9*
>
> ---
>
> 🟢 **Net revenue hit $47.2k yesterday** — up 12% vs last Tuesday ($42.1k) and above the 7-day average of $44.8k.
>
> **2,843 tickets** sold across 1,891 orders. Direct web sales led with **$16.2k** (34% of net revenue, up 18% WoW). Viator drove the most volume at 967 tickets but only **$14.5k net** after their 30% commission. Marriott partnership contributed 240 tickets at $4.8k.
>
> 🟡 **3,104 people checked in** — slightly above sales, likely weekend backlog clearing. Capacity at 82%.
>
> ⚠️ **Action needed**: 3 tickets detected from unknown channel "Broadway Concierge". Please confirm commission rate so revenue can be calculated correctly.

#### Cost Estimate for Email Digest

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Claude API (Sonnet) | $1 - $3 | ~30 calls/month, ~1k input tokens + ~500 output tokens each |
| SendGrid | Free | Free tier covers 100 emails/day |
| Cloud Function invocation | $0.10 | One daily call |
| Secret Manager (Claude key) | $0.06 | One additional secret |
| **Total** | **~$2 - $4/month** | |

Sonnet is the right model here — fast, cheap, and more than capable for structured data → narrative generation. No need for Opus on a templated daily email.

---

## Key Decisions Still Needed from Mercer

Before building, confirm with Mercer (Tuesday meeting):

1. **Vivenu API credentials** — do they have them? What Vivenu plan are they on?
2. **Full list of undershops** — all active sales channels, especially GYG, Viator, Groupon
3. **Commission rates per partner** — exact percentages, and whether they vary by ticket type
4. **Special pricing rules** — the "certain customer types within internal bookings" logic
5. **Historical data needs** — how far back for reporting? How far back can API go?
6. **GA4 property** — is it already exporting to BigQuery? (Property ID from memory: `analytics_480925616` for Mercer)
7. **Primary output format** — daily dashboard, weekly reports, Slack alerts, or all three?
8. **Add-ons** — do they sell add-ons? The field was empty in the sample but could be significant revenue
9. **Refund data** — how are refunds handled in Vivenu? Is there a separate endpoint?
10. **Data Processing Agreement** — "We'll need a DPA in place before we start pulling customer data. We'll draft one for review." Covers: data controller/processor roles, security obligations, breach notification, retention, sub-processors (Google Cloud).
11. **Privacy policy coverage** — does Mercer's customer-facing privacy policy / terms of service cover sharing data with third-party analytics processors?
12. **Security contact** — who at Mercer Labs should be the designated contact for any data security issues?

---

## Cost Estimate

### GCP Costs (Monthly)

| Service | Estimate | Notes |
|---------|----------|-------|
| BigQuery Storage | $0.10 - $0.50 | ~5-10GB first year, mostly long-term after 90 days |
| BigQuery Queries | $1 - $5 | Daily transforms + ad-hoc queries on small tables |
| Cloud Functions | $0.50 - $2 | Two daily invocations (ingestion + email digest), ~30s each |
| Cloud Scheduler | Free | Under 3 jobs |
| Secret Manager | $0.12 | 2-3 secrets (Vivenu API, Claude API, SendGrid) |
| Looker Studio | Free | Native BigQuery connector, no per-user cost |
| Claude API (Sonnet) | $1 - $3 | ~30 daily digest calls/month, small token usage |
| SendGrid | Free | Free tier covers 100 emails/day |
| **Total** | **$3 - $11/month** | |

### Scaling

At 10x volume (50,000 tickets/day), costs would still be under $30/month. BigQuery is absurdly cost-effective at this scale.

---

## Data Protection & Security

### Regulatory Landscape

This project processes personal data of Mercer Labs customers (names, emails, purchase behaviour, check-in times). Three regulatory frameworks apply:

**NY SHIELD Act** (Stop Hacks and Improve Electronic Data Security Act): Requires any business that maintains private information of NY residents to implement reasonable administrative, technical, and physical safeguards — regardless of where the business is located. Both Mercer Labs and Massive Marketing are in scope.

**UK GDPR**: Because Massive Marketing is a UK company processing personal data, UK GDPR applies to our processing activities. We act as a **data processor** on behalf of Mercer Labs (the **data controller**). This requires a written Data Processing Agreement.

**EU GDPR (indirect)**: Mercer Labs is a NYC tourist attraction — a significant portion of customers will be EU/EEA residents. While Mercer Labs bears primary controller responsibility, as their processor we must handle data to GDPR standards.

**Note**: New York does not yet have a comprehensive consumer data privacy law (the NY Privacy Act is still in bill form as of early 2026). If/when it passes, the architecture outlined here should already meet most requirements due to the PII minimisation and security measures in place.

### Legal Prerequisite: Data Processing Agreement (DPA)

**A DPA must be signed before any customer data is pulled from Vivenu.** This is a legal requirement under both UK GDPR and best practice under SHIELD Act.

The DPA must cover:

- **Roles**: Mercer Labs = data controller, Massive Marketing = data processor
- **Purpose**: Processing ticket sales and redemption data for revenue analytics and operational reporting
- **Data categories**: Customer names, email addresses, purchase history, check-in timestamps, ticket types
- **Security obligations**: Both parties' responsibilities for safeguarding data
- **Sub-processors**: Disclosure that Google Cloud (BigQuery, Cloud Functions) is used as infrastructure — Google's own DPA covers their obligations
- **Breach notification**: Massive Marketing notifies Mercer Labs immediately upon discovering any breach; Mercer Labs handles notification to affected individuals and state agencies (within 30 days per SHIELD Act)
- **Data retention**: How long data is kept and what happens at end of engagement
- **Data deletion**: Process for deleting all data if the engagement ends
- **Cross-border processing**: Acknowledge that a UK-based processor accesses US-hosted data remotely (data itself remains in US data centres)

**Action item**: Draft DPA and get it signed before Phase 1 data pull begins. Consider getting legal review — this is the one document worth spending money on.

### PII Anonymisation Strategy

The core principle: **the analytics layer that powers dashboards and reports contains no personally identifiable information.** PII exists only in the raw data layer with tightly restricted access.

| Data Layer | PII Handling | Who Can Access |
|------------|-------------|----------------|
| `raw_vivenu.raw_tickets` | Full PII retained (names, emails, all Vivenu fields) | Service account + Andy only |
| `mercer_analytics.tickets` | **Anonymised** — names excluded, emails SHA-256 hashed | Andy + Mercer dashboard users |
| `mercer_analytics.daily_*` | **No PII** — aggregated data only | Anyone with dashboard access |
| `reference.*` | **No PII** — partner/event metadata only | Anyone with dashboard access |

**How it works in practice:**

- **Customer names**: Completely excluded from `mercer_analytics.tickets`. Not needed for any analytics use case.
- **Customer emails**: SHA-256 hashed in the transform query (`TO_HEX(SHA256(LOWER(TRIM(email))))`). The hash allows deduplication and repeat-visitor analysis without exposing the actual email. The hash is one-way — you cannot reverse it to get the email.
- **Customer IDs**: Vivenu's internal customer ID is retained (it's a random string, not PII on its own).
- **Barcodes**: Retained in analytics layer for join-back capability if needed. Could be excluded in future if not required.

**If Mercer ever needs customer-level analysis** (e.g. "show me repeat visitors by name"), that query runs against `raw_vivenu.raw_tickets` with explicit access approval. This should be rare and logged.

### Technical Security Measures

These must be implemented during GCP project setup (Phase 1):

**Access Control (IAM)**:
- Least-privilege IAM roles — only service accounts and named individuals can access BQ datasets
- `raw_vivenu` dataset: restrict to service account + Andy's GCP account only
- `mercer_analytics` dataset: allow read access for Mercer dashboard users (via Looker Studio service account)
- `reference` dataset: allow read access for dashboard users, write access for Andy only
- Enforce 2FA (MFA) on all GCP accounts with access to the project
- No broad permissions — never use `roles/bigquery.admin` for dashboard users

**Encryption**:
- BigQuery encrypts all data at rest by default (AES-256) — no additional configuration needed
- All data in transit to/from GCP is TLS encrypted by default
- Vivenu API calls are HTTPS only
- Secret Manager for all API credentials — never store keys in code, environment variables, or config files

**Audit Logging**:
- Enable Cloud Audit Logs on the project from day one
- Turn on `DATA_READ` and `DATA_WRITE` audit log types for BigQuery
- This records who accessed what data and when — critical for breach investigation and compliance evidence

**Secret Management**:
- All API keys (Vivenu, GA4, Slack) stored in GCP Secret Manager
- Cloud Functions access secrets at runtime via Secret Manager API, not environment variables
- Rotate Vivenu API credentials periodically (every 6 months minimum)

**Network**:
- Cloud Functions run in GCP's managed environment with no public endpoints beyond the scheduler trigger
- No SSH access, no open ports, no public-facing infrastructure beyond Looker Studio dashboards

### Data Retention Policy

| Data | Retention Period | Deletion Trigger |
|------|-----------------|------------------|
| `raw_vivenu.raw_tickets` (with PII) | Duration of engagement + 90 days for handover | Engagement ends |
| `mercer_analytics.*` (anonymised) | Indefinite — this is the long-term value | Only if Mercer requests deletion |
| `reference.*` (no PII) | Indefinite | Only if Mercer requests deletion |
| Cloud Function logs | 30 days (GCP default) | Automatic |
| Audit logs | 400 days (GCP default for Admin Activity) | Automatic |

**End of engagement process:**
1. Export anonymised analytics data for Mercer (CSV or BQ transfer)
2. Delete `raw_vivenu` dataset (all PII)
3. Transfer or delete remaining datasets per Mercer's preference
4. Delete GCP project entirely
5. Confirm deletion in writing to Mercer

### Mercer's Responsibilities (as Data Controller)

Flag these to Mercer — they're not your responsibility to implement, but worth raising:

- **Privacy policy**: Mercer's customer-facing privacy policy / ticket purchase terms should disclose that customer data may be shared with third-party processors for analytics purposes
- **Lawful basis**: Under GDPR (for EU visitors), Mercer needs a lawful basis for processing — likely "legitimate interests" (business analytics to improve operations and revenue reporting)
- **Data subject requests**: If a customer requests access to or deletion of their data, Mercer handles it as the controller. They may ask you to delete specific records from BQ — the DPA should cover this process
- **Vivenu's own DPA**: Mercer should have a DPA with Vivenu covering the data Vivenu holds. Worth confirming this is in place.

### Implementation Checklist

Add these to Phase 1 tasks:

- [ ] Draft and sign DPA with Mercer Labs
- [ ] Confirm Mercer's privacy policy covers third-party analytics processing
- [ ] Set up IAM roles with least-privilege access on GCP project
- [ ] Enable Cloud Audit Logs (DATA_READ + DATA_WRITE) on BigQuery
- [ ] Store all API credentials in Secret Manager
- [ ] Enforce 2FA on all GCP accounts
- [ ] Implement PII anonymisation in transform query (hash emails, exclude names)
- [ ] Restrict `raw_vivenu` dataset access to service account + Andy only
- [ ] Document data flow diagram (Vivenu → GCP → BQ → Looker Studio) for DPA appendix
- [ ] Agree data retention policy with Mercer and include in DPA

---

## Future: Productisation Notes

If this proves successful and you want to offer it to other venues:

- **Multi-tenant via `venue_id`**: Add a `venue_id` column to all tables. One BQ dataset serves multiple venues.
- **Config-driven pricing**: Commission rates live in `reference.partners`, not in code. Onboarding a new venue = new config, not new code.
- **Ticketing platform abstraction**: Vivenu-specific code lives in `vivenu-client.ts`. For another venue using a different platform (Eventbrite, Universe, etc.), write a new client implementing the same TypeScript interface. Shared types in `functions/shared/types.ts` define the contract.
- **Project name**: Consider `venue-analytics` or a product name if you rebrand later. For now, `mercer-labs-488707` is fine — migration is straightforward.
