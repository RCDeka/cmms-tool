// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Personal dashboards of supervisors and admins (docs/spec-dashboards.md, D59): the list in
// the sidebar, the widget checkboxes, the dashboard page with its filters and widgets, drag
// and drop, and the exports. The last list and figures are kept on the device and shown
// offline; changing a dashboard needs a connection. Technicians keep the fixed dashboard of
// dashboard.js.
import { apiFetch } from './api.js';
import { hasRole } from './auth.js';
import * as DB from './db.js';
import { h, replaceChildren } from './dom.js';
import { getRefs } from './editor.js';
import { CATEGORIES } from './enums.js';
import { downloadCsv, downloadFile, exportFileName, toCsv, widgetImage } from './export.js';
import { multiSelect } from './filters.js';
import { formatDateTime } from './format.js';
import { valueLabel } from './labels.js';
import { announce, confirmDialog, renderPage, setActiveNav, setTitle } from './layout.js';
import { applyToPage, isOnline } from './network.js';
import { navigate } from './router.js';
import { attachWidgetDrag, moveKey } from './widget-order.js';
import {
  DEFAULT_FILTERS,
  PERIODS,
  WIDGETS,
  WIDGET_GROUPS,
  imageShowsTable,
  recordsTable,
  widgetBody,
  widgetDef,
  widgetScope,
  widgetOptions,
  widgetTable,
} from './widgets.js';

const tableContainer = document.getElementById('table-container');
const LIST_CACHE = 'dashboards';
const dataCache = (id) => `dashboard_data_${id}`;
const numberFormat = new Intl.NumberFormat('en-GB');

/** What the page needs from the app shell (app.js), given once at startup. */
let app = null;
/** My dashboards, in sidebar order (null until read from the device or the server). */
let list = null;
/**
 * Dashboard on screen: the record (its widgets and filters as shown, its version as last
 * saved), its figures, and the charts drawn.
 */
let view = null; // { dashboard, data, today, fetchedAt, fromCache, charts, legends, detach }
let myWorkRange = 'today';
/** Sites offered by the site filter (reference data). */
let knownSites = [];
/** Saves run one after the other, each with the version the previous one returned. */
let saving = Promise.resolve();

/**
 * @param {{ render: (route: object) => Promise<void>,
 *   showConsoleError: (err: Error, retry: () => void) => void,
 *   showPlaceholder: (section: string | null, title: string, message: string) => void }} hooks
 */
export function initDashboardsPage(hooks) {
  app = hooks;
  // Widget menus close on a click elsewhere, like the filter dropdowns.
  document.addEventListener('click', (event) => {
    for (const open of document.querySelectorAll('.widget-menu[open], .page-menu[open]')) {
      if (!open.contains(event.target)) open.open = false;
    }
  });
}

/** True for the roles that have personal dashboards. */
export const hasDashboards = () => hasRole('SUPERVISOR', 'ADMIN');

// --- Dashboard list (sidebar) ---------------------------------------------------------------

/** Session start: my dashboards in the sidebar, from the device, then from the server. */
export async function loadDashboardNav() {
  list = null;
  view = null;
  renderNav();
  if (!hasDashboards()) return;
  list = (await DB.getConfig(LIST_CACHE)) ?? null;
  renderNav();
  if (isOnline()) await fetchList().catch(() => {});
}

async function fetchList() {
  const { items } = await apiFetch('/dashboards');
  await storeList(items);
  return items;
}

async function storeList(items) {
  list = items;
  await DB.setConfig(LIST_CACHE, items);
  renderNav();
}

function renderNav() {
  const nav = document.getElementById('dashboard-nav');
  if (!nav) return;
  replaceChildren(
    nav,
    (list ?? []).map((d) =>
      h(
        'li',
        {},
        h(
          'a',
          {
            href: `/dashboard/${d.id}`,
            'data-link': true,
            dataset: { nav: `dashboard-${d.id}` },
            'aria-current': view?.dashboard.id === d.id ? 'page' : null,
          },
          d.name,
        ),
      ),
    ),
    h(
      'li',
      {},
      h(
        'button',
        { type: 'button', class: 'nav-action online-only', onClick: () => newDashboard() },
        '+ New dashboard',
      ),
    ),
  );
  applyToPage(nav);
}

