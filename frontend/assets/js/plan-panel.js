// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Side panel of the year planner: a plan with the visit clicked on the grid, and the plan form
// (create, edit). Online only, like the planner (P18).
import { formRow, panelHeader } from './admin-users.js';
import { h, replaceChildren } from './dom.js';
import { CATEGORIES, PERFORMERS, PLAN_TYPES, SCHEDULE_MODES } from './enums.js';
import { formatDateTime, formatWeek, personName } from './format.js';
import { valueLabel } from './labels.js';
import { formatHours, formatLoad, occurrenceBadge, planWarningText } from './planning.js';
import { allowedWeeks, moveBlocker } from './planning-rules.js';

/** Frequencies offered first (spec §4), in weeks. */
export const FREQUENCIES = [1, 2, 4, 8, 13, 26, 52];

/** "Every 13 weeks (quarterly)". Pure. */
export function frequencyText(weeks) {
  const names = {
    1: 'weekly',
    2: 'every other week',
    4: 'monthly',
    13: 'quarterly',
    26: 'twice a year',
    52: 'yearly',
  };
  return `Every ${weeks} week${weeks === 1 ? '' : 's'}${names[weeks] ? ` (${names[weeks]})` : ''}`;
}

/** Default tolerance, as the server computes it: a quarter of the period, at most 8. Pure. */
export const defaultTolerance = (frequency) => Math.min(8, Math.floor(frequency / 4));

/**
 * Values of the plan form → API body. Empty optional fields are left out at creation and sent
 * as null when editing (so a field can be cleared). Pure.
 * @param {Record<string, string | boolean>} raw form values
 * @param {{ editing: boolean, assetId: number | null }} options
 */
export function planBody(raw, { editing, assetId }) {
  const text = (v) => (typeof v === 'string' ? v.trim() : v);
  const number = (v) => (text(v) === '' || v === undefined ? null : Number(v));
  const body = {
    title: text(raw.title),
    type: raw.type,
    category: raw.category || null,
    asset_id: assetId,
    site: assetId ? undefined : text(raw.site) || null,
    building: assetId ? undefined : text(raw.building) || null,
    location: text(raw.location) || null,
    estimated_hours: number(raw.estimated_hours),
    frequency_weeks: number(raw.frequency_weeks),
    anchor_week: text(raw.anchor_week),
    end_week: text(raw.end_week) || null,
    schedule_mode: raw.schedule_mode,
    tolerance_weeks: number(raw.tolerance_weeks),
    season_from_week: number(raw.season_from_week),
    season_to_week: number(raw.season_to_week),
    performed_by: raw.performed_by,
    supplier: raw.performed_by === 'CONTRACTOR' ? text(raw.supplier) || null : null,
    description: text(raw.description) || null,
    ...(editing && { is_active: Boolean(raw.is_active) }),
  };
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || (!editing && value === null)) delete body[key];
  }
  // Left empty: the trade stays (or comes from the asset), the tolerance stays (or follows
  // the frequency).
  if (body.category === null) delete body.category;
  if (body.tolerance_weeks === null) delete body.tolerance_weeks;
  return body;
}

/** Checks of the plan form before asking the server. Pure. */
export function checkPlanForm(body, { hasAssetCode }) {
  const errors = {};
  if (!body.title) errors.title = 'Required';
  if (!hasAssetCode && !body.site) errors.site = 'Choose an asset or a site';
  if (!hasAssetCode && !body.category) errors.category = 'Required without an asset';
  if (
    !(body.estimated_hours > 0) ||
    body.estimated_hours * 2 !== Math.round(body.estimated_hours * 2)
  ) {
    errors.estimated_hours = 'Hours in steps of half an hour';
  }
  if (
    !Number.isInteger(body.frequency_weeks) ||
    body.frequency_weeks < 1 ||
    body.frequency_weeks > 104
  ) {
    errors.frequency_weeks = 'Between 1 and 104 weeks';
  }
  if (!/^\d{4}-W\d{2}$/.test(body.anchor_week ?? '')) errors.anchor_week = 'Choose a week';
  if (body.end_week && body.anchor_week && body.end_week < body.anchor_week) {
    errors.end_week = 'The end week cannot be before the first visit.';
  }
  if (((body.season_from_week ?? null) === null) !== ((body.season_to_week ?? null) === null)) {
    errors[body.season_from_week ? 'season_to_week' : 'season_from_week'] =
      'Give both ends of the season, or neither.';
  }
  if (body.performed_by === 'CONTRACTOR' && !body.supplier) {
    errors.supplier = 'Name the contractor who performs the visits.';
  }
  return errors;
}

