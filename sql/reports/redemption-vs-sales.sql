-- Ad-hoc: Sales vs redemptions by day (the Valentine's Day problem query)
-- Shows mismatch between when tickets are sold and when people show up

SELECT
  d.date AS calendar_date,
  COALESCE(sales.tickets_sold, 0) AS tickets_sold,
  COALESCE(sales.gross_revenue, 0) AS gross_sold,
  COALESCE(sales.net_revenue, 0) AS net_sold,
  COALESCE(checkins.total_checkins, 0) AS people_showed_up,
  COALESCE(checkins.gross_revenue_redeemed, 0) AS gross_redeemed,
  COALESCE(checkins.net_revenue_redeemed, 0) AS net_redeemed,
  COALESCE(checkins.total_checkins, 0) - COALESCE(sales.tickets_sold, 0) AS checkin_surplus
FROM UNNEST(
  GENERATE_DATE_ARRAY(@start_date, @end_date)
) AS d(date)
LEFT JOIN (
  SELECT report_date, SUM(tickets_sold) AS tickets_sold,
         SUM(gross_revenue) AS gross_revenue, SUM(net_revenue) AS net_revenue
  FROM mercer_analytics.daily_revenue_summary
  GROUP BY 1
) sales ON d.date = sales.report_date
LEFT JOIN mercer_analytics.daily_capacity_summary checkins ON d.date = checkins.checkin_date
ORDER BY d.date;
