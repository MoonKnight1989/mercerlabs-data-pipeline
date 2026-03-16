import { google } from 'googleapis';

// Site URL — set via SEARCH_CONSOLE_SITE_URL env var or falls back to default
// Format: 'sc-domain:mercerlabs.com' (domain property) or 'https://www.mercerlabs.com/' (URL property)
const SITE_URL = process.env['SEARCH_CONSOLE_SITE_URL'] ?? 'sc-domain:mercerlabs.com';

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
});

const searchconsole = google.searchconsole({ version: 'v1', auth });

export interface SearchConsoleRow {
  date: string;
  query: string;
  page: string;
  device: string;
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch Search Console search analytics data for a date range.
 * The API returns max 25,000 rows per request, so we paginate.
 * Data is available with a ~3 day lag.
 */
export async function fetchSearchAnalytics(
  startDate: Date,
  endDate: Date
): Promise<SearchConsoleRow[]> {
  const allRows: SearchConsoleRow[] = [];
  const PAGE_SIZE = 25000;
  let startRow = 0;

  while (true) {
    const response = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ['date', 'query', 'page', 'device', 'country'],
        rowLimit: PAGE_SIZE,
        startRow,
        dataState: 'final',
      },
    });

    const rows = response.data.rows ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const keys = row.keys ?? [];
      allRows.push({
        date: keys[0] ?? '',
        query: keys[1] ?? '',
        page: keys[2] ?? '',
        device: keys[3] ?? '',
        country: keys[4] ?? '',
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    startRow += PAGE_SIZE;
  }

  console.log(
    `[sc-client] Fetched ${allRows.length} rows for ${formatDate(startDate)}–${formatDate(endDate)}`
  );
  return allRows;
}