const field = (dt, dd) =>
  dd === null || dd === undefined || dd === '' ? null : [h('dt', {}, dt), h('dd', {}, dd)];

/**
 * A small one-field form of the panel: a labelled control, a button, and a line for the answer.
 * `submit` resolves to an error message, or null when done.
 */
function actionForm(id, label, control, buttonText, submit, { hint = null, danger = false } = {}) {
  control.id = id;
  const error = h('p', { id: `${id}-error`, class: 'field-error', role: 'alert' });
  control.setAttribute('aria-describedby', `${id}-error${hint ? ` ${id}-hint` : ''}`);
  const form = h(
    'form',
    {
      class: 'panel-action',
      novalidate: true,
      onSubmit: async (event) => {
        event.preventDefault();
        error.textContent = '';
        const message = await submit(control.value.trim());
        if (message) {
          error.textContent = message;
          control.setAttribute('aria-invalid', 'true');
          control.focus();
        } else control.removeAttribute('aria-invalid');
      },
    },
    h('label', { for: id }, label),
    hint ? h('p', { id: `${id}-hint`, class: 'field-hint' }, hint) : null,
    h(
      'div',
      { class: 'panel-action-row' },
      control,
      h(
        'button',
        {
          type: 'submit',
          class: `button ${danger ? 'button-danger' : 'button-secondary'} online-only`,
        },
        buttonText,
      ),
    ),
    error,
  );
  return form;
}

/** "Weeks 47 to 53 (± 3 weeks around week 50)". Pure. */
export function allowedText(plan, occurrence, currentWeek) {
  const { from, to } = allowedWeeks(plan, occurrence, currentWeek);
  if (from > to) return 'No week is available any more.';
  const n = (week) => Number(week.slice(6));
  const range =
    from === to ? `Only ${formatWeek(from)}` : `${formatWeek(from)} to ${formatWeek(to)}`;
  const why =
    plan.type === 'REGULATORY'
      ? `regulatory: earlier only, up to week ${n(occurrence.due_week)}`
      : `± ${plan.tolerance_weeks} week${plan.tolerance_weeks === 1 ? '' : 's'} around week ${n(occurrence.due_week)}`;
  return `Allowed: ${range} (${why}).`;
}

/** Move, skip and restore of the visit shown (supervisors, admins). */
function occurrenceActions(plan, occurrence, { currentWeek, onMove, onSkip, onRestore }) {
  if (occurrence.status === 'SKIPPED') {
    return occurrence.work_order
      ? null
      : h(
          'div',
          { class: 'detail-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'button button-secondary online-only',
              onClick: () => onRestore(occurrence),
            },
            'Restore this visit',
          ),
        );
  }
  if (occurrence.status !== 'PLANNED' || occurrence.week < currentWeek) return null;
  const week = h('input', { type: 'week', value: occurrence.week, placeholder: '2026-W45' });
  const reason = h('input', { type: 'text', maxlength: '500', autocomplete: 'off' });
  return [
    actionForm(
      'occ-move-week',
      'Move this visit to week',
      week,
      'Move visit',
      async (value) => {
        if (!/^\d{4}-W\d{2}$/.test(value)) return 'Choose a week.';
        if (value === occurrence.week) return 'The visit is already in this week.';
        const blocker = moveBlocker(plan, occurrence, value, currentWeek);
        if (blocker) return blocker.message;
        return onMove({
          kind: 'occurrence',
          planId: plan.id,
          code: plan.code,
          id: occurrence.id,
          week: value,
          from: occurrence.week,
          version: occurrence.version,
        });
      },
      { hint: allowedText(plan, occurrence, currentWeek) },
    ),
    actionForm(
      'occ-skip-reason',
      'Skip this visit',
      reason,
      'Skip visit',
      async (value) => (value ? onSkip(occurrence, value) : 'Say why the visit is skipped.'),
      {
        hint: 'e.g. "Building closed for works". The visit leaves the load; it can be restored.',
        danger: true,
      },
    ),
  ];
}

