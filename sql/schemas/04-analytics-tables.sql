-- mercer_analytics tables: clean, anonymised, query-ready
-- Built by scheduled transforms joining raw_tickets + raw_transactions + raw_scans
--   + reference.partners (by sales_channel_id) + reference.ticket_types (for base prices)

CREATE TABLE IF NOT EXISTS mercer_analytics.tickets (
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

  -- Ticket details (from reference.ticket_types)
  ticket_type_id STRING,
  ticket_name STRING,
  ticket_category STRING,                  -- adult, youth, senior, etc.
  category_name STRING,
  slot_start_time STRING,

  -- Sales channel (from reference.partners)
  sales_channel_id STRING,
  partner_name STRING,
  partner_type STRING,
  channel_group STRING,                    -- Business grouping: Retail, Web Sales, OTA, Groups, Vouchers, Passes, Comp

  -- Pricing
  gross_price FLOAT64,                     -- Base retail price (from ticket_types, what customer pays)
  real_price FLOAT64,                      -- What Vivenu API reports (may be secret-shop adjusted)
  commission_rate FLOAT64,                 -- From reference.partners (stated rate)
  net_price FLOAT64,                       -- gross_price * net_multiplier
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
  ingested_at TIMESTAMP,

  -- Derived fields (appended via ALTER TABLE)
  channel_group STRING,
  cashflow_status STRING,
  refunded_at TIMESTAMP,
  refund_date DATE
)
PARTITION BY purchase_date
CLUSTER BY sales_channel_id, was_redeemed;

CREATE TABLE IF NOT EXISTS mercer_analytics.daily_revenue_summary (
  report_date DATE NOT NULL,
  sales_channel_id STRING,
  partner_name STRING,
  partner_type STRING,
  channel_group STRING,

  -- Sales metrics
  tickets_sold INT64,
  orders INT64,
  gross_revenue FLOAT64,                   -- Sum of base retail prices
  net_revenue FLOAT64,                     -- Sum of net prices (after commission)
  commission_amount FLOAT64,               -- gross - net
  avg_ticket_price FLOAT64,
  total_inner_charges FLOAT64,
  total_outer_charges FLOAT64,

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

CREATE TABLE IF NOT EXISTS mercer_analytics.daily_capacity_summary (
  checkin_date DATE NOT NULL,

  total_checkins INT64,
  paid_checkins INT64,
  comp_checkins INT64,

  checkins_direct INT64,
  checkins_hotel INT64,
  checkins_ota INT64,
  checkins_group INT64,
  checkins_complimentary INT64,

  gross_revenue_redeemed FLOAT64,
  net_revenue_redeemed FLOAT64,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY checkin_date;
