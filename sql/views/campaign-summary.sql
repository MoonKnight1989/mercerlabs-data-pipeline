-- View: mercer_analytics.campaign_summary
-- Pre-aggregated by campaign only (no date/source/medium split)
-- Ratios are computed from raw counts, not averaged from pre-computed values
-- Use this in Looker for campaign-level reporting
--
-- IMPORTANT: ga4_purchases can have multiple rows per transaction_id (different
-- session attributions). We deduplicate to one attribution per transaction using
-- last-click (latest date/row), then join to tickets for accurate counts.

CREATE OR REPLACE VIEW mercer_analytics.campaign_summary AS
WITH deduped_purchases AS (
  -- One row per transaction_id: take the last-click attribution
  SELECT * FROM (
    SELECT
      *,
      ROW_NUMBER() OVER (PARTITION BY transaction_id ORDER BY date DESC) AS _rn
    FROM raw_ga4.ga4_purchases
  ) WHERE _rn = 1
)
SELECT
  p.campaign,
  p.default_channel_group,

  COUNT(DISTINCT p.transaction_id) AS orders,
  COUNT(DISTINCT t.ticket_id) AS tickets_sold,
  COUNTIF(t.was_redeemed) AS tickets_redeemed,
  SAFE_DIVIDE(COUNTIF(t.was_redeemed), NULLIF(COUNT(DISTINCT t.ticket_id), 0)) AS redemption_rate,

  SUM(t.gross_price) AS gross_revenue,
  SUM(t.net_price) AS net_revenue,
  SUM(CASE WHEN t.was_redeemed THEN t.gross_price ELSE 0 END) AS gross_revenue_redeemed,
  SUM(CASE WHEN t.was_redeemed THEN t.net_price ELSE 0 END) AS net_revenue_redeemed,

  SAFE_DIVIDE(SUM(t.gross_price), NULLIF(COUNT(DISTINCT t.ticket_id), 0)) AS avg_ticket_price,
  COUNTIF(t.is_complimentary) AS comp_tickets,

  AVG(CASE WHEN t.was_redeemed THEN DATE_DIFF(t.checkin_date, t.purchase_date, DAY) END) AS avg_days_to_visit,

  SAFE_DIVIDE(
    COUNTIF(NOT t.was_redeemed AND t.purchase_date < DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)),
    NULLIF(COUNTIF(t.purchase_date < DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)), 0)
  ) AS no_show_rate

FROM deduped_purchases p
INNER JOIN raw_vivenu.raw_transactions tx
  ON p.transaction_id = tx.checkout_id
LEFT JOIN mercer_analytics.tickets t
  ON tx.transaction_id = t.transaction_id
GROUP BY 1, 2