function occurrenceBox(plan, occurrence, actions) {
  return h(
    'section',
    { class: 'occurrence-box', 'aria-labelledby': 'occurrence-heading' },
    h('h3', { id: 'occurrence-heading' }, `Visit of ${formatWeek(occurrence.week)}`),
    h(
      'dl',
      { class: 'detail-fields' },
      field('Status', occurrenceBadge(occurrence.status)),
      field('Due week', formatWeek(occurrence.due_week)),
      field(
        'Planned week',
        occurrence.week === occurrence.due_week
          ? formatWeek(occurrence.week)
          : `${formatWeek(occurrence.week)} (moved)`,
      ),
      field(
        'Work order',
        occurrence.work_order
          ? h(
              'a',
              { href: `/work-orders/${occurrence.work_order.id}`, 'data-link': true },
              `${occurrence.work_order.number} (${valueLabel('work_order_status', occurrence.work_order.status)})`,
            )
          : occurrence.status === 'PLANNED'
            ? `Created ${plan.release_weeks_ahead ?? 4} weeks before the visit`
            : null,
      ),
      field('Reason for skipping', occurrence.skip_reason),
      field(
        'Warning',
        [
          occurrence.warnings?.includes('OUT_OF_SEASON')
            ? `⚠ Outside the season (weeks ${plan.season_from_week} to ${plan.season_to_week}). `
            : '',
          occurrence.warnings?.includes('BLOCKED_WEEK') ? '⚠ In a blocked week.' : '',
        ].join('') || null,
      ),
    ),
    actions ? occurrenceActions(plan, occurrence, actions) : null,
  );
}

/** Move the whole series from the panel (same as dragging the first planned visit). */
function seriesForm(plan, { onMove }) {
  const week = h('input', { type: 'week', value: plan.anchor_week, placeholder: '2026-W45' });
  return h(
    'section',
    { class: 'plan-series', 'aria-labelledby': 'plan-series-heading' },
    h('h3', { id: 'plan-series-heading' }, 'Move the series'),
    actionForm(
      'plan-anchor-week',
      'First visit of the series',
      week,
      'Move series',
      async (value) => {
        if (!/^\d{4}-W\d{2}$/.test(value)) return 'Choose a week.';
        if (value === plan.anchor_week) return 'The series already starts this week.';
        // An anchor in the past is fine: the series goes on from this week on its own weeks.
        return onMove({
          kind: 'series',
          planId: plan.id,
          code: plan.code,
          anchor: value,
          from: plan.anchor_week,
          version: plan.version,
        });
      },
      {
        hint: 'The planned visits follow; visits moved by hand keep their offset; visits with a work order stay.',
      },
    ),
  );
}

/**
 * Plan panel: the visit clicked (if any), the plan's details and its next visits.
 * @param {HTMLElement} container
 * @param {{ plan: object, occurrence: object | null, settings: object, canEdit: boolean,
 *   onClose: () => void, onEdit: () => void }} options
 */
