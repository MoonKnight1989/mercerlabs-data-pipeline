/**
 * Pricing validation script
 *
 * Pulls a sample of recent tickets from Vivenu and checks whether
 * secret shop / undershop pricing is overriding the gross (customer-facing)
 * price. If realPrice differs by undershop for the same ticketTypeId,
 * the secret shop is modifying the price and our commission logic needs
 * to use regularPrice (or a different field) as the gross amount.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/validate-pricing.ts
 */

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

const TICKETS_URL = 'https://vivenu.com/api/tickets';
const TRANSACTIONS_URL = 'https://vivenu.com/api/transactions';
const PAGE_SIZE = 500;

interface TicketSample {
  _id: string;
  transactionId: string;
  ticketTypeId: string;
  ticketName: string;
  categoryName: string;
  realPrice: number;
  regularPrice: number;
  underShopId: string | null;
  eventId: string;
  createdAt: string;
}

interface TransactionSample {
  _id: string;
  realPrice: number;
  regularPrice: number;
  underShop: string | null;
  tickets: Array<{
    name: string;
    amount: number;
    price: number;
    netPrice: number;
    ticketTypeId: string;
  }>;
}

async function fetchPage<T>(
  baseUrl: string,
  skip: number,
  dateFilter: Record<string, string>
): Promise<{ docs: T[]; total: number }> {
  const params = new URLSearchParams({
    top: String(PAGE_SIZE),
    skip: String(skip),
    ...dateFilter,
  });

  const res = await fetch(`${baseUrl}?${params}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText} — ${await res.text()}`);
  }

  const data = await res.json();
  // Tickets use "rows", transactions use "docs"
  const items = data.rows ?? data.docs ?? [];
  return { docs: items, total: data.total };
}

async function fetchAll<T>(
  baseUrl: string,
  dateFilter: Record<string, string>
): Promise<T[]> {
  const all: T[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await fetchPage<T>(baseUrl, skip, dateFilter);
    all.push(...page.docs);
    skip += page.docs.length;
    hasMore = skip < page.total;
    process.stdout.write(`\r  Fetched ${all.length}/${page.total}`);
  }
  console.log();
  return all;
}

function buildDateFilter(daysBack: number): Record<string, string> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

// ============================================================
// Analysis
// ============================================================

function analyseTicketPricing(tickets: TicketSample[]) {
  console.log('\n========================================');
  console.log('TICKET-LEVEL PRICING ANALYSIS');
  console.log('========================================\n');

  // Group by ticketTypeId
  const byType = new Map<string, TicketSample[]>();
  for (const t of tickets) {
    const key = t.ticketTypeId;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(t);
  }

  console.log(`Total tickets: ${tickets.length}`);
  console.log(`Unique ticket types: ${byType.size}\n`);

  // For each ticket type, check if realPrice varies by undershop
  let foundVariance = false;

  for (const [typeId, typeTickets] of byType) {
    const name = typeTickets[0]!.ticketName;
    const byShop = new Map<string, { realPrices: Set<number>; regularPrices: Set<number>; count: number }>();

    for (const t of typeTickets) {
      const shop = t.underShopId ?? 'DIRECT (no undershop)';
      if (!byShop.has(shop)) {
        byShop.set(shop, { realPrices: new Set(), regularPrices: new Set(), count: 0 });
      }
      const entry = byShop.get(shop)!;
      entry.realPrices.add(t.realPrice);
      entry.regularPrices.add(t.regularPrice);
      entry.count++;
    }

    // Check if realPrice differs across shops for this type
    const allRealPrices = new Set<number>();
    for (const entry of byShop.values()) {
      for (const p of entry.realPrices) allRealPrices.add(p);
    }

    if (allRealPrices.size > 1 && byShop.size > 1) {
      foundVariance = true;
      console.log(`⚠️  PRICE VARIANCE: "${name}" (${typeId})`);
      for (const [shop, data] of byShop) {
        const realArr = [...data.realPrices].sort((a, b) => a - b);
        const regArr = [...data.regularPrices].sort((a, b) => a - b);
        console.log(
          `   ${shop.substring(0, 30).padEnd(30)} | real: ${realArr.join(', ').padEnd(20)} | regular: ${regArr.join(', ').padEnd(20)} | count: ${data.count}`
        );
      }
      console.log();
    }
  }

  if (!foundVariance) {
    console.log('No price variance detected across undershops for same ticket types.');
    console.log('realPrice appears consistent — secret shop may NOT be overriding prices.\n');
  }

  // Summary table: all undershops with avg prices
  console.log('----------------------------------------');
  console.log('UNDERSHOP PRICE SUMMARY');
  console.log('----------------------------------------\n');

  const byShopAll = new Map<string, { realPrices: number[]; regularPrices: number[]; count: number }>();
  for (const t of tickets) {
    const shop = t.underShopId ?? 'DIRECT';
    if (!byShopAll.has(shop)) {
      byShopAll.set(shop, { realPrices: [], regularPrices: [], count: 0 });
    }
    const entry = byShopAll.get(shop)!;
    entry.realPrices.push(t.realPrice);
    entry.regularPrices.push(t.regularPrice);
    entry.count++;
  }

  const sorted = [...byShopAll.entries()].sort((a, b) => b[1].count - a[1].count);
  console.log(
    'Undershop ID'.padEnd(30) +
      ' | Tickets'.padEnd(10) +
      ' | Avg Real'.padEnd(12) +
      ' | Avg Regular'.padEnd(14) +
      ' | Diff%'
  );
  console.log('-'.repeat(80));

  for (const [shop, data] of sorted) {
    const avgReal = data.realPrices.reduce((a, b) => a + b, 0) / data.count;
    const avgReg = data.regularPrices.reduce((a, b) => a + b, 0) / data.count;
    const diffPct = avgReg > 0 ? ((avgReg - avgReal) / avgReg) * 100 : 0;
    console.log(
      `${shop.substring(0, 28).padEnd(30)} | ${String(data.count).padEnd(8)} | $${avgReal.toFixed(2).padEnd(10)} | $${avgReg.toFixed(2).padEnd(12)} | ${diffPct.toFixed(1)}%`
    );
  }
}

