/**
 * Cross-reference salesChannelId × underShopId to find OTA sales
 * hiding behind sch-web or sch-internal-booking via secret shops.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/channel-undershop-matrix.ts
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
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}top=${pageSize}&skip=${skip}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!res.ok) break;
    const data = await res.json();
    const items = data.rows ?? data.docs ?? [];
    all.push(...items);
    skip += items.length;
    hasMore = items.length === pageSize;
    process.stderr.write(`\r  ${all.length} records`);
  }
  process.stderr.write('\n');
  return all;
}

async function main() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const dateParams = `start=${start.toISOString()}&end=${end.toISOString()}`;

  console.log('Fetching tickets (last 30 days)...');
  const tickets = await fetchAllPages(`https://vivenu.com/api/tickets?${dateParams}`);

  // Build matrix: salesChannelId → underShopId → { count, sample realPrice, sample regularPrice }
  const matrix = new Map<string, Map<string, { count: number; prices: number[] }>>();

  for (const t of tickets) {
    const ch = t.salesChannelId ?? '(none)';
    const us = t.underShopId ?? '(none)';

    if (!matrix.has(ch)) matrix.set(ch, new Map());
    const inner = matrix.get(ch)!;
    if (!inner.has(us)) inner.set(us, { count: 0, prices: [] });
    const entry = inner.get(us)!;
    entry.count++;
    if (entry.prices.length < 5) entry.prices.push(t.realPrice);
  }

  // Known undershops from Vivenu team
  const knownUndershops: Record<string, string> = {
    '68751516fdab06fdb51542e5': 'MM: Box Office (Maestros & Machines)',
    '6883d1c71f9efd18bab187c6': 'OTA - Redeam Distributors',
    '691e234ed97271aa1b258673': 'Must See Week 2026',
    '687ab27e423ac1972951c0d6': 'Universal Vision / Jupiter Legend',
  };

  console.log('\n=== SALES CHANNEL × UNDERSHOP MATRIX ===\n');

  const sortedChannels = [...matrix.entries()].sort((a, b) => {
    const totalA = [...a[1].values()].reduce((s, v) => s + v.count, 0);
    const totalB = [...b[1].values()].reduce((s, v) => s + v.count, 0);
    return totalB - totalA;
  });

  for (const [ch, undershops] of sortedChannels) {
    const total = [...undershops.values()].reduce((s, v) => s + v.count, 0);
    console.log(`\n${ch}  (${total} tickets)`);

    const sortedUs = [...undershops.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [us, data] of sortedUs) {
      const label = knownUndershops[us] ?? '';
      const priceStr = data.prices.map(p => `$${p}`).join(', ');
      console.log(`  └─ ${us}  ${label ? `[${label}]` : ''}  (${data.count} tickets)  prices: ${priceStr}`);
    }
  }

  // Focus: undershops under sch-web and sch-internal-booking that might be OTA sales
  console.log('\n\n=== POTENTIAL HIDDEN OTA SALES ===\n');
  console.log('Undershops under sch-web / sch-internal-booking with non-standard pricing:\n');

  for (const chId of ['sch-web', 'sch-internal-booking']) {
    const undershops = matrix.get(chId);
    if (!undershops) continue;

    console.log(`${chId}:`);
    const sorted = [...undershops.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [us, data] of sorted) {
      const label = knownUndershops[us] ?? '';
      const avgPrice = data.prices.reduce((s, p) => s + p, 0) / data.prices.length;
      const priceStr = data.prices.map(p => `$${p}`).join(', ');
      // Flag if avg price is notably different from $49 (adult) or $43 (youth)
      const suspicious = avgPrice < 40 || (avgPrice > 0 && avgPrice < 43);
      console.log(`  ${us}  ${label ? `[${label}]` : ''}  (${data.count} tickets)  avg: $${avgPrice.toFixed(2)}  samples: ${priceStr}${suspicious ? '  ⚠ LOW PRICE' : ''}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