export function renderPlanPanel(
  container,
  { plan, occurrence, settings, canEdit, currentWeek, onClose, onEdit, onMove, onSkip, onRestore },
) {
  const actions = canEdit ? { currentWeek, onMove, onSkip, onRestore } : null;
  const warning = planWarningText(plan.warnings, settings);
  replaceChildren(
    container,
    panelHeader(`${plan.code} — ${plan.title}`, onClose),
    plan.is_active
      ? null
      : h('p', { class: 'detail-message' }, 'This plan is inactive: it creates no more visits.'),
    occurrence
      ? occurrenceBox(
          { ...plan, release_weeks_ahead: settings.release_weeks_ahead },
          occurrence,
          actions,
        )
      : null,
    canEdit
      ? h(
          'div',
          { class: 'detail-actions' },
          h(
            'button',
            { type: 'button', class: 'button button-secondary online-only', onClick: onEdit },
            'Edit plan',
          ),
        )
      : null,
    canEdit && plan.is_active ? seriesForm(plan, actions) : null,
    h(
      'dl',
      { class: 'detail-fields' },
      field('Type', valueLabel('work_order_type', plan.type)),
      field('Trade', valueLabel('category', plan.category)),
      field(
        'Asset',
        plan.asset
          ? h(
              'a',
              { href: `/assets/${plan.asset.id}`, 'data-link': true },
              `${plan.asset.code} — ${plan.asset.name}`,
            )
          : null,
      ),
      field('Site', plan.site),
      field('Building', plan.building),
      field('Location', plan.location),
      field('Hours per visit', [formatHours(plan.estimated_hours), warning ? ` ⚠ ${warning}` : '']),
      field('Frequency', frequencyText(plan.frequency_weeks)),
      field('First visit', formatWeek(plan.anchor_week)),
      field('Last week', plan.end_week ? formatWeek(plan.end_week) : 'Open-ended'),
      field('Calendar', valueLabel('schedule_mode', plan.schedule_mode)),
      field('Tolerance', `± ${plan.tolerance_weeks} week${plan.tolerance_weeks === 1 ? '' : 's'}`),
      field(
        'Season',
        plan.season_from_week ? `Weeks ${plan.season_from_week} to ${plan.season_to_week}` : null,
      ),
      field(
        'Done by',
        plan.performed_by === 'CONTRACTOR' ? `Contractor: ${plan.supplier}` : 'Internal team',
      ),
      field('Instructions', plan.description),
      field('Created by', plan.created_by ? personName(plan.created_by) : null),
      field(
        'Last modified',
        `${formatDateTime(plan.updated_at)}${plan.updated_by ? ` by ${personName(plan.updated_by)}` : ''}`,
      ),
    ),
    h(
      'section',
      { class: 'plan-visits', 'aria-labelledby': 'plan-visits-heading' },
      h('h3', { id: 'plan-visits-heading' }, 'Next visits'),
      plan.occurrences.length
        ? h(
            'ul',
            { class: 'plan-visit-list' },
            plan.occurrences.map((o) =>
              h(
                'li',
                {},
                h('span', { class: 'plan-visit-week' }, formatWeek(o.week)),
                ' ',
                occurrenceBadge(o.status),
                o.work_order
                  ? [
                      ' ',
                      h(
                        'a',
                        { href: `/work-orders/${o.work_order.id}`, 'data-link': true },
                        o.work_order.number,
                      ),
                    ]
                  : null,
              ),
            ),
          )
        : h('p', { class: 'muted' }, 'No visit planned.'),
    ),
  );
}

/**
 * Plan form in the side panel: creation (`plan` null) or edition.
 * @param {HTMLElement} container
 * @param {{ plan: object | null, sites: string[], onClose: () => void,
 *   onSubmit: (values: object, form: HTMLFormElement, assetCode: string) => void }} options
 */
