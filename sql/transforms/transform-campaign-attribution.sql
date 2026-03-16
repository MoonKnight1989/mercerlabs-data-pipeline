-- Transform 4: Build mercer_analytics.campaign_attribution
-- Joins GA4 purchase events → Vivenu transactions (via checkout_id) → enriched tickets
-- Provides per-campaign: tickets sold, redeemed, redemption rate, revenue, purchase-to-visit lag
-- Scheduled daily after GA4 ingest and transform-tickets

CREATE OR REPLACE TABLE mercer_analytics.campaign_attribution AS
SELECT
  p.date AS purchase_date,
  p.source,
  p.medium,
  p.campaign,
  p.default_channel_group,

  -- Orders and tickets
  COUNT(DISTINCT p.transaction_id) AS orders,
  COUNT(DISTINCT t.ticket_id) AS tickets_sold,
  COUNTIF(t.was_redeemed) AS tickets_redeemed,
  SAFE_DIVIDE(COUNTIF(t.was_redeemed), COUNT(DISTINCT t.ticket_id)) AS redemption_rate,

  -- Revenue
  SUM(t.gross_price) AS gross_revenue,
  SUM(t.net_price) AS net_revenue,
  SUM(CASE WHEN t.was_redeemed THEN t.gross_price ELSE 0 END) AS gross_revenue_redeemed,
  SUM(CASE WHEN t.was_redeemed THEN t.net_price ELSE 0 END) AS net_revenue_redeemed,

  -- Average ticket price
  SAFE_DIVIDE(SUM(t.gross_price), NULLIF(COUNT(DISTINCT t.ticket_id), 0)) AS avg_ticket_price,

  -- Complimentary
  COUNTIF(t.is_complimentary) AS comp_tickets,

  -- Purchase-to-visit lag (avg days between purchase and first check-in)
  AVG(CASE WHEN t.was_redeemed THEN DATE_DIFF(t.checkin_date, t.purchase_date, DAY) END) AS avg_days_to_visit,

  -- No-show rate (purchased 7+ days ago but never redeemed)
  SAFE_DIVIDE(
    COUNTIF(NOT t.was_redeemed AND t.purchase_date < DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)),
    NULLIF(COUNTIF(t.purchase_date < DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)), 0)
  ) AS no_show_rate,

  CURRENT_TIMESTAMP() AS updated_at

FROM raw_ga4.ga4_purchases p

-- GA4 checkout_id → Vivenu transaction
INNER JOIN raw_vivenu.raw_transactions tx
  ON p.transaction_id = tx.checkout_id

-- Transaction → enriched tickets (from transform 1)
LEFT JOIN mercer_analytics.tickets t
  ON tx.transaction_id = t.transaction_id

GROUP BY 1, 2, 3, 4, 5;