function analyseTransactionPricing(transactions: TransactionSample[]) {
  console.log('\n\n========================================');
  console.log('TRANSACTION-LEVEL PRICING ANALYSIS');
  console.log('========================================\n');

  console.log(`Total transactions: ${transactions.length}\n`);

  // Check the line-item level: price vs netPrice
  console.log('Line-item price vs netPrice (per undershop):');
  console.log('-'.repeat(90));

  const byShop = new Map<
    string,
    { txCount: number; lineItems: Array<{ name: string; price: number; netPrice: number; amount: number }> }
  >();

  for (const tx of transactions) {
    const shop = tx.underShop ?? 'DIRECT';
    if (!byShop.has(shop)) byShop.set(shop, { txCount: 0, lineItems: [] });
    const entry = byShop.get(shop)!;
    entry.txCount++;
    for (const li of tx.tickets) {
      entry.lineItems.push({
        name: li.name,
        price: li.price,
        netPrice: li.netPrice,
        amount: li.amount,
      });
    }
  }

  for (const [shop, data] of byShop) {
    console.log(`\n  ${shop} (${data.txCount} transactions, ${data.lineItems.length} line items)`);

    // Show a few sample line items
    const samples = data.lineItems.slice(0, 5);
    for (const li of samples) {
      const diff = li.price - li.netPrice;
      const diffPct = li.price > 0 ? (diff / li.price) * 100 : 0;
      console.log(
        `    "${li.name}" x${li.amount} | price: $${li.price.toFixed(2)} | netPrice: $${li.netPrice.toFixed(2)} | diff: $${diff.toFixed(2)} (${diffPct.toFixed(1)}%)`
      );
    }
    if (data.lineItems.length > 5) {
      console.log(`    ... and ${data.lineItems.length - 5} more`);
    }
  }

  // Key diagnostic: compare transaction realPrice vs regularPrice by shop
  console.log('\n\nTransaction-level realPrice vs regularPrice:');
  console.log('-'.repeat(80));
  console.log(
    'Undershop'.padEnd(30) +
      ' | Txns'.padEnd(8) +
      ' | Avg Real'.padEnd(12) +
      ' | Avg Regular'.padEnd(14) +
      ' | Diff%'
  );
  console.log('-'.repeat(80));

  for (const [shop, data] of byShop) {
    const txsForShop = transactions.filter((tx) => (tx.underShop ?? 'DIRECT') === shop);
    const avgReal = txsForShop.reduce((s, tx) => s + tx.realPrice, 0) / txsForShop.length;
    const avgReg = txsForShop.reduce((s, tx) => s + tx.regularPrice, 0) / txsForShop.length;
    const diffPct = avgReg > 0 ? ((avgReg - avgReal) / avgReg) * 100 : 0;
    console.log(
      `${shop.substring(0, 28).padEnd(30)} | ${String(data.txCount).padEnd(6)} | $${avgReal.toFixed(2).padEnd(10)} | $${avgReg.toFixed(2).padEnd(12)} | ${diffPct.toFixed(1)}%`
    );
  }
}

