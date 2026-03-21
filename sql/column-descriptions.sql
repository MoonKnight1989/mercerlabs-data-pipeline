-- Column descriptions for all mercer_analytics tables and views
-- Makes every column self-documenting in BQ UI and Looker Studio
-- Run once, re-run after schema changes

-- ============================================================
-- 1. mercer_analytics.tickets
-- ============================================================
ALTER TABLE mercer_analytics.tickets
ALTER COLUMN ticket_id SET OPTIONS(description='Vivenu ticket ID (primary key)'),
ALTER COLUMN transaction_id SET OPTIONS(description='Vivenu transaction (order) ID — one transaction can contain multiple tickets'),
ALTER COLUMN barcode SET OPTIONS(description='Scannable barcode string for gate entry'),
ALTER COLUMN customer_id SET OPTIONS(description='Vivenu customer ID'),
ALTER COLUMN customer_email_hash SET OPTIONS(description='SHA-256 hash of customer email — no PII stored'),
ALTER COLUMN event_id SET OPTIONS(description='Vivenu event ID (may span multiple days — not day-specific)'),
ALTER COLUMN root_event_id SET OPTIONS(description='Top-level event series ID'),
ALTER COLUMN ticket_type_id SET OPTIONS(description='Vivenu ticket type ID — links to reference.ticket_types for base pricing'),
ALTER COLUMN ticket_name SET OPTIONS(description='Display name of the ticket type (e.g. "Adult General Admission")'),
ALTER COLUMN ticket_category SET OPTIONS(description='Pricing category: adult, youth, senior, etc.'),
ALTER COLUMN category_name SET OPTIONS(description='Human-readable category label from Vivenu'),
ALTER COLUMN slot_start_time SET OPTIONS(description='Time-slot string from Vivenu (e.g. "10:30") — time only, not a full date'),
ALTER COLUMN sales_channel_id SET OPTIONS(description='Vivenu sales channel ID — the key used to identify which partner sold this ticket'),
ALTER COLUMN partner_name SET OPTIONS(description='Partner display name from reference.partners (e.g. "GetYourGuide", "Box Office")'),
ALTER COLUMN partner_type SET OPTIONS(description='Partner classification: direct, ota, hotel, group'),
ALTER COLUMN channel_group SET OPTIONS(description='Business grouping for reporting: Retail / Box Office, Web Sales, OTA, Groups, Vouchers, Passes, Comp'),
ALTER COLUMN gross_price SET OPTIONS(description='Retail price the customer paid — sourced from reference.ticket_types base_price, NOT Vivenu realPrice (which secret shops override to net)'),
ALTER COLUMN real_price SET OPTIONS(description='Price reported by Vivenu API — may differ from gross_price for secret-shop partners'),
ALTER COLUMN commission_rate SET OPTIONS(description='Stated commission rate from reference.partners'),
ALTER COLUMN net_price SET OPTIONS(description='Revenue Mercer keeps after commission: gross_price × net_multiplier from reference.partners'),
ALTER COLUMN is_complimentary SET OPTIONS(description='True if ticket was free (comp). Excluded from revenue calculations'),
ALTER COLUMN status SET OPTIONS(description='Vivenu ticket status (e.g. valid, invalidated, refunded)'),
ALTER COLUMN origin SET OPTIONS(description='How the ticket was created in Vivenu'),
ALTER COLUMN purchased_at SET OPTIONS(description='UTC timestamp when the ticket was purchased'),
ALTER COLUMN purchase_date SET OPTIONS(description='Date ticket was purchased (America/New_York timezone)'),
ALTER COLUMN payment_method SET OPTIONS(description='Payment method from the transaction (e.g. card, cash, free)'),
ALTER COLUMN payment_status SET OPTIONS(description='Transaction payment status (e.g. paid, refunded)'),
ALTER COLUMN inner_charge_per_ticket SET OPTIONS(description='Vivenu platform fee allocated per ticket (transaction inner_charges / ticket count)'),
ALTER COLUMN outer_charge_per_ticket SET OPTIONS(description='Payment processing fee allocated per ticket (transaction outer_charges / ticket count)'),
ALTER COLUMN tax_rate SET OPTIONS(description='Tax rate from the transaction'),
ALTER COLUMN was_redeemed SET OPTIONS(description='True if this ticket was scanned at the gate (has at least one checkin scan)'),
ALTER COLUMN first_checkin_at SET OPTIONS(description='UTC timestamp of the first gate scan for this ticket'),
ALTER COLUMN checkin_date SET OPTIONS(description='Date the ticket was actually scanned at the gate (America/New_York) — this is the VISIT date, not the purchase date'),
ALTER COLUMN checkin_device SET OPTIONS(description='Device ID of the scanner that first checked in this ticket'),
ALTER COLUMN total_scan_count SET OPTIONS(description='Total number of checkin scans for this ticket (usually 1, >1 indicates re-scans)'),
ALTER COLUMN ingested_at SET OPTIONS(description='UTC timestamp when this record was last ingested from the Vivenu API'),
ALTER COLUMN cashflow_status SET OPTIONS(description='Derived: current money status — paid, refunded, or complimentary'),
ALTER COLUMN refunded_at SET OPTIONS(description='UTC timestamp when the ticket was refunded (null if not refunded)'),
ALTER COLUMN refund_date SET OPTIONS(description='Date of refund (America/New_York) — null if not refunded'),
ALTER COLUMN event_date SET OPTIONS(description='The specific date this ticket is for. Derived from Vivenu child event start date, or checkin_date for undated events (e.g. Admission Pass). Used for true redemption rate calculations');

