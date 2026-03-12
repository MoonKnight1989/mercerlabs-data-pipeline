/**
 * Fetch sales channels and undershop IDs from Vivenu,
 * plus extract unique salesChannelId and underShopId from recent tickets.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/fetch-channels.ts
 */

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) {
    console.error(`${url}: ${res.status} ${res.statusText}`);
    console.error(await res.text());
    return null;
  }
  return res.json();
}

async function fetchAllPages(baseUrl: string, pageSize = 500): Promise<any[]> {
  const all: any[] = [];
  let skip = 0;
  let hasMore = true;
  while (hasMore) {
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}top=${pageSize}&skip=${skip}`;
    const data = await fetchJson(url);
    if (!data) break;
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
  // 1. Sales Channels endpoint
  console.log('=== SALES CHANNELS (from /api/sales-channels) ===\n');
  const channels = await fetchJson('https://vivenu.com/api/sales-channels?top=100');
  if (channels) {
    const items = channels.rows ?? channels.docs ?? channels;
    if (Array.isArray(items)) {
      for (const ch of items) {
        console.log(`  ${ch._id}  ${ch.name ?? ch.label ?? '(no name)'}  ${ch.type ?? ''}`);
      }
      console.log(`\n  Total: ${items.length}`);
    } else {
      console.log(JSON.stringify(channels, null, 2));
    }
  }

  // 2. Extract unique salesChannelId + underShopId from recent tickets
  console.log('\n\n=== CHANNELS FROM TICKET DATA (last 30 days) ===\n');

  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const dateParams = `start=${start.toISOString()}&end=${end.toISOString()}`;

  console.log('Fetching tickets...');
  const tickets = await fetchAllPages(`https://vivenu.com/api/tickets?${dateParams}`);

  const salesChannels = new Map<string, number>();
  const undershops = new Map<string, number>();

  for (const t of tickets) {
    if (t.salesChannelId) {
      salesChannels.set(t.salesChannelId, (salesChannels.get(t.salesChannelId) ?? 0) + 1);
    }
    if (t.underShopId) {
      undershops.set(t.underShopId, (undershops.get(t.underShopId) ?? 0) + 1);
    }
  }

  console.log(`\nUnique salesChannelId values (${salesChannels.size}):`);
  const sortedChannels = [...salesChannels.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, count] of sortedChannels) {
    console.log(`  ${id}  (${count} tickets)`);
  }

  console.log(`\nUnique underShopId values (${undershops.size}):`);
  const sortedShops = [...undershops.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, count] of sortedShops) {
    console.log(`  ${id}  (${count} tickets)`);
  }

  // 3. Cross-reference with the OTA spreadsheet sch_ IDs
  console.log('\n\n=== CROSS-REFERENCE WITH OTA SPREADSHEET ===\n');

  const spreadsheetSchIds: Record<string, string> = {
    'sch_692dff79dff0d30e74ca571d': 'ANI',
    'sch_685efca2ff8a3f539b6f7230': 'Expedia',
    'sch_68f7c2a92779d568939ef3e0': 'FunExpress',
    'sch_68640f34eb29e6f67cfd67d4': 'GetYourGuide',
    'sch_68c06dd445ae2b30cc55c145': 'Groupon',
    'sch_68f7c294291d810f638b32c8': 'Klook',
    'sch_6888ea86c0349dd36728dffb': 'Musement',
    'sch_686410a134f4166a6a46d84b': 'Tiqets',
    'sch_689f8977deff98895dddbf41': 'Tripster',
    'sch_6883b519eb54c3c058a073c2': 'Viator',
  };

  for (const [schId, name] of Object.entries(spreadsheetSchIds)) {
    // sch_ IDs might map to salesChannelId
    const asChannel = salesChannels.has(schId);
    // or they might be embedded in underShopId somehow
    const asUndershop = undershops.has(schId);
    // also try without the sch_ prefix
    const rawId = schId.replace('sch_', '');
    const rawAsChannel = salesChannels.has(rawId);
    const rawAsUndershop = undershops.has(rawId);

    const found: string[] = [];
    if (asChannel) found.push(`salesChannelId (${salesChannels.get(schId)} tickets)`);
    if (asUndershop) found.push(`underShopId (${undershops.get(schId)} tickets)`);
    if (rawAsChannel) found.push(`salesChannelId without sch_ prefix (${salesChannels.get(rawId)} tickets)`);
    if (rawAsUndershop) found.push(`underShopId without sch_ prefix (${undershops.get(rawId)} tickets)`);

    console.log(`  ${name.padEnd(20)} ${schId}`);
    if (found.length > 0) {
      console.log(`    FOUND: ${found.join(', ')}`);
    } else {
      console.log('    NOT FOUND in recent ticket data');
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