export function renderPlanForm(
  container,
  { plan, sites, defaultWeek, onClose, onSubmit, pickAsset },
) {
  const editing = Boolean(plan);
  const input = (name, attrs = {}) =>
    h('input', { name, type: 'text', value: plan?.[name] ?? '', ...attrs });
  const select = (name, options, { empty = null, value } = {}) => {
    const control = h(
      'select',
      { name },
      empty === null ? null : h('option', { value: '' }, empty),
      options.map(([v, label]) => h('option', { value: v }, label)),
    );
    control.value = value ?? plan?.[name] ?? (empty === null ? options[0][0] : '');
    return control;
  };

  const assetCode = h('input', {
    name: 'asset_code',
    type: 'text',
    value: plan?.asset?.code ?? '',
    autocapitalize: 'characters',
    autocomplete: 'off',
  });
  // The chosen asset in words, so the user sees what the code stands for.
  const describe = (asset) =>
    asset
      ? `${asset.code} — ${asset.name}, ${[asset.site, asset.building].filter(Boolean).join(' · ')}`
      : '';
  const assetName = h(
    'p',
    { class: 'asset-chosen' },
    plan?.asset ? `${plan.asset.code} — ${plan.asset.name}` : '',
  );
  assetCode.addEventListener('input', () => {
    assetName.textContent = '';
  });
  const browse = h(
    'button',
    {
      type: 'button',
      class: 'button button-secondary online-only',
      onClick: async () => {
        const site = form.elements.site.value.trim();
        const asset = await pickAsset({
          ...(form.elements.category.value && { category: form.elements.category.value }),
          ...(sites.includes(site) && { site }),
        });
        if (!asset) return;
        assetCode.value = asset.code;
        assetName.textContent = describe(asset);
        // The site and building follow the asset (BR-P9): clear the typed ones.
        form.elements.site.value = '';
        form.elements.building.value = '';
        assetCode.setAttribute('aria-invalid', 'false');
        assetCode.focus();
      },
    },
    'Browse assets…',
  );
  const performer = select(
    'performed_by',
    PERFORMERS.map((p) => [p, valueLabel('performed_by', p)]),
  );
  const supplier = input('supplier', { maxlength: '150' });
  const supplierRow = formRow('p-supplier', 'Contractor', supplier, { required: true });
  supplierRow.hidden = performer.value !== 'CONTRACTOR';
  performer.addEventListener('change', () => {
    supplierRow.hidden = performer.value !== 'CONTRACTOR';
  });
  const siteList = h(
    'datalist',
    { id: 'p-site-list' },
    sites.map((s) => h('option', { value: s })),
  );
  const frequencyList = h(
    'datalist',
    { id: 'p-frequency-list' },
    FREQUENCIES.map((f) => h('option', { value: String(f) }, frequencyText(f))),
  );
  const active = editing
    ? h('input', { name: 'is_active', type: 'checkbox', checked: plan.is_active })
    : null;

  const assetRow = formRow('p-asset_code', 'Asset code', assetCode, {
    hint: 'Type a code or browse the assets. The site, building and trade then follow the asset.',
  });
  const pick = h('div', { class: 'asset-pick' });
  assetCode.before(pick);
  pick.append(assetCode, browse);
  assetRow.querySelector('.form-control').append(assetName);

  const form = h(
    'form',
    {
      class: 'detail-form plan-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const raw = Object.fromEntries(new FormData(form));
        if (active) raw.is_active = active.checked;
        onSubmit(raw, form, assetCode.value.trim());
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h('p', { class: 'form-help' }, 'Fields marked * are required.'),
    formRow('p-title', 'What is done', input('title', { maxlength: '200' }), {
      required: true,
      hint: 'e.g. "Quarterly service, Tower A chiller"',
    }),
    formRow(
      'p-type',
      'Type',
      select(
        'type',
        PLAN_TYPES.map((t) => [t, valueLabel('work_order_type', t)]),
      ),
      {
        required: true,
        hint: 'Regulatory visits have a legal deadline.',
      },
    ),
    assetRow,
    formRow('p-site', 'Site', input('site', { list: 'p-site-list', maxlength: '200' }), {
      hint: 'Without an asset.',
    }),
    formRow('p-building', 'Building', input('building', { maxlength: '100' })),
    formRow(
      'p-category',
      'Trade',
      select(
        'category',
        CATEGORIES.map((c) => [c, valueLabel('category', c)]),
        { empty: "The asset's trade" },
      ),
    ),
    formRow('p-location', 'Location', input('location', { maxlength: '200' })),
    formRow(
      'p-estimated_hours',
      'Hours per visit',
      input('estimated_hours', {
        type: 'number',
        min: '0.5',
        max: '200',
        step: '0.5',
        inputmode: 'decimal',
      }),
      {
        required: true,
        hint: 'In half hours. Above 3 h 30 the visit will be split into several blocks.',
      },
    ),
    formRow(
      'p-frequency_weeks',
      'Every (weeks)',
      input('frequency_weeks', {
        type: 'number',
        min: '1',
        max: '104',
        step: '1',
        list: 'p-frequency-list',
      }),
      { required: true, hint: '1, 2, 4, 8, 13 (quarterly), 26 or 52 (yearly).' },
    ),
    formRow(
      'p-anchor_week',
      'First visit',
      input('anchor_week', {
        type: 'week',
        value: plan?.anchor_week ?? defaultWeek,
        placeholder: '2026-W45',
      }),
      {
        required: true,
        hint: editing
          ? 'Changing it moves every planned visit.'
          : 'The next visits follow every period.',
      },
    ),
    formRow(
      'p-end_week',
      'Last week',
      input('end_week', { type: 'week', placeholder: '2027-W52' }),
      {
        hint: 'End of the contract. Empty: no end.',
      },
    ),
    formRow(
      'p-schedule_mode',
      'Calendar',
      select(
        'schedule_mode',
        SCHEDULE_MODES.map((m) => [m, valueLabel('schedule_mode', m)]),
      ),
      { hint: '"From the last visit": the next visits restart from the week a visit is closed.' },
    ),
    formRow(
      'p-tolerance_weeks',
      'Tolerance (weeks)',
      input('tolerance_weeks', { type: 'number', min: '0', max: '8', step: '1' }),
      { hint: 'How far one visit may move. Empty: a quarter of the period, at most 8.' },
    ),
    formRow(
      'p-season_from_week',
      'Season from week',
      input('season_from_week', { type: 'number', min: '1', max: '53', step: '1' }),
    ),
    formRow(
      'p-season_to_week',
      'Season to week',
      input('season_to_week', { type: 'number', min: '1', max: '53', step: '1' }),
      { hint: 'e.g. 14 to 22 for checks before summer. May run over the new year (45 to 10).' },
    ),
    formRow('p-performed_by', 'Done by', performer, { required: true }),
    supplierRow,
    formRow(
      'p-description',
      'Instructions',
      h('textarea', { name: 'description', rows: '3', maxlength: '4000' }, plan?.description ?? ''),
    ),
    active
      ? formRow('p-is_active', 'Active', active, {
          hint: 'An inactive plan keeps its history and creates no more visits.',
        })
      : null,
    siteList,
    frequencyList,
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        { type: 'submit', class: 'button button-primary online-only' },
        editing ? 'Save' : 'Create plan',
      ),
      h('button', { type: 'button', class: 'button button-secondary', onClick: onClose }, 'Cancel'),
    ),
  );
  replaceChildren(
    container,
    panelHeader(editing ? `Edit ${plan.code}` : 'New maintenance plan', onClose),
    form,
  );
}

