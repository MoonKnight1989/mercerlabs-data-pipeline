import type { DailyMetrics } from './metrics-query';

const GREEN = '#2EB67D';
const RED = '#E01E5A';
const GREY = '#888888';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pctChange(current: number, previous: number | null): { text: string; color: string } | null {
  if (previous == null || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const arrow = pct >= 0 ? '\u2191' : '\u2193';
  const sign = pct >= 0 ? '+' : '';
  return {
    text: `${arrow}${sign}${pct.toFixed(1)}%`,
    color: pct >= 0 ? GREEN : RED,
  };
}

function metricLine(
  label: string,
  value: string,
  current: number,
  previous: number | null
): { text: string; color: string } {
  const change = pctChange(current, previous);
  if (change) {
    return {
      text: `*${label}*  ${value}  ${change.text}`,
      color: change.color,
    };
  }
  return {
    text: `*${label}*  ${value}`,
    color: GREY,
  };
}

export function buildSlackMessage(metrics: DailyMetrics): object {
  const lines = [
    metricLine('Tickets Sold', fmt(metrics.ticketsSold), metrics.ticketsSold, metrics.prevTicketsSold),
    metricLine('Redemptions', fmt(metrics.redemptions), metrics.redemptions, metrics.prevRedemptions),
    metricLine('Gross Revenue', fmtCurrency(metrics.grossRevenue), metrics.grossRevenue, metrics.prevGrossRevenue),
    metricLine('Net Revenue', fmtCurrency(metrics.netRevenue), metrics.netRevenue, metrics.prevNetRevenue),
  ];

  // Build attachments: each metric gets its own color-coded bar
  const attachments = lines.map((line) => ({
    color: line.color,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: line.text,
        },
      },
    ],
  }));

  // Event breakdown section
  if (metrics.eventBreakdown.length > 0) {
    let eventText = '*By Show*\n';
    for (const ev of metrics.eventBreakdown) {
      eventText += `  ${ev.eventName}: ${fmt(ev.ticketsSold)} tickets \u00b7 ${fmtCurrency(ev.grossRevenue)}\n`;
    }
    attachments.push({
      color: '#36C5F0',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: eventText.trim(),
          },
        },
      ],
    });
  }

  // Channel breakdown section
  if (metrics.channelBreakdown.length > 0) {
    let channelText = '*By Channel*\n';
    for (const ch of metrics.channelBreakdown) {
      channelText += `  ${ch.channelGroup}: ${fmt(ch.ticketsSold)} tickets \u00b7 ${fmtCurrency(ch.grossRevenue)}\n`;
    }
    attachments.push({
      color: '#ECB22E',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: channelText.trim(),
          },
        },
      ],
    });
  }

  // Comparison context
  const comparisonText = metrics.prevTicketsSold != null
    ? `Comparing to same day last week \u00b7 ${metrics.reportDate}`
    : metrics.reportDate;

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Daily Sales Summary \u2014 Mercer Labs`,
          emoji: true,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: comparisonText,
          },
        ],
      },
    ],
    attachments,
  };
}
