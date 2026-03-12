import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'mercer-labs-488707';
const RAW_DATASET = 'raw_vivenu';

const bq = new BigQuery({ projectId: PROJECT_ID });

// ============================================================
// Ticket upsert (ticket.created / ticket.updated)
// ============================================================

export async function upsertTicket(ticket: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  const table = `\`${PROJECT_ID}.${RAW_DATASET}.raw_tickets\``;

  const [job] = await bq.createQueryJob({
    query: `
      MERGE ${table} AS target
      USING (SELECT @ticket_id AS ticket_id) AS source
      ON target.ticket_id = source.ticket_id
      WHEN MATCHED THEN UPDATE SET
        transaction_id = @transaction_id,
        barcode = @barcode,
        secret = @secret,
        customer_id = @customer_id,
        customer_name = @customer_name,
        customer_firstname = @customer_firstname,
        customer_lastname = @customer_lastname,
        customer_email = @customer_email,
        event_id = @event_id,
        root_event_id = @root_event_id,
        ticket_type_id = @ticket_type_id,
        ticket_name = @ticket_name,
        category_name = @category_name,
        category_ref = @category_ref,
        real_price = @real_price,
        regular_price = @regular_price,
        currency = @currency,
        status = @status,
        ticket_type = @ticket_type,
        delivery_type = @delivery_type,
        cart_item_id = @cart_item_id,
        checkout_id = @checkout_id,
        origin = @origin,
        sales_channel_id = @sales_channel_id,
        undershop_id = @undershop_id,
        seller_id = @seller_id,
        slot_id = @slot_id,
        slot_start_time = @slot_start_time,
        personalized = @personalized,
        claimed = @claimed,
        expired = @expired,
        created_at = @created_at,
        updated_at = @updated_at,
        ingested_at = @ingested_at,
        ingestion_batch_id = @ingestion_batch_id
      WHEN NOT MATCHED THEN INSERT (
        ticket_id, transaction_id, barcode, secret, customer_id,
        customer_name, customer_firstname, customer_lastname, customer_email,
        event_id, root_event_id, ticket_type_id, ticket_name, category_name,
        category_ref, real_price, regular_price, currency, status, ticket_type,
        delivery_type, cart_item_id, checkout_id, origin, sales_channel_id,
        undershop_id, seller_id, slot_id, slot_start_time, personalized,
        claimed, expired, created_at, updated_at, ingested_at, ingestion_batch_id
      ) VALUES (
        @ticket_id, @transaction_id, @barcode, @secret, @customer_id,
        @customer_name, @customer_firstname, @customer_lastname, @customer_email,
        @event_id, @root_event_id, @ticket_type_id, @ticket_name, @category_name,
        @category_ref, @real_price, @regular_price, @currency, @status, @ticket_type,
        @delivery_type, @cart_item_id, @checkout_id, @origin, @sales_channel_id,
        @undershop_id, @seller_id, @slot_id, @slot_start_time, @personalized,
        @claimed, @expired, @created_at, @updated_at, @ingested_at, @ingestion_batch_id
      )`,
    params: {
      ticket_id: String(ticket['_id'] ?? ''),
      transaction_id: String(ticket['transactionId'] ?? ''),
      barcode: String(ticket['barcode'] ?? ''),
      secret: String(ticket['secret'] ?? ''),
      customer_id: (ticket['customerId'] as string) || null,
      customer_name: String(ticket['name'] ?? ''),
      customer_firstname: (ticket['firstname'] as string) || null,
      customer_lastname: (ticket['lastname'] as string) || null,
      customer_email: (ticket['email'] as string) || null,
      event_id: String(ticket['eventId'] ?? ''),
      root_event_id: (ticket['rootEventId'] as string) || null,
      ticket_type_id: String(ticket['ticketTypeId'] ?? ''),
      ticket_name: String(ticket['ticketName'] ?? ''),
      category_name: String(ticket['categoryName'] ?? ''),
      category_ref: (ticket['categoryRef'] as string) || null,
      real_price: Number(ticket['realPrice'] ?? 0),
      regular_price: Number(ticket['regularPrice'] ?? 0),
      currency: String(ticket['currency'] ?? 'USD'),
      status: String(ticket['status'] ?? ''),
      ticket_type: String(ticket['type'] ?? ''),
      delivery_type: String(ticket['deliveryType'] ?? ''),
      cart_item_id: (ticket['cartItemId'] as string) || null,
      checkout_id: (ticket['checkoutId'] as string) || null,
      origin: String(ticket['origin'] ?? ''),
      sales_channel_id: (ticket['salesChannelId'] as string) || null,
      undershop_id: (ticket['underShopId'] as string) || null,
      seller_id: String(ticket['sellerId'] ?? ''),
      slot_id: (ticket['slotId'] as string) || null,
      slot_start_time: (ticket['slotStartTime'] as string) || null,
      personalized: Boolean(ticket['personalized']),
      claimed: Boolean(ticket['claimed']),
      expired: Boolean(ticket['expired']),
      created_at: String(ticket['createdAt'] ?? now),
      updated_at: String(ticket['updatedAt'] ?? now),
      ingested_at: now,
      ingestion_batch_id: 'webhook',
    },
    types: {
      customer_id: 'STRING',
      customer_firstname: 'STRING',
      customer_lastname: 'STRING',
      customer_email: 'STRING',
      root_event_id: 'STRING',
      category_ref: 'STRING',
      cart_item_id: 'STRING',
      checkout_id: 'STRING',
      sales_channel_id: 'STRING',
      undershop_id: 'STRING',
      slot_id: 'STRING',
      slot_start_time: 'STRING',
    },
  });
  await job.getQueryResults();
}

