import { BigQuery } from '@google-cloud/bigquery';
import type { UnknownChannel } from './types';

const PROJECT_ID = 'mercer-labs-488707';

export async function checkForUnknownChannels(): Promise<UnknownChannel[]> {
  const bq = new BigQuery({ projectId: PROJECT_ID });

  const query = `
    INSERT INTO \`${PROJECT_ID}.reference.unknown_channels\`
      (sales_channel_id, first_seen_at, sample_ticket_id, sample_price, ticket_count)
    SELECT
      r.sales_channel_id,
      CURRENT_TIMESTAMP(),
      ANY_VALUE(r.ticket_id),
      ANY_VALUE(r.real_price),
      COUNT(*)
    FROM \`${PROJECT_ID}.raw_vivenu.raw_tickets\` r
    LEFT JOIN \`${PROJECT_ID}.reference.partners\` p
      ON r.sales_channel_id = p.sales_channel_id
    LEFT JOIN \`${PROJECT_ID}.reference.unknown_channels\` u
      ON r.sales_channel_id = u.sales_channel_id
    WHERE r.sales_channel_id IS NOT NULL
      AND p.sales_channel_id IS NULL
      AND u.sales_channel_id IS NULL
    GROUP BY 1;
  `;

  console.log('[channel-checker] Checking for unknown sales channels');
  const [job] = await bq.createQueryJob({ query });
  await job.getQueryResults();

  const metadata = await job.getMetadata();
  const insertedCount = Number(
    metadata[0]?.statistics?.query?.dmlStats?.insertedRowCount ?? 0
  );

  if (insertedCount === 0) {
    console.log('[channel-checker] No new unknown channels found');
    return [];
  }

  // Fetch the newly inserted unknowns for the return value
  const [rows] = await bq.query({
    query: `
      SELECT *
      FROM \`${PROJECT_ID}.reference.unknown_channels\`
      WHERE resolved = FALSE
      ORDER BY first_seen_at DESC
      LIMIT ${insertedCount}
    `,
  });

  const unknowns = (rows as Record<string, unknown>[]).map((row) => ({
    sales_channel_id: String(row['sales_channel_id']),
    first_seen_at: String(row['first_seen_at']),
    sample_ticket_id: row['sample_ticket_id'] ? String(row['sample_ticket_id']) : null,
    sample_price: row['sample_price'] != null ? Number(row['sample_price']) : null,
    ticket_count: Number(row['ticket_count']),
    resolved: false,
    resolved_at: null,
  }));

  console.warn(
    `[channel-checker] WARNING: ${unknowns.length} new unknown channel(s) detected:`,
    unknowns.map((u) => u.sales_channel_id).join(', ')
  );

  return unknowns;
}