/** Widget checkboxes in the sidebar (K4), for the dashboard on screen. */
function renderPicker() {
  const picker = document.getElementById('widget-picker');
  if (!picker) return;
  if (!view) {
    picker.hidden = true;
    replaceChildren(picker);
    return;
  }
  const shown = new Set(view.dashboard.widgets.map((w) => w.key));
  replaceChildren(
    picker,
    h('h2', { id: 'widget-picker-title', class: 'widget-picker-title' }, 'Widgets'),
    h(
      'p',
      { class: 'widget-picker-hint' },
      `Tick the widgets to show on “${view.dashboard.name}”.`,
    ),
    WIDGET_GROUPS.map((group) =>
      h(
        'fieldset',
        { class: 'widget-group' },
        h('legend', {}, group),
        WIDGETS.filter((w) => w.group === group).map((w) =>
          h(
            'label',
            { class: 'widget-option' },
            h('input', {
              type: 'checkbox',
              class: 'online-only',
              checked: shown.has(w.key),
              dataset: { focus: `pick-${w.key}` },
              onChange: (event) => toggleWidget(w.key, event.target.checked),
            }),
            h('span', {}, w.label),
          ),
        ),
      ),
    ),
  );
  picker.hidden = false;
  applyToPage(picker);
}

/** Leaving the dashboard page: the checkboxes go, the charts are released. */
export function leaveDashboards(routeName) {
  if (routeName === 'dashboard' || !view) return;
  releaseView();
  view = null;
  renderPicker();
  renderNav();
}

function releaseView() {
  view?.detach?.();
  for (const list of view?.charts.values() ?? []) for (const chart of list) chart.destroy?.();
  view?.charts.clear();
}

// --- Page -----------------------------------------------------------------------------------

const filterQuery = (filters) => {
  const query = new URLSearchParams({ period: String(filters.period) });
  if (filters.sites.length) query.set('site', filters.sites.join('|'));
  if (filters.categories.length) query.set('category', filters.categories.join(','));
  return query.toString();
};
const keysOf = (dashboard) => dashboard.widgets.map((w) => w.key).filter((k) => widgetDef(k));

/**
 * /dashboard (my first dashboard) and /dashboard/:id.
 * @param {{ id?: number }} route
 * @param {() => boolean} isCurrent
 */
export async function showDashboards(route, isCurrent) {
  if (!list) list = (await DB.getConfig(LIST_CACHE)) ?? null;
  if (!isCurrent()) return;
  if (!list) {
    if (!isOnline()) {
      return app.showPlaceholder(
        null,
        'Dashboard',
        'Your dashboards have not been loaded on this device yet, so they are not available offline.',
      );
    }
    renderPage(h('p', { class: 'loading-state', role: 'status' }, 'Loading your dashboards…'));
    try {
      await fetchList();
    } catch (err) {
      if (isCurrent()) app.showConsoleError(err, () => app.render(route));
      return;
    }
    if (!isCurrent()) return;
  }
  const dashboard = route.id ? list.find((d) => d.id === route.id) : list[0];
  if (!dashboard) {
    return app.showPlaceholder(
      null,
      'Dashboard not found',
      'This dashboard does not exist, or it is not one of yours.',
    );
  }

  knownSites = (await getRefs()?.catch(() => null))?.sites ?? knownSites;
  if (!isCurrent()) return;
  const sameDashboard = view?.dashboard.id === dashboard.id;
  if (!sameDashboard) {
    releaseView();
    const cached = await DB.getConfig(dataCache(dashboard.id));
    if (!isCurrent()) return;
    view = {
      dashboard,
      data: cached?.data ?? null,
      today: cached?.today ?? null,
      fetchedAt: cached?.fetched_at ?? null,
      fromCache: Boolean(cached),
      charts: new Map(), // widget key → Chart instances drawn
      legends: new Map(), // widget key → [label, color slot][] (images)
      detach: null,
    };
  }
  paint();
  if (!sameDashboard) tableContainer.querySelector('.dashboard-filters')?.focus();
  if (!isOnline()) return;

  // Fresh list (another browser may have changed it), then fresh figures.
  try {
    const items = await fetchList();
    if (!isCurrent() || view?.dashboard.id !== dashboard.id) return;
    const fresh = items.find((d) => d.id === dashboard.id);
    if (!fresh) return app.render(route);
    view.dashboard = fresh;
    await loadFigures(isCurrent);
  } catch (err) {
    if (isCurrent() && !view?.data) showMessage(err.message, 'error');
  }
}

