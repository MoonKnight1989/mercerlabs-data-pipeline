/**
 * Fetch start dates for all child events referenced by tickets.
 * Outputs a CSV: event_id, event_name, event_date, parent_id
 * Then load into reference.event_dates for the tickets transform.
 *
 * Usage:
 *   VIVENU_API_KEY=<key> npx tsx scripts/fetch-event-dates.ts
 *   bq load --source_format=CSV --skip_leading_rows=1 --autodetect reference.event_dates config/event_dates.csv
 */

import { writeFileSync } from 'fs';

const API_KEY = process.env['VIVENU_API_KEY'];
if (!API_KEY) {
  console.error('Set VIVENU_API_KEY environment variable');
  process.exit(1);
}

const EVENTS_URL = 'https://vivenu.com/api/events';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

interface EventResponse {
  _id: string;
  name: string;
  start: string;
  end: string;
  parentId?: string;
}

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < retries) {
          const wait = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          console.log(`  Retry ${attempt + 1} after ${wait}ms (status ${res.status})`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
      }
      return res;
    } catch (err) {
      if (attempt < retries) {
        const wait = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.log(`  Retry ${attempt + 1} after ${wait}ms (network error)`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

async function fetchAllEvents(): Promise<EventResponse[]> {
  const all: EventResponse[] = [];
  let skip = 0;
  const PAGE_SIZE = 100;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      top: String(PAGE_SIZE),
      skip: String(skip),
    });

    const res = await fetchWithRetry(`${EVENTS_URL}?${params}`);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API ${res.status}: ${body}`);
    }

    const data = await res.json();
    const items: EventResponse[] = data.rows ?? data.docs ?? [];
    all.push(...items);
    skip += items.length;
    hasMore = items.length === PAGE_SIZE;

    process.stdout.write(`\r  Fetched ${all.length} events`);
  }
  console.log();
  return all;
}

function toDateString(isoString: string): string {
  // Extract just the date portion in ET (UTC-5)
  const d = new Date(isoString);
  // Vivenu times are typically in ET — the start time is the event date
  // Use UTC date since Vivenu stores event start as ~15:00 UTC = 10:00 ET
  return d.toISOString().split('T')[0];
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

async function main() {
  console.log('Fetching all events from Vivenu...\n');

  const events = await fetchAllEvents();
  console.log(`\nTotal events from API: ${events.length}`);

  // Build CSV
  const lines = ['event_id,event_name,event_date,event_start,event_end,parent_id'];

  let childCount = 0;
  let rootCount = 0;

  for (const ev of events) {
    const eventDate = toDateString(ev.start);
    const startStr = ev.start;
    const endStr = ev.end;
    const parentId = ev.parentId ?? '';

    lines.push(
      [
        ev._id,
        escapeCsv(ev.name),
        eventDate,
        startStr,
        endStr,
        parentId,
      ].join(',')
    );

    if (parentId) {
      childCount++;
    } else {
      rootCount++;
    }
  }

  const outPath = 'config/event_dates.csv';
  writeFileSync(outPath, lines.join('\n') + '\n');

  console.log(`\nWrote ${events.length} events to ${outPath}`);
  console.log(`  Root events: ${rootCount}`);
  console.log(`  Child events: ${childCount}`);

  // Show sample
  console.log('\nSample child events:');
  const children = events.filter((e) => e.parentId).slice(0, 5);
  for (const c of children) {
    console.log(`  ${c._id} | ${toDateString(c.start)} | ${c.name}`);
  }

  console.log(`\nNext steps:`);
  console.log(`  bq rm -f reference.event_dates`);
  console.log(`  bq load --source_format=CSV --skip_leading_rows=1 --autodetect reference.event_dates ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
