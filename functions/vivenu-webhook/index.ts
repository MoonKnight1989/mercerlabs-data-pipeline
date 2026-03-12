import * as ff from '@google-cloud/functions-framework';
import { createHmac } from 'crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { upsertTicket, upsertTransaction, insertScan, upsertTicketTypesFromEvent } from './bigquery-writer';

const GCP_PROJECT = 'mercer-labs-488707';

// Cache secrets for the lifetime of the instance
let webhookSecretCache: string | null = null;

async function getSecret(secretName: string): Promise<string> {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${GCP_PROJECT}/secrets/${secretName}/versions/latest`,
  });
  const payload = version.payload?.data;
  if (!payload) throw new Error(`Secret ${secretName} has no payload`);
  return typeof payload === 'string' ? payload : payload.toString();
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

// Vivenu webhook event types we handle
type EventType =
  | 'ticket.created'
  | 'ticket.updated'
  | 'transaction.complete'
  | 'transaction.canceled'
  | 'transaction.partiallyCanceled'
  | 'scan.created'
  | 'event.created'
  | 'event.updated';

const HANDLED_EVENTS = new Set<string>([
  'ticket.created',
  'ticket.updated',
  'transaction.complete',
  'transaction.canceled',
  'transaction.partiallyCanceled',
  'scan.created',
  'event.created',
  'event.updated',
]);

ff.http('vivenuWebhook', async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Verify HMAC signature
  const signature = req.headers['x-vivenu-signature'] as string | undefined;
  if (!signature) {
    console.warn('[webhook] Missing x-vivenu-signature header');
    res.status(401).json({ error: 'Missing signature' });
    return;
  }

  if (!webhookSecretCache) {
    webhookSecretCache = await getSecret('vivenu-webhook-secret');
  }

  const rawBody = JSON.stringify(req.body);
  if (!verifySignature(rawBody, signature, webhookSecretCache)) {
    console.warn('[webhook] Invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  // Vivenu webhook format: { type, data, id, sellerId, webhookId, mode }
  const eventType = req.body?.type as string | undefined;
  const data = req.body?.data as Record<string, unknown> | undefined;

  if (!eventType || !data) {
    console.warn(`[webhook] Missing type or data. Keys: ${JSON.stringify(Object.keys(req.body ?? {}))}`);
    res.status(400).json({ error: 'Missing type or data' });
    return;
  }

  // Acknowledge quickly for events we don't handle
  if (!HANDLED_EVENTS.has(eventType)) {
    console.log(`[webhook] Ignoring event: ${eventType}`);
    res.status(200).json({ status: 'ignored', event: eventType });
    return;
  }

  try {
    const event = eventType as EventType;

    switch (event) {
      case 'ticket.created':
      case 'ticket.updated':
        // data.ticket contains the ticket object
        await upsertTicket(data['ticket'] as Record<string, unknown>);
        break;

      case 'transaction.complete':
      case 'transaction.canceled':
      case 'transaction.partiallyCanceled':
        // data.transaction contains the transaction object
        await upsertTransaction(data['transaction'] as Record<string, unknown>);
        break;

      case 'scan.created':
        // data.scan or data itself contains the scan
        await insertScan((data['scan'] as Record<string, unknown>) ?? data);
        break;

      case 'event.created':
      case 'event.updated':
        // data.event or data itself contains the event
        await upsertTicketTypesFromEvent((data['event'] as Record<string, unknown>) ?? data);
        break;
    }

    console.log(`[webhook] Processed ${eventType}`);
    res.status(200).json({ status: 'processed', event: eventType });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[webhook] Error processing ${eventType}: ${message}`);
    res.status(500).json({ error: message });
  }
});