/** Fetches the figures of the widgets shown, keeps them on the device, and redraws. */
async function loadFigures(isCurrent = () => true) {
  const { dashboard } = view;
  const keys = keysOf(dashboard);
  tableContainer.classList.add('is-refreshing');
  tableContainer.setAttribute('aria-busy', 'true');
  try {
    const response = keys.length
      ? await apiFetch(
          `/dashboard/widgets?keys=${keys.join(',')}&${filterQuery(dashboard.filters)}`,
        )
      : { widgets: {}, today: null, generated_at: new Date().toISOString() };
    const snapshot = {
      data: response.widgets,
      today: response.today,
      fetched_at: response.generated_at,
    };
    await DB.setConfig(dataCache(dashboard.id), snapshot);
    if (!isCurrent() || view?.dashboard.id !== dashboard.id) return;
    Object.assign(view, {
      data: snapshot.data,
      today: snapshot.today,
      fetchedAt: snapshot.fetched_at,
      fromCache: false,
    });
    paint();
  } finally {
    tableContainer.classList.remove('is-refreshing');
    tableContainer.removeAttribute('aria-busy');
  }
}

/** Element that had the focus, found again after a redraw (by its data-focus value). */
function focusKey() {
  return document.activeElement?.closest?.('[data-focus]')?.dataset.focus ?? null;
}

/** Draws the whole page from `view`, keeps the focus where it was, then draws the charts. */
function paint(focus = focusKey()) {
  const { dashboard } = view;
  setActiveNav(`dashboard-${dashboard.id}`);
  setTitle(dashboard.name);
  releaseView();
  renderNav();
  renderPicker();

  const grid = h('ul', { class: 'widget-grid', 'aria-label': `Widgets of ${dashboard.name}` });
  const charts = [];
  const entries = dashboard.widgets.filter((w) => widgetDef(w.key));
  entries.forEach((entry) => {
    const { card, charts: drawn, legend } = widgetCard(entry);
    grid.append(card);
    for (const chart of drawn ?? []) charts.push({ key: entry.key, ...chart });
    if (legend) view.legends.set(entry.key, legend);
    else view.legends.delete(entry.key);
  });

  renderPage(
    h(
      'div',
      { class: 'dashboard dashboard-page' },
      toolbar(dashboard),
      view.fromCache && view.fetchedAt
        ? h(
            'div',
            { class: 'banner banner-info', role: 'note' },
            `Offline: figures saved on this device on ${formatDateTime(view.fetchedAt)}.`,
          )
        : null,
      h('p', { id: 'dashboard-message', class: 'dashboard-message', role: 'status' }),
      h(
        'p',
        { id: 'widget-drag-help', class: 'visually-hidden' },
        'Press Space to pick the widget up, the arrow keys to move it, and Space to drop it.',
      ),
      entries.length
        ? grid
        : h('p', { class: 'empty-state' }, 'No widget yet: tick widgets in the sidebar.'),
    ),
  );
  view.detach = attachWidgetDrag(grid, {
    onOrder: (keys, key) => reorderWidgets(keys, key),
    announce,
    labelOf: (key) => widgetDef(key).label,
  });
  applyToPage(tableContainer);
  refreshMoveItems(grid);
  if (focus) tableContainer.querySelector(`[data-focus="${CSS.escape(focus)}"]`)?.focus();
  drawCharts(charts);
}

/** "Move earlier" on the first card and "Move later" on the last one are disabled. */
function refreshMoveItems(grid) {
  const cards = [...grid.querySelectorAll(':scope > .widget-card')];
  cards.forEach((card, i) => {
    const earlier = card.querySelector('[data-move="earlier"]');
    const later = card.querySelector('[data-move="later"]');
    if (isOnline()) {
      earlier.disabled = i === 0;
      later.disabled = i === cards.length - 1;
    }
  });
}