-- ============================================================
-- 2. mercer_analytics.daily_revenue_summary
--    IMPORTANT: This table is grouped by PURCHASE DATE.
--    Redemption columns here answer: "of tickets SOLD on this date,
--    how many were eventually scanned?" — NOT "how many people
--    walked in on this date." For walk-in counts, use
--    daily_capacity_summary or daily_combined_summary.
-- ============================================================
ALTER TABLE mercer_analytics.daily_revenue_summary
ALTER COLUMN report_date SET OPTIONS(description='Purchase date (America/New_York) — all metrics in this row are for tickets SOLD on this date'),
ALTER COLUMN sales_channel_id SET OPTIONS(description='Vivenu sales channel ID'),
ALTER COLUMN partner_name SET OPTIONS(description='Partner display name from reference.partners'),
ALTER COLUMN partner_type SET OPTIONS(description='Partner classification: direct, ota, hotel, group'),
ALTER COLUMN channel_group SET OPTIONS(description='Business grouping: Retail / Box Office, Web Sales, OTA, Groups, Vouchers, Passes, Comp'),
ALTER COLUMN tickets_sold SET OPTIONS(description='Total tickets sold on this date (paid + comp)'),
ALTER COLUMN orders SET OPTIONS(description='Distinct transactions (orders) on this date'),
ALTER COLUMN gross_revenue SET OPTIONS(description='Sum of retail prices for paid tickets sold on this date'),
ALTER COLUMN net_revenue SET OPTIONS(description='Sum of net prices (after commission) for paid tickets sold on this date'),
ALTER COLUMN commission_amount SET OPTIONS(description='Total commission = gross_revenue - net_revenue'),
ALTER COLUMN avg_ticket_price SET OPTIONS(description='Average gross price per paid ticket sold on this date'),
ALTER COLUMN total_inner_charges SET OPTIONS(description='Sum of Vivenu platform fees for tickets sold on this date'),
ALTER COLUMN total_outer_charges SET OPTIONS(description='Sum of payment processing fees for tickets sold on this date'),
ALTER COLUMN tickets_redeemed SET OPTIONS(description='Paid tickets sold on this date that were EVENTUALLY scanned (may be days/weeks later). NOT walk-in count — for that use daily_capacity_summary'),
ALTER COLUMN unique_transactions_redeemed SET OPTIONS(description='Distinct orders from this date where at least one ticket was eventually scanned'),
ALTER COLUMN comp_tickets_sold SET OPTIONS(description='Complimentary (free) tickets issued on this date'),
ALTER COLUMN comp_tickets_redeemed SET OPTIONS(description='Comp tickets from this date that were eventually scanned'),
ALTER COLUMN redemption_rate SET OPTIONS(description='Fraction of paid tickets sold on this date that were eventually scanned. Measures sell-through, NOT daily attendance rate'),
ALTER COLUMN updated_at SET OPTIONS(description='When this row was last rebuilt by the transform');

