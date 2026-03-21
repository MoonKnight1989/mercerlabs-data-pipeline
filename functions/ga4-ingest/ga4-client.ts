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

export interface GA4DailyOverviewRow {
  date: string;
  active_users: number;
  active_1_day_users: number;
  active_7_day_users: number;
  active_28_day_users: number;
  total_users: number;
  new_users: number;
  returning_users: number;
  sessions: number;
  engaged_sessions: number;
  engagement_rate: number;
  avg_session_duration: number;
  page_views: number;
  conversions: number;
  user_engagement_duration: number;
  event_count: number;
}

export interface GA4PageRow {
  date: string;
  page_path: string;
  page_title: string;
  page_views: number;
  active_users: number;
  new_users: number;
  engaged_sessions: number;
  avg_session_duration: number;
  bounce_rate: number;
  conversions: number;
  event_count: number;
}

export interface GA4TechnologyRow {
  date: string;
  device_category: string;
  operating_system: string;
  browser: string;
  screen_resolution: string;
  sessions: number;
  total_users: number;
  new_users: number;
  engaged_sessions: number;
  avg_session_duration: number;
  bounce_rate: number;
  conversions: number;
}

export interface GA4UserAcquisitionRow {
  date: string;
  first_user_source: string;
  first_user_medium: string;
  first_user_campaign: string;
  first_user_channel_group: string;
  new_users: number;
  total_users: number;
  sessions: number;
  engaged_sessions: number;
  conversions: number;
  user_engagement_duration: number;
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

export async function fetchDailyOverview(
  startDate: Date,
  endDate: Date
): Promise<GA4DailyOverviewRow[]> {
  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'active1DayUsers' },
      { name: 'active7DayUsers' },
      { name: 'active28DayUsers' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViews' },
    ],
    limit: 250000,
  });

  // Second request for remaining metrics (10 metric limit per request)
  const [response2] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'engagementRate' },
      { name: 'conversions' },
      { name: 'userEngagementDuration' },
      { name: 'eventCount' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
    ],
    limit: 250000,
  });

  // Build lookup from second response
  const extras = new Map<string, { engagement_rate: number; conversions: number; user_engagement_duration: number; event_count: number; returning_users: number }>();
  for (const row of response2.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    const date = dims[0]?.value ?? '';
    const key = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const totalUsers = Number(mets[4]?.value ?? 0);
    const newUsers = Number(mets[5]?.value ?? 0);
    extras.set(key, {
      engagement_rate: Number(mets[0]?.value ?? 0),
      conversions: Number(mets[1]?.value ?? 0),
      user_engagement_duration: Number(mets[2]?.value ?? 0),
      event_count: Number(mets[3]?.value ?? 0),
      returning_users: Math.max(0, totalUsers - newUsers),
    });
  }

  const rows: GA4DailyOverviewRow[] = [];
  for (const row of response.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    const date = dims[0]?.value ?? '';
    const key = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const ext = extras.get(key);
    const totalUsers = Number(mets[4]?.value ?? 0);
    const newUsers = Number(mets[5]?.value ?? 0);
    rows.push({
      date: key,
      active_users: Number(mets[0]?.value ?? 0),
      active_1_day_users: Number(mets[1]?.value ?? 0),
      active_7_day_users: Number(mets[2]?.value ?? 0),
      active_28_day_users: Number(mets[3]?.value ?? 0),
      total_users: totalUsers,
      new_users: newUsers,
      returning_users: ext?.returning_users ?? Math.max(0, totalUsers - newUsers),
      sessions: Number(mets[6]?.value ?? 0),
      engaged_sessions: Number(mets[7]?.value ?? 0),
      engagement_rate: ext?.engagement_rate ?? 0,
      avg_session_duration: Number(mets[8]?.value ?? 0),
      page_views: Number(mets[9]?.value ?? 0),
      conversions: ext?.conversions ?? 0,
      user_engagement_duration: ext?.user_engagement_duration ?? 0,
      event_count: ext?.event_count ?? 0,
    });
  }

  console.log(`[ga4-client] Fetched ${rows.length} daily overview rows for ${formatDate(startDate)}–${formatDate(endDate)}`);
  return rows;
}

