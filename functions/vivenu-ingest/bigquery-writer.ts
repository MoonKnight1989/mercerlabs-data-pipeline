import { BigQuery } from '@google-cloud/bigquery';
import type {
  VivenuTicket,
  VivenuTransaction,
  VivenuScan,
  VivenuEvent,
  RawTicketRow,
  RawTransactionRow,
  RawScanRow,
} from './types';

const PROJECT_ID = 'mercer-labs-488707';
const DATASET_ID = 'raw_vivenu';

export interface MergeResult {
  inserted: number;
  updated: number;
}

// ============================================================
// Ticket mapping
// ============================================================

function mapTicketToRow(ticket: VivenuTicket, batchId: string): RawTicketRow {
  return {
    ticket_id: ticket._id,
    transaction_id: ticket.transactionId,
    barcode: ticket.barcode,
    secret: ticket.secret,
    customer_id: ticket.customerId,
    customer_name: ticket.name,
    customer_firstname: ticket.firstname,
    customer_lastname: ticket.lastname,
    customer_email: ticket.email,
    event_id: ticket.eventId,
    root_event_id: ticket.rootEventId,
    ticket_type_id: ticket.ticketTypeId,
    ticket_name: ticket.ticketName,
    category_name: ticket.categoryName,
    category_ref: ticket.categoryRef,
    real_price: ticket.realPrice,
    regular_price: ticket.regularPrice,
    currency: ticket.currency,
    status: ticket.status,
    ticket_type: ticket.type,
    delivery_type: ticket.deliveryType,
    cart_item_id: ticket.cartItemId,
    checkout_id: ticket.checkoutId,
    origin: ticket.origin,
    sales_channel_id: ticket.salesChannelId,
    undershop_id: ticket.underShopId,
    seller_id: ticket.sellerId,
    slot_id: ticket.slotId,
    slot_start_time: ticket.slotStartTime,
    personalized: ticket.personalized,
    claimed: ticket.claimed,
    expired: ticket.expired,
    created_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  };
}

// ============================================================
// Transaction mapping
// ============================================================

function mapTransactionToRow(tx: VivenuTransaction, batchId: string): RawTransactionRow {
  return {
    transaction_id: tx._id,
    seller_id: tx.sellerId,
    customer_id: tx.customerId,
    event_id: tx.eventId,
    customer_name: tx.name,
    customer_firstname: tx.prename,
    customer_lastname: tx.lastname,
    customer_email: tx.email,
    customer_phone: tx.phone,
    customer_street: tx.street,
    customer_city: tx.city,
    customer_state: tx.state,
    customer_country: tx.country,
    customer_postal: tx.postal,
    ticket_count: tx.tickets.length,
    currency: tx.currency,
    regular_price: tx.regularPrice,
    real_price: tx.realPrice,
    payment_charge: tx.paymentCharge,
    inner_charge: tx.innerCharge,
    outer_charge: tx.outerCharge,
    payment_method: tx.paymentMethod,
    payment_status: tx.paymentStatus,
    status: tx.status,
    origin: tx.origin,
    sales_channel_id: tx.salesChannelId,
    undershop_id: tx.underShop,
    checkout_id: tx.checkoutId,
    tax_rate: tx.taxRate,
    tickets_json: JSON.stringify(tx.tickets),
    created_at: tx.createdAt,
    updated_at: tx.updatedAt,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  };
}

// ============================================================
// Generic MERGE via temp table
// ============================================================

