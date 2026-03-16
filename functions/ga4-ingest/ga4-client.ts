import { BetaAnalyticsDataClient } from '@google-analytics/data';

const GA4_PROPERTY_ID = '480925616';

const client = new BetaAnalyticsDataClient();

export interface GA4SessionRow {
  date: string;
  source: string;
  medium: string;
  campaign: string;
  default_channel_group: string;
  device_category: string;
  country: string;
  city: string;
  landing_page: string;
  sessions: number;
  engaged_sessions: number;
  total_users: number;
  new_users: number;
  page_views: number;
  avg_session_duration: number;
  bounce_rate: number;
  conversions: number;
  event_count: number;
}

export interface GA4PurchaseRow {
  date: string;
  transaction_id: string;
  source: string;
  medium: string;
  campaign: string;
  default_channel_group: string;
  device_category: string;
  country: string;
  city: string;
  items_purchased: number;
  purchase_revenue: number;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function fetchSessions(
  startDate: Date,
  endDate: Date
): Promise<GA4SessionRow[]> {
  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [
      {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
      },
    ],
    dimensions: [
      { name: 'date' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'sessionCampaignName' },
      { name: 'sessionDefaultChannelGroup' },
      { name: 'deviceCategory' },
      { name: 'country' },
      { name: 'city' },
      { name: 'landingPagePlusQueryString' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' },
      { name: 'conversions' },
      { name: 'eventCount' },
    ],
    limit: 250000,
  });

  const rows: GA4SessionRow[] = [];
  for (const row of response.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    const date = dims[0]?.value ?? '';
    rows.push({
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      source: dims[1]?.value ?? '(not set)',
      medium: dims[2]?.value ?? '(not set)',
      campaign: dims[3]?.value ?? '(not set)',
      default_channel_group: dims[4]?.value ?? '(not set)',
      device_category: dims[5]?.value ?? '(not set)',
      country: dims[6]?.value ?? '(not set)',
      city: dims[7]?.value ?? '(not set)',
      landing_page: dims[8]?.value ?? '(not set)',
      sessions: Number(mets[0]?.value ?? 0),
      engaged_sessions: Number(mets[1]?.value ?? 0),
      total_users: Number(mets[2]?.value ?? 0),
      new_users: Number(mets[3]?.value ?? 0),
      page_views: Number(mets[4]?.value ?? 0),
      avg_session_duration: Number(mets[5]?.value ?? 0),
      bounce_rate: Number(mets[6]?.value ?? 0),
      conversions: Number(mets[7]?.value ?? 0),
      event_count: Number(mets[8]?.value ?? 0),
    });
  }

  console.log(`[ga4-client] Fetched ${rows.length} session rows for ${formatDate(startDate)}–${formatDate(endDate)}`);
  return rows;
}

export async function fetchPurchases(
  startDate: Date,
  endDate: Date
): Promise<GA4PurchaseRow[]> {
  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [
      {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
      },
    ],
    dimensions: [
      { name: 'date' },
      { name: 'transactionId' },
      { name: 'sessionSource' },
      { name: 'sessionMedium' },
      { name: 'sessionCampaignName' },
      { name: 'sessionDefaultChannelGroup' },
      { name: 'deviceCategory' },
      { name: 'country' },
      { name: 'city' },
    ],
    metrics: [
      { name: 'itemsPurchased' },
      { name: 'purchaseRevenue' },
    ],
    limit: 250000,
  });

  const rows: GA4PurchaseRow[] = [];
  for (const row of response.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    const date = dims[0]?.value ?? '';
    const txId = dims[1]?.value ?? '';
    if (!txId || txId === '(not set)') continue;
    rows.push({
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      transaction_id: txId,
      source: dims[2]?.value ?? '(not set)',
      medium: dims[3]?.value ?? '(not set)',
      campaign: dims[4]?.value ?? '(not set)',
      default_channel_group: dims[5]?.value ?? '(not set)',
      device_category: dims[6]?.value ?? '(not set)',
      country: dims[7]?.value ?? '(not set)',
      city: dims[8]?.value ?? '(not set)',
      items_purchased: Number(mets[0]?.value ?? 0),
      purchase_revenue: Number(mets[1]?.value ?? 0),
    });
  }

  console.log(`[ga4-client] Fetched ${rows.length} purchase rows for ${formatDate(startDate)}–${formatDate(endDate)}`);
  return rows;
}
