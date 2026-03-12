// Types needed by daily-email-digest (copied from shared/types.ts)

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

/** Row shape for reference.unknown_channels */
export interface UnknownChannel {
  sales_channel_id: string;
  first_seen_at: string;
  sample_ticket_id: string | null;
  sample_price: number | null;
  ticket_count: number;
  resolved: boolean;
  resolved_at: string | null;
}

/** Channel breakdown for email digest */
export interface ChannelSummary {
  name: string;
  type: string;
  tickets: number;
  gross_revenue: number;
  net_revenue: number;
  commission_rate: number;
}

/** Structured data payload sent to Claude API for narrative generation */
export interface EmailDigestPayload {
  report_date: string;
  day_of_week: string;
  yesterday: {
    net_revenue: number;
    gross_revenue: number;
    commission_total: number;
    tickets_sold: number;
    orders: number;
    total_checkins: number;
    paid_checkins: number;
    comp_checkins: number;
    channels: ChannelSummary[];
  };
  same_day_last_week: {
    net_revenue: number;
    tickets_sold: number;
  } | null;
  trailing_7_day_avg: {
    net_revenue: number;
    tickets_sold: number;
    redemptions: number;
  } | null;
  alerts: {
    unknown_channels: UnknownChannel[];
  };
}
