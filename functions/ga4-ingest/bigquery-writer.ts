import { BigQuery } from '@google-cloud/bigquery';
import type { GA4SessionRow, GA4PurchaseRow } from './ga4-client';

const PROJECT_ID = 'mercer-labs-488707';
const DATASET_ID = 'raw_ga4';

const bq = new BigQuery({ projectId: PROJECT_ID });

export async function writeSessions(rows: GA4SessionRow[], batchId: string): Promise<number> {
  if (rows.length === 0) return 0;

  const bqRows = rows.map((r) => ({
    ...r,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  }));

  const table = bq.dataset(DATASET_ID).table('ga4_sessions');
  for (let i = 0; i < bqRows.length; i += 500) {
    const batch = bqRows.slice(i, i + 500);
    await table.insert(batch, { createInsertId: false });
  }

  console.log(`[bq-writer] Inserted ${rows.length} session rows`);
  return rows.length;
}

export async function writePurchases(rows: GA4PurchaseRow[], batchId: string): Promise<number> {
  if (rows.length === 0) return 0;

  const bqRows = rows.map((r) => ({
    ...r,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  }));

  const table = bq.dataset(DATASET_ID).table('ga4_purchases');
  for (let i = 0; i < bqRows.length; i += 500) {
    const batch = bqRows.slice(i, i + 500);
    await table.insert(batch, { createInsertId: false });
  }

  console.log(`[bq-writer] Inserted ${rows.length} purchase rows`);
  return rows.length;
}

export async function deleteDateRange(
  tableId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const table = `\`${PROJECT_ID}.${DATASET_ID}.${tableId}\``;
  const query = `DELETE FROM ${table} WHERE date BETWEEN @start_date AND @end_date`;
  const [job] = await bq.createQueryJob({
    query,
    params: { start_date: startDate, end_date: endDate },
  });
  await job.getQueryResults();
  console.log(`[bq-writer] Deleted existing rows from ${tableId} for ${startDate} to ${endDate}`);
}