async function mergeViaTempTable<T>(
  bq: BigQuery,
  tableId: string,
  primaryKey: string,
  rows: T[],
  batchId: string
): Promise<MergeResult> {
  if (rows.length === 0) {
    console.log(`[bigquery-writer] No rows to merge into ${tableId}`);
    return { inserted: 0, updated: 0 };
  }

  const tempTableId = `_temp_${tableId}_${batchId.replace(/-/g, '_')}`;
  const targetFqn = `\`${PROJECT_ID}.${DATASET_ID}.${tableId}\``;
  const tempFqn = `\`${PROJECT_ID}.${DATASET_ID}.${tempTableId}\``;

  console.log(`[bigquery-writer] Loading ${rows.length} rows into temp table for ${tableId}`);

  // Create temp table via CTAS from target schema (empty)
  const createTempQuery = `
    CREATE TABLE ${tempFqn}
    AS SELECT * FROM ${targetFqn} WHERE FALSE;
  `;
  const [createJob] = await bq.createQueryJob({ query: createTempQuery });
  await createJob.getQueryResults();

  // Stream insert into temp table
  const tempRef = bq.dataset(DATASET_ID).table(tempTableId);
  // Insert in batches of 500 to avoid streaming limits
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    await tempRef.insert(batch as Record<string, unknown>[], { createInsertId: false });
  }

  // MERGE from temp into target
  const columns = Object.keys(rows[0] as Record<string, unknown>);
  const updateClauses = columns
    .filter((c) => c !== primaryKey)
    .map((c) => `target.${c} = source.${c}`)
    .join(',\n        ');

  const mergeQuery = `
    MERGE ${targetFqn} AS target
    USING ${tempFqn} AS source
    ON target.${primaryKey} = source.${primaryKey}
    WHEN MATCHED THEN
      UPDATE SET
        ${updateClauses}
    WHEN NOT MATCHED THEN
      INSERT ROW;
  `;

  console.log(`[bigquery-writer] Running MERGE for ${tableId}`);
  const [mergeJob] = await bq.createQueryJob({ query: mergeQuery });
  await mergeJob.getQueryResults();

  // Clean up temp table
  await tempRef.delete({ ignoreNotFound: true });

  // Get DML stats
  const metadata = await mergeJob.getMetadata();
  const dmlStats = metadata[0]?.statistics?.query?.dmlStats;
  const inserted = Number(dmlStats?.insertedRowCount ?? 0);
  const updated = Number(dmlStats?.updatedRowCount ?? 0);

  console.log(`[bigquery-writer] ${tableId} MERGE: ${inserted} inserted, ${updated} updated`);
  return { inserted, updated };
}

// ============================================================
// Public API
// ============================================================

export async function mergeTickets(
  tickets: VivenuTicket[],
  batchId: string
): Promise<MergeResult> {
  const bq = new BigQuery({ projectId: PROJECT_ID });
  const rows = tickets.map((t) => mapTicketToRow(t, batchId));
  return mergeViaTempTable(bq, 'raw_tickets', 'ticket_id', rows, batchId);
}

export async function mergeTransactions(
  transactions: VivenuTransaction[],
  batchId: string
): Promise<MergeResult> {
  const bq = new BigQuery({ projectId: PROJECT_ID });
  const rows = transactions.map((tx) => mapTransactionToRow(tx, batchId));
  return mergeViaTempTable(bq, 'raw_transactions', 'transaction_id', rows, batchId);
}

// ============================================================
// Scan mapping
// ============================================================

function mapScanToRow(scan: VivenuScan, batchId: string): RawScanRow {
  return {
    scan_id: scan._id,
    ticket_id: scan.ticketId,
    scan_time: scan.time,
    event_id: scan.eventId,
    barcode: scan.barcode,
    customer_name: scan.name,
    ticket_type_id: scan.ticketTypeId,
    ticket_name: scan.ticketName,
    device_id: scan.deviceId ?? null,
    scan_type: scan.type,
    scan_result: scan.scanResult,
    seller_id: scan.sellerId,
    created_at: scan.createdAt,
    updated_at: scan.updatedAt,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  };
}

export async function mergeScans(
  scans: VivenuScan[],
  batchId: string
): Promise<MergeResult> {
  const bq = new BigQuery({ projectId: PROJECT_ID });
  const rows = scans.map((s) => mapScanToRow(s, batchId));
  return mergeViaTempTable(bq, 'raw_scans', 'scan_id', rows, batchId);
}