// ============================================================
// Transaction upsert (transaction.complete / canceled / partiallyCanceled)
// ============================================================

export async function upsertTransaction(tx: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  const table = `\`${PROJECT_ID}.${RAW_DATASET}.raw_transactions\``;
  const tickets = Array.isArray(tx['tickets']) ? tx['tickets'] : [];

  const [job] = await bq.createQueryJob({
    query: `
      MERGE ${table} AS target
      USING (SELECT @transaction_id AS transaction_id) AS source
      ON target.transaction_id = source.transaction_id
      WHEN MATCHED THEN UPDATE SET
        seller_id = @seller_id,
        customer_id = @customer_id,
        event_id = @event_id,
        customer_name = @customer_name,
        customer_firstname = @customer_firstname,
        customer_lastname = @customer_lastname,
        customer_email = @customer_email,
        customer_phone = @customer_phone,
        customer_street = @customer_street,
        customer_city = @customer_city,
        customer_state = @customer_state,
        customer_country = @customer_country,
        customer_postal = @customer_postal,
        ticket_count = @ticket_count,
        currency = @currency,
        regular_price = @regular_price,
        real_price = @real_price,
        payment_charge = @payment_charge,
        inner_charge = @inner_charge,
        outer_charge = @outer_charge,
        payment_method = @payment_method,
        payment_status = @payment_status,
        status = @status,
        origin = @origin,
        sales_channel_id = @sales_channel_id,
        undershop_id = @undershop_id,
        checkout_id = @checkout_id,
        tax_rate = @tax_rate,
        tickets_json = @tickets_json,
        created_at = @created_at,
        updated_at = @updated_at,
        ingested_at = @ingested_at,
        ingestion_batch_id = @ingestion_batch_id
      WHEN NOT MATCHED THEN INSERT (
        transaction_id, seller_id, customer_id, event_id,
        customer_name, customer_firstname, customer_lastname, customer_email,
        customer_phone, customer_street, customer_city, customer_state,
        customer_country, customer_postal, ticket_count, currency,
        regular_price, real_price, payment_charge, inner_charge, outer_charge,
        payment_method, payment_status, status, origin,
        sales_channel_id, undershop_id, checkout_id, tax_rate,
        tickets_json, created_at, updated_at, ingested_at, ingestion_batch_id
      ) VALUES (
        @transaction_id, @seller_id, @customer_id, @event_id,
        @customer_name, @customer_firstname, @customer_lastname, @customer_email,
        @customer_phone, @customer_street, @customer_city, @customer_state,
        @customer_country, @customer_postal, @ticket_count, @currency,
        @regular_price, @real_price, @payment_charge, @inner_charge, @outer_charge,
        @payment_method, @payment_status, @status, @origin,
        @sales_channel_id, @undershop_id, @checkout_id, @tax_rate,
        @tickets_json, @created_at, @updated_at, @ingested_at, @ingestion_batch_id
      )`,
    params: {
      transaction_id: String(tx['_id'] ?? ''),
      seller_id: String(tx['sellerId'] ?? ''),
      customer_id: String(tx['customerId'] ?? ''),
      event_id: String(tx['eventId'] ?? ''),
      customer_name: String(tx['name'] ?? ''),
      customer_firstname: String(tx['prename'] ?? ''),
      customer_lastname: String(tx['lastname'] ?? ''),
      customer_email: String(tx['email'] ?? ''),
      customer_phone: (tx['phone'] as string) || null,
      customer_street: (tx['street'] as string) || null,
      customer_city: (tx['city'] as string) || null,
      customer_state: (tx['state'] as string) || null,
      customer_country: (tx['country'] as string) || null,
      customer_postal: (tx['postal'] as string) || null,
      ticket_count: tickets.length,
      currency: String(tx['currency'] ?? 'USD'),
      regular_price: Number(tx['regularPrice'] ?? 0),
      real_price: Number(tx['realPrice'] ?? 0),
      payment_charge: Number(tx['paymentCharge'] ?? 0),
      inner_charge: Number(tx['innerCharge'] ?? 0),
      outer_charge: Number(tx['outerCharge'] ?? 0),
      payment_method: String(tx['paymentMethod'] ?? ''),
      payment_status: String(tx['paymentStatus'] ?? ''),
      status: String(tx['status'] ?? ''),
      origin: String(tx['origin'] ?? ''),
      sales_channel_id: (tx['salesChannelId'] as string) || null,
      undershop_id: (tx['underShop'] as string) || null,
      checkout_id: (tx['checkoutId'] as string) || null,
      tax_rate: Number(tx['taxRate'] ?? 0),
      tickets_json: JSON.stringify(tickets),
      created_at: String(tx['createdAt'] ?? now),
      updated_at: String(tx['updatedAt'] ?? now),
      ingested_at: now,
      ingestion_batch_id: 'webhook',
    },
    types: {
      customer_phone: 'STRING',
      customer_street: 'STRING',
      customer_city: 'STRING',
      customer_state: 'STRING',
      customer_country: 'STRING',
      customer_postal: 'STRING',
      sales_channel_id: 'STRING',
      undershop_id: 'STRING',
      checkout_id: 'STRING',
    },
  });
  await job.getQueryResults();
}

