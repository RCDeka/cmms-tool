import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderDetail } from '../assets/js/detail.js';
import { focusRow, renderTable, selectRow } from '../assets/js/table.js';

const asset = (id, extra = {}) => ({
  id,
  code: `AST-${String(id).padStart(4, '0')}`,
  name: `Asset ${id}`,
  site: 'Lyon Part-Dieu Branch',
  category: 'HVAC',
  criticality: 'HIGH',
  status: 'IN_SERVICE',
  has_conflict: false,
  ...extra,
});

let container;
beforeEach(() => {
  document.body.innerHTML = '<section id="c"></section>';
  container = document.getElementById('c');
});

const page = (items, extra = {}) => ({ total: 120, page: 2, pages: 3, items, ...extra });
const rows = () => [...container.querySelectorAll('tbody tr')];

describe('renderTable', () => {
  it('renders an accessible table with the brief columns', () => {
    renderTable(container, {
      entity: 'assets',
      data: page([asset(1), asset(2)]),
      selectedId: null,
      onOpen() {},
      onPage() {},
    });
    const headers = [...container.querySelectorAll('th')];
    expect(headers.map((th) => th.textContent)).toEqual([
      'Asset code',
      'Name',
      'Site',
      'Category',
      'Criticality',
      'Status',
    ]);
    expect(headers.every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    expect(container.querySelector('caption').textContent).toBe('Assets, page 2 of 3');
    expect(rows()[0].querySelector('.badge-criticality-high').textContent).toBe('High');
    expect(rows()[0].querySelector('.badge-status-in-service').textContent).toBe('In service');
  });

  it('marks the columns hidden next to the detail panel', () => {
    renderTable(container, {
      entity: 'assets',
      data: page([asset(1)]),
      selectedId: null,
      onOpen() {},
      onPage() {},
    });
    const secondary = [...container.querySelectorAll('th.col-secondary')].map(
      (th) => th.textContent,
    );
    expect(secondary).toEqual(['Site', 'Category', 'Criticality']);
    expect(rows()[0].querySelectorAll('td.col-secondary')).toHaveLength(3);
  });

  it('flags conflicts with color, icon and text, and broken-down assets', () => {
    renderTable(container, {
      entity: 'assets',
      data: page([asset(1, { has_conflict: true }), asset(2, { status: 'BROKEN_DOWN' })]),
      selectedId: null,
      onOpen() {},
      onPage() {},
    });
    const [conflict, broken] = rows();
    expect(conflict.classList.contains('has-conflict')).toBe(true);
    expect(conflict.querySelector('.badge-conflict').textContent).toBe('⚠Conflict');
    expect(broken.classList.contains('is-broken-down')).toBe(true);
    expect(broken.textContent).toContain('Broken down');
  });

  it('keeps one row in the tab order and moves with the arrow keys', () => {
    const onOpen = vi.fn();
    renderTable(container, {
      entity: 'assets',
      data: page([asset(1), asset(2), asset(3)]),
      selectedId: 2,
      onOpen,
      onPage() {},
    });
    expect(rows().map((r) => r.tabIndex)).toEqual([-1, 0, -1]);
    expect(rows()[1].getAttribute('aria-current')).toBe('true');

    rows()[1].focus();
    rows()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows()[2]);
    expect(rows().map((r) => r.tabIndex)).toEqual([-1, -1, 0]);

    rows()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(rows()[0]);

    rows()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onOpen).toHaveBeenCalledWith(1);
  });

  it('opens a row on click', () => {
    const onOpen = vi.fn();
    renderTable(container, {
      entity: 'assets',
      data: page([asset(7)]),
      selectedId: null,
      onOpen,
      onPage() {},
    });
    rows()[0].querySelector('td').click();
    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it('disables pagination buttons at the bounds', () => {
    const onPage = vi.fn();
    const buttons = () =>
      Object.fromEntries(
        [...container.querySelectorAll('[data-pager]')].map((b) => [b.dataset.pager, b]),
      );

    renderTable(container, {
      entity: 'assets',
      data: page([asset(1)], { page: 1, pages: 3 }),
      selectedId: null,
      onOpen() {},
      onPage,
    });
    expect(buttons().first.disabled).toBe(true);
    expect(buttons().previous.disabled).toBe(true);
    expect(buttons().next.disabled).toBe(false);
    expect(container.querySelector('.pagination-status').textContent).toBe('Page 1 / 3');
    buttons().last.click();
    expect(onPage).toHaveBeenCalledWith(3, 'last');

    renderTable(container, {
      entity: 'assets',
      data: page([asset(1)], { page: 3, pages: 3 }),
      selectedId: null,
      onOpen() {},
      onPage,
    });
    expect(buttons().next.disabled).toBe(true);
    expect(buttons().last.disabled).toBe(true);
    expect(buttons().first.textContent).toBe('◀◀ First');
  });

  it('updates the selection without re-rendering, and focuses a row', () => {
    renderTable(container, {
      entity: 'assets',
      data: page([asset(1), asset(2)]),
      selectedId: 1,
      onOpen() {},
      onPage() {},
    });
    const firstRow = rows()[0];
    selectRow(container, 2);
    expect(rows()[0]).toBe(firstRow); // same element: not re-rendered
    expect(firstRow.classList.contains('is-selected')).toBe(false);
    expect(rows()[1].getAttribute('aria-current')).toBe('true');
    expect(focusRow(container, 2)).toBe(true);
    expect(document.activeElement).toBe(rows()[1]);
    expect(focusRow(container, 99)).toBe(false);
  });

  it('shows an empty state', () => {
    renderTable(container, {
      entity: 'work_orders',
      data: page([], { total: 0, page: 1, pages: 1 }),
      selectedId: null,
      onOpen() {},
      onPage() {},
    });
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('.empty-state').textContent).toBe(
      'No work orders on this page.',
    );
  });
});

