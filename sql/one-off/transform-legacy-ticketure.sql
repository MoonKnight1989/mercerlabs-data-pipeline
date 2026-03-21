-- One-off: Transform reference.legacy_ticketure into mercer_analytics.tickets
-- Only inserts pre-Vivenu data (before 2025-07-09)
-- Run ONCE after load-legacy-ticketure.py completes
--
-- Data model: Ticketure has one row per audit_action per ticket.
-- A "purchased" row = the sale, a "redeemed" row = the scan.
-- We pivot so each ticket is one row (like Vivenu tickets table).

INSERT INTO mercer_analytics.tickets (
  ticket_id,
  transaction_id,
  barcode,
  customer_id,
  customer_email_hash,
  event_id,
  root_event_id,
  ticket_type_id,
  ticket_name,
  ticket_category,
  category_name,
  slot_start_time,
  sales_channel_id,
  partner_name,
  partner_type,
  channel_group,
  gross_price,
  real_price,
  commission_rate,
  net_price,
  is_complimentary,
  status,
  origin,
  purchased_at,
  purchase_date,
  payment_method,
  payment_status,
  inner_charge_per_ticket,
  outer_charge_per_ticket,
  tax_rate,
  was_redeemed,
  first_checkin_at,
  checkin_date,
  checkin_device,
  total_scan_count,
  ingested_at,
  cashflow_status,
  refunded_at,
  refund_date
)

WITH purchases AS (
  SELECT
    scan_code,
    order_number,
    event_name,
    ticket_group,
    ticket_type,
    session_time,
    identity_email_hash,
    by_identity,
    payment_gateway,
    occurred_on AS purchased_at,
    before_discounts_price,
    discount_amount,
    revenue,
    fee_fixed_inside + fee_percent_inside AS inner_charges,
    fee_fixed_outside + fee_percent_outside AS outer_charges,
    source_sheet
  FROM `mercer-labs-488707.reference.legacy_ticketure`
  WHERE audit_action = 'purchased'
),

redemptions AS (
  SELECT
    scan_code,
    MIN(occurred_on) AS first_checkin_at,
    COUNT(*) AS scan_count
  FROM `mercer-labs-488707.reference.legacy_ticketure`
  WHERE audit_action = 'redeemed'
  GROUP BY scan_code
),

refunds AS (
  SELECT
    scan_code,
    MIN(occurred_on) AS refunded_at
  FROM `mercer-labs-488707.reference.legacy_ticketure`
  WHERE audit_action = 'refunded'
  GROUP BY scan_code
)

SELECT
  -- Ticket ID: use scan_code as unique identifier (prefixed to avoid collision with Vivenu IDs)
  CONCAT('TKT-', p.scan_code) AS ticket_id,
  CONCAT('TKT-', p.order_number) AS transaction_id,
  p.scan_code AS barcode,
  CAST(NULL AS STRING) AS customer_id,
  p.identity_email_hash AS customer_email_hash,

  -- Event: no Vivenu event_id, use a synthetic one
  CONCAT('TKT-EVENT-', REGEXP_REPLACE(p.event_name, r'[^A-Za-z0-9]', '')) AS event_id,
  CAST(NULL AS STRING) AS root_event_id,

  -- Ticket type
  CAST(NULL AS STRING) AS ticket_type_id,
  p.ticket_group AS ticket_name,
  p.ticket_type AS ticket_category,
  p.ticket_type AS category_name,
  FORMAT_TIMESTAMP('%H:%M', p.session_time, 'America/New_York') AS slot_start_time,

  -- Sales channel: map by_identity to channel
  CONCAT('TKT-', REGEXP_REPLACE(p.by_identity, r'[^A-Za-z0-9]', '')) AS sales_channel_id,
  CASE p.by_identity
    WHEN 'Kiosk User' THEN 'Box Office (Kiosk)'
    WHEN 'Box Office' THEN 'Box Office'
    WHEN 'Ticketure Web' THEN 'Ticketure Web'
    WHEN 'Nliven Partner Sales' THEN 'Nliven Partner Sales'
    ELSE COALESCE(p.by_identity, 'Unknown')
  END AS partner_name,
  CASE p.by_identity
    WHEN 'Kiosk User' THEN 'direct'
    WHEN 'Box Office' THEN 'direct'
    WHEN 'Ticketure Web' THEN 'direct'
    WHEN 'Nliven Partner Sales' THEN 'ota'
    ELSE 'direct'
  END AS partner_type,
  CASE p.by_identity
    WHEN 'Kiosk User' THEN 'Retail / Box Office'
    WHEN 'Box Office' THEN 'Retail / Box Office'
    WHEN 'Ticketure Web' THEN 'Web Sales'
    WHEN 'Nliven Partner Sales' THEN 'OTA'
    ELSE 'Other'
  END AS channel_group,

  -- Pricing
  p.before_discounts_price AS gross_price,
  p.before_discounts_price AS real_price,
  SAFE_DIVIDE(p.discount_amount, NULLIF(p.before_discounts_price, 0)) AS commission_rate,
  p.revenue AS net_price,
  (p.before_discounts_price = 0 OR p.ticket_type LIKE '%Comp%') AS is_complimentary,

  -- Status
  CASE
    WHEN ref.refunded_at IS NOT NULL THEN 'refunded'
    ELSE 'valid'
  END AS status,
  'ticketure' AS origin,

  -- Timestamps
  p.purchased_at,
  DATE(p.purchased_at, 'America/New_York') AS purchase_date,

  -- Payment
  p.payment_gateway AS payment_method,
  CASE
    WHEN ref.refunded_at IS NOT NULL THEN 'refunded'
    ELSE 'paid'
  END AS payment_status,
  p.inner_charges AS inner_charge_per_ticket,
  p.outer_charges AS outer_charge_per_ticket,
  CAST(NULL AS FLOAT64) AS tax_rate,

  -- Redemption
  r.first_checkin_at IS NOT NULL AS was_redeemed,
  r.first_checkin_at,
  DATE(r.first_checkin_at, 'America/New_York') AS checkin_date,
  CAST(NULL AS STRING) AS checkin_device,
  COALESCE(r.scan_count, 0) AS total_scan_count,

  -- Metadata
  CURRENT_TIMESTAMP() AS ingested_at,

  -- Derived
  CASE
    WHEN ref.refunded_at IS NOT NULL THEN 'refunded'
    WHEN p.before_discounts_price = 0 OR p.ticket_type LIKE '%Comp%' THEN 'complimentary'
    ELSE 'paid'
  END AS cashflow_status,
  ref.refunded_at,
  DATE(ref.refunded_at, 'America/New_York') AS refund_date

FROM purchases p
LEFT JOIN redemptions r ON p.scan_code = r.scan_code
LEFT JOIN refunds ref ON p.scan_code = ref.scan_code
