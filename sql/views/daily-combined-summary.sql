-- View: mercer_analytics.daily_combined_summary
-- Joins daily sales (by purchase date) with daily attendance (by checkin date)
-- One row per date with both sales and walk-in metrics
-- Use this view for any dashboard that needs both revenue AND attendance on the same date axis

CREATE OR REPLACE VIEW mercer_analytics.daily_combined_summary AS
WITH all_dates AS (
  -- Union of all dates that appear in any source
  SELECT report_date AS d FROM mercer_analytics.daily_revenue_summary GROUP BY 1
  UNION DISTINCT
  SELECT checkin_date FROM mercer_analytics.daily_capacity_summary
  UNION DISTINCT
  SELECT budget_date FROM reference.daily_budgets
)
SELECT
  ad.d AS report_date,
  r.tickets_sold,
  r.orders,
  r.gross_revenue,
  r.net_revenue,
  r.comp_tickets,
  CAST(c.total_checkins AS INT64) AS redemptions,
  CAST(c.paid_checkins AS INT64) AS paid_checkins,
  CAST(c.comp_checkins AS INT64) AS comp_checkins,
  b.budgeted_tickets_sold,
  b.budgeted_redemptions,
  b.budgeted_net_revenue,
  ed.tickets_for_event_date,
  ed.paid_tickets_for_event_date,
  ed.redeemed_for_event_date,
  SAFE_DIVIDE(ed.redeemed_for_event_date, ed.paid_tickets_for_event_date) AS redemption_rate
FROM all_dates ad
LEFT JOIN (
  SELECT
    report_date,
    SUM(tickets_sold) AS tickets_sold,
    SUM(orders) AS orders,
    SUM(gross_revenue) AS gross_revenue,
    SUM(net_revenue) AS net_revenue,
    SUM(comp_tickets_sold) AS comp_tickets
  FROM mercer_analytics.daily_revenue_summary
  GROUP BY report_date
) r ON ad.d = r.report_date
LEFT JOIN mercer_analytics.daily_capacity_summary c
  ON ad.d = c.checkin_date
LEFT JOIN reference.daily_budgets b
  ON ad.d = b.budget_date
LEFT JOIN (
  SELECT
    event_date,
    COUNT(*) AS tickets_for_event_date,
    COUNTIF(is_complimentary = FALSE) AS paid_tickets_for_event_date,
    COUNTIF(was_redeemed AND is_complimentary = FALSE) AS redeemed_for_event_date
  FROM mercer_analytics.tickets
  WHERE event_date IS NOT NULL
  GROUP BY event_date
) ed ON ad.d = ed.event_date
