-- Ad-hoc: Tickets with abnormally high scan counts (potential hardware issues)

SELECT
  ticket_id,
  barcode,
  partner_name,
  total_scan_count,
  first_checkin_at,
  checkin_date,
  checkin_device,
  status
FROM mercer_analytics.tickets
WHERE total_scan_count > 5
  AND checkin_date >= DATE_SUB(CURRENT_DATE('America/New_York'), INTERVAL 7 DAY)
ORDER BY total_scan_count DESC;
