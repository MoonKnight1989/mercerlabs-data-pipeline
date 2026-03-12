import { describe, it, expect } from 'vitest';
import type {
  VivenuTicket,
  VivenuTransaction,
  VivenuScan,
  RawTicketRow,
  RawTransactionRow,
  RawScanRow,
} from '../shared/types';

// ============================================================
// Ticket mapping (mirrors bigquery-writer.ts mapTicketToRow)
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
// Transaction mapping (mirrors bigquery-writer.ts mapTransactionToRow)
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
// Scan mapping (mirrors bigquery-writer.ts mapScanToRow)
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
    device_id: scan.deviceId,
    scan_type: scan.type,
    scan_result: scan.scanResult,
    seller_id: scan.sellerId,
    created_at: scan.createdAt,
    updated_at: scan.updatedAt,
    ingested_at: new Date().toISOString(),
    ingestion_batch_id: batchId,
  };
}

// ============================================================
// Test fixtures
// ============================================================

function makeTicket(overrides: Partial<VivenuTicket> = {}): VivenuTicket {
  return {
    _id: 'ticket-001',
    transactionId: 'txn-001',
    barcode: 'abc123',
    secret: 'sec-001',
    customerId: 'cust-001',
    name: 'John Doe',
    firstname: 'John',
    lastname: 'Doe',
    email: 'john@example.com',
    eventId: 'evt-001',
    rootEventId: 'root-evt-001',
    ticketTypeId: 'tt-001',
    ticketName: 'Adult',
    categoryName: 'General Admission',
    categoryRef: null,
    realPrice: 26,
    regularPrice: 30,
    currency: 'USD',
    status: 'VALID',
    type: 'SINGLE',
    deliveryType: 'VIRTUAL',
    cartItemId: null,
    checkoutId: 'co-001',
    checkoutItemId: null,
    triggeredBy: [],
    origin: 'yourticket',
    salesChannelId: 'sch-001',
    underShopId: 'us-001',
    sellerId: 'seller-001',
    slotId: 'slot-001',
    slotStartTime: '16:00',
    addOns: [],
    personalized: false,
    claimed: false,
    expired: false,
    entryPermissions: [],
    capabilities: [],
    history: [],
    createdAt: '2026-02-20T15:30:00Z',
    updatedAt: '2026-02-20T15:30:00Z',
    street: null,
    city: null,
    state: null,
    country: null,
    postal: null,
    posId: null,
    company: null,
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<VivenuTransaction> = {}): VivenuTransaction {
  return {
    _id: 'txn-001',
    sellerId: 'seller-001',
    customerId: 'cust-001',
    eventId: 'evt-001',
    name: 'John Doe',
    prename: 'John',
    lastname: 'Doe',
    email: 'john@example.com',
    phone: null,
    street: null,
    city: null,
    state: null,
    country: null,
    postal: null,
    tickets: [
      {
        _id: 'tli-001',
        type: 'SINGLE',
        name: 'Adult',
        amount: 2,
        price: 52,
        netPrice: 48,
        taxRate: 0,
        ticketTypeId: 'tt-001',
        categoryRef: null,
        slotInfo: null,
        taxInfo: null,
      },
    ],
    products: [],
    additionalItems: [],
    currency: 'USD',
    regularPrice: 60,
    realPrice: 52,
    paymentCharge: 0,
    innerCharge: 1.56,
    outerCharge: 2.08,
    innerFeeComponents: null,
    outerFeeComponents: null,
    paymentInfo: null,
    paymentMethod: 'credit_card',
    paymentStatus: 'RECEIVED',
    status: 'COMPLETE',
    origin: 'yourticket',
    salesChannelId: 'sch-001',
    underShop: 'us-001',
    checkoutId: 'co-001',
    taxRate: 0,
    historyEntries: [],
    createdAt: '2026-02-20T15:30:00Z',
    updatedAt: '2026-02-20T15:30:00Z',
    ...overrides,
  };
}

function makeScan(overrides: Partial<VivenuScan> = {}): VivenuScan {
  return {
    _id: 'scan-001',
    ticketId: 'ticket-001',
    time: '2026-02-20T19:05:32.534Z',
    eventId: 'evt-001',
    barcode: 'abc123',
    name: 'John Doe',
    ticketTypeId: 'tt-001',
    ticketName: 'Adult',
    deviceId: 'device-iphone-001',
    type: 'checkin',
    scanResult: 'approved',
    sellerId: 'seller-001',
    createdAt: '2026-02-20T19:05:32.534Z',
    updatedAt: '2026-02-20T19:05:32.534Z',
    ...overrides,
  };
}

// ============================================================
// Tests
// ============================================================

describe('ticket mapping', () => {
  it('maps _id to ticket_id', () => {
    const row = mapTicketToRow(makeTicket(), 'batch-001');
    expect(row.ticket_id).toBe('ticket-001');
  });

  it('maps realPrice and regularPrice', () => {
    const row = mapTicketToRow(makeTicket(), 'batch-001');
    expect(row.real_price).toBe(26);
    expect(row.regular_price).toBe(30);
  });

  it('maps categoryName to category_name', () => {
    const row = mapTicketToRow(makeTicket(), 'batch-001');
    expect(row.category_name).toBe('General Admission');
  });

  it('handles null undershop_id', () => {
    const row = mapTicketToRow(makeTicket({ underShopId: null }), 'batch-001');
    expect(row.undershop_id).toBeNull();
  });

  it('maps all key fields correctly', () => {
    const row = mapTicketToRow(makeTicket(), 'batch-001');
    expect(row.transaction_id).toBe('txn-001');
    expect(row.customer_email).toBe('john@example.com');
    expect(row.event_id).toBe('evt-001');
    expect(row.root_event_id).toBe('root-evt-001');
    expect(row.slot_start_time).toBe('16:00');
    expect(row.origin).toBe('yourticket');
    expect(row.ingestion_batch_id).toBe('batch-001');
  });
});

describe('transaction mapping', () => {
  it('maps _id to transaction_id', () => {
    const row = mapTransactionToRow(makeTransaction(), 'batch-001');
    expect(row.transaction_id).toBe('txn-001');
  });

  it('maps fee fields', () => {
    const row = mapTransactionToRow(makeTransaction(), 'batch-001');
    expect(row.inner_charge).toBe(1.56);
    expect(row.outer_charge).toBe(2.08);
    expect(row.payment_charge).toBe(0);
  });

  it('maps payment info', () => {
    const row = mapTransactionToRow(makeTransaction(), 'batch-001');
    expect(row.payment_method).toBe('credit_card');
    expect(row.payment_status).toBe('RECEIVED');
  });

  it('calculates ticket_count from tickets array length', () => {
    const row = mapTransactionToRow(makeTransaction(), 'batch-001');
    expect(row.ticket_count).toBe(1);
  });

  it('serialises tickets to JSON', () => {
    const row = mapTransactionToRow(makeTransaction(), 'batch-001');
    const parsed = JSON.parse(row.tickets_json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('Adult');
  });

  it('maps underShop to undershop_id', () => {
    const row = mapTransactionToRow(makeTransaction(), 'batch-001');
    expect(row.undershop_id).toBe('us-001');
  });

  it('handles null optional fields', () => {
    const row = mapTransactionToRow(makeTransaction({ phone: null, street: null }), 'batch-001');
    expect(row.customer_phone).toBeNull();
    expect(row.customer_street).toBeNull();
  });
});

describe('scan mapping', () => {
  it('maps _id to scan_id', () => {
    const row = mapScanToRow(makeScan(), 'batch-001');
    expect(row.scan_id).toBe('scan-001');
  });

  it('maps ticketId to ticket_id', () => {
    const row = mapScanToRow(makeScan(), 'batch-001');
    expect(row.ticket_id).toBe('ticket-001');
  });

  it('maps time to scan_time', () => {
    const row = mapScanToRow(makeScan(), 'batch-001');
    expect(row.scan_time).toBe('2026-02-20T19:05:32.534Z');
  });

  it('maps type to scan_type', () => {
    const row = mapScanToRow(makeScan({ type: 'checkout' }), 'batch-001');
    expect(row.scan_type).toBe('checkout');
  });

  it('maps device and result fields', () => {
    const row = mapScanToRow(makeScan(), 'batch-001');
    expect(row.device_id).toBe('device-iphone-001');
    expect(row.scan_result).toBe('approved');
  });

  it('handles null deviceId', () => {
    const row = mapScanToRow(makeScan({ deviceId: null }), 'batch-001');
    expect(row.device_id).toBeNull();
  });
});

describe('commission calculation', () => {
  function calculateNetPrice(
    realPrice: number,
    netRevenueMultiplier: number,
    isComplimentary: boolean
  ): number {
    if (isComplimentary) return 0;
    return realPrice * netRevenueMultiplier;
  }

  it('calculates net price for direct sales (0% commission)', () => {
    expect(calculateNetPrice(26, 1.0, false)).toBe(26);
  });

  it('calculates net price for 30% commission', () => {
    expect(calculateNetPrice(50, 0.7, false)).toBeCloseTo(35);
  });

  it('calculates net price for 20% commission', () => {
    expect(calculateNetPrice(26, 0.8, false)).toBeCloseTo(20.8);
  });

  it('returns 0 for complimentary regardless of price', () => {
    expect(calculateNetPrice(50, 1.0, true)).toBe(0);
    expect(calculateNetPrice(100, 0.7, true)).toBe(0);
  });

  it('handles zero price', () => {
    expect(calculateNetPrice(0, 0.7, false)).toBe(0);
  });
});

describe('scan deduplication logic', () => {
  interface ScanEntry {
    time: string;
    type: 'checkin' | 'checkout';
    deviceId: string | null;
  }

  function getFirstCheckin(scans: ScanEntry[]): { time: string; device: string | null } | null {
    const checkins = scans
      .filter((s) => s.type === 'checkin')
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    if (checkins.length === 0) return null;
    return { time: checkins[0]!.time, device: checkins[0]!.deviceId };
  }

  it('returns null for no scans', () => {
    expect(getFirstCheckin([])).toBeNull();
  });

  it('returns null for checkout-only scans', () => {
    expect(
      getFirstCheckin([{ time: '2026-02-20T19:00:00Z', type: 'checkout', deviceId: 'dev-1' }])
    ).toBeNull();
  });

  it('returns single checkin', () => {
    const result = getFirstCheckin([
      { time: '2026-02-20T19:05:32.534Z', type: 'checkin', deviceId: 'iPhone' },
    ]);
    expect(result?.time).toBe('2026-02-20T19:05:32.534Z');
    expect(result?.device).toBe('iPhone');
  });

  it('takes earliest from multiple checkins', () => {
    const result = getFirstCheckin([
      { time: '2026-02-19T21:56:27.509Z', type: 'checkin', deviceId: 'iPhone' },
      { time: '2026-02-19T21:56:27.507Z', type: 'checkin', deviceId: 'iPad' },
      { time: '2026-02-19T21:56:27.508Z', type: 'checkin', deviceId: 'iPhone' },
    ]);
    expect(result?.time).toBe('2026-02-19T21:56:27.507Z');
    expect(result?.device).toBe('iPad');
  });

  it('ignores checkout scans when finding first checkin', () => {
    const result = getFirstCheckin([
      { time: '2026-02-19T18:00:00Z', type: 'checkout', deviceId: 'dev-1' },
      { time: '2026-02-19T21:56:27.509Z', type: 'checkin', deviceId: 'iPhone' },
    ]);
    expect(result?.time).toBe('2026-02-19T21:56:27.509Z');
  });
});
