import { beforeEach, describe, expect, it } from 'vitest';
import { chartRows, chartSummary, kpiTiles, renderDashboard } from '../assets/js/dashboard.js';

const kpis = {
  open_work_orders: 18,
  in_progress_work_orders: 25,
  closed_this_month: 1284,
  assets_broken_down: 0,
  overdue_work_orders: 9,
};
const stats = {
  period: 30,
  by_category: [
    { category: 'HVAC', count: 12 },
    { category: 'ELECTRICAL', count: 30 },
    { category: 'FIRE_SAFETY', count: 0 },
    { category: 'PLUMBING', count: 5 },
    { category: 'NETWORK_CABLING', count: 7 },
    { category: 'SECURITY', count: 7 },
    { category: 'UNSPECIFIED', count: 40 },
  ],
  by_status: [],
  by_type: [],
};
const wo = (id, extra = {}) => ({
  id,
  number: `WO-2026-0000${id}`,
  title: `Work ${id}`,
  status: 'OPEN',
  priority: 'HIGH',
  due_on: null,
  updated_at: '2026-10-04T08:00:00.000Z',
  updated_by: { id: 2, first_name: 'Julien', last_name: 'Bernard' },
  ...extra,
});

describe('kpiTiles', () => {
  it('shows only the KPIs received, in order, and flags counts that need attention', () => {
    const tiles = kpiTiles(kpis);
    expect(tiles.map((t) => t.key)).toEqual([
      'open_work_orders',
      'in_progress_work_orders',
      'closed_this_month',
      'overdue_work_orders',
      'assets_broken_down',
    ]);
    expect(tiles.find((t) => t.key === 'overdue_work_orders').flagged).toBe(true);
    expect(tiles.find((t) => t.key === 'assets_broken_down').flagged).toBe(false); // zero
    expect(tiles.find((t) => t.key === 'open_work_orders').flagged).toBe(false); // not an alert KPI
    expect(kpiTiles({ ...kpis, pending_conflicts: 2 }).at(-1)).toMatchObject({
      key: 'pending_conflicts',
      href: '/conflicts',
      flagged: true,
    });
  });
});

describe('chartRows', () => {
  it('sorts categories by count and keeps "Unspecified" last', () => {
    expect(chartRows(stats).map((r) => [r.label, r.count])).toEqual([
      ['Electrical', 30],
      ['HVAC', 12],
      ['Network cabling', 7],
      ['Security', 7],
      ['Plumbing', 5],
      ['Fire safety', 0],
      ['Unspecified', 40],
    ]);
  });

  it('summarises the chart in text for screen readers', () => {
    expect(chartSummary(chartRows(stats).slice(0, 2))).toBe('Bar chart. Electrical: 30, HVAC: 12.');
  });
});

describe('renderDashboard', () => {
  let host;
  beforeEach(() => {
    document.body.innerHTML = '<section id="host"></section>';
    host = document.getElementById('host');
  });

  const render = (extra = {}) =>
    renderDashboard(host, {
      data: {
        today: '2026-10-04',
        kpis,
        recent_activity: [wo(1), wo(2, { status: 'CLOSED' })],
        my_work_today: [
          wo(3, { priority: 'URGENT', due_on: '2026-10-02' }),
          wo(4, { due_on: '2026-10-04' }),
        ],
      },
      stats,
      fromCache: false,
      fetchedAt: '2026-10-04T08:00:00.000Z',
      ...extra,
    });

  it('renders KPI tiles as links with readable values and a text flag', () => {
    render();
    const tiles = [...host.querySelectorAll('.kpi-tile')];
    expect(tiles).toHaveLength(5);
    expect(tiles[2].textContent).toContain('Closed this month');
    expect(tiles[2].querySelector('.kpi-value').textContent).toBe('1,284');
    const overdue = tiles[3];
    expect(overdue.getAttribute('href')).toBe('/work-orders');
    expect(overdue.querySelector('.kpi-flag').textContent).toBe('⚠Needs attention');
  });

  it('gives the chart a text alternative and a data table', () => {
    const chart = render();
    expect(chart.canvas.getAttribute('role')).toBe('img');
    expect(chart.canvas.getAttribute('aria-label')).toMatch(/^Bar chart\. Electrical: 30/);
    const rows = [...host.querySelectorAll('.chart-table tbody tr')].map((tr) => tr.textContent);
    expect(rows[0]).toBe('Electrical30');
    expect(host.querySelector('#chart-heading').textContent).toBe(
      'Work orders by category — last 30 days',
    );
    expect(host.querySelector('.chart-card figcaption p').textContent).toBe(
      '101 work orders created',
    );
  });

  it('lists my work with an overdue mark, and recent activity', () => {
    render();
    const mine = host.querySelectorAll('[aria-labelledby="mywork-heading"] li');
    expect(mine[0].textContent).toContain('Urgent');
    expect(mine[0].textContent).toContain('Overdue');
    expect(mine[1].textContent).not.toContain('Overdue'); // due today
    expect(host.querySelectorAll('[aria-labelledby="recent-heading"] li')).toHaveLength(2);
    expect(host.querySelector('[aria-labelledby="recent-heading"] a').getAttribute('href')).toBe(
      '/work-orders/1',
    );
  });

  it('says when the figures come from the device', () => {
    render({ fromCache: true });
    expect(host.querySelector('.banner-info').textContent).toMatch(
      /^Offline: figures saved on this device on /,
    );
  });

  it('shows empty states', () => {
    renderDashboard(host, {
      data: { today: '2026-10-04', kpis, recent_activity: [], my_work_today: [] },
      stats,
      fromCache: false,
      fetchedAt: 'x',
    });
    expect(host.textContent).toContain('No work order assigned to you is due today.');
    expect(host.textContent).toContain('No activity yet.');
  });
});
