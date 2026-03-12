-- Ad-hoc: Check for unresolved sales channels

SELECT
  u.sales_channel_id,
  u.first_seen_at,
  u.ticket_count,
  u.sample_price,
  u.sample_ticket_id
FROM reference.unknown_channels u
WHERE u.resolved = FALSE
ORDER BY u.first_seen_at DESC;