// ============================================================
// Scan insert (scan.created)
// Each scan has a unique _id. Same ticket can have multiple scans
// (checkin, checkout, re-checkin). Deduplication of checkins per
// ticket is handled in the transform layer (MIN first_checkin_at).
// ============================================================

export async function insertScan(scan: Record<string, unknown>): Promise<void> {
  const now = new Date().toISOString();
  const table = `\`${PROJECT_ID}.${RAW_DATASET}.raw_scans\``;

  // Use MERGE to handle potential duplicate webhook deliveries
  const [job] = await bq.createQueryJob({
    query: `
      MERGE ${table} AS target
      USING (SELECT @scan_id AS scan_id) AS source
      ON target.scan_id = source.scan_id
      WHEN NOT MATCHED THEN INSERT (
        scan_id, ticket_id, scan_time, event_id, barcode, customer_name,
        ticket_type_id, ticket_name, device_id, scan_type, scan_result,
        seller_id, created_at, updated_at, ingested_at, ingestion_batch_id
      ) VALUES (
        @scan_id, @ticket_id, @scan_time, @event_id, @barcode, @customer_name,
        @ticket_type_id, @ticket_name, @device_id, @scan_type, @scan_result,
        @seller_id, @created_at, @updated_at, @ingested_at, @ingestion_batch_id
      )`,
    params: {
      scan_id: String(scan['_id'] ?? ''),
      ticket_id: String(scan['ticketId'] ?? ''),
      scan_time: String(scan['time'] ?? now),
      event_id: String(scan['eventId'] ?? ''),
      barcode: String(scan['barcode'] ?? ''),
      customer_name: String(scan['name'] ?? ''),
      ticket_type_id: String(scan['ticketTypeId'] ?? ''),
      ticket_name: String(scan['ticketName'] ?? ''),
      device_id: (scan['deviceId'] as string) || null,
      scan_type: String(scan['type'] ?? ''),
      scan_result: String(scan['scanResult'] ?? ''),
      seller_id: String(scan['sellerId'] ?? ''),
      created_at: String(scan['createdAt'] ?? now),
      updated_at: String(scan['updatedAt'] ?? now),
      ingested_at: now,
      ingestion_batch_id: 'webhook',
    },
    types: {
      device_id: 'STRING',
    },
  });
  await job.getQueryResults();
}