-- ============================================================
-- 3. mercer_analytics.daily_capacity_summary
--    This table is grouped by CHECKIN DATE (visit date).
--    It answers: "how many people walked in on this date?"
--    This matches what the Vivenu scanning dashboard shows.
-- ============================================================
ALTER TABLE mercer_analytics.daily_capacity_summary
ALTER COLUMN checkin_date SET OPTIONS(description='The date people actually walked in and scanned at the gate (America/New_York). This is the VISIT date'),
ALTER COLUMN total_checkins SET OPTIONS(description='Total people who scanned in on this date (paid + comp). Matches Vivenu scanning dashboard'),
ALTER COLUMN paid_checkins SET OPTIONS(description='Paid ticket holders who scanned in on this date'),
ALTER COLUMN comp_checkins SET OPTIONS(description='Complimentary ticket holders who scanned in on this date'),
ALTER COLUMN checkins_direct SET OPTIONS(description='Walk-ins via direct/retail channels who scanned on this date'),
ALTER COLUMN checkins_hotel SET OPTIONS(description='Hotel partner ticket holders who scanned on this date'),
ALTER COLUMN checkins_ota SET OPTIONS(description='OTA (online travel agency) ticket holders who scanned on this date'),
ALTER COLUMN checkins_group SET OPTIONS(description='Group booking ticket holders who scanned on this date'),
ALTER COLUMN checkins_complimentary SET OPTIONS(description='Comp ticket holders who scanned on this date (same as comp_checkins)'),
ALTER COLUMN gross_revenue_redeemed SET OPTIONS(description='Total retail value of tickets that were scanned on this date (regardless of when purchased)'),
ALTER COLUMN net_revenue_redeemed SET OPTIONS(description='Total net revenue of tickets that were scanned on this date (regardless of when purchased)'),
ALTER COLUMN updated_at SET OPTIONS(description='When this row was last rebuilt by the transform');

-- ============================================================
-- 4. mercer_analytics.daily_combined_summary (VIEW)
--    Joins sales (by purchase date) with attendance (by checkin
--    date) on the same date axis. Best default for dashboards.
-- ============================================================
ALTER VIEW mercer_analytics.daily_combined_summary
ALTER COLUMN report_date SET OPTIONS(description='Calendar date — sales metrics are for tickets SOLD on this date, attendance metrics are for people who VISITED on this date'),
ALTER COLUMN tickets_sold SET OPTIONS(description='Total tickets sold on this date (paid + comp) — from daily_revenue_summary'),
ALTER COLUMN orders SET OPTIONS(description='Distinct transactions (orders) on this date — from daily_revenue_summary'),
ALTER COLUMN gross_revenue SET OPTIONS(description='Total retail revenue from tickets sold on this date — from daily_revenue_summary'),
ALTER COLUMN net_revenue SET OPTIONS(description='Total net revenue (after commission) from tickets sold on this date — from daily_revenue_summary'),
ALTER COLUMN comp_tickets SET OPTIONS(description='Complimentary tickets issued on this date — from daily_revenue_summary'),
ALTER COLUMN redemptions SET OPTIONS(description='People who actually walked in and scanned on this date — from daily_capacity_summary. Matches Vivenu scanning dashboard'),
ALTER COLUMN paid_checkins SET OPTIONS(description='Paid ticket holders who scanned in on this date — from daily_capacity_summary'),
ALTER COLUMN comp_checkins SET OPTIONS(description='Comp ticket holders who scanned in on this date — from daily_capacity_summary'),
ALTER COLUMN budgeted_tickets_sold SET OPTIONS(description='2026 daily budget target for tickets sold — from reference.daily_budgets'),
ALTER COLUMN budgeted_redemptions SET OPTIONS(description='2026 daily budget target for redemptions (walk-ins) — from reference.daily_budgets'),
ALTER COLUMN budgeted_net_revenue SET OPTIONS(description='2026 daily budget target for net revenue — from reference.daily_budgets'),
ALTER COLUMN tickets_for_event_date SET OPTIONS(description='Total tickets (paid + comp) sold for events scheduled on this date — used for true redemption rate'),
ALTER COLUMN paid_tickets_for_event_date SET OPTIONS(description='Paid tickets sold for events scheduled on this date'),
ALTER COLUMN redeemed_for_event_date SET OPTIONS(description='Paid tickets for events on this date that were actually scanned at the gate'),
ALTER COLUMN redemption_rate SET OPTIONS(description='True redemption rate: redeemed / paid tickets for events on this date. Answers "what % of people who bought tickets for today actually showed up?"');