function printDiagnosticSummary(tickets: TicketSample[], transactions: TransactionSample[]) {
  console.log('\n\n========================================');
  console.log('DIAGNOSTIC SUMMARY');
  console.log('========================================\n');

  // Check if realPrice == regularPrice for direct sales
  const directTickets = tickets.filter((t) => !t.underShopId);
  const directMatch = directTickets.filter((t) => t.realPrice === t.regularPrice).length;
  const directTotal = directTickets.length;

  console.log(`Direct sales (no undershop): ${directTotal} tickets`);
  console.log(`  realPrice == regularPrice: ${directMatch}/${directTotal} (${directTotal > 0 ? ((directMatch / directTotal) * 100).toFixed(1) : 0}%)`);

  // Check OTA tickets
  const otaTickets = tickets.filter((t) => t.underShopId);
  const otaMatch = otaTickets.filter((t) => t.realPrice === t.regularPrice).length;
  const otaTotal = otaTickets.length;

  console.log(`\nOTA/undershop sales: ${otaTotal} tickets`);
  console.log(`  realPrice == regularPrice: ${otaMatch}/${otaTotal} (${otaTotal > 0 ? ((otaMatch / otaTotal) * 100).toFixed(1) : 0}%)`);

  const otaDifferent = otaTickets.filter((t) => t.realPrice !== t.regularPrice);
  if (otaDifferent.length > 0) {
    console.log(`\n  ⚠️  ${otaDifferent.length} OTA tickets have realPrice != regularPrice`);
    console.log('  This suggests secret shop IS modifying prices. Sample:');
    for (const t of otaDifferent.slice(0, 5)) {
      console.log(
        `    ${t.underShopId?.substring(0, 24)} | real: $${t.realPrice} | regular: $${t.regularPrice} | diff: $${(t.regularPrice - t.realPrice).toFixed(2)}`
      );
    }
  }

  // Key conclusion
  console.log('\n----------------------------------------');
  console.log('CONCLUSION:');
  console.log('----------------------------------------');

  const anyDirectDiff = directTickets.some((t) => t.realPrice !== t.regularPrice);
  const anyOtaDiff = otaDifferent.length > 0;

  if (!anyOtaDiff && !anyDirectDiff) {
    console.log('realPrice == regularPrice across ALL channels.');
    console.log('Secret shop does NOT appear to be modifying base prices.');
    console.log('Safe to use realPrice as the gross amount for commission calculation.');
  } else if (anyOtaDiff && !anyDirectDiff) {
    console.log('realPrice DIFFERS from regularPrice for OTA undershops ONLY.');
    console.log('Secret shop IS modifying OTA prices — likely setting net amounts.');
    console.log('');
    console.log('ACTION NEEDED: Use regularPrice as the gross amount instead of realPrice,');
    console.log('or determine the actual customer-facing price another way.');
    console.log('realPrice for OTAs is likely already NET of commission.');
  } else if (anyDirectDiff) {
    console.log('realPrice differs from regularPrice even for direct sales.');
    console.log('This could be discounts, coupons, or dynamic pricing.');
    console.log('Investigate further before deciding which field = gross amount.');
  }

  // Check transaction line items for clues
  console.log('\n----------------------------------------');
  console.log('TRANSACTION LINE-ITEM CHECK:');
  console.log('----------------------------------------');

  let lineItemsWithNetDiff = 0;
  let totalLineItems = 0;
  for (const tx of transactions) {
    for (const li of tx.tickets) {
      totalLineItems++;
      if (li.price !== li.netPrice) lineItemsWithNetDiff++;
    }
  }
  console.log(`Line items where price != netPrice: ${lineItemsWithNetDiff}/${totalLineItems}`);
  console.log('(If price == netPrice and taxRate == 0, netPrice is not tax-related)');
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('Vivenu Pricing Validation');
  console.log('=========================\n');
  console.log('Checking if secret shop / undershop pricing overrides the gross price...\n');

  const dateFilter = buildDateFilter(30); // last 30 days

  console.log('Fetching tickets (last 30 days)...');
  const tickets = await fetchAll<TicketSample>(TICKETS_URL, dateFilter);

  console.log('Fetching transactions (last 30 days)...');
  const transactions = await fetchAll<TransactionSample>(TRANSACTIONS_URL, dateFilter);

  analyseTicketPricing(tickets);
  analyseTransactionPricing(transactions);
  printDiagnosticSummary(tickets, transactions);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
