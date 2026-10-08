import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assetLocation,
  nextSort,
  openAssetPicker,
  pickerQuery,
} from '../assets/js/asset-picker.js';
import { renderPlanForm } from '../assets/js/plan-panel.js';

// jsdom has no modal dialogs.
HTMLDialogElement.prototype.showModal ??= function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function close() {
  this.open = false;
};

const asset = (id, o = {}) => ({
  id,
  code: `AST-${String(id).padStart(4, '0')}`,
  name: `Chiller ${id}`,
  site: 'Lyon Part-Dieu Branch',
  building: 'Main building',
  floor: 'L-1',
  exact_location: 'Plant room',
  category: 'HVAC',
  subcategory: 'Chiller',
  status: 'IN_SERVICE',
  criticality: 'HIGH',
  ...o,
});
const page = (items, o = {}) => ({ total: items.length, page: 1, pages: 1, items, ...o });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('picker query and sort', () => {
  it('asks for 20 assets, with the filters, the default order left out', () => {
    expect(pickerQuery({})).toBe('page=1&size=20');
    expect(
      pickerQuery({
        q: 'chiller',
        site: 'Paris La Défense Headquarters',
        category: 'HVAC',
        status: 'BROKEN_DOWN',
        sort: 'site',
        order: 'desc',
        page: 3,
      }),
    ).toBe(
      'page=3&size=20&sort=site&order=desc&q=chiller&site=Paris+La+D%C3%A9fense+Headquarters&category=HVAC&status=BROKEN_DOWN',
    );
  });

  it('sorts ascending, then descending on a second click, back to page 1', () => {
    expect(nextSort({ sort: 'code', order: 'asc', page: 4 }, 'site')).toEqual({
      sort: 'site',
      order: 'asc',
      page: 1,
    });
    expect(nextSort({ sort: 'site', order: 'asc' }, 'site').order).toBe('desc');
    expect(nextSort({ sort: 'site', order: 'desc' }, 'site').order).toBe('asc');
  });

  it('writes the location from what is known', () => {
    expect(assetLocation(asset(1))).toBe('Main building · L-1 · Plant room');
    expect(assetLocation(asset(1, { floor: null, exact_location: '' }))).toBe('Main building');
  });
});

describe('openAssetPicker', () => {
  let dialog;
  beforeEach(() => {
    document.body.innerHTML =
      '<button id="opener">Browse</button><dialog id="asset-dialog"></dialog>';
    dialog = document.getElementById('asset-dialog');
    document.getElementById('opener').focus();
  });

  it('lists assets with their location and trade, and resolves with the one chosen', async () => {
    const fetchPage = vi.fn(async () => page([asset(1), asset(2, { status: 'BROKEN_DOWN' })]));
    const chosen = openAssetPicker({
      dialog,
      fetchPage,
      sites: ['Lyon Part-Dieu Branch'],
      initial: { category: 'HVAC' },
    });
    await flush();
    expect(fetchPage).toHaveBeenCalledWith('page=1&size=20&category=HVAC');
    expect(dialog.querySelector('#asset-picker-category').value).toBe('HVAC');
    const rows = dialog.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Main building · L-1 · Plant room');
    expect(rows[0].textContent).toContain('Chiller'); // subcategory
    expect(rows[1].className).toBe('is-broken-down');
    rows[1].querySelector('button').click();
    expect(await chosen).toMatchObject({ id: 2, code: 'AST-0002' });
    expect(dialog.open).toBe(false);
    expect(document.activeElement.id).toBe('opener');
  });

  it('sorts from the column titles and filters', async () => {
    const fetchPage = vi.fn(async () => page([asset(1)]));
    const chosen = openAssetPicker({ dialog, fetchPage });
    await flush();
    dialog.querySelector('[data-sort="site"]').click();
    await flush();
    expect(fetchPage).toHaveBeenLastCalledWith('page=1&size=20&sort=site&order=asc');
    expect(dialog.querySelector('th[aria-sort]').getAttribute('aria-sort')).toBe('ascending');
    dialog.querySelector('[data-sort="site"]').click();
    await flush();
    expect(fetchPage).toHaveBeenLastCalledWith('page=1&size=20&sort=site&order=desc');
    const status = dialog.querySelector('#asset-picker-status');
    status.value = 'BROKEN_DOWN';
    status.dispatchEvent(new Event('change'));
    await flush();
    expect(fetchPage).toHaveBeenLastCalledWith(
      'page=1&size=20&sort=site&order=desc&status=BROKEN_DOWN',
    );
    dialog.dispatchEvent(new Event('cancel')); // Escape
    expect(await chosen).toBe(null);
  });

  it('pages through long lists and says when offline', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([asset(1)], { total: 45, pages: 3 }))
      .mockResolvedValueOnce(page([asset(21)], { total: 45, page: 2, pages: 3 }))
      .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 0 }));
    openAssetPicker({ dialog, fetchPage });
    await flush();
    expect(dialog.textContent).toContain('45 assets');
    dialog.querySelector('[data-pager="next"]').click();
    await flush();
    expect(fetchPage).toHaveBeenLastCalledWith('page=2&size=20');
    expect(dialog.textContent).toContain('Page 2 / 3');
    dialog.querySelector('[data-pager="next"]').click();
    await flush();
    expect(dialog.querySelector('.error-state').textContent).toContain('needs a connection');
  });
});

describe('plan form', () => {
  it('fills the asset code from the picker, filtered on the trade chosen', async () => {
    const container = document.createElement('div');
    document.body.replaceChildren(container);
    const pickAsset = vi.fn(async () => asset(7));
    renderPlanForm(container, {
      plan: null,
      sites: ['Lyon Part-Dieu Branch'],
      defaultWeek: '2026-W41',
      onClose: () => {},
      onSubmit: () => {},
      pickAsset,
    });
    const form = container.querySelector('form');
    form.elements.category.value = 'HVAC';
    form.elements.site.value = 'Lyon Part-Dieu Branch';
    form.elements.building.value = 'Old typing';
    [...container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Browse assets…')
      .click();
    await flush();
    expect(pickAsset).toHaveBeenCalledWith({ category: 'HVAC', site: 'Lyon Part-Dieu Branch' });
    expect(form.elements.asset_code.value).toBe('AST-0007');
    expect(form.elements.site.value).toBe(''); // follows the asset now
    expect(form.elements.building.value).toBe('');
    expect(container.querySelector('.asset-chosen').textContent).toBe(
      'AST-0007 — Chiller 7, Lyon Part-Dieu Branch · Main building',
    );
  });
});
