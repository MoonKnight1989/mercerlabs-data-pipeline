/**
 * Check what fields exist alongside salesChannelId on tickets.
 * Grab one ticket per sales channel and dump all its fields.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/check-channel-fields.ts
 */

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

async function main() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  // Grab a batch of tickets
  const params = new URLSearchParams({
    top: '500',
    skip: '0',
    start: start.toISOString(),
    end: end.toISOString(),
  });

  const res = await fetch(`https://vivenu.com/api/tickets?${params}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const data = await res.json();
  const tickets = data.rows ?? [];

  // Get one sample per salesChannelId
  const seen = new Map<string, any>();
  for (const t of tickets) {
    const ch = t.salesChannelId ?? '(none)';
    if (!seen.has(ch)) seen.set(ch, t);
  }

  console.log('=== SAMPLE TICKET PER SALES CHANNEL ===\n');
  console.log('Looking for any channel name/label fields...\n');

  for (const [channel, ticket] of seen) {
    console.log(`--- salesChannelId: ${channel} ---`);

    // Check for any field that might contain a channel name
    const interesting = [
      'salesChannelId', 'salesChannelName', 'salesChannel',
      'underShopId', 'underShopName', 'underShop',
      'channelName', 'channel', 'shopName', 'shop',
      'origin', 'source', 'sourceName',
    ];

    for (const field of interesting) {
      if (ticket[field] !== undefined) {
        console.log(`  ${field}: ${JSON.stringify(ticket[field])}`);
      }
    }

    // Also dump ALL top-level keys so we don't miss anything
    const allKeys = Object.keys(ticket).sort();
    const unknown = allKeys.filter(k => !['_id','transactionId','barcode','secret','customerId',
      'name','firstname','lastname','email','eventId','rootEventId','ticketTypeId','ticketName',
      'categoryName','categoryRef','realPrice','regularPrice','currency','status','type',
      'deliveryType','cartItemId','checkoutId','checkoutItemId','triggeredBy','origin',
      'salesChannelId','underShopId','sellerId','slotId','slotStartTime','addOns',
      'personalized','claimed','expired','entryPermissions','capabilities','history',
      'createdAt','updatedAt','street','city','state','country','postal','posId','company',
      '__v','id'].includes(k));

    if (unknown.length > 0) {
      console.log(`  EXTRA FIELDS: ${unknown.join(', ')}`);
      for (const k of unknown) {
        console.log(`    ${k}: ${JSON.stringify(ticket[k])}`);
      }
    }
    console.log();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