async function drawCharts(charts) {
  const shown = view;
  for (const chart of charts) {
    if (!chart.canvas.isConnected) continue;
    try {
      const instance = await chart.draw();
      if (view !== shown || !chart.canvas.isConnected) instance.destroy();
      else {
        instance.caption = chart.caption ?? null; // shown above the chart in the image
        view.charts.set(chart.key, [...(view.charts.get(chart.key) ?? []), instance]);
      }
    } catch {
      // No chart library (offline before it was ever cached): the table view opens instead.
      chart.canvas.closest('.widget-card')?.querySelector('.chart-table')?.setAttribute('open', '');
    }
  }
}

function showMessage(text, tone = 'info') {
  const el = document.getElementById('dashboard-message');
  if (!el) return;
  el.textContent = text;
  el.className = `dashboard-message${text ? ` banner banner-${tone}` : ''}`;
}

// --- Toolbar: filters and the dashboard menu -----------------------------------------------

function toolbar(dashboard) {
  const { filters } = dashboard;
  const period = h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Period' },
    PERIODS.map((days) =>
      h(
        'button',
        {
          type: 'button',
          class: 'segmented-option online-only',
          dataset: { focus: `period-${days}` },
          'aria-pressed': String(filters.period === days),
          onClick: () => {
            if (filters.period !== days) changeFilters({ ...filters, period: days });
          },
        },
        `${days} days`,
      ),
    ),
  );
  // The dashboard's sites come first if a site is no longer in the reference data.
  const siteNames = [...new Set([...filters.sites, ...knownSites])];
  const sites = multiSelect({
    id: 'dashboard-sites',
    labelId: 'dashboard-sites-label',
    options: siteNames.map((s) => [s, s]),
    separator: '|',
    onChange: () => changeFilters({ ...dashboard.filters, sites: splitValue(sites.value, '|') }),
    summary: (value) => (value ? null : 'All sites'),
  });
  sites.value = filters.sites.join('|');
  const trades = multiSelect({
    id: 'dashboard-categories',
    labelId: 'dashboard-categories-label',
    options: CATEGORIES.map((c) => [c, valueLabel('category', c)]),
    onChange: () =>
      changeFilters({ ...dashboard.filters, categories: splitValue(trades.value, ',') }),
    summary: (value) => (value ? null : 'All trades'),
  });
  trades.value = filters.categories.join(',');
  for (const el of [sites, trades]) {
    el.querySelector('summary').dataset.focus = el.id;
    for (const box of el.querySelectorAll('input')) box.classList.add('online-only');
  }

  return h(
    'div',
    { class: 'dashboard-toolbar' },
    h(
      'div',
      {
        class: 'dashboard-filters',
        role: 'group',
        'aria-label': 'Filters of this dashboard',
        tabindex: '-1',
      },
      h('div', { class: 'filter-field' }, h('span', { class: 'filter-label' }, 'Period'), period),
      h(
        'div',
        { class: 'filter-field' },
        h('span', { id: 'dashboard-sites-label', class: 'filter-label' }, 'Sites'),
        sites,
      ),
      h(
        'div',
        { class: 'filter-field' },
        h('span', { id: 'dashboard-categories-label', class: 'filter-label' }, 'Trades'),
        trades,
      ),
    ),
    dashboardMenu(dashboard),
  );
}

const splitValue = (value, separator) => (value ? value.split(separator) : []);

function menuButton(label, onClick, { online = false, disabled = false, move } = {}) {
  return h(
    'button',
    {
      type: 'button',
      class: `menu-item${online ? ' online-only' : ''}`,
      disabled,
      dataset: move ? { move } : undefined,
      onClick: (event) => {
        event.target.closest('details').open = false;
        onClick();
      },
    },
    label,
  );
}

function dashboardMenu(dashboard) {
  const index = list.findIndex((d) => d.id === dashboard.id);
  return h(
    'details',
    { class: 'page-menu' },
    h(
      'summary',
      { class: 'button button-secondary', dataset: { focus: 'page-menu' } },
      'Dashboard',
    ),
    h(
      'div',
      { class: 'menu-list' },
      menuButton('New dashboard…', () => newDashboard(), { online: true }),
      menuButton('Rename…', () => renameDashboard(), { online: true }),
      menuButton('Duplicate…', () => duplicateDashboard(), { online: true }),
      menuButton('Move up in the sidebar', () => moveDashboard(-1), {
        online: true,
        disabled: index <= 0,
      }),
      menuButton('Move down in the sidebar', () => moveDashboard(1), {
        online: true,
        disabled: index === list.length - 1,
      }),
      menuButton('Delete…', () => deleteDashboard(), {
        online: true,
        disabled: list.length === 1,
      }),
    ),
  );
}

