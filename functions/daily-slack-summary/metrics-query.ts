import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'mercer-labs-488707';
const bq = new BigQuery({ projectId: PROJECT_ID });

export interface DailyMetrics {
  reportDate: string;
  dayOfWeek: string;
  ticketsSold: number;
  redemptions: number;
  grossRevenue: number;
  netRevenue: number;
  orders: number;
  compTickets: number;
  // Week-over-week comparisons (null if no data for last week)
  prevTicketsSold: number | null;
  prevRedemptions: number | null;
  prevGrossRevenue: number | null;
  prevNetRevenue: number | null;
  // By event breakdown
  eventBreakdown: EventMetrics[];
  // Top channels
  channelBreakdown: ChannelMetrics[];
}

export interface EventMetrics {
  eventName: string;
  ticketsSold: number;
  grossRevenue: number;
}

export interface ChannelMetrics {
  channelGroup: string;
  ticketsSold: number;
  grossRevenue: number;
}

export async function fetchDailyMetrics(): Promise<DailyMetrics> {
  // Run all queries in parallel
  const [yesterdayRows, prevWeekRows, eventRows, channelRows, checkins, prevCheckins] =
    await Promise.all([
      queryYesterday(),
      querySameDayLastWeek(),
      queryEventBreakdown(),
      queryChannelBreakdown(),
      queryCheckins(-1),
      queryCheckins(-8),
    ]);

  const yesterday = yesterdayRows[0];
  const prev = prevWeekRows[0] ?? null;

  // Compute report date in ET
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
  const dayOfWeek = yesterdayDate.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
  });

  return {
    reportDate,
    dayOfWeek,
    ticketsSold: yesterday?.tickets_sold ?? 0,
    redemptions: checkins?.total_checkins ?? 0,
    grossRevenue: yesterday?.gross_revenue ?? 0,
    netRevenue: yesterday?.net_revenue ?? 0,
    orders: yesterday?.orders ?? 0,
    compTickets: yesterday?.comp_tickets ?? 0,
    prevTicketsSold: prev?.tickets_sold ?? null,
    prevRedemptions: prevCheckins?.total_checkins ?? null,
    prevGrossRevenue: prev?.gross_revenue ?? null,
    prevNetRevenue: prev?.net_revenue ?? null,
    eventBreakdown: eventRows,
    channelBreakdown: channelRows,
  };
}

interface AggRow {
  tickets_sold: number;
  redemptions: number;
  gross_revenue: number;
  net_revenue: number;
  orders: number;
  comp_tickets: number;
}

async function queryYesterday(): Promise<AggRow[]> {
  const [rows] = await bq.query({
    query: `
      SELECT
        SUM(tickets_sold) AS tickets_sold,
        SUM(tickets_redeemed) AS redemptions,
        SUM(gross_revenue) AS gross_revenue,
        SUM(net_revenue) AS net_revenue,
        SUM(orders) AS orders,
        SUM(comp_tickets_sold) AS comp_tickets
      FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date = CURRENT_DATE('America/New_York') - 1
    `,
  });
  return rows as AggRow[];
}

async function querySameDayLastWeek(): Promise<AggRow[]> {
  const [rows] = await bq.query({
    query: `
      SELECT
        SUM(tickets_sold) AS tickets_sold,
        SUM(tickets_redeemed) AS redemptions,
        SUM(gross_revenue) AS gross_revenue,
        SUM(net_revenue) AS net_revenue,
        SUM(orders) AS orders,
        SUM(comp_tickets_sold) AS comp_tickets
      FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date = CURRENT_DATE('America/New_York') - 8
    `,
  });
  return rows as AggRow[];
}

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

async function queryEventBreakdown(): Promise<EventMetrics[]> {
  const [rows] = await bq.query({
    query: `
      SELECT
        COALESCE(event_name, 'Other') AS event_name,
        COUNT(*) AS tickets_sold,
        SUM(gross_price) AS gross_revenue
      FROM \`${PROJECT_ID}.mercer_analytics.tickets\`
      WHERE purchase_date = CURRENT_DATE('America/New_York') - 1
        AND NOT is_complimentary
      GROUP BY 1
      ORDER BY 3 DESC
    `,
  });
  return (rows as Array<{ event_name: string; tickets_sold: number; gross_revenue: number }>).map(
    (r) => ({
      eventName: r.event_name,
      ticketsSold: r.tickets_sold,
      grossRevenue: r.gross_revenue,
    })
  );
}

async function queryChannelBreakdown(): Promise<ChannelMetrics[]> {
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
        SUM(gross_revenue) AS gross_revenue
      FROM \`${PROJECT_ID}.mercer_analytics.daily_revenue_summary\`
      WHERE report_date = CURRENT_DATE('America/New_York') - 1
      GROUP BY 1
      ORDER BY 3 DESC
    `,
  });
  return (rows as Array<{ channel_bucket: string; tickets_sold: number; gross_revenue: number }>).map(
    (r) => ({
      channelGroup: r.channel_bucket,
      ticketsSold: r.tickets_sold,
      grossRevenue: r.gross_revenue,
    })
  );
}
