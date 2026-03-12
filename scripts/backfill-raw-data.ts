/**
 * Backfill historical data from Vivenu API into BigQuery raw tables.
 * Fetches tickets, transactions, and scans in weekly batches.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/backfill-raw-data.ts [--months=11] [--dry-run]
 */

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const MONTHS = parseInt(
  process.argv.find((a) => a.startsWith('--months='))?.split('=')[1] ?? '11',
  10
);

const VIVENU_BASE = 'https://vivenu.com/api';
const PORTIER_BASE = 'https://portier.vivenu.com/api';
const PAGE_SIZE = 500;
const HEADERS = { Authorization: `Bearer ${API_KEY}` };

interface WeekRange {
  start: Date;
  end: Date;
  label: string;
}

function buildWeekRanges(months: number): WeekRange[] {
  const ranges: WeekRange[] = [];
  const now = new Date();
  const earliest = new Date();
  earliest.setMonth(earliest.getMonth() - months);

  let cursor = new Date(earliest);
  while (cursor < now) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const end = weekEnd > now ? now : weekEnd;

    ranges.push({
      start: new Date(cursor),
      end,
      label: `${cursor.toISOString().split('T')[0]} → ${end.toISOString().split('T')[0]}`,
    });

    cursor = new Date(end);
  }
  return ranges;
}