// --- Widget cards ---------------------------------------------------------------------------

function widgetCard({ key, options }) {
  const def = widgetDef(key);
  const data = view.data?.[key];
  const titleId = `widget-${key}-title`;
  const scope = widgetScope(def, view.dashboard.filters);
  const body = data
    ? widgetBody(key, data, {
        filters: view.dashboard.filters,
        myWorkRange,
        onMyWorkRange: (range) => {
          myWorkRange = range;
          paint(`range-${range}`);
        },
        options: widgetOptions(key, options),
        onOption: (name, value) => setOption(key, name, value),
        navigate,
      })
    : {
        element: h(
          'p',
          { class: 'empty-state' },
          isOnline() ? 'Loading…' : 'Not saved on this device yet.',
        ),
      };
  const card = h(
    'li',
    {
      class: `widget-card widget-size-${def.size.toLowerCase()}${body.flagged ? ' is-flagged' : ''}`,
      dataset: { key },
      'aria-labelledby': titleId,
    },
    h(
      'div',
      { class: 'widget-header' },
      h(
        'button',
        {
          type: 'button',
          class: 'widget-handle online-only',
          'aria-label': `Move ${def.label}`,
          'aria-describedby': 'widget-drag-help',
          'aria-pressed': 'false',
          dataset: { focus: `handle-${key}` },
        },
        h('span', { 'aria-hidden': 'true' }, '⠿'),
      ),
      h(
        'div',
        { class: 'widget-titles' },
        h('h2', { id: titleId, class: 'widget-title' }, def.label),
        scope ? h('p', { class: 'widget-scope' }, scope) : null,
      ),
      widgetMenu(key, def, Boolean(data)),
    ),
    h('div', { class: 'widget-body' }, body.element),
  );
  // Focus returns to the My work switch after a redraw.
  for (const button of card.querySelectorAll('[data-range]')) {
    button.dataset.focus = `range-${button.dataset.range}`;
  }
  return { card, charts: body.charts, legend: body.legend };
}

function widgetMenu(key, def, hasData) {
  return h(
    'details',
    { class: 'widget-menu' },
    h(
      'summary',
      { 'aria-label': `Actions: ${def.label}`, dataset: { focus: `menu-${key}` } },
      h('span', { 'aria-hidden': 'true' }, '⋯'),
    ),
    h(
      'div',
      { class: 'menu-list' },
      menuButton('Figures (CSV)', () => exportFigures(key), { disabled: !hasData }),
      def.rows
        ? menuButton(
            def.rows === 'assets' ? 'Assets (CSV)' : 'Work orders (CSV)',
            () => exportRecords(key),
            { online: true },
          )
        : null,
      menuButton('Image (JPG)', () => exportImage(key), { disabled: !hasData }),
      menuButton('Move earlier', () => moveWidget(key, -1), { online: true, move: 'earlier' }),
      menuButton('Move later', () => moveWidget(key, 1), { online: true, move: 'later' }),
      menuButton('Remove from dashboard', () => toggleWidget(key, false), { online: true }),
    ),
  );
}

// --- Changes --------------------------------------------------------------------------------

/**
 * Saves changes of the dashboard on screen. The page already shows them; a refusal reloads
 * the dashboard as the server has it and says why.
 */
function save(changes, { refetch = false } = {}) {
  const id = view.dashboard.id;
  saving = saving.then(async () => {
    try {
      const current = list.find((d) => d.id === id);
      const updated = await apiFetch(`/dashboards/${id}`, {
        method: 'PUT',
        body: { version: current.version, ...changes },
      });
      await storeList(list.map((d) => (d.id === id ? updated : d)));
      if (view?.dashboard.id !== id) return;
      view.dashboard = { ...view.dashboard, version: updated.version, name: updated.name };
      if (refetch) await loadFigures();
    } catch (err) {
      await recover(err);
    }
  });
  return saving;
}

