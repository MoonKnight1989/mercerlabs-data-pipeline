import type { EmailDigestPayload } from './types';

// ── Formatting helpers ──────────────────────────────────────────────
function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtCurrency(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return n.toFixed(2) + '%';
}

function wowBadge(current: number, previous: number | null): string {
  if (previous == null || previous === 0) return '';
  const pct = ((current - previous) / previous) * 100;
  const arrow = pct >= 0 ? '\u2191' : '\u2193';
  const color = pct >= 0 ? '#2EB67D' : '#E01E5A';
  const sign = pct >= 0 ? '+' : '';
  return `<span style="color:${color};font-size:12px;margin-left:6px;">${arrow}${sign}${pct.toFixed(1)}% WoW</span>`;
}

// ── Styles ──────────────────────────────────────────────────────────
const FONT = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;`;
const TABLE_STYLE = `width:100%;border-collapse:collapse;margin-bottom:24px;`;
const HEADER_CELL = `background-color:#D4EDDA;padding:10px 14px;text-align:left;font-weight:600;font-size:13px;border:1px solid #C3E6CB;`;
const HEADER_CELL_R = `${HEADER_CELL}text-align:right;`;
const DATA_CELL = `padding:10px 14px;text-align:left;font-size:13px;border-bottom:1px solid #EEE;`;
const DATA_CELL_R = `${DATA_CELL}text-align:right;`;
const SECTION_TITLE = `font-size:15px;font-weight:700;margin:24px 0 8px 0;color:#333;`;

// ── Template ────────────────────────────────────────────────────────
export function buildEmailHtml(data: EmailDigestPayload): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F5F5F5;${FONT}">
<div style="max-width:680px;margin:0 auto;padding:24px;">

  <!-- Header -->
  <div style="background-color:#1A1A2E;color:#FFFFFF;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;font-weight:600;">Mercer Labs \u2014 Daily Sales Report</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#AAAACC;">${data.report_date}</p>
  </div>

  <div style="background-color:#FFFFFF;padding:24px;border-radius:0 0 8px 8px;border:1px solid #E0E0E0;border-top:none;">

    <!-- Ticket Sales + NET Revenue -->
    <p style="${SECTION_TITLE}">Ticket Sales + NET Revenue</p>
    <table style="${TABLE_STYLE}">
      <tr>
        <th style="${HEADER_CELL}">Total Tickets Sold</th>
        <th style="${HEADER_CELL_R}">NET Revenue</th>
        <th style="${HEADER_CELL_R}">Retail NET Revenue</th>
        <th style="${HEADER_CELL_R}">Total NET Revenue</th>
      </tr>
      <tr>
        <td style="${DATA_CELL}">
          ${fmtNum(data.total_tickets_sold)}
          ${wowBadge(data.total_tickets_sold, data.prev_tickets_sold)}
        </td>
        <td style="${DATA_CELL_R}">
          ${fmtCurrency(data.net_revenue)}
          ${wowBadge(data.net_revenue, data.prev_net_revenue)}
        </td>
        <td style="${DATA_CELL_R}">${fmtCurrency(data.retail_net_revenue)}</td>
        <td style="${DATA_CELL_R}"><strong>${fmtCurrency(data.total_net_revenue)}</strong></td>
      </tr>
    </table>

    <!-- Gross Revenue + Redemptions (improvement over screenshot) -->
    <table style="${TABLE_STYLE}">
      <tr>
        <th style="${HEADER_CELL}">Gross Revenue</th>
        <th style="${HEADER_CELL_R}">Redemptions</th>
        <th style="${HEADER_CELL_R}">Orders</th>
        <th style="${HEADER_CELL_R}">Comp Tickets</th>
      </tr>
      <tr>
        <td style="${DATA_CELL}">
          ${fmtCurrency(data.gross_revenue)}
          ${wowBadge(data.gross_revenue, data.prev_gross_revenue)}
        </td>
        <td style="${DATA_CELL_R}">
          ${fmtNum(data.total_redemptions)}
          ${wowBadge(data.total_redemptions, data.prev_redemptions)}
        </td>
        <td style="${DATA_CELL_R}">${fmtNum(data.orders)}</td>
        <td style="${DATA_CELL_R}">${fmtNum(data.comp_tickets)}</td>
      </tr>
    </table>

    <!-- Sales by Event -->
    ${data.events.length > 0 ? `
    <p style="${SECTION_TITLE}">Sales by Event</p>
    <table style="${TABLE_STYLE}">
      <tr>
        <th style="${HEADER_CELL}">Event</th>
        <th style="${HEADER_CELL_R}">Tickets Sold</th>
        <th style="${HEADER_CELL_R}">NET Revenue</th>
        <th style="${HEADER_CELL_R}">% of Total</th>
      </tr>
      ${data.events.map((ev) => `
      <tr>
        <td style="${DATA_CELL}">${ev.event_name}</td>
        <td style="${DATA_CELL_R}">${fmtNum(ev.tickets_sold)}</td>
        <td style="${DATA_CELL_R}">${fmtCurrency(ev.net_revenue)}</td>
        <td style="${DATA_CELL_R}">${fmtPct(ev.pct_of_total)}</td>
      </tr>`).join('')}
    </table>
    ` : ''}

    <!-- Sales by Channel -->
    ${data.channels.length > 0 ? `
    <p style="${SECTION_TITLE}">Sales by Channel</p>
    <table style="${TABLE_STYLE}">
      <tr>
        <th style="${HEADER_CELL}">Channel</th>
        <th style="${HEADER_CELL_R}">Tickets Sold</th>
        <th style="${HEADER_CELL_R}">NET Revenue</th>
        <th style="${HEADER_CELL_R}">% of Total</th>
      </tr>
      ${data.channels.map((ch) => `
      <tr>
        <td style="${DATA_CELL}">${ch.channel}</td>
        <td style="${DATA_CELL_R}">${fmtNum(ch.tickets_sold)}</td>
        <td style="${DATA_CELL_R}">${fmtCurrency(ch.net_revenue)}</td>
        <td style="${DATA_CELL_R}">${fmtPct(ch.pct_of_total)}</td>
      </tr>`).join('')}
    </table>
    ` : ''}

    <!-- Additional Categories -->
    <p style="${SECTION_TITLE}">Sales by Additional Category</p>
    <table style="${TABLE_STYLE}">
      <tr>
        <th style="${HEADER_CELL}">Category</th>
        <th style="${HEADER_CELL_R}">Tickets Sold</th>
        <th style="${HEADER_CELL_R}">NET Revenue</th>
      </tr>
      <tr>
        <td style="${DATA_CELL}">Gift Cards</td>
        <td style="${DATA_CELL_R}">${fmtNum(data.gift_card_tickets)}</td>
        <td style="${DATA_CELL_R}">${fmtCurrency(data.gift_card_revenue)}</td>
      </tr>
      <tr>
        <td style="${DATA_CELL}">Group Sales</td>
        <td style="${DATA_CELL_R}">${fmtNum(data.group_tickets)}</td>
        <td style="${DATA_CELL_R}">${fmtCurrency(data.group_revenue)}</td>
      </tr>
    </table>

    <!-- Footer -->
    <hr style="border:none;border-top:1px solid #EEE;margin:24px 0 12px;">
    <p style="font-size:11px;color:#999;margin:0;">
      ${data.prev_tickets_sold != null ? 'Comparing to same day last week \u00b7 ' : ''}
      Auto-generated from Mercer Labs Analytics Pipeline \u00b7 Data as of 9:00 AM ET
    </p>

  </div>
</div>
</body>
</html>`;
}
