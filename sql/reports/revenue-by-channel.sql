-- Ad-hoc: Net revenue by channel for a date range
-- Replace @start_date and @end_date with actual dates

SELECT
  partner_name,
  partner_type,
  sales_channel_id,
  COUNT(*) AS tickets_sold,
  COUNT(DISTINCT transaction_id) AS orders,
  SUM(gross_price) AS gross_revenue,
  SUM(net_price) AS net_revenue,
  SUM(gross_price - net_price) AS commission_paid,
  SAFE_DIVIDE(SUM(net_price), COUNT(*)) AS net_revenue_per_ticket,
  SAFE_DIVIDE(SUM(net_price), SUM(gross_price)) AS net_retention_rate
FROM mercer_analytics.tickets
WHERE purchase_date BETWEEN @start_date AND @end_date
  AND NOT is_complimentary
GROUP BY 1, 2, 3
ORDER BY net_revenue DESC;
