import { BigQuery } from '@google-cloud/bigquery';
import type {
  DailyRevenueSummary,
  DailyCapacitySummary,
  UnknownChannel,
  EmailDigestPayload,
  ChannelSummary,
} from './types';

const PROJECT_ID = 'mercer-labs-488707';

const bq = new BigQuery({ projectId: PROJECT_ID });

async function queryYesterdayRevenue(): Promise<DailyRevenueSummary[]> {
  const [rows] = await bq.query({
    query: `
      SELECT * FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date = CURRENT_DATE('America/New_York') - 1
    `,
  });
  return rows as DailyRevenueSummary[];
}

async function querySameDayLastWeek(): Promise<DailyRevenueSummary[]> {
  const [rows] = await bq.query({
    query: `
      SELECT * FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date = CURRENT_DATE('America/New_York') - 8
    `,
  });
  return rows as DailyRevenueSummary[];
}

async function queryYesterdayCapacity(): Promise<DailyCapacitySummary | null> {
  const [rows] = await bq.query({
    query: `
      SELECT * FROM \`${PROJECT_ID}.mercer_analytics.daily_capacity_summary\`
      WHERE checkin_date = CURRENT_DATE('America/New_York') - 1
    `,
  });
  const typed = rows as DailyCapacitySummary[];
  return typed[0] ?? null;
}

interface TrailingAverage {
  net_revenue: number;
  tickets_sold: number;
  redemptions: number;
}

async function queryTrailing7DayAvg(): Promise<TrailingAverage | null> {
  const [rows] = await bq.query({
    query: `
      SELECT
        AVG(net_revenue) AS net_revenue,
        AVG(tickets_sold) AS tickets_sold,
        AVG(tickets_redeemed) AS redemptions
      FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date BETWEEN
        CURRENT_DATE('America/New_York') - 8
        AND CURRENT_DATE('America/New_York') - 2
    `,
  });
  const typed = rows as Record<string, number | null>[];
  const row = typed[0];
  if (!row || row['net_revenue'] == null) return null;
  return {
    net_revenue: Number(row['net_revenue']),
    tickets_sold: Number(row['tickets_sold']),
    redemptions: Number(row['redemptions']),
  };
}

async function queryUnresolvedChannels(): Promise<UnknownChannel[]> {
  const [rows] = await bq.query({
    query: `
      SELECT * FROM \`${PROJECT_ID}.reference.unknown_channels\`
      WHERE resolved = FALSE
    `,
  });
  return (rows as Record<string, unknown>[]).map((row) => ({
    sales_channel_id: String(row['sales_channel_id']),
    first_seen_at: String(row['first_seen_at']),
    sample_ticket_id: row['sample_ticket_id'] ? String(row['sample_ticket_id']) : null,
    sample_price: row['sample_price'] != null ? Number(row['sample_price']) : null,
    ticket_count: Number(row['ticket_count']),
    resolved: false,
    resolved_at: null,
  }));
}

function sumField(rows: DailyRevenueSummary[], field: keyof DailyRevenueSummary): number {
  return rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
}

function buildChannelSummaries(rows: DailyRevenueSummary[]): ChannelSummary[] {
  return rows
    .filter((r) => r.gross_revenue > 0)
    .map((r) => ({
      name: r.partner_name ?? r.sales_channel_id ?? 'Direct',
      type: r.partner_type ?? 'unknown',
      tickets: r.tickets_sold,
      gross_revenue: r.gross_revenue,
      net_revenue: r.net_revenue,
      commission_rate: Number(
        (1 - (r.net_revenue / (r.gross_revenue || 1))).toFixed(2)
      ),
    }))
    .sort((a, b) => b.net_revenue - a.net_revenue);
}

const DAYS_OF_WEEK = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

export async function buildDigestPayload(): Promise<EmailDigestPayload> {
  const [yesterday, lastWeek, capacity, trailing, unknowns] = await Promise.all([
    queryYesterdayRevenue(),
    querySameDayLastWeek(),
    queryYesterdayCapacity(),
    queryTrailing7DayAvg(),
    queryUnresolvedChannels(),
  ]);

  const now = new Date();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const reportDate = yesterdayDate.toISOString().split('T')[0]!;
  const dayOfWeek = DAYS_OF_WEEK[yesterdayDate.getDay()]!;

  return {
    report_date: reportDate,
    day_of_week: dayOfWeek,
    yesterday: {
      net_revenue: sumField(yesterday, 'net_revenue'),
      gross_revenue: sumField(yesterday, 'gross_revenue'),
      commission_total: sumField(yesterday, 'commission_amount'),
      tickets_sold: sumField(yesterday, 'tickets_sold'),
      orders: sumField(yesterday, 'orders'),
      total_checkins: capacity?.total_checkins ?? 0,
      paid_checkins: capacity?.paid_checkins ?? 0,
      comp_checkins: capacity?.comp_checkins ?? 0,
      channels: buildChannelSummaries(yesterday),
    },
    same_day_last_week: lastWeek.length > 0
      ? {
          net_revenue: sumField(lastWeek, 'net_revenue'),
          tickets_sold: sumField(lastWeek, 'tickets_sold'),
        }
      : null,
    trailing_7_day_avg: trailing,
    alerts: {
      unknown_channels: unknowns,
    },
  };
}
