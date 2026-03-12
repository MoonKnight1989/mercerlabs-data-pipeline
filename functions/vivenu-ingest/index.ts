import * as ff from '@google-cloud/functions-framework';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { randomUUID } from 'crypto';
import type { IngestionResult } from './types';
import { fetchTickets, fetchTransactions } from './vivenu-client';
import { mergeTickets, mergeTransactions } from './bigquery-writer';
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

  // Fetch tickets and transactions only.
  // Scans: handled by scan.created webhook (Portier API has no date filter)
  // Ticket types: already seeded, maintained via event webhooks
  const [tickets, transactions] = await Promise.all([
    fetchTickets(fetchOpts),
    fetchTransactions(fetchOpts),
  ]);

  console.log(
    `[vivenu-ingest] Fetched ${tickets.length} tickets, ${transactions.length} transactions`
  );

  // MERGE raw data in parallel
  const [ticketResult, txResult] = await Promise.all([
    mergeTickets(tickets, batchId),
    mergeTransactions(transactions, batchId),
  ]);

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
    scans_fetched: 0,
    scans_inserted: 0,
    scans_updated: 0,
    ticket_types_upserted: 0,
    new_unknown_channels: newUnknownChannels,
    errors,
    duration_ms: Date.now() - startTime,
  };

  console.log(
    `[vivenu-ingest] Complete: tickets(+${result.tickets_inserted}/~${result.tickets_updated}), ` +
      `transactions(+${result.transactions_inserted}/~${result.transactions_updated}), ` +
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
