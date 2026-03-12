-- raw_vivenu tables
-- Three raw tables matching the three Vivenu API endpoints
-- Verified against live API 2026-03-05

-- Tickets: one row per individual admission (from vivenu.com/api/tickets)
CREATE TABLE IF NOT EXISTS raw_vivenu.raw_tickets (
  ticket_id STRING NOT NULL,              -- Vivenu _id
  transaction_id STRING,                   -- Vivenu transactionId
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
  ticket_name STRING,                      -- e.g. "Adult", "Date Night Package"
  category_name STRING,                    -- e.g. "General Admission", "OTA Tickets", "Curated Packages"
  category_ref STRING,
  real_price FLOAT64,                      -- What customer pays per ticket (includes fees)
  regular_price FLOAT64,                   -- Base price before fees
  currency STRING,
  status STRING,                           -- VALID, RESERVED, INVALID
  ticket_type STRING,                      -- SINGLE, etc.
  delivery_type STRING,                    -- VIRTUAL, etc.
  cart_item_id STRING,
  checkout_id STRING,
  origin STRING,                           -- yourticket, pos, etc.
  sales_channel_id STRING,
  undershop_id STRING,                     -- Partner/channel identifier
  seller_id STRING,
  slot_id STRING,
  slot_start_time STRING,                  -- Time slot e.g. "16:00", "19:00"
  personalized BOOL,
  claimed BOOL,
  expired BOOL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL,
  ingestion_batch_id STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY sales_channel_id, status;

-- Transactions: one row per order/purchase (from vivenu.com/api/transactions)
-- Groups tickets, has payment details, fees, taxes, full customer PII
CREATE TABLE IF NOT EXISTS raw_vivenu.raw_transactions (
  transaction_id STRING NOT NULL,          -- Vivenu _id
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
  regular_price FLOAT64,                   -- Base order total
  real_price FLOAT64,                      -- Actual total charged
  payment_charge FLOAT64,
  inner_charge FLOAT64,                    -- Vivenu platform fee
  outer_charge FLOAT64,                    -- Payment processing fee
  payment_method STRING,                   -- external, credit_card, etc.
  payment_status STRING,                   -- RECEIVED, EXTERNAL, etc.
  status STRING,                           -- COMPLETE, CANCELLED, etc.
  origin STRING,
  sales_channel_id STRING,
  undershop_id STRING,                     -- Vivenu underShop field
  checkout_id STRING,
  tax_rate FLOAT64,
  tickets_json STRING,                     -- Full ticket line items as JSON
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL,
  ingestion_batch_id STRING
)
PARTITION BY DATE(created_at)
CLUSTER BY sales_channel_id, status;

-- Scans: one row per barcode scan event (from portier.vivenu.com/api/scans)
-- Links to tickets via ticket_id. Multiple scans per ticket possible.
CREATE TABLE IF NOT EXISTS raw_vivenu.raw_scans (
  scan_id STRING NOT NULL,                 -- Vivenu _id
  ticket_id STRING,                        -- FK to raw_tickets.ticket_id
  scan_time TIMESTAMP,                     -- When the scan happened
  event_id STRING,
  barcode STRING,
  customer_name STRING,
  ticket_type_id STRING,
  ticket_name STRING,
  device_id STRING,                        -- Scanner device identifier
  scan_type STRING,                        -- "checkin" or "checkout"
  scan_result STRING,                      -- "approved", etc.
  seller_id STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  ingested_at TIMESTAMP NOT NULL,
  ingestion_batch_id STRING
)
PARTITION BY DATE(scan_time)
CLUSTER BY ticket_id, scan_type;
