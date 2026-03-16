import * as ff from '@google-cloud/functions-framework';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { checkCloudFunctions, checkBQTransfers } from './status-checker';
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

ff.http('pipelineMonitor', async (_req, res) => {
  try {
    console.log('[pipeline-monitor] Starting daily pipeline check');

    const [functionResults, transferResults] = await Promise.all([
      checkCloudFunctions(),
      checkBQTransfers(),
    ]);

    const allResults = [...functionResults, ...transferResults];
    const failures = allResults.filter((r) => r.status === 'FAILED');

    const slackMessage = buildSlackMessage(allResults, failures.length);

    const webhookUrl = await getSecret('slack-webhook-url');
    await postToSlack(webhookUrl, slackMessage);

    console.log(
      `[pipeline-monitor] Posted summary: ${allResults.length} jobs, ${failures.length} failures`
    );

    res.status(200).json({
      status: 'ok',
      jobs_checked: allResults.length,
      failures: failures.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pipeline-monitor] Error: ${message}`);
    res.status(500).json({ error: message });
  }
});