-- ============================================================
-- 5. mercer_analytics.yoy_weekly_comparison (VIEW)
--    One row per date with ISO week/day keys for YoY comparison.
--    In Looker: use sort_key as dimension, split by iso_year.
-- ============================================================
ALTER VIEW mercer_analytics.yoy_weekly_comparison
ALTER COLUMN report_date SET OPTIONS(description='Calendar date'),
ALTER COLUMN iso_year SET OPTIONS(description='ISO year (use to split series in Looker for YoY comparison)'),
ALTER COLUMN iso_week SET OPTIONS(description='ISO week number (1-53). Same week number across years = like-for-like comparison'),
ALTER COLUMN day_of_week SET OPTIONS(description='Day of week as number (1=Sunday, 7=Saturday)'),
ALTER COLUMN day_name SET OPTIONS(description='Day of week name (Monday, Tuesday, etc.)'),
ALTER COLUMN sort_key SET OPTIONS(description='Numeric sort key: iso_week * 10 + day_of_week. Use as dimension in Looker, sort ascending'),
ALTER COLUMN tickets_sold SET OPTIONS(description='Total tickets sold on this date'),
ALTER COLUMN orders SET OPTIONS(description='Distinct orders on this date'),
ALTER COLUMN gross_revenue SET OPTIONS(description='Gross revenue from tickets sold on this date'),
ALTER COLUMN net_revenue SET OPTIONS(description='Net revenue (after commission) from tickets sold on this date'),
ALTER COLUMN redemptions SET OPTIONS(description='People who walked in on this date (from daily_capacity_summary)'),
ALTER COLUMN comp_tickets SET OPTIONS(description='Complimentary tickets on this date'),
ALTER COLUMN budgeted_tickets_sold SET OPTIONS(description='2026 daily budget target for tickets sold — from reference.daily_budgets'),
ALTER COLUMN budgeted_redemptions SET OPTIONS(description='2026 daily budget target for redemptions (walk-ins) — from reference.daily_budgets'),
ALTER COLUMN budgeted_net_revenue SET OPTIONS(description='2026 daily budget target for net revenue — from reference.daily_budgets'),
ALTER COLUMN tickets_for_event_date SET OPTIONS(description='Total tickets (paid + comp) sold for events scheduled on this date'),
ALTER COLUMN paid_tickets_for_event_date SET OPTIONS(description='Paid tickets sold for events scheduled on this date'),
ALTER COLUMN redeemed_for_event_date SET OPTIONS(description='Paid tickets for events on this date that were actually scanned'),
ALTER COLUMN redemption_rate SET OPTIONS(description='True redemption rate: redeemed / paid tickets for events on this date');
