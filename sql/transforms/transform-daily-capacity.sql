-- Transform 3: Build mercer_analytics.daily_capacity_summary
-- Scheduled daily at 06:30 ET (after transform-tickets)
-- Operational table: how many people actually showed up each day

CREATE OR REPLACE TABLE mercer_analytics.daily_capacity_summary AS
SELECT
  checkin_date,

  COUNTIF(was_redeemed) AS total_checkins,
  COUNTIF(was_redeemed AND NOT is_complimentary) AS paid_checkins,
  COUNTIF(was_redeemed AND is_complimentary) AS comp_checkins,

  COUNTIF(was_redeemed AND partner_type = 'direct') AS checkins_direct,
  COUNTIF(was_redeemed AND partner_type = 'hotel') AS checkins_hotel,
  COUNTIF(was_redeemed AND partner_type = 'ota') AS checkins_ota,
  COUNTIF(was_redeemed AND partner_type = 'group') AS checkins_group,
  COUNTIF(was_redeemed AND is_complimentary) AS checkins_complimentary,

  SUM(CASE WHEN was_redeemed THEN gross_price ELSE 0 END) AS gross_revenue_redeemed,
  SUM(CASE WHEN was_redeemed THEN net_price ELSE 0 END) AS net_revenue_redeemed,

  CURRENT_TIMESTAMP() AS updated_at

FROM mercer_analytics.tickets
WHERE checkin_date IS NOT NULL
GROUP BY 1;
