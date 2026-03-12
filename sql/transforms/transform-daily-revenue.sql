-- Transform 2: Build mercer_analytics.daily_revenue_summary
-- Scheduled daily at 06:30 ET (after transform-tickets)
-- Pre-aggregated daily revenue by sales channel with gross/commission/net breakdown

CREATE OR REPLACE TABLE mercer_analytics.daily_revenue_summary AS
SELECT
  purchase_date AS report_date,
  sales_channel_id,
  partner_name,
  partner_type,
  channel_group,

  -- Sales
  COUNT(*) AS tickets_sold,
  COUNT(DISTINCT transaction_id) AS orders,
  SUM(CASE WHEN NOT is_complimentary THEN gross_price ELSE 0 END) AS gross_revenue,
  SUM(CASE WHEN NOT is_complimentary THEN net_price ELSE 0 END) AS net_revenue,
  SUM(CASE WHEN NOT is_complimentary THEN (gross_price - net_price) ELSE 0 END) AS commission_amount,
  SAFE_DIVIDE(
    SUM(CASE WHEN NOT is_complimentary THEN gross_price ELSE 0 END),
    COUNTIF(NOT is_complimentary)
  ) AS avg_ticket_price,
  SUM(COALESCE(inner_charge_per_ticket, 0)) AS total_inner_charges,
  SUM(COALESCE(outer_charge_per_ticket, 0)) AS total_outer_charges,

  -- Redemptions (grouped by purchase date, not check-in date)
  COUNTIF(was_redeemed AND NOT is_complimentary) AS tickets_redeemed,
  COUNT(DISTINCT CASE WHEN was_redeemed AND NOT is_complimentary THEN transaction_id END) AS unique_transactions_redeemed,

  -- Complimentary
  COUNTIF(is_complimentary) AS comp_tickets_sold,
  COUNTIF(is_complimentary AND was_redeemed) AS comp_tickets_redeemed,

  -- Rates
  SAFE_DIVIDE(
    COUNTIF(was_redeemed AND NOT is_complimentary),
    COUNTIF(NOT is_complimentary)
  ) AS redemption_rate,

  CURRENT_TIMESTAMP() AS updated_at

FROM mercer_analytics.tickets
GROUP BY 1, 2, 3, 4, 5;
