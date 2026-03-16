import type {
  VivenuTicket,
  VivenuTicketsResponse,
  VivenuTransaction,
  VivenuTransactionsResponse,
  VivenuEvent,
  VivenuEventsResponse,
  VivenuScan,
  VivenuScansResponse,
} from './types';

const TICKETS_BASE_URL = 'https://vivenu.com/api/tickets';
const TRANSACTIONS_BASE_URL = 'https://vivenu.com/api/transactions';
const EVENTS_BASE_URL = 'https://vivenu.com/api/events';
const SCANS_BASE_URL = 'https://portier.vivenu.com/api/scans';
const PAGE_SIZE = 500;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

export interface FetchOptions {
  apiKey: string;
  startDate: Date;
  endDate: Date;
}

async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  attempt = 1
): Promise<Response> {
  try {
    const response = await fetch(url, { method: 'GET', headers });
    if (!response.ok) {
      throw new Error(`Vivenu API ${response.status}: ${response.statusText}`);
    }
    return response;
  } catch (error) {
    if (attempt >= MAX_RETRIES) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Vivenu API failed after ${MAX_RETRIES} attempts: ${message}`);
    }
    const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
    console.log(`[vivenu-client] Retry ${attempt}/${MAX_RETRIES} after ${backoff}ms`);
    await new Promise((resolve) => setTimeout(resolve, backoff));
    return fetchWithRetry(url, headers, attempt + 1);
  }
}

export async function fetchTickets(options: FetchOptions): Promise<VivenuTicket[]> {
  const { apiKey, startDate, endDate } = options;
  const allTickets: VivenuTicket[] = [];
  let skip = 0;
  let hasMore = true;

  const headers = { Authorization: `Bearer ${apiKey}` };

  console.log(
    `[vivenu-client] Fetching tickets from ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  while (hasMore) {
    const params = new URLSearchParams({
      top: String(PAGE_SIZE),
      skip: String(skip),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    const response = await fetchWithRetry(`${TICKETS_BASE_URL}?${params.toString()}`, headers);
    const data = (await response.json()) as VivenuTicketsResponse;

    allTickets.push(...data.rows);
    skip += data.rows.length;
    hasMore = skip < data.total;

    console.log(`[vivenu-client] Tickets: ${allTickets.length}/${data.total}`);
  }

  console.log(`[vivenu-client] Complete: ${allTickets.length} tickets fetched`);
  return allTickets;
}

export async function fetchTransactions(options: FetchOptions): Promise<VivenuTransaction[]> {
  const { apiKey, startDate, endDate } = options;
  const allTransactions: VivenuTransaction[] = [];
  let skip = 0;
  let hasMore = true;

  const headers = { Authorization: `Bearer ${apiKey}` };

  console.log(
    `[vivenu-client] Fetching transactions from ${startDate.toISOString()} to ${endDate.toISOString()}`
  );

  while (hasMore) {
    const params = new URLSearchParams({
      top: String(PAGE_SIZE),
      skip: String(skip),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    const response = await fetchWithRetry(
      `${TRANSACTIONS_BASE_URL}?${params.toString()}`,
      headers
    );
    const data = (await response.json()) as VivenuTransactionsResponse;

    allTransactions.push(...data.docs);
    skip += data.docs.length;
    hasMore = skip < data.total;

    console.log(`[vivenu-client] Transactions: ${allTransactions.length}/${data.total}`);
  }

  console.log(`[vivenu-client] Complete: ${allTransactions.length} transactions fetched`);
  return allTransactions;
}

export async function fetchEvents(apiKey: string): Promise<VivenuEvent[]> {
  const allEvents: VivenuEvent[] = [];
  let skip = 0;
  let hasMore = true;

  const headers = { Authorization: `Bearer ${apiKey}` };

  console.log('[vivenu-client] Fetching events for ticket type base prices');

  while (hasMore) {
    const params = new URLSearchParams({
      top: String(100),
      skip: String(skip),
    });

    const response = await fetchWithRetry(`${EVENTS_BASE_URL}?${params.toString()}`, headers);
    const data = (await response.json()) as VivenuEventsResponse;

    allEvents.push(...data.rows);
    skip += data.rows.length;
    hasMore = data.rows.length === 100;

    console.log(`[vivenu-client] Events: ${allEvents.length}`);
  }

  console.log(`[vivenu-client] Complete: ${allEvents.length} events fetched`);
  return allEvents;
}

/**
 * Fetch a single event by ID from the Vivenu API.
 */
export async function fetchEventById(apiKey: string, eventId: string): Promise<VivenuEvent> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const response = await fetchWithRetry(`${EVENTS_BASE_URL}/${eventId}`, headers);
  return (await response.json()) as VivenuEvent;
}

/**
 * Fetch recent scans from Portier API (newest first).
 * The Portier API has no date filter, so we fetch pages from the front
 * and stop after `maxPages` pages. Default 10 pages = 10,000 scans
 * which covers ~2-3 days of typical volume.
 * The MERGE in BigQuery handles deduplication.
 */
export async function fetchRecentScans(
  apiKey: string,
  maxPages = 10
): Promise<VivenuScan[]> {
  const allScans: VivenuScan[] = [];
  const headers = { Authorization: `Bearer ${apiKey}` };
  const scanPageSize = 1000;

  console.log(`[vivenu-client] Fetching recent scans (up to ${maxPages} pages)`);

  for (let page = 0; page < maxPages; page++) {
    const skip = page * scanPageSize;
    const params = new URLSearchParams({
      top: String(scanPageSize),
      skip: String(skip),
    });

    const response = await fetchWithRetry(`${SCANS_BASE_URL}?${params.toString()}`, headers);
    const data = (await response.json()) as VivenuScansResponse;

    allScans.push(...data.docs);

    if (data.docs.length < scanPageSize) break;

    console.log(`[vivenu-client] Scans: ${allScans.length}/${data.total}`);
  }

  console.log(`[vivenu-client] Complete: ${allScans.length} scans fetched`);
  return allScans;
}
