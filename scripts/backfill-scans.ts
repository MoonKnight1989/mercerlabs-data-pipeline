/**
 * Backfill scans from Portier API into raw_vivenu.raw_scans
 *
 * The Portier API has no date filter, so we fetch pages from newest to oldest
 * and stop once we've seen enough consecutive duplicates (already in BQ).
 *
 * Usage:
 *   npx tsx scripts/backfill-scans.ts                  # smart mode: stop when duplicates found
 *   npx tsx scripts/backfill-scans.ts --full            # fetch ALL scans (full rebuild)
 *   npx tsx scripts/backfill-scans.ts --pages=50        # fetch first 50 pages (50K scans)
 */

import { BigQuery } from '@google-cloud/bigquery';
import { randomUUID } from 'crypto';

const PROJECT_ID = 'mercer-labs-488707';
const API_BASE = 'https://portier.vivenu.com/api/scans';
const PAGE_SIZE = 1000;
const DUPLICATE_THRESHOLD = 3; // stop after N consecutive pages with 100% duplicates

async function getApiKey(): Promise<string> {
  const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/vivenu-api-key/versions/latest`,
  });
  return version.payload?.data?.toString() ?? '';
}

interface ScanDoc {
  _id: string;
  ticketId: string;
  time: string;
  eventId: string;
  barcode: string;
  name: string;
  ticketTypeId: string;
  ticketName: string;
  deviceId: string | null;
  type: 'checkin' | 'checkout';
  scanResult: string;
  sellerId: string;
  createdAt: string;
  updatedAt: string;
}

async function fetchPage(apiKey: string, skip: number): Promise<{ docs: ScanDoc[]; total: number }> {
  const url = `${API_BASE}?top=${PAGE_SIZE}&skip=${skip}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ docs: ScanDoc[]; total: number }>;
}

async function getExistingScanIds(bq: BigQuery, scanIds: string[]): Promise<Set<string>> {
  if (scanIds.length === 0) return new Set();
  // Check in batches of 10K to avoid query size limits
  const existing = new Set<string>();
  for (let i = 0; i < scanIds.length; i += 10000) {
    const batch = scanIds.slice(i, i + 10000);
    const [rows] = await bq.query({
      query: `SELECT scan_id FROM \`${PROJECT_ID}.raw_vivenu.raw_scans\` WHERE scan_id IN UNNEST(@ids)`,
      params: { ids: batch },
    });
    for (const row of rows) {
      existing.add(row.scan_id);
    }
  }
  return existing;
}

function toRow(doc: ScanDoc, batchId: string) {
  return {
    scan_id: doc._id,
    ticket_id: doc.ticketId,
    scan_time: doc.time,
    event_id: doc.eventId,
    barcode: doc.barcode,
    customer_name: doc.name,
    ticket_type_id: doc.ticketTypeId,
    ticket_name: doc.ticketName,
    device_id: doc.deviceId ?? null,
    scan_type: doc.type,
    scan_result: doc.scanResult,
    seller_id: doc.sellerId,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const fullMode = args.includes('--full');
  const pagesArg = args.find(a => a.startsWith('--pages='));
  const maxPages = pagesArg ? parseInt(pagesArg.split('=')[1]!, 10) : (fullMode ? Infinity : Infinity);

  const apiKey = await getApiKey();
  const bq = new BigQuery({ projectId: PROJECT_ID });
  const table = bq.dataset('raw_vivenu').table('raw_scans');
  const batchId = `backfill-${randomUUID()}`;

  console.log(`[backfill-scans] Starting batch ${batchId}`);

  // Get first page to know total
  const firstPage = await fetchPage(apiKey, 0);
  console.log(`[backfill-scans] Total scans in API: ${firstPage.total}`);

  const totalPages = Math.ceil(firstPage.total / PAGE_SIZE);
  const pagesToFetch = Math.min(totalPages, maxPages);
  let totalInserted = 0;
  let consecutiveDuplicatePages = 0;

  for (let page = 0; page < pagesToFetch; page++) {
    const skip = page * PAGE_SIZE;
    const data = page === 0 ? firstPage : await fetchPage(apiKey, skip);
    const docs = data.docs;

    if (docs.length === 0) break;

    // Check which scan_ids already exist in BQ
    const scanIds = docs.map(d => d._id);
    const existing = await getExistingScanIds(bq, scanIds);
    const newDocs = docs.filter(d => !existing.has(d._id));

    const dupeCount = docs.length - newDocs.length;
    console.log(`[backfill-scans] Page ${page + 1}/${pagesToFetch}: ${docs.length} fetched, ${newDocs.length} new, ${dupeCount} existing`);

    if (newDocs.length > 0) {
      consecutiveDuplicatePages = 0;
      const rows = newDocs.map(d => toRow(d, batchId));
      // Insert in batches of 500
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        await table.insert(batch, { createInsertId: false });
      }
      totalInserted += newDocs.length;
    } else {
      consecutiveDuplicatePages++;
      if (!fullMode && consecutiveDuplicatePages >= DUPLICATE_THRESHOLD) {
        console.log(`[backfill-scans] ${DUPLICATE_THRESHOLD} consecutive pages with no new scans — stopping`);
        break;
      }
    }
  }

  console.log(`[backfill-scans] Done. Inserted ${totalInserted} new scans.`);
}

main().catch(err => {
  console.error('[backfill-scans] Fatal error:', err);
  process.exit(1);
});
