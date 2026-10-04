import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NOT_FINISHED,
  currentSort,
  filtersQuery,
  hasFilters,
  isPlainList,
  parseFilters,
  renderFilterBar,
  sortByColumn,
  withoutSort,
} from '../assets/js/filters.js';
import { detailUrl, listUrl, parseRoute } from '../assets/js/router.js';

const q = (text) => new URLSearchParams(text);

describe('parseFilters', () => {
  it('keeps valid filters only', () => {
    expect(
      parseFilters('assets', q('q=%20chiller%20&status=BROKEN_DOWN&category=GARDEN&page=2')),
    ).toEqual({
      q: 'chiller',
      status: 'BROKEN_DOWN',
    });
    expect(
      parseFilters('work_orders', q(`status=${NOT_FINISHED}&mine=true&overdue=yes&assignee_id=4`)),
    ).toEqual({
      status: NOT_FINISHED,
      mine: true,
      assignee_id: 4,
    });
    expect(parseFilters('work_orders', q('status=OPEN,DONE&assignee_id=x'))).toEqual({});
  });

  it('writes filters in a stable order and knows when there are none', () => {
    expect(filtersQuery('work_orders', { overdue: true, q: 'leak', status: 'OPEN' })).toBe(
      'q=leak&status=OPEN&overdue=true',
    );
    expect(hasFilters({})).toBe(false);
    expect(hasFilters({ q: 'x' })).toBe(true);
  });
});

describe('table sort', () => {
  it('reads a sortable column and its order, and leaves the default order out', () => {
    expect(parseFilters('work_orders', q('sort=assignee'))).toEqual({
      sort: 'assignee',
      order: 'asc',
    });
    expect(parseFilters('assets', q('sort=status&order=desc&q=fan'))).toEqual({
      q: 'fan',
      sort: 'status',
      order: 'desc',
    });
    expect(parseFilters('assets', q('sort=code&order=asc'))).toEqual({}); // the default
    expect(parseFilters('assets', q('sort=brand'))).toEqual({}); // not a column
    expect(parseFilters('work_orders', q('sort=created_on'))).toEqual({}); // not a column
  });

  it('tells sorted lists from filtered ones', () => {
    const sorted = { sort: 'name', order: 'asc' };
    expect(hasFilters(sorted)).toBe(false);
    expect(isPlainList(sorted)).toBe(false);
    expect(isPlainList({})).toBe(true);
    expect(withoutSort({ ...sorted, q: 'x' })).toEqual({ q: 'x' });
    expect(filtersQuery('assets', { order: 'desc', sort: 'name', q: 'x' })).toBe(
      'q=x&sort=name&order=desc',
    );
  });

  it('starts a new column ascending, flips the same column, and keeps the filters', () => {
    expect(currentSort('assets', {})).toEqual({ sort: 'code', order: 'asc' });
    expect(currentSort('work_orders', {})).toEqual({ sort: 'created_on', order: 'desc' });
    expect(sortByColumn('work_orders', { mine: true }, 'due_on')).toEqual({
      mine: true,
      sort: 'due_on',
      order: 'asc',
    });
    const desc = sortByColumn('work_orders', { sort: 'due_on', order: 'asc' }, 'due_on');
    expect(desc).toEqual({ sort: 'due_on', order: 'desc' });
    expect(sortByColumn('work_orders', desc, 'due_on')).toEqual({ sort: 'due_on', order: 'asc' });
    // Assets: Code is the default order, so code ascending leaves the URL clean.
    expect(sortByColumn('assets', {}, 'code')).toEqual({ sort: 'code', order: 'desc' });
    expect(sortByColumn('assets', { sort: 'code', order: 'desc' }, 'code')).toEqual({});
  });

  it('keeps the sort in list and record URLs', () => {
    const filters = { status: 'OPEN', sort: 'priority', order: 'desc' };
    const url = new URL(detailUrl('work_orders', 4, 2, filters), 'http://x');
    expect(url.search).toBe('?status=OPEN&sort=priority&order=desc&page=2');
    expect(parseRoute(url.pathname, url.search).filters).toEqual(filters);
    expect(parseRoute('/assets', '?sort=name').filters).toEqual({ sort: 'name', order: 'asc' });
  });
});

describe('routes and URLs keep the filters', () => {
  it('round-trips through the router', () => {
    const filters = { q: 'leak', status: NOT_FINISHED };
    const url = new URL(detailUrl('work_orders', 9, 2, filters), 'http://x');
    expect(url.pathname + url.search).toBe(
      '/work-orders/9?q=leak&status=OPEN%2CIN_PROGRESS%2CON_HOLD&page=2',
    );
    expect(parseRoute(url.pathname, url.search)).toEqual({
      name: 'detail',
      entity: 'work_orders',
      id: 9,
      page: 2,
      filters,
    });
    expect(listUrl('assets', 1, { status: 'BROKEN_DOWN' })).toBe('/assets?status=BROKEN_DOWN');
    expect(parseRoute('/assets', '')).toEqual({ name: 'list', entity: 'assets', page: 1 }); // no empty filters
  });
});

describe('renderFilterBar', () => {
  afterEach(() => vi.useRealTimers());
  const refs = {
    sites: ['Lyon Part-Dieu Branch'],
    users: [{ id: 4, first_name: 'Karim', last_name: 'Benali' }],
  };

  it('reports select changes at once and typing after a pause', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { element } = renderFilterBar({
      entity: 'assets',
      filters: {},
      refs,
      canFilterAssignee: false,
      onChange,
    });
    document.body.replaceChildren(element);
    const status = element.querySelector('#filter-status');
    status.value = 'BROKEN_DOWN';
    status.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenLastCalledWith({ status: 'BROKEN_DOWN' }, { typing: false });
    const search = element.querySelector('#filter-q');
    search.value = 'chil';
    search.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(350);
    expect(onChange).toHaveBeenLastCalledWith(
      { q: 'chil', status: 'BROKEN_DOWN' },
      { typing: true },
    );
  });

  it('shows the current filters, a clear button, and labels for every control', () => {
    const onChange = vi.fn();
    const { element, setFilters } = renderFilterBar({
      entity: 'work_orders',
      filters: { mine: true, site: 'Lyon Part-Dieu Branch' },
      refs,
      canFilterAssignee: true,
      onChange,
    });
    document.body.replaceChildren(element);
    expect(element.querySelector('#filter-mine').checked).toBe(true);
    expect(element.querySelector('#filter-site').value).toBe('Lyon Part-Dieu Branch');
    for (const control of element.querySelectorAll('input, select')) {
      expect(element.querySelector(`label[for="${control.id}"]`), control.id).not.toBeNull();
    }
    const clear = element.querySelector('.filter-clear');
    expect(clear.hidden).toBe(false);
    clear.click();
    expect(onChange).toHaveBeenLastCalledWith({}, { typing: false });
    setFilters({});
    expect(clear.hidden).toBe(true);
    expect(element.getAttribute('role')).toBe('search');
  });

  it('offers the assignee filter to supervisors and admins only', () => {
    const tech = renderFilterBar({
      entity: 'work_orders',
      filters: {},
      refs,
      canFilterAssignee: false,
      onChange() {},
    });
    expect(tech.element.querySelector('#filter-assignee_id')).toBeNull();
    const sup = renderFilterBar({
      entity: 'work_orders',
      filters: {},
      refs,
      canFilterAssignee: true,
      onChange() {},
    });
    expect(
      [...sup.element.querySelectorAll('#filter-assignee_id option')].map((o) => o.textContent),
    ).toEqual(['Any', 'Karim Benali']);
  });
});
