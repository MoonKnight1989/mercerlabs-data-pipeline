import type { JobResult } from './status-checker';

function statusIcon(status: string): string {
  switch (status) {
    case 'OK':
      return ':white_check_mark:';
    case 'FAILED':
      return ':x:';
    case 'NO_RUN':
      return ':warning:';
    default:
      return ':grey_question:';
  }
}

function todayET(): string {
  return new Date().toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function buildSlackMessage(
  results: JobResult[],
  failureCount: number
): object {
  const dateStr = todayET();
  const allOk = failureCount === 0;

  const headerEmoji = allOk ? ':large_green_circle:' : ':red_circle:';
  const headerText = allOk
    ? `${headerEmoji}  Pipeline Daily Summary — ${dateStr}`
    : `${headerEmoji}  Pipeline Daily Summary — ${dateStr} — ${failureCount} failure${failureCount > 1 ? 's' : ''}`;

  // Group by type
  const functions = results.filter((r) => r.type === 'function');
  const transforms = results.filter((r) => r.type === 'transform');

  let body = '';

  if (functions.length > 0) {
    body += '*Ingestion Functions*\n';
    for (const r of functions) {
      body += `${statusIcon(r.status)}  *${r.name}*`;
      if (r.status === 'OK') {
        body += ` — ${r.detail}`;
      } else if (r.status === 'FAILED') {
        body += ` — FAILED`;
      } else {
        body += ` — ${r.detail}`;
      }
      body += '\n';
    }
    body += '\n';
  }

  if (transforms.length > 0) {
    body += '*Transforms*\n';
    for (const r of transforms) {
      body += `${statusIcon(r.status)}  *${r.name}*`;
      if (r.status === 'OK') {
        body += ` — ${r.detail}`;
      } else if (r.status === 'FAILED') {
        body += ` — FAILED`;
      } else {
        body += ` — ${r.detail}`;
      }
      body += '\n';
    }
    body += '\n';
  }

  // Error details section
  const failures = results.filter((r) => r.status === 'FAILED' && r.error);
  if (failures.length > 0) {
    body += '*Error Details*\n';
    for (const r of failures) {
      body += `> *${r.name}:* ${r.error}\n`;
    }
  }

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: allOk
            ? `Pipeline Daily Summary — ${dateStr}`
            : `Pipeline Summary — ${dateStr} — ${failureCount} failure${failureCount > 1 ? 's' : ''}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: body.trim(),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: allOk
              ? ':large_green_circle: All systems operational'
              : `:red_circle: ${failureCount} job${failureCount > 1 ? 's' : ''} need${failureCount === 1 ? 's' : ''} attention`,
          },
        ],
      },
    ],
  };
}