async function recover(err) {
  const message =
    err.status === 409
      ? 'This dashboard was changed elsewhere: it is shown again as saved.'
      : err.status === 0
        ? 'The change could not be saved: the server cannot be reached.'
        : err.message;
  try {
    const items = await fetchList();
    const fresh = view && items.find((d) => d.id === view.dashboard.id);
    if (fresh) {
      view.dashboard = fresh;
      paint();
      await loadFigures();
    }
  } catch {
    // Still unreachable: the page keeps what is on screen.
  }
  showMessage(message, 'error');
  announce(message);
}

function setWidgets(widgets) {
  view.dashboard = { ...view.dashboard, widgets };
}

function toggleWidget(key, checked) {
  const { widgets } = view.dashboard;
  const label = widgetDef(key).label;
  if (checked === widgets.some((w) => w.key === key)) return;
  if (checked) {
    setWidgets([...widgets, { key, options: {} }]);
    paint();
    tableContainer.querySelector(`[data-key="${key}"]`)?.scrollIntoView({ block: 'nearest' });
    announce(`${label} added at the end of the dashboard.`);
    save({ widgets: view.dashboard.widgets }, { refetch: true });
  } else {
    setWidgets(widgets.filter((w) => w.key !== key));
    paint(focusKey() ?? 'page-menu');
    announce(`${label} removed from the dashboard.`);
    save({ widgets: view.dashboard.widgets });
  }
}

/** Widgets in the order of `keys`; widgets of an unknown key keep their place at the end. */
function orderedWidgets(keys) {
  const byKey = new Map(view.dashboard.widgets.map((w) => [w.key, w]));
  return [
    ...keys.map((k) => byKey.get(k)),
    ...view.dashboard.widgets.filter((w) => !keys.includes(w.key)),
  ];
}

/** Order changed by drag and drop: the grid already shows it, no redraw. */
function reorderWidgets(keys) {
  setWidgets(orderedWidgets(keys));
  refreshMoveItems(tableContainer.querySelector('.widget-grid'));
  save({ widgets: view.dashboard.widgets });
}

/** "Move earlier" (-1) or "Move later" (+1) in the widget menu. */
function moveWidget(key, step) {
  const grid = tableContainer.querySelector('.widget-grid');
  const card = grid.querySelector(`:scope > [data-key="${key}"]`);
  const sibling = step < 0 ? card.previousElementSibling : card.nextElementSibling;
  if (!sibling) return;
  if (step < 0) sibling.before(card);
  else sibling.after(card);
  const keys = [...grid.querySelectorAll(':scope > .widget-card')].map((c) => c.dataset.key);
  card.querySelector('.widget-handle').focus();
  announce(`${widgetDef(key).label}, position ${keys.indexOf(key) + 1} of ${keys.length}.`);
  reorderWidgets(keys);
}

/** A widget setting (planned vs reactive: count or hours), saved with the dashboard. */
function setOption(key, name, value) {
  if (!isOnline()) return;
  setWidgets(
    view.dashboard.widgets.map((w) =>
      w.key === key ? { ...w, options: { ...w.options, [name]: value } } : w,
    ),
  );
  paint(`${name}-${value}`);
  save({ widgets: view.dashboard.widgets });
}

function changeFilters(filters) {
  view.dashboard = { ...view.dashboard, filters: { ...DEFAULT_FILTERS, ...filters } };
  paint();
  save({ filters: view.dashboard.filters }, { refetch: true });
}

// --- Dashboard actions (dialogs) ------------------------------------------------------------

/**
 * Asks for a name (and, for a new dashboard, what to start from) in a modal dialog.
 * @param {{ title: string, submit: string, value?: string,
 *   starts?: { value: string, label: string }[] }} options
 * @param {(values: { name: string, start?: string }) => Promise<void>} onSubmit throws an
 *   ApiError to keep the dialog open with its message
 */