async function fetchAllPages(
  baseUrl: string,
  start: Date,
  end: Date,
  rowKey: 'rows' | 'docs'
): Promise<any[]> {
  const all: any[] = [];
  let skip = 0;
  let hasMore = true;
  const dateParams = `start=${start.toISOString()}&end=${end.toISOString()}`;

  while (hasMore) {
    const url = `${baseUrl}?${dateParams}&top=${PAGE_SIZE}&skip=${skip}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited — wait and retry
        console.log('    Rate limited, waiting 5s...');
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      console.error(`    API error: ${res.status} ${res.statusText}`);
      break;
    }
    const data = await res.json();
    const items = data[rowKey] ?? [];
    all.push(...items);
    skip += items.length;
    hasMore = items.length === PAGE_SIZE;
  }
  return all;
}

async function writeToNdjson(records: any[], filePath: string): Promise<void> {
  const { writeFileSync } = await import('fs');
  const lines = records.map((r) => JSON.stringify(r));
  writeFileSync(filePath, lines.join('\n'));
}

async function loadToBigQuery(
  filePath: string,
  table: string
): Promise<number> {
  const { execSync } = await import('child_process');
  try {
    execSync(
      `bq load --project_id=mercer-labs-488707 --source_format=NEWLINE_DELIMITED_JSON ` +
        `'mercer-labs-488707:${table}' '${filePath}'`,
      { stdio: 'pipe' }
    );
    return 0;
  } catch (err: any) {
    console.error(`    BQ load error: ${err.stderr?.toString() ?? err.message}`);
    return 1;
  }
}

function mapTicket(t: any, batchId: string, now: string): Record<string, unknown> {
  return {
    ticket_id: t._id,
    transaction_id: t.transactionId,
    barcode: t.barcode,
    secret: t.secret,
    customer_id: t.customerId ?? null,
    customer_name: t.name ?? '',
    customer_firstname: t.firstname ?? null,
    customer_lastname: t.lastname ?? null,
    customer_email: t.email ?? null,
    event_id: t.eventId,
    root_event_id: t.rootEventId ?? null,
    ticket_type_id: t.ticketTypeId,
    ticket_name: t.ticketName ?? '',
    category_name: t.categoryName ?? '',
    category_ref: t.categoryRef ?? null,
    real_price: t.realPrice ?? 0,
    regular_price: t.regularPrice ?? 0,
    currency: t.currency ?? 'USD',
    status: t.status ?? '',
    ticket_type: t.type ?? '',
    delivery_type: t.deliveryType ?? '',
    cart_item_id: t.cartItemId ?? null,
    checkout_id: t.checkoutId ?? null,
    origin: t.origin ?? '',
    sales_channel_id: t.salesChannelId ?? null,
    undershop_id: t.underShopId ?? null,
    seller_id: t.sellerId ?? '',
    slot_id: t.slotId ?? null,
    slot_start_time: t.slotStartTime ?? null,
    personalized: t.personalized ?? false,
    claimed: t.claimed ?? false,
    expired: t.expired ?? false,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    ingested_at: now,
    ingestion_batch_id: batchId,
  };
}

function mapTransaction(tx: any, batchId: string, now: string): Record<string, unknown> {
  return {
    transaction_id: tx._id,
    seller_id: tx.sellerId ?? '',
    customer_id: tx.customerId ?? '',
    event_id: tx.eventId ?? '',
    customer_name: tx.name ?? '',
    customer_firstname: tx.prename ?? '',
    customer_lastname: tx.lastname ?? '',
    customer_email: tx.email ?? '',
    customer_phone: tx.phone ?? null,
    customer_street: tx.street ?? null,
    customer_city: tx.city ?? null,
    customer_state: tx.state ?? null,
    customer_country: tx.country ?? null,
    customer_postal: tx.postal ?? null,
    ticket_count: Array.isArray(tx.tickets) ? tx.tickets.length : 0,
    currency: tx.currency ?? 'USD',
    regular_price: tx.regularPrice ?? 0,
    real_price: tx.realPrice ?? 0,
    payment_charge: tx.paymentCharge ?? 0,
    inner_charge: tx.innerCharge ?? 0,
    outer_charge: tx.outerCharge ?? 0,
    payment_method: tx.paymentMethod ?? '',
    payment_status: tx.paymentStatus ?? '',
    status: tx.status ?? '',
    origin: tx.origin ?? '',
    sales_channel_id: tx.salesChannelId ?? null,
    undershop_id: tx.underShop ?? null,
    checkout_id: tx.checkoutId ?? null,
    tax_rate: tx.taxRate ?? 0,
    tickets_json: JSON.stringify(tx.tickets ?? []),
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
    ingested_at: now,
    ingestion_batch_id: batchId,
  };
}

function mapScan(s: any, batchId: string, now: string): Record<string, unknown> {
  return {
    scan_id: s._id,
    ticket_id: s.ticketId,
    scan_time: s.time,
    event_id: s.eventId,
    barcode: s.barcode ?? '',
    customer_name: s.name ?? '',
    ticket_type_id: s.ticketTypeId ?? '',
    ticket_name: s.ticketName ?? '',
    device_id: s.deviceId ?? null,
    scan_type: s.type ?? '',
    scan_result: s.scanResult ?? '',
    seller_id: s.sellerId ?? '',
    created_at: s.createdAt,
    updated_at: s.updatedAt,
    ingested_at: now,
    ingestion_batch_id: batchId,
  };
}

async function fetchAllScans(): Promise<any[]> {
  // Scans API doesn't support date filtering — fetch all with pagination
  const all: any[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${PORTIER_BASE}/scans?top=${PAGE_SIZE}&skip=${skip}`;
    const res = await fetch(url, { headers: HEADERS });
    if (!res.ok) {
      if (res.status === 429) {
        console.log('    Rate limited on scans, waiting 5s...');
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      console.error(`    Scans API error: ${res.status}`);
      break;
    }
    const data = await res.json();
    const items = data.docs ?? [];
    all.push(...items);
    skip += items.length;
    hasMore = items.length === PAGE_SIZE;
    if (skip % 5000 === 0) process.stderr.write(`\r  Scans: ${all.length}`);
  }
  process.stderr.write(`\r  Scans: ${all.length}\n`);
  return all;
}

async function main() {
  const ranges = buildWeekRanges(MONTHS);
  console.log(`Backfill: ${MONTHS} months, ${ranges.length} weekly batches`);
  if (DRY_RUN) console.log('DRY RUN — no data will be written\n');

  let totalTickets = 0;
  let totalTransactions = 0;

  // Phase 1: Fetch and load tickets + transactions in weekly batches
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]!;
    const batchId = `backfill-${range.start.toISOString().split('T')[0]}`;
    const now = new Date().toISOString();

    console.log(`\n[${i + 1}/${ranges.length}] ${range.label}`);

    const [tickets, transactions] = await Promise.all([
      fetchAllPages(`${VIVENU_BASE}/tickets`, range.start, range.end, 'rows'),
      fetchAllPages(`${VIVENU_BASE}/transactions`, range.start, range.end, 'docs'),
    ]);

    console.log(`  Fetched: ${tickets.length} tickets, ${transactions.length} tx`);
    totalTickets += tickets.length;
    totalTransactions += transactions.length;

    if (DRY_RUN || (tickets.length === 0 && transactions.length === 0)) {
      continue;
    }

    if (tickets.length > 0) {
      const mapped = tickets.map((t) => mapTicket(t, batchId, now));
      await writeToNdjson(mapped, '/tmp/backfill-tickets.ndjson');
      await loadToBigQuery('/tmp/backfill-tickets.ndjson', 'raw_vivenu.raw_tickets');
      process.stdout.write('  ✓ tickets');
    }

    if (transactions.length > 0) {
      const mapped = transactions.map((tx) => mapTransaction(tx, batchId, now));
      await writeToNdjson(mapped, '/tmp/backfill-transactions.ndjson');
      await loadToBigQuery('/tmp/backfill-transactions.ndjson', 'raw_vivenu.raw_transactions');
      process.stdout.write('  ✓ transactions');
    }

    console.log();
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Phase 2: Fetch ALL scans (no date filtering available) and load in chunks
  console.log('\n=== LOADING SCANS (all history) ===\n');
  if (!DRY_RUN) {
    const allScans = await fetchAllScans();
    const batchId = 'backfill-scans';
    const now = new Date().toISOString();

    const CHUNK_SIZE = 50000;
    for (let j = 0; j < allScans.length; j += CHUNK_SIZE) {
      const chunk = allScans.slice(j, j + CHUNK_SIZE);
      const mapped = chunk.map((s) => mapScan(s, batchId, now));
      await writeToNdjson(mapped, '/tmp/backfill-scans.ndjson');
      await loadToBigQuery('/tmp/backfill-scans.ndjson', 'raw_vivenu.raw_scans');
      console.log(`  ✓ Loaded scans ${j + 1}–${j + chunk.length}`);
    }

    console.log(`  Total scans loaded: ${allScans.length}`);
  }

  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Total: ${totalTickets} tickets, ${totalTransactions} transactions`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
