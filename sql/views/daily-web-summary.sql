-- View: mercer_analytics.daily_web_summary
-- Combines GA4 daily overview with session traffic breakdown and ticket sales
-- One row per date — use as the primary GA4 dashboard data source in Looker
-- Joins web traffic metrics with actual ticket revenue for full-funnel view

CREATE OR REPLACE VIEW mercer_analytics.daily_web_summary AS
WITH overview AS (
  SELECT
    date,
    SUM(active_users) AS active_users,
    SUM(active_1_day_users) AS dau,
    SUM(active_7_day_users) AS wau,
    SUM(active_28_day_users) AS mau,
    SUM(total_users) AS total_users,
    SUM(new_users) AS new_users,
    SUM(returning_users) AS returning_users,
    SUM(sessions) AS sessions,
    SUM(engaged_sessions) AS engaged_sessions,
    SAFE_DIVIDE(SUM(engaged_sessions), SUM(sessions)) AS engagement_rate,
    SAFE_DIVIDE(SUM(user_engagement_duration), SUM(active_users)) AS avg_engagement_time_sec,
    SUM(page_views) AS page_views,
    SUM(conversions) AS conversions,
    SUM(event_count) AS event_count
  FROM raw_ga4.ga4_daily_overview
  GROUP BY date
),

-- Traffic by channel (aggregated from sessions table)
-- ga4_sessions.date is DATE type (legacy schema), cast to STRING for join
traffic AS (
  SELECT
    CAST(date AS STRING) AS date,
    SUM(sessions) AS total_sessions,
    SUM(CASE WHEN default_channel_group = 'Organic Search' THEN sessions ELSE 0 END) AS sessions_organic,
    SUM(CASE WHEN default_channel_group = 'Paid Search' THEN sessions ELSE 0 END) AS sessions_paid_search,
    SUM(CASE WHEN default_channel_group = 'Paid Social' THEN sessions ELSE 0 END) AS sessions_paid_social,
    SUM(CASE WHEN default_channel_group = 'Organic Social' THEN sessions ELSE 0 END) AS sessions_organic_social,
    SUM(CASE WHEN default_channel_group = 'Direct' THEN sessions ELSE 0 END) AS sessions_direct,
    SUM(CASE WHEN default_channel_group = 'Referral' THEN sessions ELSE 0 END) AS sessions_referral,
    SUM(CASE WHEN default_channel_group = 'Email' THEN sessions ELSE 0 END) AS sessions_email,
    SUM(CASE WHEN default_channel_group = 'Display' THEN sessions ELSE 0 END) AS sessions_display
  FROM raw_ga4.ga4_sessions
  GROUP BY date
),

-- Device split (from technology table)
devices AS (
  SELECT
    date,
    SUM(sessions) AS device_total,
    SUM(CASE WHEN device_category = 'mobile' THEN sessions ELSE 0 END) AS sessions_mobile,
    SUM(CASE WHEN device_category = 'desktop' THEN sessions ELSE 0 END) AS sessions_desktop,
    SUM(CASE WHEN device_category = 'tablet' THEN sessions ELSE 0 END) AS sessions_tablet
  FROM raw_ga4.ga4_technology
  GROUP BY date
),

-- GA4 purchase events (web conversions only)
-- ga4_purchases.date is DATE type (legacy schema), cast to STRING for join
purchases AS (
  SELECT
    CAST(date AS STRING) AS date,
    COUNT(DISTINCT transaction_id) AS web_orders,
    SUM(items_purchased) AS web_items_purchased,
    SUM(purchase_revenue) AS web_purchase_revenue
  FROM raw_ga4.ga4_purchases
  GROUP BY date
),

-- Actual ticket revenue from the pipeline (for comparison)
tickets AS (
  SELECT
    FORMAT_DATE('%Y-%m-%d', report_date) AS date,
    SUM(net_revenue) AS pipeline_net_revenue,
    SUM(tickets_sold) AS pipeline_tickets_sold
  FROM mercer_analytics.daily_revenue_summary
  GROUP BY 1
)

SELECT
  PARSE_DATE('%Y-%m-%d', o.date) AS report_date,

  -- User metrics
  o.active_users,
  o.dau,
  o.wau,
  o.mau,
  o.total_users,
  o.new_users,
  o.returning_users,
  SAFE_DIVIDE(o.new_users, o.total_users) AS new_user_rate,

  -- Engagement
  o.sessions,
  o.engaged_sessions,
  o.engagement_rate,
  o.avg_engagement_time_sec,
  o.page_views,
  SAFE_DIVIDE(o.page_views, o.sessions) AS pages_per_session,
  o.conversions,
  o.event_count,

  -- Channel breakdown
  t.sessions_organic,
  t.sessions_paid_search,
  t.sessions_paid_social,
  t.sessions_organic_social,
  t.sessions_direct,
  t.sessions_referral,
  t.sessions_email,
  t.sessions_display,

  -- Device breakdown
  d.sessions_mobile,
  d.sessions_desktop,
  d.sessions_tablet,
  SAFE_DIVIDE(d.sessions_mobile, d.device_total) AS mobile_share,

  -- Web conversions (GA4)
  p.web_orders,
  p.web_items_purchased,
  p.web_purchase_revenue,
  SAFE_DIVIDE(p.web_orders, o.sessions) AS web_conversion_rate,

  -- Pipeline revenue (for full-funnel comparison)
  tk.pipeline_net_revenue,
  tk.pipeline_tickets_sold

FROM overview o
LEFT JOIN traffic t ON o.date = t.date
LEFT JOIN devices d ON o.date = d.date
LEFT JOIN purchases p ON o.date = p.date
LEFT JOIN tickets tk ON o.date = tk.date
