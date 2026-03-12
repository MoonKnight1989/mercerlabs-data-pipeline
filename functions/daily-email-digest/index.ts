import * as ff from '@google-cloud/functions-framework';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildDigestPayload } from './bq-queries';
import { generateNarrative, buildFallbackNarrative } from './claude-client';
import { sendDigestEmail } from './email-sender';

const GCP_PROJECT = 'mercer-labs-488707';

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

interface EmailConfig {
  daily_digest_recipients: string[];
  alert_recipients: string[];
}

function loadEmailConfig(): EmailConfig {
  const configPath = join(__dirname, '..', 'config', 'email-recipients.json');
  const raw = readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as EmailConfig;
}

function loadSystemPrompt(): string {
  const promptPath = join(__dirname, '..', 'config', 'email-digest-system-prompt.txt');
  return readFileSync(promptPath, 'utf-8');
}

ff.http('dailyEmailDigest', async (_req, res) => {
  console.log('[daily-email-digest] Starting daily email digest');
  const startTime = Date.now();

  try {
    // Build data payload from BigQuery
    const payload = await buildDigestPayload();

    if (payload.yesterday.tickets_sold === 0 && payload.yesterday.total_checkins === 0) {
      console.warn('[daily-email-digest] No data for yesterday. Pipeline may have failed.');
    }

    // Get secrets
    const [claudeApiKey, sendgridApiKey] = await Promise.all([
      getSecret('claude-api-key'),
      getSecret('sendgrid-api-key'),
    ]);

    // Generate narrative via Claude API (with fallback)
    let narrative: string;
    try {
      const systemPrompt = loadSystemPrompt();
      narrative = await generateNarrative(claudeApiKey, systemPrompt, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[daily-email-digest] Claude API failed, using fallback: ${message}`
      );
      narrative = buildFallbackNarrative(payload);
    }

    // Send email
    const config = loadEmailConfig();
    await sendDigestEmail({
      sendgridApiKey,
      to: config.daily_digest_recipients,
      reportDate: payload.report_date,
      dayOfWeek: payload.day_of_week,
      narrative,
    });

    const duration = Date.now() - startTime;
    console.log(`[daily-email-digest] Complete in ${duration}ms`);
    res.status(200).json({ success: true, duration_ms: duration });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daily-email-digest] Fatal error: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});
