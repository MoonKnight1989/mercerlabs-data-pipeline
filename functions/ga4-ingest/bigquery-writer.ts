import { BigQuery } from '@google-cloud/bigquery';
import type {
  GA4SessionRow,
  GA4PurchaseRow,
  GA4DailyOverviewRow,
  GA4PageRow,
  GA4TechnologyRow,
  GA4UserAcquisitionRow,
} from './ga4-client';

const PROJECT_ID = 'mercer-labs-488707';
const DATASET_ID = 'raw_ga4';

const bq = new BigQuery({ projectId: PROJECT_ID });

async function insertBatched(
  tableId: string,
  rows: Record<string, unknown>[],
  batchId: string
): Promise<number> {
  if (rows.length === 0) return 0;

  const bqRows = rows.map((r) => ({
    ...r,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  }));

  const table = bq.dataset(DATASET_ID).table(tableId);
  for (let i = 0; i < bqRows.length; i += 500) {
    const batch = bqRows.slice(i, i + 500);
    await table.insert(batch, { createInsertId: false });
  }

  console.log(`[bq-writer] Inserted ${rows.length} rows into ${tableId}`);
  return rows.length;
}

function toRecords<T extends object>(rows: T[]): Record<string, unknown>[] {
  return rows as unknown as Record<string, unknown>[];
}

export async function writeSessions(rows: GA4SessionRow[], batchId: string): Promise<number> {
  return insertBatched('ga4_sessions', toRecords(rows), batchId);
}

export async function writePurchases(rows: GA4PurchaseRow[], batchId: string): Promise<number> {
  return insertBatched('ga4_purchases', toRecords(rows), batchId);
}

export async function writeDailyOverview(rows: GA4DailyOverviewRow[], batchId: string): Promise<number> {
  return insertBatched('ga4_daily_overview', toRecords(rows), batchId);
}

export async function writePages(rows: GA4PageRow[], batchId: string): Promise<number> {
  return insertBatched('ga4_pages', toRecords(rows), batchId);
}

export async function writeTechnology(rows: GA4TechnologyRow[], batchId: string): Promise<number> {
  return insertBatched('ga4_technology', toRecords(rows), batchId);
}

export async function writeUserAcquisition(rows: GA4UserAcquisitionRow[], batchId: string): Promise<number> {
  return insertBatched('ga4_user_acquisition', toRecords(rows), batchId);
}

export async function deleteDateRange(
  tableId: string,
  startDate: string,
  endDate: string
): Promise<void> {
  const table = `\`${PROJECT_ID}.${DATASET_ID}.${tableId}\``;
  const query = `DELETE FROM ${table} WHERE date BETWEEN @start_date AND @end_date`;
  try {
    const [job] = await bq.createQueryJob({
      query,
      params: { start_date: startDate, end_date: endDate },
    });
    await job.getQueryResults();
    console.log(`[bq-writer] Deleted existing rows from ${tableId} for ${startDate} to ${endDate}`);
  } catch (err) {
    // Table may not exist yet on first run — that's fine
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Not found')) {
      console.log(`[bq-writer] Table ${tableId} not found (will be created on first insert)`);
    } else {
      throw err;
    }
  }
}
