import * as ff from '@google-cloud/functions-framework';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { buildDigestPayload, queryRecipients } from './bq-queries';
import { buildEmailHtml } from './email-template';
import { sendEmail } from './email-sender';

const GCP_PROJECT = 'mercer-labs-488707';
const RECIPIENT_GROUP = 'board';

async function getSecret(secretName: string): Promise<string> {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${GCP_PROJECT}/secrets/${secretName}/versions/latest`,
  });
  const payload = version.payload?.data;
  if (!payload) throw new Error(`Secret ${secretName} has no payload`);
  return typeof payload === 'string' ? payload : payload.toString();
}

ff.http('dailyEmailDigest', async (_req, res) => {
  const startTime = Date.now();
  console.log('[daily-email-digest] Starting daily email digest');

  try {
    // Fetch data and recipients in parallel
    const [payload, recipients, fromEmail, saKeyJson] = await Promise.all([
      buildDigestPayload(),
      queryRecipients(RECIPIENT_GROUP),
      getSecret('email-digest-from-address'),
      getSecret('gmail-sa-key'),
    ]);

    if (recipients.length === 0) {
      console.warn('[daily-email-digest] No active recipients in group: ' + RECIPIENT_GROUP);
      res.status(200).json({ status: 'skipped', reason: 'no_recipients' });
      return;
    }

    if (payload.total_tickets_sold === 0 && payload.total_redemptions === 0) {
      console.warn('[daily-email-digest] No data for yesterday — pipeline may have failed');
    }

    const html = buildEmailHtml(payload);
    const toAddresses = recipients.map((r) => r.email);

    await sendEmail({
      serviceAccountKeyJson: saKeyJson,
      fromEmail,
      to: toAddresses,
      subject: `Mercer Labs \u2014 ${payload.day_of_week} Sales Report \u2014 ${payload.report_date}`,
      html,
    });

    const duration = Date.now() - startTime;
    console.log(`[daily-email-digest] Sent to ${toAddresses.length} recipient(s) in ${duration}ms`);

    res.status(200).json({
      status: 'ok',
      recipients: toAddresses.length,
      tickets_sold: payload.total_tickets_sold,
      net_revenue: payload.net_revenue,
      duration_ms: duration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daily-email-digest] Error: ${message}`);
    res.status(500).json({ error: message });
  }
});
