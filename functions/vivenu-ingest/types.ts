// ============================================================
// Vivenu API response types (verified against live API 2026-03-05)
// ============================================================

// --- Tickets: vivenu.com/api/tickets ---

/** Raw ticket from Vivenu API (GET /api/tickets) */
export interface VivenuTicket {
  _id: string;
  transactionId: string;
  barcode: string;
  secret: string;
  customerId: string | null;
  name: string;
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  eventId: string;
  rootEventId: string | null;
  ticketTypeId: string;
  ticketName: string;
  categoryName: string;
  categoryRef: string | null;
  realPrice: number;
  regularPrice: number;
  currency: string;
  status: string;
  type: string;
  deliveryType: string;
  cartItemId: string | null;
  checkoutId: string | null;
  checkoutItemId: string | null;
  triggeredBy: unknown[];
  origin: string;
  salesChannelId: string | null;
  underShopId: string | null;
  sellerId: string;
  slotId: string | null;
  slotStartTime: string | null;
  addOns: unknown[];
  personalized: boolean;
  claimed: boolean;
  expired: boolean;
  entryPermissions: unknown[];
  capabilities: unknown[];
  history: VivenuHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  // Customer address fields (present on some tickets)
  street: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal: string | null;
  // POS-specific
  posId: string | null;
  company: string | null;
}

export interface VivenuHistoryEntry {
  type: string;
  date: string;
  _id: string;
}

/** Vivenu tickets paginated response */
export interface VivenuTicketsResponse {
  rows: VivenuTicket[];
  total: number;
}

// --- Transactions: vivenu.com/api/transactions ---