/** Server errors on the form: `asset_id` is typed as an asset code. Pure. */
export function planFieldErrors(fields) {
  const { asset_id: asset, ...rest } = fields;
  return asset ? { ...rest, asset_code: asset } : rest;
}

/**
 * Blocked weeks panel (BR-P8): the weeks to avoid from this week on, for one site or all.
 * Supervisors and admins add and remove them; the planner warns, it never refuses.
 * @param {HTMLElement} container
 * @param {{ items: object[], sites: string[], canEdit: boolean, onClose: () => void,
 *   onAdd: (values: object, form: HTMLFormElement) => void, onRemove: (item: object) => void }} options
 */
export function renderBlockedWeeksPanel(
  container,
  { items, sites, canEdit, onClose, onAdd, onRemove },
) {
  const site = h(
    'select',
    { name: 'site' },
    h('option', { value: '' }, 'Every site'),
    sites.map((s) => h('option', { value: s }, s)),
  );
  const form = canEdit
    ? h(
        'form',
        {
          class: 'detail-form blocked-form',
          novalidate: true,
          onSubmit: (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(form));
            onAdd(
              { week: values.week, reason: values.reason.trim(), site: values.site || null },
              form,
            );
          },
        },
        h('h3', {}, 'Block a week'),
        h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
        formRow(
          'bw-week',
          'Week',
          h('input', { name: 'week', type: 'week', placeholder: '2026-W52' }),
          {
            required: true,
          },
        ),
        formRow('bw-site', 'Site', site),
        formRow(
          'bw-reason',
          'Reason',
          h('input', { name: 'reason', type: 'text', maxlength: '200' }),
          {
            required: true,
            hint: 'e.g. "Data center change freeze", "Summer holidays".',
          },
        ),
        h(
          'div',
          { class: 'form-actions' },
          h('button', { type: 'submit', class: 'button button-primary online-only' }, 'Block week'),
        ),
      )
    : null;
  replaceChildren(
    container,
    panelHeader('Blocked weeks', onClose),
    h(
      'p',
      {},
      'Visits should avoid these weeks. The planner warns about visits planned in them (⛔ in the week header, ⚠ on the visit), it does not refuse them.',
    ),
    items.length
      ? h(
          'ul',
          { class: 'blocked-list' },
          items.map((item) =>
            h(
              'li',
              {},
              h('strong', {}, formatWeek(item.week)),
              ` · ${item.site ?? 'Every site'} · ${item.reason}`,
              canEdit
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'button button-secondary online-only',
                      'aria-label': `Remove ${formatWeek(item.week)}, ${item.site ?? 'every site'}`,
                      onClick: () => onRemove(item),
                    },
                    'Remove',
                  )
                : null,
            ),
          ),
        )
      : h('p', { class: 'muted' }, 'No week is blocked from this week on.'),
    form,
  );
}

