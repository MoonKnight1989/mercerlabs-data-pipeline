-- Transform 1: Build mercer_analytics.tickets
-- Joins raw_tickets + raw_transactions + raw_scans + reference.partners + reference.ticket_types
-- Anonymises PII: hashes emails, excludes names
-- Uses base_price from ticket_types as gross (not secret-shop-adjusted realPrice)
-- Applies net_multiplier from partners based on ticket category
-- Deduplicates scans: takes earliest checkin timestamp per ticket
-- Scheduled daily at 06:30 ET

MERGE mercer_analytics.tickets AS target
USING (
  SELECT
    t.ticket_id,
    t.transaction_id,
    t.barcode,
    t.customer_id,

    -- Anonymise email: prefer transaction email (more complete), fallback to ticket
    TO_HEX(SHA256(LOWER(TRIM(COALESCE(tx.customer_email, t.customer_email))))) AS customer_email_hash,

    t.event_id,
    t.root_event_id,

    -- Ticket details from reference.ticket_types (falls back to raw data)
    t.ticket_type_id,
    COALESCE(tt.ticket_name, t.ticket_name) AS ticket_name,
    COALESCE(tt.ticket_category, 'other') AS ticket_category,
    t.category_name,
    t.slot_start_time,

    -- Sales channel from reference.partners
    -- If no partner match and ticket has an undershop with modified pricing,
    -- flag as "Unattributed Partner" rather than letting it blend into Direct
    t.sales_channel_id,
    CASE
      WHEN p.partner_name IS NOT NULL THEN p.partner_name
      WHEN t.sales_channel_id IN ('sch-web', 'sch-internal-booking', 'sch-pos', 'sch-kiosk')
        AND t.undershop_id IS NOT NULL
        AND tt.base_price IS NOT NULL
        AND ABS(t.real_price - tt.base_price) > 0.01
        AND t.real_price > 0
        THEN 'Unattributed Partner'
      ELSE NULL
    END AS partner_name,
    CASE
      WHEN p.partner_type IS NOT NULL THEN p.partner_type
      WHEN t.sales_channel_id IN ('sch-web', 'sch-internal-booking', 'sch-pos', 'sch-kiosk')
        AND t.undershop_id IS NOT NULL
        AND tt.base_price IS NOT NULL
        AND ABS(t.real_price - tt.base_price) > 0.01
        AND t.real_price > 0
        THEN 'unattributed'
      ELSE 'unknown'
    END AS partner_type,

    -- Pricing: use base_price from ticket_types as gross (true retail, unaffected by secret shop)
    -- Fall back to realPrice for ticket types not yet in the reference table
    COALESCE(tt.base_price, t.real_price) AS gross_price,
    t.real_price,
    COALESCE(p.commission_rate, 0) AS commission_rate,

    -- Net price: gross × net_multiplier, using the correct multiplier for ticket category
    -- For unattributed partners (secret shop only), use realPrice as net since the shop already set it
    CASE
      WHEN COALESCE(tt.base_price, t.real_price) = 0 THEN 0
      WHEN p.partner_name IS NOT NULL AND COALESCE(tt.ticket_category, 'other') = 'adult'
        THEN COALESCE(tt.base_price, t.real_price) * COALESCE(p.net_multiplier_adult, 1)
      WHEN p.partner_name IS NOT NULL
        THEN COALESCE(tt.base_price, t.real_price) * COALESCE(p.net_multiplier_other, 1)
      WHEN t.sales_channel_id IN ('sch-web', 'sch-internal-booking', 'sch-pos', 'sch-kiosk')
        AND t.undershop_id IS NOT NULL
        AND tt.base_price IS NOT NULL
        AND ABS(t.real_price - tt.base_price) > 0.01
        AND t.real_price > 0
        THEN t.real_price  -- Secret shop already set to net amount
      ELSE COALESCE(tt.base_price, t.real_price)  -- Direct sales: gross = net
    END AS net_price,

    COALESCE(tt.base_price, t.real_price) = 0 AS is_complimentary,

    t.status,
    t.origin,
    t.created_at AS purchased_at,
    DATE(TIMESTAMP(t.created_at), 'America/New_York') AS purchase_date,

    -- Transaction-level enrichment
    tx.payment_method,
    tx.payment_status,
    SAFE_DIVIDE(tx.inner_charge, tx.ticket_count) AS inner_charge_per_ticket,
    SAFE_DIVIDE(tx.outer_charge, tx.ticket_count) AS outer_charge_per_ticket,
    tx.tax_rate,

    -- Scan data: first checkin
    sc.first_checkin_at IS NOT NULL AS was_redeemed,
    sc.first_checkin_at,
    DATE(TIMESTAMP(sc.first_checkin_at), 'America/New_York') AS checkin_date,
    sc.checkin_device,
    COALESCE(sc.total_scan_count, 0) AS total_scan_count,

    t.ingested_at,

    -- Channel group: business-level grouping for financial reports
    -- Placed last to match ALTER TABLE column position
    CASE
      WHEN COALESCE(tt.base_price, t.real_price) = 0 THEN 'Comp'
      WHEN t.sales_channel_id IN ('sch-pos', 'sch-kiosk', 'sch_689b974b3c97b864f1cbac8c', 'sch_69ab02d015fa535f892c5951')
        THEN 'Retail / Box Office'
      WHEN p.partner_type = 'ota' THEN 'OTA'
      WHEN LOWER(COALESCE(tt.ticket_name, t.ticket_name)) LIKE '%pass%' THEN 'Passes'
      WHEN LOWER(COALESCE(tt.ticket_name, t.ticket_name)) LIKE '%voucher%'
        OR LOWER(COALESCE(tt.ticket_name, t.ticket_name)) LIKE '%gift%' THEN 'Vouchers'
      WHEN t.sales_channel_id = 'sch-internal-booking' THEN 'Groups'
      WHEN t.sales_channel_id IN ('sch-web', 'sch-internal-booking')
        AND t.undershop_id IS NOT NULL
        AND tt.base_price IS NOT NULL
        AND ABS(t.real_price - tt.base_price) > 0.01
        AND t.real_price > 0
        THEN 'Unattributed Partner'
      WHEN t.sales_channel_id = 'sch-web' THEN 'Web Sales'
      ELSE 'Other'
    END AS channel_group,

    -- Cashflow status: where is the money?
    CASE
      WHEN tx.payment_status IN ('REFUND', 'POS-CANCELED') THEN 'refund'
      WHEN tx.payment_status = 'DISPUTE' THEN 'dispute'
      WHEN tx.payment_status = 'AWAITING' THEN 'pending'
      WHEN tx.payment_status IS NULL AND COALESCE(tt.base_price, t.real_price) = 0 THEN 'comp'
      WHEN tx.payment_status = 'EXTERNAL' THEN 'partner_settlement'
      ELSE 'collected'
    END AS cashflow_status,

    -- Refund timestamp: transaction updated_at is set when refund is processed
    CASE
      WHEN tx.payment_status IN ('REFUND', 'POS-CANCELED') THEN tx.updated_at
    END AS refunded_at,
    CASE
      WHEN tx.payment_status IN ('REFUND', 'POS-CANCELED')
        THEN DATE(TIMESTAMP(tx.updated_at), 'America/New_York')
    END AS refund_date

  FROM raw_vivenu.raw_tickets t

  -- Join transactions for payment/fee data
  LEFT JOIN raw_vivenu.raw_transactions tx
    ON t.transaction_id = tx.transaction_id

  -- Join ticket types for base (retail) price
  LEFT JOIN reference.ticket_types tt
    ON t.ticket_type_id = tt.ticket_type_id
    AND tt.is_active = TRUE

  -- Join partners for commission rates (keyed on sales_channel_id)
  LEFT JOIN reference.partners p
    ON t.sales_channel_id = p.sales_channel_id
    AND p.is_active = TRUE

  -- Join scans: pre-aggregate to first checkin per ticket
  LEFT JOIN (
    SELECT
      ticket_id,
      MIN(CASE WHEN scan_type = 'checkin' THEN scan_time END) AS first_checkin_at,
      ARRAY_AGG(
        CASE WHEN scan_type = 'checkin' THEN device_id END
        IGNORE NULLS
        ORDER BY scan_time ASC
        LIMIT 1
      )[SAFE_OFFSET(0)] AS checkin_device,
      COUNTIF(scan_type = 'checkin') AS total_scan_count
    FROM raw_vivenu.raw_scans
    WHERE scan_result = 'approved'
    GROUP BY ticket_id
  ) sc ON t.ticket_id = sc.ticket_id

) AS source
ON target.ticket_id = source.ticket_id
WHEN MATCHED THEN
  UPDATE SET
    transaction_id = source.transaction_id,
    barcode = source.barcode,
    customer_id = source.customer_id,
    customer_email_hash = source.customer_email_hash,
    event_id = source.event_id,
    root_event_id = source.root_event_id,
    ticket_type_id = source.ticket_type_id,
    ticket_name = source.ticket_name,
    ticket_category = source.ticket_category,
    category_name = source.category_name,
    slot_start_time = source.slot_start_time,
    sales_channel_id = source.sales_channel_id,
    partner_name = source.partner_name,
    partner_type = source.partner_type,
    channel_group = source.channel_group,
    gross_price = source.gross_price,
    real_price = source.real_price,
    commission_rate = source.commission_rate,
    net_price = source.net_price,
    is_complimentary = source.is_complimentary,
    status = source.status,
    origin = source.origin,
    purchased_at = source.purchased_at,
    purchase_date = source.purchase_date,
    payment_method = source.payment_method,
    payment_status = source.payment_status,
    inner_charge_per_ticket = source.inner_charge_per_ticket,
    outer_charge_per_ticket = source.outer_charge_per_ticket,
    tax_rate = source.tax_rate,
    was_redeemed = source.was_redeemed,
    first_checkin_at = source.first_checkin_at,
    checkin_date = source.checkin_date,
    checkin_device = source.checkin_device,
    total_scan_count = source.total_scan_count,
    ingested_at = source.ingested_at,
    cashflow_status = source.cashflow_status,
    refunded_at = source.refunded_at,
    refund_date = source.refund_date
WHEN NOT MATCHED THEN
  INSERT ROW;
