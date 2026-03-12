import { describe, it, expect } from 'vitest';
import { buildFallbackNarrative } from './claude-client';
import type { EmailDigestPayload } from './types';

function makePayload(overrides: Partial<EmailDigestPayload> = {}): EmailDigestPayload {
  return {
    report_date: '2026-02-25',
    day_of_week: 'Wednesday',
    yesterday: {
      net_revenue: 47200,
      gross_revenue: 62400,
      commission_total: 15200,
      tickets_sold: 2843,
      orders: 1891,
      total_checkins: 3104,
      paid_checkins: 2780,
      comp_checkins: 324,
      channels: [
        { name: 'Direct Web', type: 'direct', tickets: 812, gross_revenue: 16240, net_revenue: 16240, commission_rate: 0 },
        { name: 'Viator', type: 'third_party', tickets: 967, gross_revenue: 20714, net_revenue: 14500, commission_rate: 0.3 },
        { name: 'Marriott Downtown', type: 'hotel', tickets: 240, gross_revenue: 5647, net_revenue: 4800, commission_rate: 0.15 },
      ],
    },
    same_day_last_week: {
      net_revenue: 42100,
      tickets_sold: 2540,
    },
    trailing_7_day_avg: {
      net_revenue: 44800,
      tickets_sold: 2650,
      redemptions: 2900,
    },
    alerts: {
      unknown_channels: [],
    },
    ...overrides,
  };
}

describe('buildFallbackNarrative', () => {
  it('includes net revenue', () => {
    const narrative = buildFallbackNarrative(makePayload());
    expect(narrative).toContain('47,200');
  });

  it('includes top channels', () => {
    const narrative = buildFallbackNarrative(makePayload());
    expect(narrative).toContain('Direct Web');
    expect(narrative).toContain('Viator');
  });

  it('includes week-on-week comparison', () => {
    const narrative = buildFallbackNarrative(makePayload());
    expect(narrative).toContain('Same Day Last Week');
  });

  it('handles missing last week data', () => {
    const narrative = buildFallbackNarrative(makePayload({ same_day_last_week: null }));
    expect(narrative).not.toContain('Same Day Last Week');
  });

  it('shows unknown channel alert', () => {
    const narrative = buildFallbackNarrative(makePayload({
      alerts: {
        unknown_channels: [{
          sales_channel_id: 'test-id',
          first_seen_at: '2026-02-25T06:00:00Z',
          sample_ticket_id: 'tkt-001',
          sample_price: 26,
          ticket_count: 3,
          resolved: false,
          resolved_at: null,
        }],
      },
    }));
    expect(narrative).toContain('Action needed');
    expect(narrative).toContain('1 unknown sales channel');
  });
});
