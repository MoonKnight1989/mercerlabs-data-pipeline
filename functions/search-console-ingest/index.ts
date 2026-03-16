import * as ff from '@google-cloud/functions-framework';
import { randomUUID } from 'crypto';
import { fetchSearchAnalytics } from './search-console-client';
import { writeSearchData, deleteDateRange } from './bigquery-writer';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

ff.http('searchConsoleIngest', async (req, res) => {
  const batchId = randomUUID();
  console.log(`[sc-ingest] Starting batch ${batchId}`);

  // Determine date range:
  // - Default: 4 days ago only (SC data has ~3 day lag)
  // - Query params: ?start=YYYY-MM-DD&end=YYYY-MM-DD (backfill)
  // - Query param: ?days=N (pull last N days, offset by 3 for lag)
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
    startDate = daysAgo(days + 3); // offset for data lag
    endDate = daysAgo(3);
  } else {
    // Default: 4 days ago (safe lag for finalized data)
    startDate = daysAgo(4);
    endDate = daysAgo(4);
  }

  const startStr = toDateString(startDate);
  const endStr = toDateString(endDate);
  console.log(`[sc-ingest] Date range: ${startStr} to ${endStr}`);

  try {
    // Delete existing data for this range (idempotent re-runs)
    if (!skipDelete) {
      await deleteDateRange(startStr, endStr);
    }

    // Fetch from Search Console API in chunks of 30 days
    let totalRows = 0;

    let chunkStart = new Date(startDate);
    while (chunkStart <= endDate) {
      const chunkEnd = new Date(chunkStart);
      chunkEnd.setDate(chunkEnd.getDate() + 29);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

      const rows = await fetchSearchAnalytics(chunkStart, chunkEnd);

      if (rows.length > 0) {
        totalRows += await writeSearchData(rows, batchId);
      }

      chunkStart.setDate(chunkStart.getDate() + 30);
    }

    const result = {
      status: 'ok',
      batch_id: batchId,
      date_range: { start: startStr, end: endStr },
      rows: totalRows,
    };

    console.log(`[sc-ingest] Complete: ${JSON.stringify(result)}`);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sc-ingest] Error: ${message}`);
    res.status(500).json({ error: message, batch_id: batchId });
  }
});
