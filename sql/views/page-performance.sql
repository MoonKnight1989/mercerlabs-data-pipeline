-- View: mercer_analytics.page_performance
-- Page-level metrics from GA4 — use as a separate Looker data source
-- One row per date × page path for content performance analysis

CREATE OR REPLACE VIEW mercer_analytics.page_performance AS
SELECT
  PARSE_DATE('%Y-%m-%d', date) AS report_date,
  page_path,
  page_title,
  SUM(page_views) AS page_views,
  SUM(active_users) AS users,
  SUM(new_users) AS new_users,
  SUM(engaged_sessions) AS engaged_sessions,
  SAFE_DIVIDE(SUM(avg_session_duration * engaged_sessions), NULLIF(SUM(engaged_sessions), 0)) AS avg_session_duration,
  SAFE_DIVIDE(SUM(bounce_rate * page_views), NULLIF(SUM(page_views), 0)) AS bounce_rate,
  SUM(conversions) AS conversions,
  SAFE_DIVIDE(SUM(conversions), NULLIF(SUM(active_users), 0)) AS conversion_rate
FROM raw_ga4.ga4_pages
GROUP BY 1, 2, 3
