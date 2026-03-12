/**
 * Cross-reference salesChannelId and underShopId on tickets.
 * Confirms whether salesChannelId alone is sufficient for partner identification.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/cross-ref-channels.ts
 */

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

async function fetchAllPages(baseUrl: string, pageSize = 500): Promise<any[]> {
  const all: any[] = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${baseUrl}${sep}top=${pageSize}&skip=${skip}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const data = await res.json();
    const items = data.rows ?? data.docs ?? [];
    all.push(...items);
    skip += items.length;
    hasMore = items.length === pageSize;
    process.stderr.write(`\r  ${all.length} tickets`);
  }
  process.stderr.write('\n');
  return all;
}

async function main() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  console.log('Fetching tickets (last 30 days)...');
  const tickets = await fetchAllPages(
    `https://vivenu.com/api/tickets?start=${start.toISOString()}&end=${end.toISOString()}`
  );

  // Build cross-reference: salesChannelId → Set of underShopIds
  const channelToShops = new Map<string, Map<string, number>>();

  for (const t of tickets) {
    const ch = t.salesChannelId ?? '(none)';
    const shop = t.underShopId ?? '(none)';

    if (!channelToShops.has(ch)) channelToShops.set(ch, new Map());
    const shops = channelToShops.get(ch);
    if (shops) shops.set(shop, (shops.get(shop) ?? 0) + 1);
  }

  console.log('\n=== salesChannelId → underShopId MAPPING ===\n');

  const sorted = [...channelToShops.entries()].sort((a, b) => {
    const totalA = [...a[1].values()].reduce((s, n) => s + n, 0);
    const totalB = [...b[1].values()].reduce((s, n) => s + n, 0);
    return totalB - totalA;
  });

  for (const [channel, shops] of sorted) {
    const total = [...shops.values()].reduce((s, n) => s + n, 0);
    console.log(`${channel}  (${total} tickets)`);
    const shopEntries = [...shops.entries()].sort((a, b) => b[1] - a[1]);
    for (const [shop, count] of shopEntries) {
      console.log(`  → ${shop}  (${count})`);
    }
    console.log();
  }

  // Check: any tickets with NO salesChannelId?
  const noChannel = tickets.filter((t: any) => !t.salesChannelId);
  console.log(`\nTickets with NO salesChannelId: ${noChannel.length}/${tickets.length}`);

  if (noChannel.length > 0) {
    const shopCounts = new Map<string, number>();
    for (const t of noChannel) {
      const shop = t.underShopId ?? '(none)';
      shopCounts.set(shop, (shopCounts.get(shop) ?? 0) + 1);
    }
    console.log('Their underShopIds:');
    for (const [shop, count] of [...shopCounts.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${shop}: ${count}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