// ============================================================
// Ticket types upsert from event webhook (event.created / event.updated)
// Each event contains nested ticket types — extract and upsert to reference table
// ============================================================

function categoriseTicketType(name: string, price: number): string {
  const lower = name.toLowerCase();
  if (price === 0) return 'comp';
  if (lower.includes('child')) return 'child';
  if (lower.includes('youth')) return 'youth';
  if (lower.includes('senior')) return 'senior';
  if (lower.includes('student')) return 'student';
  if (lower.includes('ada')) return 'ada';
  if (lower.includes('vip')) return 'vip';
  if (lower.includes('package') || lower.includes('date night') || lower.includes('family')) return 'package';
  if (lower.includes('adult') || lower === 'general admission') return 'adult';
  return 'other';
}

export async function upsertTicketTypesFromEvent(event: Record<string, unknown>): Promise<void> {
  const tickets = event['tickets'] as Array<Record<string, unknown>> | undefined;
  if (!tickets || tickets.length === 0) return;

  const now = new Date().toISOString();
  const table = `\`${PROJECT_ID}.reference.ticket_types\``;

  for (const tt of tickets) {
    const name = String(tt['name'] ?? '');
    const price = Number(tt['price'] ?? 0);

    const [job] = await bq.createQueryJob({
      query: `
        MERGE ${table} AS target
        USING (SELECT @ticket_type_id AS ticket_type_id) AS source
        ON target.ticket_type_id = source.ticket_type_id
        WHEN MATCHED THEN UPDATE SET
          ticket_name = @ticket_name,
          base_price = @base_price,
          ticket_category = @ticket_category,
          tax_rate = @tax_rate,
          is_active = @is_active,
          updated_at = @updated_at
        WHEN NOT MATCHED THEN INSERT (
          ticket_type_id, ticket_name, base_price, ticket_category, tax_rate, is_active, updated_at
        ) VALUES (
          @ticket_type_id, @ticket_name, @base_price, @ticket_category, @tax_rate, @is_active, @updated_at
        )`,
      params: {
        ticket_type_id: String(tt['_id'] ?? ''),
        ticket_name: name,
        base_price: price,
        ticket_category: categoriseTicketType(name, price),
        tax_rate: Number(tt['taxRate'] ?? 0),
        is_active: Boolean(tt['active'] ?? true),
        updated_at: now,
      },
    });
    await job.getQueryResults();
  }

  console.log(`[bigquery-writer] Upserted ${tickets.length} ticket types from event ${event['_id']}`);
}
