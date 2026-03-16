import * as ff from '@google-cloud/functions-framework';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { fetchDailyMetrics } from './metrics-query';
import { buildSlackMessage } from './message-builder';

const GCP_PROJECT = 'mercer-labs-488707';

async function getSecret(secretName: string): Promise<string> {
  const client = new SecretManagerServiceClient();
  const [version] = await client.accessSecretVersion({
    name: `projects/${GCP_PROJECT}/secrets/${secretName}/versions/latest`,
  });
  const payload = version.payload?.data;
  if (!payload) throw new Error(`Secret ${secretName} has no payload`);
  return typeof payload === 'string' ? payload : payload.toString();
}

async function postToSlack(webhookUrl: string, message: object): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${await res.text()}`);
  }
}

ff.http('dailySlackSummary', async (_req, res) => {
  const startTime = Date.now();

  try {
    console.log('[daily-slack-summary] Starting daily Slack summary');

    const metrics = await fetchDailyMetrics();

    console.log(
      `[daily-slack-summary] Yesterday: ${metrics.ticketsSold} tickets, ` +
        `${metrics.redemptions} redemptions, gross ${metrics.grossRevenue}`
    );

    const slackMessage = buildSlackMessage(metrics);

    const webhookUrl = await getSecret('slack-webhook-url-mercer');
    await postToSlack(webhookUrl, slackMessage);

    const duration = Date.now() - startTime;
    console.log(`[daily-slack-summary] Posted to Slack in ${duration}ms`);

    res.status(200).json({
      status: 'ok',
      tickets_sold: metrics.ticketsSold,
      gross_revenue: metrics.grossRevenue,
      net_revenue: metrics.netRevenue,
      duration_ms: duration,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daily-slack-summary] Error: ${message}`);
    res.status(500).json({ error: message });
  }
});
