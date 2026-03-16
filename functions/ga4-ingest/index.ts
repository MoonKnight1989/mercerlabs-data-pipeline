import * as ff from '@google-cloud/functions-framework';
import { randomUUID } from 'crypto';
import { fetchSessions, fetchPurchases } from './ga4-client';
import { writeSessions, writePurchases, deleteDateRange } from './bigquery-writer';

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
    // Skip delete for initial backfill or when streaming buffer conflicts
    if (!skipDelete) {
      await deleteDateRange('ga4_sessions', startStr, endStr);
      await deleteDateRange('ga4_purchases', startStr, endStr);
    }

    // Fetch from GA4 Data API in chunks of 30 days (API can handle large ranges but
    // chunking avoids response size limits and gives progress logging)
    let totalSessions = 0;
    let totalPurchases = 0;

    let chunkStart = new Date(startDate);
    while (chunkStart <= endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + 29);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

      const [sessions, purchases] = await Promise.all([
        fetchSessions(chunkStart, chunkEnd),
        fetchPurchases(chunkStart, chunkEnd),
      ]);

      if (sessions.length > 0) {
        totalSessions += await writeSessions(sessions, batchId);
      }
      if (purchases.length > 0) {
        totalPurchases += await writePurchases(purchases, batchId);
      }

      chunkStart.setDate(chunkStart.getDate() + 30);
    }

    const result = {
      status: 'ok',
      batch_id: batchId,
      date_range: { start: startStr, end: endStr },
      sessions_rows: totalSessions,
      purchase_rows: totalPurchases,
    };

    console.log(`[ga4-ingest] Complete: ${JSON.stringify(result)}`);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ga4-ingest] Error: ${message}`);
    res.status(500).json({ error: message, batch_id: batchId });
  }
});
