import * as ff from '@google-cloud/functions-framework';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { randomUUID } from 'crypto';
import type { IngestionResult } from './types';
import { fetchTickets, fetchTransactions, fetchRecentScans, fetchEventById, fetchEvents } from './vivenu-client';
import { mergeTickets, mergeTransactions, mergeScans, findNewRootEvents, insertNewEvents, syncEventDates } from './bigquery-writer';
import { checkForUnknownChannels } from './channel-checker';

const GCP_PROJECT = 'mercer-labs-488707';

// Daily catch-up: 1-day window to pick up anything webhooks may have missed.
// Webhooks are the primary ingestion path — this is the safety net.
// Ticket types are seeded and maintained via event.created/updated webhooks.
const CATCHUP_WINDOW_DAYS = 1;

async function getSecret(secretName: string): Promise<string> {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${GCP_PROJECT}/secrets/${secretName}/versions/latest`,
  });
  const payload = version.payload?.data;
  if (!payload) {
    throw new Error(`Secret ${secretName} has no payload`);
  }
  return typeof payload === 'string' ? payload : payload.toString();
}

async function runCatchup(): Promise<IngestionResult> {
  const startTime = Date.now();
  const batchId = randomUUID();
  const errors: string[] = [];

  console.log(`[vivenu-ingest] Starting daily catch-up batch ${batchId}`);

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - CATCHUP_WINDOW_DAYS);

  const apiKey = await getSecret('vivenu-api-key');
  const fetchOpts = { apiKey, startDate, endDate };

  // Fetch tickets, transactions, and recent scans.
  // Scans: Portier API has no date filter, so we fetch the most recent pages
  // (10 pages = 10K scans ≈ 2-3 days) and MERGE handles dedup.
  // Ticket types: already seeded, maintained via event webhooks
  const [tickets, transactions, scans] = await Promise.all([
    fetchTickets(fetchOpts),
    fetchTransactions(fetchOpts),
    fetchRecentScans(apiKey),
  ]);

  console.log(
    `[vivenu-ingest] Fetched ${tickets.length} tickets, ${transactions.length} transactions, ${scans.length} scans`
  );

  // MERGE raw data in parallel
  const [ticketResult, txResult, scanResult] = await Promise.all([
    mergeTickets(tickets, batchId),
    mergeTransactions(transactions, batchId),
    mergeScans(scans, batchId),
  ]);

  // Auto-sync: detect new root events and register in reference.events
  let newEventsCount = 0;
  try {
    const missingEventIds = await findNewRootEvents();
    if (missingEventIds.length > 0) {
      console.log(`[vivenu-ingest] Found ${missingEventIds.length} new root event(s): ${missingEventIds.join(', ')}`);
      const newEvents = await Promise.all(
        missingEventIds.map((id) => fetchEventById(apiKey, id))
      );
      newEventsCount = await insertNewEvents(newEvents);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[vivenu-ingest] Event sync failed (non-fatal): ${msg}`);
    errors.push(`Event sync failed: ${msg}`);
  }

  // Sync all event dates into reference.event_dates (for true redemption rate)
  let eventDatesResult = { inserted: 0, updated: 0 };
  try {
    const allEvents = await fetchEvents(apiKey);
    eventDatesResult = await syncEventDates(allEvents);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[vivenu-ingest] Event dates sync failed (non-fatal): ${msg}`);
    errors.push(`Event dates sync failed: ${msg}`);
  }

  // Check for unknown sales channels
  const newUnknownChannels = await checkForUnknownChannels();
  if (newUnknownChannels.length > 0) {
    errors.push(
      `${newUnknownChannels.length} unknown sales channel(s) detected. Add to reference.partners.`
    );
  }

  const result: IngestionResult = {
    success: errors.length === 0 || errors.every((e) => e.includes('unknown')),
    batch_id: batchId,
    tickets_fetched: tickets.length,
    tickets_inserted: ticketResult.inserted,
    tickets_updated: ticketResult.updated,
    transactions_fetched: transactions.length,
    transactions_inserted: txResult.inserted,
    transactions_updated: txResult.updated,
    scans_fetched: scans.length,
    scans_inserted: scanResult.inserted,
    scans_updated: scanResult.updated,
    ticket_types_upserted: newEventsCount,
    new_unknown_channels: newUnknownChannels,
    errors,
    duration_ms: Date.now() - startTime,
  };

  console.log(
    `[vivenu-ingest] Complete: tickets(+${result.tickets_inserted}/~${result.tickets_updated}), ` +
      `transactions(+${result.transactions_inserted}/~${result.transactions_updated}), ` +
      `scans(+${result.scans_inserted}/~${result.scans_updated}), ` +
      `event_dates(+${eventDatesResult.inserted}/~${eventDatesResult.updated}), ` +
      `${result.new_unknown_channels.length} new channels, ${result.duration_ms}ms`
  );

  return result;
}

ff.http('vivenuIngest', async (_req, res) => {
  try {
    const result = await runCatchup();
    res.status(result.success ? 200 : 207).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[vivenu-ingest] Fatal error: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});
