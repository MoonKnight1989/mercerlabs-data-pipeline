import { BigQuery } from '@google-cloud/bigquery';
import type { SearchConsoleRow } from './search-console-client';

const PROJECT_ID = 'mercer-labs-488707';
const DATASET_ID = 'raw_search_console';

const bq = new BigQuery({ projectId: PROJECT_ID });

export async function writeSearchData(
  rows: SearchConsoleRow[],
  batchId: string
): Promise<number> {
  if (rows.length === 0) return 0;

  const bqRows = rows.map((r) => ({
    ...r,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  }));

  const table = bq.dataset(DATASET_ID).table('search_analytics');
  for (let i = 0; i < bqRows.length; i += 500) {
    const batch = bqRows.slice(i, i + 500);
    await table.insert(batch, { createInsertId: false });
  }

  console.log(`[bq-writer] Inserted ${rows.length} search analytics rows`);
  return rows.length;
}

export async function deleteDateRange(
  startDate: string,
  endDate: string
): Promise<void> {
  const table = `\`${PROJECT_ID}.${DATASET_ID}.search_analytics\``;
  const query = `DELETE FROM ${table} WHERE date BETWEEN @start_date AND @end_date`;
  const [job] = await bq.createQueryJob({
    query,
    params: { start_date: startDate, end_date: endDate },
  });
  await job.getQueryResults();
  console.log(`[bq-writer] Deleted existing rows for ${startDate} to ${endDate}`);
}
