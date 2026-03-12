/**
 * Fetch events and their ticket type configurations from Vivenu.
 * Shows base prices per ticket type — the actual customer-facing price
 * before any secret shop overrides.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/fetch-events.ts
 */

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

const EVENTS_URL = 'https://vivenu.com/api/events';
const PAGE_SIZE = 100;

interface VivenuTicketType {
  _id: string;
  name: string;
  price: number;
  amount: number;
  active: boolean;
  taxRate: number;
  description?: string;
  categoryRef?: string | null;
  maxAmountPerOrder?: number;
  [key: string]: unknown;
}

interface VivenuEvent {
  _id: string;
  name: string;
  start: string;
  end: string;
  tickets: VivenuTicketType[];
  [key: string]: unknown;
}

async function fetchEvents(): Promise<VivenuEvent[]> {
  const all: VivenuEvent[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      top: String(PAGE_SIZE),
      skip: String(skip),
    });

    const res = await fetch(`${EVENTS_URL}?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${res.statusText} — ${body}`);
    }

    const data = await res.json();
    // Events endpoint may use "rows" or "docs"
    const items: VivenuEvent[] = data.rows ?? data.docs ?? [];
    all.push(...items);
    skip += items.length;
    hasMore = items.length === PAGE_SIZE;

    process.stdout.write(`\r  Fetched ${all.length} events`);
  }
  console.log();
  return all;
}

function analyseEvents(events: VivenuEvent[]) {
  console.log(`\nTotal events: ${events.length}\n`);

  // Collect all ticket types across events
  const ticketTypes = new Map<
    string,
    {
      id: string;
      name: string;
      basePrice: number;
      taxRate: number;
      active: boolean;
      eventId: string;
      eventName: string;
      categoryRef: string | null;
    }
  >();

  for (const event of events) {
    if (!event.tickets || event.tickets.length === 0) continue;

    console.log(`\n--- ${event.name} (${event._id}) ---`);
    console.log(`    ${event.start} → ${event.end}`);
    console.log(
      '    ' +
        'Ticket Type'.padEnd(35) +
        'Base Price'.padEnd(12) +
        'Tax'.padEnd(8) +
        'Active'.padEnd(8) +
        'ID'
    );
    console.log('    ' + '-'.repeat(90));

    for (const tt of event.tickets) {
      console.log(
        '    ' +
          (tt.name ?? '(unnamed)').padEnd(35) +
          `$${tt.price.toFixed(2)}`.padEnd(12) +
          `${(tt.taxRate * 100).toFixed(1)}%`.padEnd(8) +
          `${tt.active}`.padEnd(8) +
          tt._id
      );

      ticketTypes.set(`${event._id}:${tt._id}`, {
        id: tt._id,
        name: tt.name,
        basePrice: tt.price,
        taxRate: tt.taxRate,
        active: tt.active,
        eventId: event._id,
        eventName: event.name,
        categoryRef: tt.categoryRef ?? null,
      });
    }
  }

  // Cross-reference: same ticket type name across events
  console.log('\n\n========================================');
  console.log('TICKET TYPE BASE PRICES (all events)');
  console.log('========================================\n');

  const byName = new Map<string, Array<{ eventName: string; price: number; id: string; active: boolean }>>();
  for (const tt of ticketTypes.values()) {
    if (!byName.has(tt.name)) byName.set(tt.name, []);
    byName.get(tt.name)!.push({
      eventName: tt.eventName,
      price: tt.basePrice,
      id: tt.id,
      active: tt.active,
    });
  }

  for (const [name, entries] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const prices = [...new Set(entries.map((e) => e.price))];
    const flag = prices.length > 1 ? ' (VARIES BY EVENT)' : '';
    console.log(`"${name}"${flag}`);
    for (const e of entries) {
      console.log(`    $${e.price.toFixed(2)} | ${e.active ? 'active' : 'INACTIVE'} | ${e.eventName} | ${e.id}`);
    }
  }

  // Validation against known OTA prices from earlier run
  console.log('\n\n========================================');
  console.log('VALIDATION: Base price vs OTA realPrice');
  console.log('========================================\n');
  console.log('Compare these base prices to the OTA realPrice values from validate-pricing.ts:');
  console.log('If base_price matches direct-sale realPrice but NOT OTA realPrice,');
  console.log('the secret shop is confirmed to be overriding OTA prices.\n');

  // Output as JSON seed for reference.ticket_types
  console.log('\n========================================');
  console.log('SEED DATA (for reference.ticket_types)');
  console.log('========================================\n');

  const seed = [...ticketTypes.values()].map((tt) => ({
    ticket_type_id: tt.id,
    event_id: tt.eventId,
    ticket_name: tt.name,
    base_price: tt.basePrice,
    category_ref: tt.categoryRef,
    tax_rate: tt.taxRate,
    is_active: tt.active,
  }));

  console.log(JSON.stringify(seed, null, 2));
}

async function main() {
  console.log('Vivenu Events & Ticket Types');
  console.log('============================\n');
  console.log('Fetching events to get base ticket type prices...\n');

  const events = await fetchEvents();
  analyseEvents(events);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