describe('renderDetail', () => {
  const workOrder = {
    id: 5,
    number: 'WO-2026-00005',
    title: '<img src=x onerror=alert(1)> Leak',
    status: 'ON_HOLD',
    priority: 'URGENT',
    type: 'CORRECTIVE',
    category: null,
    site: 'Saclay Data Center',
    asset: { id: 12, code: 'AST-0012', name: 'Chiller' },
    description: '',
    assignee: { id: 4, first_name: 'Karim', last_name: 'Benali' },
    created_on: '2026-10-01',
    estimated_hours: 2,
    has_conflict: true,
  };

  it('escapes values, skips empty fields and links the asset', () => {
    const onClose = vi.fn();
    renderDetail(container, { entity: 'work_orders', record: workOrder, onClose });
    const title = container.querySelector('.detail-title');
    expect(title.textContent).toBe('WO-2026-00005 — <img src=x onerror=alert(1)> Leak');
    expect(container.querySelector('img')).toBeNull();

    const labels = [...container.querySelectorAll('dt')].map((dt) => dt.textContent);
    expect(labels).not.toContain('Category'); // null
    expect(labels).not.toContain('Description'); // empty string
    expect(labels).toContain('Assignee');
    expect(container.querySelector('dd a[data-link]').getAttribute('href')).toBe('/assets/12');
    expect(container.querySelector('.badge-priority-urgent').textContent).toBe('Urgent');

    container.querySelector('#btn-close-detail').click();
    expect(onClose).toHaveBeenCalledOnce();
    expect(container.querySelector('#btn-close-detail').getAttribute('aria-label')).toBe(
      'Close details',
    );
  });

  it('shows the conflict banner with text, not color alone', () => {
    renderDetail(container, { entity: 'work_orders', record: workOrder, onClose() {} });
    const banner = container.querySelector('.banner-warning');
    expect(banner.textContent).toContain('⚠');
    expect(banner.textContent).toContain('Conflict');
  });
});
