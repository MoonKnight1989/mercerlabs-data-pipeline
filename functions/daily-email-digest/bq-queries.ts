import { BigQuery } from '@google-cloud/bigquery';
import type {
  DailyRevenueSummary,
  EventSummary,
  ChannelSummary,
  EmailRecipient,
  EmailDigestPayload,
} from './types';

const PROJECT_ID = 'mercer-labs-488707';
const bq = new BigQuery({ projectId: PROJECT_ID });

// ── Yesterday totals (one row per channel) ──────────────────────────
async function queryYesterdayRevenue(): Promise<DailyRevenueSummary[]> {
  const [rows] = await bq.query({
    query: `
      SELECT * FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date = CURRENT_DATE('America/New_York') - 1
    `,
  });
  return rows as DailyRevenueSummary[];
}

// ── Same day last week (for WoW comparison) ─────────────────────────
async function querySameDayLastWeek(): Promise<DailyRevenueSummary[]> {
  const [rows] = await bq.query({
    query: `
      SELECT * FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date = CURRENT_DATE('America/New_York') - 8
    `,
  });
  return rows as DailyRevenueSummary[];
}

// ── Sales by event (from tickets table) ─────────────────────────────
async function queryEventBreakdown(): Promise<EventSummary[]> {
  const [rows] = await bq.query({
    query: `
      SELECT
        COALESCE(event_name, 'Other') AS event_name,
        COUNT(*) AS tickets_sold,
        SUM(net_price) AS net_revenue
      FROM \`${PROJECT_ID}.mercer_analytics.tickets\`
      WHERE purchase_date = CURRENT_DATE('America/New_York') - 1
        AND NOT is_complimentary
      GROUP BY 1
      ORDER BY 3 DESC
    `,
  });
  const typed = rows as Array<{ event_name: string; tickets_sold: number; net_revenue: number }>;
  const total = typed.reduce((s, r) => s + r.net_revenue, 0);
  return typed.map((r) => ({
    event_name: r.event_name,
    tickets_sold: r.tickets_sold,
    net_revenue: r.net_revenue,
    pct_of_total: total > 0 ? (r.net_revenue / total) * 100 : 0,
  }));
}

// ── Sales by channel (Walk-in / Online / Groups / Other) ────────────
async function queryChannelBreakdown(): Promise<ChannelSummary[]> {
  const [rows] = await bq.query({
    query: `
      SELECT
        CASE
          WHEN channel_group IN ('Retail / Box Office') THEN 'Walk-in'
          WHEN channel_group IN ('Web Sales', 'OTA', 'Unattributed Partner') THEN 'Online'
          WHEN channel_group = 'Groups' THEN 'Groups'
          ELSE 'Other'
        END AS channel_bucket,
        SUM(tickets_sold) AS tickets_sold,
        SUM(net_revenue) AS net_revenue
      FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date = CURRENT_DATE('America/New_York') - 1
      GROUP BY 1
      ORDER BY 3 DESC
    `,
  });
  const typed = rows as Array<{ channel_bucket: string; tickets_sold: number; net_revenue: number }>;
  const total = typed.reduce((s, r) => s + r.net_revenue, 0);
  return typed.map((r) => ({
    channel: r.channel_bucket,
    tickets_sold: r.tickets_sold,
    net_revenue: r.net_revenue,
    pct_of_total: total > 0 ? (r.net_revenue / total) * 100 : 0,
  }));
}

// ── Gift cards + group sales (additional categories) ────────────────
interface AdditionalCategory {
  gift_card_tickets: number;
  gift_card_revenue: number;
  group_tickets: number;
  group_revenue: number;
}

async function queryAdditionalCategories(): Promise<AdditionalCategory> {
  const [rows] = await bq.query({
    query: `
      SELECT
        COUNTIF(ticket_category = 'package') AS gift_card_tickets,
        SUM(IF(ticket_category = 'package', net_price, 0)) AS gift_card_revenue,
        COUNTIF(channel_group = 'Groups') AS group_tickets,
        SUM(IF(channel_group = 'Groups', net_price, 0)) AS group_revenue
      FROM \`${PROJECT_ID}.mercer_analytics.tickets\`
      WHERE purchase_date = CURRENT_DATE('America/New_York') - 1
        AND NOT is_complimentary
    `,
  });
  const r = (rows as Record<string, number>[])[0];
  return {
    gift_card_tickets: r?.['gift_card_tickets'] ?? 0,
    gift_card_revenue: r?.['gift_card_revenue'] ?? 0,
    group_tickets: r?.['group_tickets'] ?? 0,
    group_revenue: r?.['group_revenue'] ?? 0,
  };
}