// ============================================================
// Event auto-sync: detect new root events and register them
// ============================================================

/**
 * Find root_event_ids in raw_tickets that are missing from reference.events.
 * Returns the list of event IDs that need to be fetched from the Vivenu API.
 */
export async function findNewRootEvents(): Promise<string[]> {
  const bq = new BigQuery({ projectId: PROJECT_ID });
  const [rows] = await bq.query({
    query: `
      SELECT DISTINCT t.root_event_id
      FROM raw_vivenu.raw_tickets t
      LEFT JOIN reference.events e ON t.root_event_id = e.event_id
      WHERE t.root_event_id IS NOT NULL
        AND e.event_id IS NULL
    `,
  });
  return (rows as Array<{ root_event_id: string }>).map((r) => r.root_event_id);
}

/**
 * Sync all events into reference.event_dates.
 * MERGE ensures new events are added and existing ones updated.
 * This gives us event_id → event_date mapping for true redemption rates.
 */
export async function syncEventDates(events: VivenuEvent[]): Promise<MergeResult> {
  if (events.length === 0) return { inserted: 0, updated: 0 };

  const bq = new BigQuery({ projectId: PROJECT_ID });

  const rows = events.map((ev) => ({
    event_id: ev._id,
    event_name: ev.name,
    event_date: ev.start ? ev.start.split('T')[0] : null,
    event_start: ev.start ?? null,
    event_end: ev.end ?? null,
    parent_id: null,
  }));

  // Use MERGE via temp table to handle inserts and updates
  const tempTable = `_temp_event_dates_${Date.now()}`;
  const tempFqn = `\`${PROJECT_ID}.reference.${tempTable}\``;
  const targetFqn = `\`${PROJECT_ID}.reference.event_dates\``;

  // Create temp table matching event_dates schema
  const [createJob] = await bq.createQueryJob({
    query: `CREATE TABLE ${tempFqn} AS SELECT * FROM ${targetFqn} WHERE FALSE`,
  });
  await createJob.getQueryResults();

  // Insert in batches
  const tempRef = bq.dataset('reference').table(tempTable);
  for (let i = 0; i < rows.length; i += 500) {
    await tempRef.insert(rows.slice(i, i + 500), { createInsertId: false });
  }

  // MERGE
  const [mergeJob] = await bq.createQueryJob({
    query: `
      MERGE ${targetFqn} AS target
      USING ${tempFqn} AS source
      ON target.event_id = source.event_id
      WHEN MATCHED THEN
        UPDATE SET
          event_name = source.event_name,
          event_date = source.event_date,
          event_start = source.event_start,
          event_end = source.event_end
      WHEN NOT MATCHED THEN
        INSERT ROW
    `,
  });
  await mergeJob.getQueryResults();

  await tempRef.delete({ ignoreNotFound: true });

  const metadata = await mergeJob.getMetadata();
  const dmlStats = metadata[0]?.statistics?.query?.dmlStats;
  const inserted = Number(dmlStats?.insertedRowCount ?? 0);
  const updated = Number(dmlStats?.updatedRowCount ?? 0);

  console.log(`[bigquery-writer] event_dates MERGE: ${inserted} inserted, ${updated} updated`);
  return { inserted, updated };
}

/**
 * Insert newly discovered root events into reference.events.
 * Called with events fetched from the Vivenu API by ID.
 */
export async function insertNewEvents(events: VivenuEvent[]): Promise<number> {
  if (events.length === 0) return 0;

  const bq = new BigQuery({ projectId: PROJECT_ID });
  const table = bq.dataset('reference').table('events');

  const rows = events.map((ev) => ({
    event_id: ev._id,
    event_name: ev.name,
    event_start: ev.start ?? null,
    event_end: ev.end ?? null,
    daily_capacity: null,
    is_active: true,
    notes: null,
  }));

  await table.insert(rows, { createInsertId: false });
  console.log(`[bigquery-writer] Inserted ${rows.length} new root event(s) into reference.events`);
  return rows.length;
}

