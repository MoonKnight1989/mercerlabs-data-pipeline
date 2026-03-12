/**
 * Fetch ticket types from Events API and output NDJSON for BQ loading.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/seed-ticket-types.ts > /tmp/ticket-types.ndjson
 */

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

const PAGE_SIZE = 100;

async function fetchAllEvents(): Promise<any[]> {
  const all: any[] = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const params = new URLSearchParams({ top: String(PAGE_SIZE), skip: String(skip) });
    const res = await fetch(`https://vivenu.com/api/events?${params}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const data = await res.json();
    const items = data.rows ?? data.docs ?? [];
    all.push(...items);
    skip += items.length;
    hasMore = items.length === PAGE_SIZE;
    process.stderr.write(`\r  Fetched ${all.length} events`);
  }
  process.stderr.write('\n');
  return all;
}

function categorize(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('adult')) return 'adult';
  if (lower.includes('youth') || lower.includes('child') || lower.includes('kid')) return 'youth';
  if (lower.includes('senior')) return 'senior';
  if (lower.includes('student')) return 'student';
  if (lower.includes('infant') || lower.includes('baby') || lower.includes('toddler')) return 'infant';
  return 'other';
}

async function main() {
  const events = await fetchAllEvents();
  process.stderr.write(`Total events: ${events.length}\n`);

  const types = new Map<string, { id: string; name: string; price: number; active: boolean; taxRate: number }>();

  for (const evt of events) {
    if (!evt.tickets) continue;
    for (const tt of evt.tickets) {
      if (!types.has(tt._id)) {
        types.set(tt._id, {
          id: tt._id,
          name: tt.name,
          price: tt.price,
          active: tt.active,
          taxRate: tt.taxRate ?? 0,
        });
      }
    }
  }

  process.stderr.write(`Unique ticket types: ${types.size}\n`);

  const now = new Date().toISOString();
  for (const tt of types.values()) {
    const row = {
      ticket_type_id: tt.id,
      ticket_name: tt.name,
      base_price: tt.price,
      ticket_category: categorize(tt.name),
      tax_rate: tt.taxRate,
      is_active: tt.active,
      updated_at: now,
    };
    console.log(JSON.stringify(row));
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
