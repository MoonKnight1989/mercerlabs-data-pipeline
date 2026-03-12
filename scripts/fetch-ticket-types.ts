/**
 * Fetch deduplicated ticket types and their base prices from the Events API.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/fetch-ticket-types.ts
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

async function main() {
  const events = await fetchAllEvents();
  console.log(`Total events: ${events.length}\n`);

  // Deduplicate ticket types by ID
  const types = new Map<
    string,
    { id: string; name: string; price: number; active: boolean; eventCount: number; sampleEventId: string }
  >();

  for (const evt of events) {
    if (!evt.tickets) continue;
    for (const tt of evt.tickets) {
      if (!types.has(tt._id)) {
        types.set(tt._id, {
          id: tt._id,
          name: tt.name,
          price: tt.price,
          active: tt.active,
          eventCount: 0,
          sampleEventId: evt._id,
        });
      }
      const entry = types.get(tt._id);
      if (entry) entry.eventCount++;
    }
  }

  console.log(`Unique ticket type IDs: ${types.size}\n`);
  console.log(
    'ID'.padEnd(28) +
      'Base Price'.padEnd(12) +
      'Active'.padEnd(8) +
      'Events'.padEnd(8) +
      'Name'
  );
  console.log('-'.repeat(100));

  const sorted = [...types.values()].sort((a, b) => b.eventCount - a.eventCount);
  for (const tt of sorted) {
    console.log(
      tt.id.padEnd(28) +
        ('$' + tt.price.toFixed(2)).padEnd(12) +
        String(tt.active).padEnd(8) +
        String(tt.eventCount).padEnd(8) +
        tt.name
    );
  }

  // Now cross-reference: compare base prices to known OTA realPrices
  console.log('\n\n========================================');
  console.log('KEY VALIDATION');
  console.log('========================================\n');

  const adultTypes = sorted.filter((t) => t.name === 'Adult' && t.price > 0);
  const youthTypes = sorted.filter((t) => t.name === 'Youth (4-17)' && t.price > 0);
  const studentTypes = sorted.filter((t) => t.name === 'Student' && t.price > 0);

  console.log('Adult base prices:', adultTypes.map((t) => `$${t.price} (${t.id})`).join(', '));
  console.log('Youth base prices:', youthTypes.map((t) => `$${t.price} (${t.id})`).join(', '));
  console.log('Student base prices:', studentTypes.map((t) => `$${t.price} (${t.id})`).join(', '));

  console.log('\nCompare to OTA realPrices from validate-pricing.ts:');
  console.log('  OTA 6883d1c7: Adult $39.66, Youth $35.09, Student $35.09');
  console.log('  OTA 68c9bca4: Adult $39.63, Youth $35.06, Student $43.00');
  console.log('\nIf base > OTA realPrice → secret shop is overriding to net amount');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
