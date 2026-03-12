/**
 * Check for distributor IDs on tickets and explore the distributors API.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/check-distributors.ts
 */

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${API_KEY}` };

async function main() {
  // 1. Try /api/distributors endpoint
  console.log('=== TRYING /api/distributors ENDPOINT ===\n');
  for (const path of [
    'https://vivenu.com/api/distributors',
    'https://vivenu.com/api/distributors?top=100',
    'https://vivenu.com/api/distributor',
  ]) {
    const res = await fetch(path, { headers });
    console.log(`${path}: ${res.status} ${res.statusText}`);
    if (res.ok) {
      const data = await res.json();
      const items = data.rows ?? data.docs ?? (Array.isArray(data) ? data : [data]);
      console.log(`  Found ${items.length} items`);
      for (const item of items.slice(0, 30)) {
        console.log(`  ${item._id}  ${item.name ?? item.label ?? '(no name)'}  salesChannelId=${item.salesChannelId ?? '(none)'}`);
      }
    }
    console.log();
  }

  // 2. Check a sample of tickets for any distributor-related fields
  console.log('\n=== CHECKING TICKETS FOR DISTRIBUTOR FIELDS ===\n');
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  const params = new URLSearchParams({
    top: '500',
    skip: '0',
    start: start.toISOString(),
    end: end.toISOString(),
  });

  const res = await fetch(`https://vivenu.com/api/tickets?${params}`, { headers });
  const data = await res.json();
  const tickets = data.rows ?? [];

  // Look for any field containing "dist" in key or value
  const distFields = new Set<string>();
  for (const t of tickets) {
    for (const [key, val] of Object.entries(t)) {
      if (key.toLowerCase().includes('dist') ||
          (typeof val === 'string' && val.startsWith('dist_'))) {
        distFields.add(key);
        console.log(`  ticket ${t._id}: ${key} = ${JSON.stringify(val)}`);
      }
    }
  }

  if (distFields.size === 0) {
    console.log('  No distributor-related fields found on tickets');
  } else {
    console.log(`\n  Distributor fields found: ${[...distFields].join(', ')}`);
  }

  // 3. Also check transactions for distributor fields
  console.log('\n\n=== CHECKING TRANSACTIONS FOR DISTRIBUTOR FIELDS ===\n');
  const txRes = await fetch(`https://vivenu.com/api/transactions?${params}`, { headers });
  const txData = await txRes.json();
  const transactions = txData.docs ?? [];

  const txDistFields = new Set<string>();
  for (const tx of transactions) {
    for (const [key, val] of Object.entries(tx)) {
      if (key.toLowerCase().includes('dist') ||
          (typeof val === 'string' && val.startsWith('dist_'))) {
        txDistFields.add(key);
        if (txDistFields.size <= 10) {
          console.log(`  tx ${tx._id}: ${key} = ${JSON.stringify(val)}`);
        }
      }
    }
  }

  if (txDistFields.size === 0) {
    console.log('  No distributor-related fields found on transactions');
  } else {
    console.log(`\n  Distributor fields found: ${[...txDistFields].join(', ')}`);
  }

  // 4. Try fetching the ANI distributor directly
  console.log('\n\n=== TRYING DIRECT DISTRIBUTOR FETCH ===\n');
  const aniDistId = 'dist_692dff79dff0d30e74ca571f';
  for (const path of [
    `https://vivenu.com/api/distributors/${aniDistId}`,
    `https://vivenu.com/api/sales-channels/${aniDistId}`,
  ]) {
    const res = await fetch(path, { headers });
    console.log(`${path}: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
