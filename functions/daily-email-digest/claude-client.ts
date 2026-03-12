import type { EmailDigestPayload } from './types';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

interface ClaudeMessage {
  role: string;
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

export async function generateNarrative(
  apiKey: string,
  systemPrompt: string,
  payload: EmailDigestPayload
): Promise<string> {
  const userMessage = `Generate the daily briefing email for this data:\n\n${JSON.stringify(payload, null, 2)}`;

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }] satisfies ClaudeMessage[],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as ClaudeResponse;
    const textContent = data.content.find((c) => c.type === 'text');
    if (!textContent) {
      throw new Error('Claude API returned no text content');
    }

    console.log('[claude-client] Narrative generated successfully');
    return textContent.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[claude-client] Failed to generate narrative: ${message}`);
    throw error;
  }
}

export function buildFallbackNarrative(payload: EmailDigestPayload): string {
  const y = payload.yesterday;
  const lines = [
    `<strong>Net Revenue: $${y.net_revenue.toLocaleString()}</strong>`,
    `Gross Revenue: $${y.gross_revenue.toLocaleString()}`,
    `Commission: $${y.commission_total.toLocaleString()}`,
    `Tickets Sold: ${y.tickets_sold.toLocaleString()}`,
    `Orders: ${y.orders.toLocaleString()}`,
    `Check-ins: ${y.total_checkins.toLocaleString()} (${y.paid_checkins.toLocaleString()} paid, ${y.comp_checkins.toLocaleString()} comp)`,
    '',
    '<strong>Top Channels:</strong>',
  ];

  for (const ch of y.channels.slice(0, 5)) {
    lines.push(`- ${ch.name}: $${ch.net_revenue.toLocaleString()} (${ch.tickets} tickets)`);
  }

  if (payload.same_day_last_week) {
    const diff = y.net_revenue - payload.same_day_last_week.net_revenue;
    const pct = ((diff / payload.same_day_last_week.net_revenue) * 100).toFixed(1);
    lines.push('', `vs Same Day Last Week: ${diff >= 0 ? '+' : ''}${pct}%`);
  }

  if (payload.alerts.unknown_channels.length > 0) {
    lines.push(
      '',
      `<strong>Action needed:</strong> ${payload.alerts.unknown_channels.length} unknown sales channel(s) detected.`
    );
  }

  return lines.join('<br>');
}
