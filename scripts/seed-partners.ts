/**
 * Seed reference.partners table in BigQuery from partners-seed.json
 *
 * Usage:
 *   cd functions/vivenu-ingest && npx tsx ../../scripts/seed-partners.ts
 */

import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROJECT_ID = 'mercer-labs-488707';
const bq = new BigQuery({ projectId: PROJECT_ID });

async function main() {
  const seedPath = resolve(__dirname, '../config/partners-seed.json');
  const partners = JSON.parse(readFileSync(seedPath, 'utf8'));

  // Clear existing
  await bq.query({ query: `DELETE FROM \`${PROJECT_ID}.reference.partners\` WHERE TRUE` });
  console.log('Cleared existing partners');

  // Insert
  const table = bq.dataset('reference').table('partners');
  const now = new Date().toISOString();
  const rows = partners.map((p: Record<string, unknown>) => ({
    ...p,
    is_active: true,
    created_at: now,
    updated_at: now,
  }));

  await table.insert(rows);
  console.log(`Inserted ${rows.length} partners`);

  // Verify
  const [result] = await bq.query({
    query: `SELECT COUNT(*) as count FROM \`${PROJECT_ID}.reference.partners\``,
  });
  console.log(`Verified: ${result[0].count} partners in table`);
}

main().catch((err) => {
  console.error('Fatal error:', err.message ?? err);
  process.exit(1);
});