function nameDialog({ title, submit, value = '', starts }, onSubmit) {
  const input = h('input', {
    id: 'dashboard-name',
    name: 'name',
    type: 'text',
    required: true,
    maxlength: '60',
    autocomplete: 'off',
    value,
  });
  const error = h('p', { id: 'dashboard-name-error', class: 'field-error', role: 'alert' });
  const choices = starts?.map((s, i) =>
    h(
      'label',
      { class: 'radio' },
      h('input', { type: 'radio', name: 'start', value: s.value, checked: i === 0 }),
      h('span', {}, s.label),
    ),
  );
  const form = h(
    'form',
    { class: 'dialog-form', novalidate: true },
    h('h2', { class: 'dialog-title' }, title),
    h('div', { class: 'form-field' }, h('label', { for: input.id }, 'Name'), input, error),
    choices
      ? h('fieldset', { class: 'dialog-choices' }, h('legend', {}, 'Start from'), choices)
      : null,
    h(
      'div',
      { class: 'dialog-actions' },
      h('button', { type: 'submit', class: 'button button-primary online-only' }, submit),
      h('button', { type: 'button', class: 'button button-secondary', value: 'cancel' }, 'Cancel'),
    ),
  );
  const dialog = h(
    'dialog',
    { class: 'dialog', 'aria-labelledby': 'dashboard-dialog-title' },
    form,
  );
  form.querySelector('.dialog-title').id = 'dashboard-dialog-title';
  document.body.append(dialog);
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  form.querySelector('[value="cancel"]').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Give the dashboard a name.';
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
      return input.focus();
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await onSubmit({ name, start: form.elements.start?.value });
      close();
    } catch (err) {
      error.textContent =
        err.body?.details?.fields?.name === 'Already used'
          ? 'You already have a dashboard with this name.'
          : err.message;
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
      button.disabled = false;
      input.focus();
    }
  });
  applyToPage(dialog);
  dialog.showModal();
  input.select();
}

function newDashboard() {
  const starts = [
    { value: 'EMPTY', label: 'An empty dashboard' },
    { value: 'OVERVIEW', label: 'The overview (every key figure and chart)' },
    { value: 'BACKLOG', label: 'The backlog (flow, age, weeks of work, planned vs reactive)' },
  ];
  if (view) starts.push({ value: 'COPY', label: `A copy of “${view.dashboard.name}”` });
  nameDialog({ title: 'New dashboard', submit: 'Create', starts }, async ({ name, start }) => {
    const body =
      start === 'COPY' ? { name, copy_of: view.dashboard.id } : { name, template: start };
    const created = await apiFetch('/dashboards', { method: 'POST', body });
    await storeList([...list, created]);
    announce(`Dashboard ${created.name} created.`);
    navigate(`/dashboard/${created.id}`);
  });
}

function renameDashboard() {
  const { dashboard } = view;
  nameDialog(
    { title: 'Rename the dashboard', submit: 'Rename', value: dashboard.name },
    async ({ name }) => {
      if (name === dashboard.name) return;
      await saving;
      const current = list.find((d) => d.id === dashboard.id);
      const updated = await apiFetch(`/dashboards/${dashboard.id}`, {
        method: 'PUT',
        body: { version: current.version, name },
      });
      await storeList(list.map((d) => (d.id === updated.id ? updated : d)));
      view.dashboard = { ...view.dashboard, name: updated.name, version: updated.version };
      paint('page-menu');
      announce(`Dashboard renamed ${updated.name}.`);
    },
  );
}

function duplicateDashboard() {
  const { dashboard } = view;
  nameDialog(
    { title: 'Duplicate the dashboard', submit: 'Duplicate', value: `${dashboard.name} (copy)` },
    async ({ name }) => {
      await saving;
      const created = await apiFetch('/dashboards', {
        method: 'POST',
        body: { name, copy_of: dashboard.id },
      });
      await storeList([...list, created]);
      announce(`Dashboard ${created.name} created.`);
      navigate(`/dashboard/${created.id}`);
    },
  );
}

async function moveDashboard(step) {
  const ids = list.map((d) => d.id);
  const id = view.dashboard.id;
  const reordered = moveKey(ids, id, ids.indexOf(id) + step);
  await saving;
  try {
    await apiFetch('/dashboards/order', { method: 'PUT', body: { ids: reordered } });
    await storeList(reordered.map((x) => list.find((d) => d.id === x)));
    paint('page-menu');
    announce(`${view.dashboard.name} moved ${step < 0 ? 'up' : 'down'} in the sidebar.`);
  } catch (err) {
    await recover(err);
  }
}