/** 'Week 45' (the year only when it differs from the current week's). Pure. */
const shortWeek = (week, currentWeek) =>
  week.slice(0, 4) === currentWeek.slice(0, 4) ? `Week ${Number(week.slice(6))}` : formatWeek(week);

/**
 * Highest load of one trade in one week (the trade imbalance the assistant lowers): the
 * week's hours of the trade against the trade's weekly capacity. Pure.
 */
export function peakTradeLoad(figures, capacityByCategory) {
  let peak = 0;
  for (const f of figures) {
    for (const [trade, hours] of Object.entries(f.by_category)) {
      const capacity = capacityByCategory[trade];
      if (capacity > 0) peak = Math.max(peak, hours / capacity);
    }
  }
  return peak;
}

/**
 * Before → after lines of a balancing proposal (Phase 20): peak load, weeks over capacity,
 * tight weeks, and the busiest week of a trade. Pure.
 * @param {{ figures: object[], tiles: object }} before
 * @param {{ figures: object[], tiles: object }} after with the moves kept
 * @param {Record<string, number>} capacityByCategory weekly capacity per trade
 * @returns {{ label: string, before: string, after: string, better: boolean }[]}
 */
export function proposalSummary(before, after, capacityByCategory) {
  const line = (label, b, a, format) => ({
    label,
    before: format(b),
    after: format(a),
    better: a < b - 1e-9,
  });
  const work = (side) => side.tiles.workload;
  return [
    line('Peak week load', work(before).peak_load ?? 0, work(after).peak_load ?? 0, formatLoad),
    line('Weeks over capacity', work(before).weeks_over, work(after).weeks_over, String),
    line('Tight weeks (85–100%)', work(before).weeks_tight, work(after).weeks_tight, String),
    line(
      'Busiest week of one trade',
      peakTradeLoad(before.figures, capacityByCategory),
      peakTradeLoad(after.figures, capacityByCategory),
      formatLoad,
    ),
  ];
}