/** Raw transaction from Vivenu API (GET /api/transactions) */
export interface VivenuTransaction {
  _id: string;
  sellerId: string;
  customerId: string;
  eventId: string;
  name: string;
  prename: string;
  lastname: string;
  email: string;
  phone: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal: string | null;
  tickets: VivenuTransactionTicket[];
  products: unknown[];
  additionalItems: unknown[];
  currency: string;
  regularPrice: number;
  realPrice: number;
  paymentCharge: number;
  innerCharge: number;
  outerCharge: number;
  innerFeeComponents: VivenuFeeComponents | null;
  outerFeeComponents: VivenuFeeComponents | null;
  paymentInfo: VivenuPaymentInfo | null;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
  origin: string;
  salesChannelId: string | null;
  underShop: string | null;
  checkoutId: string | null;
  taxRate: number;
  historyEntries: VivenuHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface VivenuTransactionTicket {
  _id: string;
  type: string;
  name: string;
  amount: number;
  price: number;
  netPrice: number;
  taxRate: number;
  ticketTypeId: string;
  categoryRef: string | null;
  slotInfo: { slotId: string; slotStartTime: string } | null;
  taxInfo: {
    taxItems: Array<{
      name?: string;
      rate: number;
      perUnit: number;
      netPerUnit: number;
      netTotal: number;
      total: number;
    }>;
  } | null;
}

export interface VivenuFeeComponents {
  fix: Array<{ amount: number; value: number; total: number; type: string }>;
  var: Array<{ amount: number; value: number; total: number; type: string }>;
}

export interface VivenuPaymentInfo {
  _id: string;
  gateway: string | null;
  method: string;
  providerType: string | null;
  psp: string | null;
}

/** Vivenu transactions paginated response */
export interface VivenuTransactionsResponse {
  docs: VivenuTransaction[];
  total: number;
}

// --- Scans: portier.vivenu.com/api/scans ---

/** Raw scan from Vivenu Portier API (GET portier.vivenu.com/api/scans) */
export interface VivenuScan {
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

/** Vivenu scans paginated response */
export interface VivenuScansResponse {
  docs: VivenuScan[];
  total: number;
}

// --- Events: vivenu.com/api/events ---

/** Ticket type from Vivenu event (nested in event response) */
export interface VivenuEventTicketType {
  _id: string;
  name: string;
  price: number;
  amount: number;
  active: boolean;
  taxRate: number;
  description?: string;
  categoryRef?: string | null;
}

/** Event from Vivenu API (GET /api/events) */
export interface VivenuEvent {
  _id: string;
  name: string;
  start: string;
  end: string;
  tickets: VivenuEventTicketType[];
}

/** Vivenu events paginated response */
export interface VivenuEventsResponse {
  rows: VivenuEvent[];
  total: number;
}

// ============================================================
// BigQuery row types
// ============================================================

/** Row shape for raw_vivenu.raw_tickets */
export interface RawTicketRow {
  ticket_id: string;
  transaction_id: string;
  barcode: string;
  secret: string;
  customer_id: string | null;
  customer_name: string;
  customer_firstname: string | null;
  customer_lastname: string | null;
  customer_email: string | null;
  event_id: string;
  root_event_id: string | null;
  ticket_type_id: string;
  ticket_name: string;
  category_name: string;
  category_ref: string | null;
  real_price: number;
  regular_price: number;
  currency: string;
  status: string;
  ticket_type: string;
  delivery_type: string;
  cart_item_id: string | null;
  checkout_id: string | null;
  origin: string;
  sales_channel_id: string | null;
  undershop_id: string | null;
  seller_id: string;
  slot_id: string | null;
  slot_start_time: string | null;
  personalized: boolean;
  claimed: boolean;
  expired: boolean;
  created_at: string;
  updated_at: string;
  ingested_at: string;
  ingestion_batch_id: string;
}

/** Row shape for raw_vivenu.raw_transactions */
export interface RawTransactionRow {
  transaction_id: string;
  seller_id: string;
  customer_id: string;
  event_id: string;
  customer_name: string;
  customer_firstname: string;
  customer_lastname: string;
  customer_email: string;
  customer_phone: string | null;
  customer_street: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_country: string | null;
  customer_postal: string | null;
  ticket_count: number;
  currency: string;
  regular_price: number;
  real_price: number;
  payment_charge: number;
  inner_charge: number;
  outer_charge: number;
  payment_method: string;
  payment_status: string;
  status: string;
  origin: string;
  sales_channel_id: string | null;
  undershop_id: string | null;
  checkout_id: string | null;
  tax_rate: number;
  tickets_json: string;
  created_at: string;
  updated_at: string;
  ingested_at: string;
  ingestion_batch_id: string;
}

/** Row shape for raw_vivenu.raw_scans */
export interface RawScanRow {
  scan_id: string;
  ticket_id: string;
  scan_time: string;
  event_id: string;
  barcode: string;
  customer_name: string;
  ticket_type_id: string;
  ticket_name: string;
  device_id: string | null;
  scan_type: string;
  scan_result: string;
  seller_id: string;
  created_at: string;
  updated_at: string;
  ingested_at: string;
  ingestion_batch_id: string;
}

/** Row shape for mercer_analytics.tickets (anonymised, enriched) */
export interface CleanTicketRow {
  ticket_id: string;
  transaction_id: string;
  barcode: string;
  customer_id: string | null;
  customer_email_hash: string | null;
  event_id: string;
  root_event_id: string | null;
  ticket_type_id: string;
  ticket_name: string;
  ticket_category: string;
  category_name: string;
  slot_start_time: string | null;
  sales_channel_id: string | null;
  partner_name: string | null;
  partner_type: string | null;
  channel_group: string;
  cashflow_status: string;
  refunded_at: string | null;
  refund_date: string | null;
  gross_price: number;
  real_price: number;
  commission_rate: number | null;
  net_price: number | null;
  is_complimentary: boolean;
  status: string;
  origin: string;
  purchased_at: string;
  purchase_date: string;
  // Enriched from transactions
  payment_method: string | null;
  payment_status: string | null;
  inner_charge_per_ticket: number | null;
  outer_charge_per_ticket: number | null;
  tax_rate: number | null;
  // Enriched from scans
  was_redeemed: boolean;
  first_checkin_at: string | null;
  checkin_date: string | null;
  checkin_device: string | null;
  total_scan_count: number;
  ingested_at: string;
}

// ============================================================
// Reference table types
// ============================================================

/** Row shape for reference.partners (keyed on sales_channel_id) */
export interface PartnerConfig {
  sales_channel_id: string;
  partner_name: string | null;
  partner_type: string;
  connection_type: string | null;
  commission_rate: number;
  net_multiplier_adult: number;
  net_multiplier_other: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape for reference.ticket_types */
export interface TicketTypeConfig {
  ticket_type_id: string;
  ticket_name: string;
  base_price: number;
  ticket_category: string;
  tax_rate: number;
  is_active: boolean;
  updated_at: string;
}

/** Row shape for reference.unknown_channels */
export interface UnknownChannel {
  sales_channel_id: string;
  first_seen_at: string;
  sample_ticket_id: string | null;
  sample_price: number | null;
  ticket_count: number;
  resolved: boolean;
  resolved_at: string | null;
}

// ============================================================
// Analytics summary types
// ============================================================

/** Row shape for mercer_analytics.daily_revenue_summary */
export interface DailyRevenueSummary {
  report_date: string;
  sales_channel_id: string | null;
  partner_name: string | null;
  partner_type: string | null;
  channel_group: string;
  tickets_sold: number;
  orders: number;
  gross_revenue: number;
  net_revenue: number;
  commission_amount: number;
  avg_ticket_price: number | null;
  total_inner_charges: number;
  total_outer_charges: number;
  tickets_redeemed: number;
  unique_transactions_redeemed: number;
  comp_tickets_sold: number;
  comp_tickets_redeemed: number;
  redemption_rate: number | null;
  updated_at: string;
}

/** Row shape for mercer_analytics.daily_capacity_summary */
export interface DailyCapacitySummary {
  checkin_date: string;
  total_checkins: number;
  paid_checkins: number;
  comp_checkins: number;
  checkins_direct: number;
  checkins_hotel: number;
  checkins_ota: number;
  checkins_group: number;
  checkins_complimentary: number;
  gross_revenue_redeemed: number;
  net_revenue_redeemed: number;
  updated_at: string;
}

// ============================================================
// Email digest types
// ============================================================

/** Channel breakdown for email digest */
export interface ChannelSummary {
  name: string;
  type: string;
  tickets: number;
  gross_revenue: number;
  net_revenue: number;
  commission_rate: number;
}

/** Structured data payload sent to Claude API for narrative generation */
export interface EmailDigestPayload {
  report_date: string;
  day_of_week: string;
  yesterday: {
    net_revenue: number;
    gross_revenue: number;
    commission_total: number;
    tickets_sold: number;
    orders: number;
    total_checkins: number;
    paid_checkins: number;
    comp_checkins: number;
    channels: ChannelSummary[];
  };
  same_day_last_week: {
    net_revenue: number;
    tickets_sold: number;
  } | null;
  trailing_7_day_avg: {
    net_revenue: number;
    tickets_sold: number;
    redemptions: number;
  } | null;
  alerts: {
    unknown_channels: UnknownChannel[];
  };
}

// ============================================================
// Ingestion result types
// ============================================================

/** Return type for the vivenu-ingest function */
export interface IngestionResult {
  success: boolean;
  batch_id: string;
  tickets_fetched: number;
  tickets_inserted: number;
  tickets_updated: number;
  transactions_fetched: number;
  transactions_inserted: number;
  transactions_updated: number;
  scans_fetched: number;
  scans_inserted: number;
  scans_updated: number;
  ticket_types_upserted: number;
  new_unknown_channels: UnknownChannel[];
  errors: string[];
  duration_ms: number;
}