async function deleteDashboard() {
  const { dashboard } = view;
  const choice = await confirmDialog({
    title: 'Delete this dashboard?',
    message: `“${dashboard.name}” and its layout will be deleted. The work orders and figures are not affected.`,
    actions: [
      { value: 'cancel', label: 'Cancel', primary: true },
      { value: 'delete', label: 'Delete dashboard' },
    ],
  });
  if (choice !== 'delete') return;
  await saving;
  try {
    const current = list.find((d) => d.id === dashboard.id);
    await apiFetch(`/dashboards/${dashboard.id}?version=${current.version}`, { method: 'DELETE' });
    await DB.setConfig(dataCache(dashboard.id), null);
    await storeList(list.filter((d) => d.id !== dashboard.id));
    releaseView();
    view = null;
    announce(`Dashboard ${dashboard.name} deleted.`);
    navigate('/dashboard');
  } catch (err) {
    await recover(err);
  }
}

// --- Exports --------------------------------------------------------------------------------

const today = () => view.today ?? new Date().toISOString().slice(0, 10);

function fileName(key, ext, suffix) {
  return exportFileName({
    dashboard: view.dashboard.name,
    widget: widgetDef(key).label,
    suffix,
    date: today(),
    ext,
  });
}

function exportFigures(key) {
  const table = widgetTable(key, view.data[key], { myWorkRange, options: optionsOf(key) });
  downloadCsv(
    toCsv(
      table.columns.map((c) => c.label),
      table.rows,
    ),
    fileName(key, 'csv'),
  );
}

async function exportRecords(key) {
  const def = widgetDef(key);
  const segment = key === 'my_work' ? `&segment=${myWorkRange}` : '';
  showMessage('Preparing the file…');
  try {
    const result = await apiFetch(
      `/dashboard/widgets/${key}/rows?${filterQuery(view.dashboard.filters)}${segment}`,
    );
    const table = recordsTable(result.kind, result.items);
    downloadCsv(
      toCsv(table.columns, table.rows),
      fileName(key, 'csv', def.rows === 'assets' ? 'assets' : 'work orders'),
    );
    const text = result.truncated
      ? `The file holds the first ${numberFormat.format(result.items.length)} of ${numberFormat.format(result.total)} records.`
      : `${numberFormat.format(result.total)} record${result.total === 1 ? '' : 's'} exported.`;
    showMessage(text, result.truncated ? 'warning' : 'info');
    announce(text);
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

/** Options of a widget on the dashboard on screen, defaults filled in. */
const optionsOf = (key) =>
  widgetOptions(key, view.dashboard.widgets.find((w) => w.key === key)?.options);

async function exportImage(key) {
  const def = widgetDef(key);
  const data = view.data[key];
  const card = tableContainer.querySelector(`[data-key="${key}"]`);
  const charts = (view.charts.get(key) ?? []).map((c) => ({
    canvas: c.canvas,
    caption: c.caption,
  }));
  const chart = charts.length ? charts : null;
  const tile = def.size === 'S';
  const css = getComputedStyle(document.documentElement);
  try {
    const blob = await widgetImage({
      title: def.label,
      subtitle: widgetScope(def, view.dashboard.filters),
      footer: `Tacto · ${view.dashboard.name} · figures of ${formatDateTime(view.fetchedAt)}`,
      font: css.getPropertyValue('--font-sans').trim(),
      charts,
      legend: view.legends
        .get(key)
        ?.map(([label, slot]) => [
          label,
          css.getPropertyValue(`--color-chart-series-${slot}`).trim(),
        ]),
      value: tile ? numberFormat.format(data.value) : undefined,
      note: card?.classList.contains('is-flagged') ? '⚠ Needs attention' : undefined,
      // Without the chart library, a chart's image falls back to its table.
      table:
        imageShowsTable(key) || (!chart && !tile)
          ? widgetTable(key, data, { myWorkRange, options: optionsOf(key) })
          : undefined,
    });
    downloadFile(blob, fileName(key, 'jpg'));
  } catch (err) {
    showMessage(err.message, 'error');
  }
}