/**
 * Panel of the balancing assistant (Phase 20): what the proposal changes (before → after for
 * the moves ticked), then the moves, each with a checkbox, and Accept or Discard. Nothing is
 * saved before Accept.
 * @param {HTMLElement} container
 * @param {{ proposal: object, after: object, selected: Set<number>, currentWeek: string,
 *   capacityByCategory: Record<string, number>, loadOf: (week: string) => number | null, onToggle: (id: number, on: boolean) => void,
 *   onToggleAll: (on: boolean) => void, onAccept: () => void, onClose: () => void }} options
 */
export function renderSuggestionsPanel(
  container,
  {
    proposal,
    after,
    selected,
    currentWeek,
    capacityByCategory,
    loadOf,
    onToggle,
    onToggleAll,
    onAccept,
    onClose,
  },
) {
  const { moves } = proposal;
  const week = (w) => shortWeek(w, currentWeek);
  const summary = proposalSummary(proposal.before, after, capacityByCategory);
  const list = moves.length
    ? h(
        'ul',
        { class: 'proposal-list' },
        moves.map((m) => {
          const id = `proposal-${m.occurrence_id}`;
          return h(
            'li',
            {},
            h('input', {
              type: 'checkbox',
              id,
              checked: selected.has(m.occurrence_id),
              onChange: (event) => onToggle(m.occurrence_id, event.target.checked),
            }),
            h(
              'label',
              { for: id },
              h('strong', {}, `${m.code} · ${week(m.from)} → ${week(m.to)}`),
              h(
                'span',
                { class: 'muted' },
                `${m.title} · ${valueLabel('category', m.category)} · ${formatHours(m.estimated_hours)}${
                  m.type === 'REGULATORY' ? ' · § regulatory' : ''
                }`,
              ),
              h(
                'span',
                { class: 'muted' },
                `Due ${week(m.due_week)}. Load now: ${week(m.from)} ${formatLoad(loadOf(m.from))}, ${week(m.to)} ${formatLoad(loadOf(m.to))}.`,
              ),
            ),
          );
        }),
      )
    : null;
  const count = moves.filter((m) => selected.has(m.occurrence_id)).length;
  replaceChildren(
    container,
    panelHeader('Suggested moves', onClose),
    moves.length
      ? [
          h(
            'p',
            {},
            `${moves.length} visit${moves.length === 1 ? '' : 's'} could move to smooth the weeks shown. Each stays within its plan's tolerance and season, outside blocked weeks, and a regulatory visit only moves earlier. Nothing is saved until you accept.`,
          ),
          h(
            'table',
            { class: 'proposal-summary' },
            h('caption', { class: 'visually-hidden' }, 'Figures before and after the moves ticked'),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col' }, 'Figure'),
                h('th', { scope: 'col' }, 'Now'),
                h('th', { scope: 'col' }, 'With the moves ticked'),
              ),
            ),
            h(
              'tbody',
              {},
              summary.map((row) =>
                h(
                  'tr',
                  {},
                  h('th', { scope: 'row' }, row.label),
                  h('td', { class: 'numeric' }, row.before),
                  h(
                    'td',
                    { class: `numeric${row.better ? ' is-better' : ''}` },
                    row.after,
                    row.better ? h('span', { class: 'visually-hidden' }, ' (lower)') : null,
                  ),
                ),
              ),
            ),
          ),
          h(
            'div',
            { class: 'form-actions' },
            h(
              'button',
              {
                type: 'button',
                class: 'button button-secondary',
                onClick: () => onToggleAll(true),
              },
              'Tick all',
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'button button-secondary',
                onClick: () => onToggleAll(false),
              },
              'Untick all',
            ),
          ),
          list,
          h(
            'div',
            { class: 'form-actions' },
            h(
              'button',
              {
                type: 'button',
                class: 'button button-primary online-only',
                disabled: !count,
                onClick: onAccept,
              },
              `Accept ${count} move${count === 1 ? '' : 's'}`,
            ),
            h(
              'button',
              { type: 'button', class: 'button button-secondary', onClick: onClose },
              'Discard',
            ),
          ),
        ]
      : h(
          'p',
          {},
          'The weeks shown are already as smooth as the plans allow: no visit can move to lower the load within its rules.',
        ),
  );
}
