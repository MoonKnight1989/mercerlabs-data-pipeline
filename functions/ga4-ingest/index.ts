import * as ff from '@google-cloud/functions-framework';
import { randomUUID } from 'crypto';
import {
  fetchSessions,
  fetchPurchases,
  fetchDailyOverview,
  fetchPages,
  fetchTechnology,
  fetchUserAcquisition,
} from './ga4-client';
import {
  writeSessions,
  writePurchases,
  writeDailyOverview,
  writePages,
  writeTechnology,
  writeUserAcquisition,
  deleteDateRange,
} from './bigquery-writer';

const ALL_TABLES = [
  'ga4_sessions',
  'ga4_purchases',
  'ga4_daily_overview',
  'ga4_pages',
  'ga4_technology',
  'ga4_user_acquisition',
];

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

ff.http('ga4Ingest', async (req, res) => {
  const batchId = randomUUID();
  console.log(`[ga4-ingest] Starting batch ${batchId}`);

  // Determine date range:
  // - Default: yesterday only (daily scheduled run)
  // - Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD (backfill)
  // - Query param: ?days=N (pull last N days)
  let startDate: Date;
  let endDate: Date;

  const startParam = req.query['start'] as string | undefined;
  const endParam = req.query['end'] as string | undefined;
  const daysParam = req.query['days'] as string | undefined;
  const skipDelete = req.query['skipDelete'] === 'true';

  if (startParam && endParam) {
    startDate = new Date(startParam);
    endDate = new Date(endParam);
  } else if (daysParam) {
    const days = parseInt(daysParam, 10);
    startDate = daysAgo(days);
    endDate = daysAgo(1);
  } else {
    startDate = daysAgo(1);
    endDate = daysAgo(1);
  }

  const startStr = toDateString(startDate);
  const endStr = toDateString(endDate);
  console.log(`[ga4-ingest] Date range: ${startStr} to ${endStr}`);

  try {
    // Delete existing data for this range (idempotent re-runs)
    if (!skipDelete) {
      await Promise.all(
        ALL_TABLES.map((t) => deleteDateRange(t, startStr, endStr))
      );
    }

    // Fetch and write in chunks of 30 days
    const totals = {
      sessions: 0,
      purchases: 0,
      daily_overview: 0,
      pages: 0,
      technology: 0,
      user_acquisition: 0,
    };

    let chunkStart = new Date(startDate);
    while (chunkStart <= endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + 29);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

      // Fetch all report types in parallel
      const [sessions, purchases, overview, pages, tech, acquisition] = await Promise.all([
        fetchSessions(chunkStart, chunkEnd),
        fetchPurchases(chunkStart, chunkEnd),
        fetchDailyOverview(chunkStart, chunkEnd),
        fetchPages(chunkStart, chunkEnd),
        fetchTechnology(chunkStart, chunkEnd),
        fetchUserAcquisition(chunkStart, chunkEnd),
      ]);

      // Write all in parallel
      const [s, p, o, pg, t, a] = await Promise.all([
        writeSessions(sessions, batchId),
        writePurchases(purchases, batchId),
        writeDailyOverview(overview, batchId),
        writePages(pages, batchId),
        writeTechnology(tech, batchId),
        writeUserAcquisition(acquisition, batchId),
      ]);

      totals.sessions += s;
      totals.purchases += p;
      totals.daily_overview += o;
      totals.pages += pg;
      totals.technology += t;
      totals.user_acquisition += a;

      chunkStart.setDate(chunkStart.getDate() + 30);
    }

    const result = {
      status: 'ok',
      batch_id: batchId,
      date_range: { start: startStr, end: endStr },
      rows: totals,
    };

    console.log(`[ga4-ingest] Complete: ${JSON.stringify(result)}`);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ga4-ingest] Error: ${message}`);
    res.status(500).json({ error: message, batch_id: batchId });
  }
});
