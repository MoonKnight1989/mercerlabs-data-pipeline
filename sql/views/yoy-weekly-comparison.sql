-- View: mercer_analytics.yoy_weekly_comparison
-- One row per date with ISO week/day keys for like-for-like YoY comparison
-- In Looker: use iso_week_day as dimension, split series by iso_year

CREATE OR REPLACE VIEW mercer_analytics.yoy_weekly_comparison AS
SELECT
  report_date,
  EXTRACT(ISOYEAR FROM report_date) AS iso_year,
  EXTRACT(ISOWEEK FROM report_date) AS iso_week,
  EXTRACT(DAYOFWEEK FROM report_date) AS day_of_week,
  FORMAT_DATE('%A', report_date) AS day_name,
  EXTRACT(ISOWEEK FROM report_date) * 10 + EXTRACT(DAYOFWEEK FROM report_date) AS sort_key,
  tickets_sold,
  orders,
  gross_revenue,
  net_revenue,
  redemptions,
  comp_tickets,
  budgeted_tickets_sold,
  budgeted_redemptions,
  budgeted_net_revenue,
  tickets_for_event_date,
  paid_tickets_for_event_date,
  redeemed_for_event_date,
  redemption_rate
FROM mercer_analytics.daily_combined_summary
