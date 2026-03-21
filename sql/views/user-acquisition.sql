-- View: mercer_analytics.user_acquisition
-- First-touch attribution: how users were originally acquired
-- Compare with session-level attribution (ga4_sessions) to see
-- which channels bring new users vs which drive return visits

CREATE OR REPLACE VIEW mercer_analytics.user_acquisition AS
SELECT
  PARSE_DATE('%Y-%m-%d', date) AS report_date,
  first_user_source,
  first_user_medium,
  first_user_campaign,
  first_user_channel_group,
  SUM(new_users) AS new_users,
  SUM(total_users) AS total_users,
  SUM(sessions) AS sessions,
  SUM(engaged_sessions) AS engaged_sessions,
  SAFE_DIVIDE(SUM(engaged_sessions), SUM(sessions)) AS engagement_rate,
  SUM(conversions) AS conversions,
  SAFE_DIVIDE(SUM(conversions), NULLIF(SUM(total_users), 0)) AS conversion_rate,
  SAFE_DIVIDE(SUM(user_engagement_duration), NULLIF(SUM(total_users), 0)) AS avg_engagement_time_sec
FROM raw_ga4.ga4_user_acquisition
GROUP BY 1, 2, 3, 4, 5