// ── Checkins from daily_capacity_summary (by checkin date) ──────────
interface CheckinRow {
  total_checkins: number;
  paid_checkins: number;
  comp_checkins: number;
}

async function queryCheckins(dayOffset: number): Promise<CheckinRow | null> {
  const [rows] = await bq.query({
    query: `
      SELECT total_checkins, paid_checkins, comp_checkins
      FROM \`${PROJECT_ID}.mercer_analytics.daily_capacity_summary\`
      WHERE checkin_date = CURRENT_DATE('America/New_York') + @offset
    `,
    params: { offset: dayOffset },
  });
  return (rows as CheckinRow[])[0] ?? null;
}

// ── Recipients from reference.email_recipients ──────────────────────
export async function queryRecipients(groupName: string): Promise<EmailRecipient[]> {
  const [rows] = await bq.query({
    query: `
      SELECT email, display_name
      FROM \`${PROJECT_ID}.reference.email_recipients\`
      WHERE is_active = TRUE
        AND group_name = @groupName
    `,
    params: { groupName },
  });
  return rows as EmailRecipient[];
}

// ── Helpers ─────────────────────────────────────────────────────────
function sumField(rows: DailyRevenueSummary[], field: keyof DailyRevenueSummary): number {
  return rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
}

const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

// ── Main builder ────────────────────────────────────────────────────
export async function buildDigestPayload(): Promise<EmailDigestPayload> {
  const [yesterday, lastWeek, events, channels, additional, checkins, prevCheckins] =
    await Promise.all([
      queryYesterdayRevenue(),
      querySameDayLastWeek(),
      queryEventBreakdown(),
      queryChannelBreakdown(),
      queryAdditionalCategories(),
      queryCheckins(-1),
      queryCheckins(-8),
    ]);

  const now = new Date();
  const yesterdayDate = new Date(
    now.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
  );
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const reportDate = yesterdayDate.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const dayOfWeek = DAYS_OF_WEEK[yesterdayDate.getDay()]!;

  const netRevenue = sumField(yesterday, 'net_revenue');
  const grossRevenue = sumField(yesterday, 'gross_revenue');
  // Retail NET = direct/box office net revenue only
  const retailRows = yesterday.filter(
    (r) => r.channel_group === 'Retail / Box Office'
  );
  const retailNetRevenue = sumField(retailRows, 'net_revenue');

  const prevNet = lastWeek.length > 0 ? sumField(lastWeek, 'net_revenue') : null;
  const prevGross = lastWeek.length > 0 ? sumField(lastWeek, 'gross_revenue') : null;
  const prevTickets = lastWeek.length > 0 ? sumField(lastWeek, 'tickets_sold') : null;
  const prevRedemptions = prevCheckins?.total_checkins ?? null;

  return {
    report_date: reportDate,
    day_of_week: dayOfWeek,
    total_tickets_sold: sumField(yesterday, 'tickets_sold'),
    net_revenue: netRevenue,
    retail_net_revenue: retailNetRevenue,
    total_net_revenue: netRevenue + retailNetRevenue,
    gross_revenue: grossRevenue,
    total_redemptions: checkins?.total_checkins ?? 0,
    orders: sumField(yesterday, 'orders'),
    comp_tickets: sumField(yesterday, 'comp_tickets_sold'),
    prev_tickets_sold: prevTickets,
    prev_net_revenue: prevNet,
    prev_gross_revenue: prevGross,
    prev_redemptions: prevRedemptions,
    events,
    channels,
    gift_card_tickets: additional.gift_card_tickets,
    gift_card_revenue: additional.gift_card_revenue,
    group_tickets: additional.group_tickets,
    group_revenue: additional.group_revenue,
  };
}