export async function fetchPages(
  startDate: Date,
  endDate: Date
): Promise<GA4PageRow[]> {
  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
    dimensions: [
      { name: 'date' },
      { name: 'pagePath' },
      { name: 'pageTitle' },
    ],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'activeUsers' },
      { name: 'newUsers' },
      { name: 'engagedSessions' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' },
      { name: 'conversions' },
      { name: 'eventCount' },
    ],
    limit: 250000,
  });

  const rows: GA4PageRow[] = [];
  for (const row of response.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    const date = dims[0]?.value ?? '';
    rows.push({
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      page_path: dims[1]?.value ?? '(not set)',
      page_title: dims[2]?.value ?? '(not set)',
      page_views: Number(mets[0]?.value ?? 0),
      active_users: Number(mets[1]?.value ?? 0),
      new_users: Number(mets[2]?.value ?? 0),
      engaged_sessions: Number(mets[3]?.value ?? 0),
      avg_session_duration: Number(mets[4]?.value ?? 0),
      bounce_rate: Number(mets[5]?.value ?? 0),
      conversions: Number(mets[6]?.value ?? 0),
      event_count: Number(mets[7]?.value ?? 0),
    });
  }

  console.log(`[ga4-client] Fetched ${rows.length} page rows for ${formatDate(startDate)}–${formatDate(endDate)}`);
  return rows;
}

export async function fetchTechnology(
  startDate: Date,
  endDate: Date
): Promise<GA4TechnologyRow[]> {
  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
    dimensions: [
      { name: 'date' },
      { name: 'deviceCategory' },
      { name: 'operatingSystem' },
      { name: 'browser' },
      { name: 'screenResolution' },
    ],
    metrics: [
      { name: 'sessions' },
      { name: 'totalUsers' },
      { name: 'newUsers' },
      { name: 'engagedSessions' },
      { name: 'averageSessionDuration' },
      { name: 'bounceRate' },
      { name: 'conversions' },
    ],
    limit: 250000,
  });

  const rows: GA4TechnologyRow[] = [];
  for (const row of response.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    const date = dims[0]?.value ?? '';
    rows.push({
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      device_category: dims[1]?.value ?? '(not set)',
      operating_system: dims[2]?.value ?? '(not set)',
      browser: dims[3]?.value ?? '(not set)',
      screen_resolution: dims[4]?.value ?? '(not set)',
      sessions: Number(mets[0]?.value ?? 0),
      total_users: Number(mets[1]?.value ?? 0),
      new_users: Number(mets[2]?.value ?? 0),
      engaged_sessions: Number(mets[3]?.value ?? 0),
      avg_session_duration: Number(mets[4]?.value ?? 0),
      bounce_rate: Number(mets[5]?.value ?? 0),
      conversions: Number(mets[6]?.value ?? 0),
    });
  }

  console.log(`[ga4-client] Fetched ${rows.length} technology rows for ${formatDate(startDate)}–${formatDate(endDate)}`);
  return rows;
}

export async function fetchUserAcquisition(
  startDate: Date,
  endDate: Date
): Promise<GA4UserAcquisitionRow[]> {
  const [response] = await client.runReport({
    property: `properties/${GA4_PROPERTY_ID}`,
    dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
    dimensions: [
      { name: 'date' },
      { name: 'firstUserSource' },
      { name: 'firstUserMedium' },
      { name: 'firstUserCampaignName' },
      { name: 'firstUserDefaultChannelGroup' },
    ],
    metrics: [
      { name: 'newUsers' },
      { name: 'totalUsers' },
      { name: 'sessions' },
      { name: 'engagedSessions' },
      { name: 'conversions' },
      { name: 'userEngagementDuration' },
    ],
    limit: 250000,
  });

  const rows: GA4UserAcquisitionRow[] = [];
  for (const row of response.rows ?? []) {
    const dims = row.dimensionValues ?? [];
    const mets = row.metricValues ?? [];
    const date = dims[0]?.value ?? '';
    rows.push({
      date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
      first_user_source: dims[1]?.value ?? '(not set)',
      first_user_medium: dims[2]?.value ?? '(not set)',
      first_user_campaign: dims[3]?.value ?? '(not set)',
      first_user_channel_group: dims[4]?.value ?? '(not set)',
      new_users: Number(mets[0]?.value ?? 0),
      total_users: Number(mets[1]?.value ?? 0),
      sessions: Number(mets[2]?.value ?? 0),
      engaged_sessions: Number(mets[3]?.value ?? 0),
      conversions: Number(mets[4]?.value ?? 0),
      user_engagement_duration: Number(mets[5]?.value ?? 0),
    });
  }

  console.log(`[ga4-client] Fetched ${rows.length} user acquisition rows for ${formatDate(startDate)}–${formatDate(endDate)}`);
  return rows;
}
