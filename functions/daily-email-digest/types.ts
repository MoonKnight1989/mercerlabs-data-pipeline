/** Row shape for mercer_analytics.daily_revenue_summary */
export interface DailyRevenueSummary {
  report_date: string;
  sales_channel_id: string | null;
  partner_name: string | null;
  partner_type: string | null;
  channel_group: string;
  tickets_sold: number;
  orders: number;
  gross_revenue: number;
  net_revenue: number;
  commission_amount: number;
  avg_ticket_price: number | null;
  total_inner_charges: number;
  total_outer_charges: number;
  tickets_redeemed: number;
  unique_transactions_redeemed: number;
  comp_tickets_sold: number;
  comp_tickets_redeemed: number;
  redemption_rate: number | null;
  updated_at: string;
}

/** Row shape for mercer_analytics.daily_capacity_summary */
export interface DailyCapacitySummary {
  checkin_date: string;
  total_checkins: number;
  paid_checkins: number;
  comp_checkins: number;
  checkins_direct: number;
  checkins_hotel: number;
  checkins_ota: number;
  checkins_group: number;
  checkins_complimentary: number;
  gross_revenue_redeemed: number;
  net_revenue_redeemed: number;
  updated_at: string;
}

/** Event-level breakdown */
export interface EventSummary {
  event_name: string;
  tickets_sold: number;
  net_revenue: number;
  pct_of_total: number;
}

/** Channel-level breakdown */
export interface ChannelSummary {
  channel: string;
  tickets_sold: number;
  net_revenue: number;
  pct_of_total: number;
}

/** Recipient from reference.email_recipients */
export interface EmailRecipient {
  email: string;
  display_name: string | null;
}

/** Full digest payload for email template rendering */
export interface EmailDigestPayload {
  report_date: string;
  day_of_week: string;
  // Headline totals
  total_tickets_sold: number;
  net_revenue: number;
  retail_net_revenue: number;
  total_net_revenue: number;
  gross_revenue: number;
  total_redemptions: number;
  orders: number;
  comp_tickets: number;
  // WoW comparisons
  prev_tickets_sold: number | null;
  prev_net_revenue: number | null;
  prev_gross_revenue: number | null;
  prev_redemptions: number | null;
  // Breakdowns
  events: EventSummary[];
  channels: ChannelSummary[];
  // Additional categories
  gift_card_tickets: number;
  gift_card_revenue: number;
  group_tickets: number;
  group_revenue: number;
}
