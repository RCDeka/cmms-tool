// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Side panel of the year planner: a plan with the visit clicked on the grid, and the plan form
// (create, edit). Online only, like the planner (P18).
import { formRow, panelHeader } from './admin-users.js';
import { h, replaceChildren } from './dom.js';
import { CATEGORIES, PERFORMERS, PLAN_TYPES, SCHEDULE_MODES } from './enums.js';
import { formatDateTime, formatWeek, personName } from './format.js';
import { valueLabel } from './labels.js';
import { placeIndex, placeOf, placePicker } from './places.js';
import { formatHours, formatLoad, occurrenceBadge, planWarningText } from './planning.js';
import { allowedWeeks, moveBlocker } from './planning-rules.js';
import { t, tn } from './i18n.js';

/** Frequencies offered first (spec §4), in weeks. */
export const FREQUENCIES = [1, 2, 4, 8, 13, 26, 52];

/** "Every 13 weeks (quarterly)". Pure. */
export function frequencyText(weeks) {
  const names = {
    1: t('weekly'),
    2: t('every other week'),
    4: t('monthly'),
    13: t('quarterly'),
    26: t('twice a year'),
    52: t('yearly'),
  };
  const every = tn(weeks, 'Every {n} week', 'Every {n} weeks');
  return names[weeks] ? `${every} (${names[weeks]})` : every;
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
    // Without an asset, the place chosen (D82); with one, the asset's (BR-LOC8).
    location_id: assetId ? undefined : (raw.location_id ?? null),
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
  if (!body.title) errors.title = t('Required');
  if (!hasAssetCode && !body.location_id) errors.location_id = t('Choose an asset or a place');
  if (!hasAssetCode && !body.category) errors.category = t('Required without an asset');
  if (
    !(body.estimated_hours > 0) ||
    body.estimated_hours * 2 !== Math.round(body.estimated_hours * 2)
  ) {
    errors.estimated_hours = t('Hours in steps of half an hour');
  }
  if (
    !Number.isInteger(body.frequency_weeks) ||
    body.frequency_weeks < 1 ||
    body.frequency_weeks > 104
  ) {
    errors.frequency_weeks = t('Between 1 and 104 weeks');
  }
  if (!/^\d{4}-W\d{2}$/.test(body.anchor_week ?? '')) errors.anchor_week = t('Choose a week');
  if (body.end_week && body.anchor_week && body.end_week < body.anchor_week) {
    errors.end_week = t('The end week cannot be before the first visit.');
  }
  if (((body.season_from_week ?? null) === null) !== ((body.season_to_week ?? null) === null)) {
    errors[body.season_from_week ? 'season_to_week' : 'season_from_week'] = t(
      'Give both ends of the season, or neither.',
    );
  }
  if (body.performed_by === 'CONTRACTOR' && !body.supplier) {
    errors.supplier = t('Name the contractor who performs the visits.');
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
  if (from > to) return t('No week is available any more.');
  const n = (week) => Number(week.slice(6));
  const range =
    from === to
      ? t('Only {from}', { from: formatWeek(from) })
      : t('{from} to {to}', { from: formatWeek(from), to: formatWeek(to) });
  const why =
    plan.type === 'REGULATORY'
      ? t('regulatory: earlier only, up to week {due_week}', { due_week: n(occurrence.due_week) })
      : tn(plan.tolerance_weeks, '± {n} week around week {due}', '± {n} weeks around week {due}', {
          due: n(occurrence.due_week),
        });
  return t('Allowed: {range} ({why}).', { range, why });
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
            t('Restore this visit'),
          ),
        );
  }
  if (occurrence.status !== 'PLANNED' || occurrence.week < currentWeek) return null;
  const week = h('input', { type: 'week', value: occurrence.week, placeholder: '2026-W45' });
  const reason = h('input', { type: 'text', maxlength: '500', autocomplete: 'off' });
  return [
    actionForm(
      'occ-move-week',
      t('Move this visit to week'),
      week,
      t('Move visit'),
      async (value) => {
        if (!/^\d{4}-W\d{2}$/.test(value)) return t('Choose a week.');
        if (value === occurrence.week) return t('The visit is already in this week.');
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
      t('Skip this visit'),
      reason,
      t('Skip visit'),
      async (value) => (value ? onSkip(occurrence, value) : t('Say why the visit is skipped.')),
      {
        hint: t('e.g. "Building closed for works". The visit leaves the load; it can be restored.'),
        danger: true,
      },
    ),
  ];
}

function occurrenceBox(plan, occurrence, actions) {
  return h(
    'section',
    { class: 'occurrence-box', 'aria-labelledby': 'occurrence-heading' },
    h(
      'h3',
      { id: 'occurrence-heading' },
      t('Visit of {week}', { week: formatWeek(occurrence.week) }),
    ),
    h(
      'dl',
      { class: 'detail-fields' },
      field(t('Status'), occurrenceBadge(occurrence.status)),
      field(t('Due week'), formatWeek(occurrence.due_week)),
      field(
        t('Planned week'),
        occurrence.week === occurrence.due_week
          ? formatWeek(occurrence.week)
          : t('{week} (moved)', { week: formatWeek(occurrence.week) }),
      ),
      field(
        t('Work order'),
        occurrence.work_order
          ? h(
              'a',
              { href: `/work-orders/${occurrence.work_order.id}`, 'data-link': true },
              `${occurrence.work_order.number} (${valueLabel('work_order_status', occurrence.work_order.status)})`,
            )
          : occurrence.status === 'PLANNED'
            ? tn(
                plan.release_weeks_ahead ?? 4,
                'Created {n} week before the visit',
                'Created {n} weeks before the visit',
              )
            : null,
      ),
      field(t('Reason for skipping'), occurrence.skip_reason),
      field(
        t('Warning'),
        [
          occurrence.warnings?.includes('OUT_OF_SEASON')
            ? t('⚠ Outside the season (weeks {season_from_week} to {season_to_week}). ', {
                season_from_week: plan.season_from_week,
                season_to_week: plan.season_to_week,
              })
            : '',
          occurrence.warnings?.includes('BLOCKED_WEEK') ? t('⚠ In a blocked week.') : '',
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
    h('h3', { id: 'plan-series-heading' }, t('Move the series')),
    actionForm(
      'plan-anchor-week',
      t('First visit of the series'),
      week,
      t('Move series'),
      async (value) => {
        if (!/^\d{4}-W\d{2}$/.test(value)) return t('Choose a week.');
        if (value === plan.anchor_week) return t('The series already starts this week.');
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
        hint: t(
          'The planned visits follow; visits moved by hand keep their offset; visits with a work order stay.',
        ),
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
      : h('p', { class: 'detail-message' }, t('This plan is inactive: it creates no more visits.')),
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
            t('Edit plan'),
          ),
        )
      : null,
    canEdit && plan.is_active ? seriesForm(plan, actions) : null,
    h(
      'dl',
      { class: 'detail-fields' },
      field(t('Type'), valueLabel('work_order_type', plan.type)),
      field(t('Trade'), valueLabel('category', plan.category)),
      field(
        t('Asset'),
        plan.asset
          ? h(
              'a',
              { href: `/assets/${plan.asset.id}`, 'data-link': true },
              `${plan.asset.code} — ${plan.asset.name}`,
            )
          : null,
      ),
      field(t('Site'), plan.site),
      field(t('Place'), plan.place),
      field(t('Exact location'), plan.location),
      field(t('Hours per visit'), [
        formatHours(plan.estimated_hours),
        warning ? ` ⚠ ${warning}` : '',
      ]),
      field(t('Frequency'), frequencyText(plan.frequency_weeks)),
      field(t('First visit'), formatWeek(plan.anchor_week)),
      field(t('Last week'), plan.end_week ? formatWeek(plan.end_week) : t('Open-ended')),
      field(t('Calendar'), valueLabel('schedule_mode', plan.schedule_mode)),
      field(t('Tolerance'), tn(plan.tolerance_weeks, '± {n} week', '± {n} weeks')),
      field(
        t('Season'),
        plan.season_from_week
          ? t('Weeks {season_from_week} to {season_to_week}', {
              season_from_week: plan.season_from_week,
              season_to_week: plan.season_to_week,
            })
          : null,
      ),
      field(
        t('Done by'),
        plan.performed_by === 'CONTRACTOR'
          ? t('Contractor: {supplier}', { supplier: plan.supplier })
          : t('Internal team'),
      ),
      field(t('Instructions'), plan.description),
      field(t('Created by'), plan.created_by ? personName(plan.created_by) : null),
      field(
        t('Last modified'),
        `${formatDateTime(plan.updated_at)}${plan.updated_by ? t(' by {updated_by}', { updated_by: personName(plan.updated_by) }) : ''}`,
      ),
    ),
    h(
      'section',
      { class: 'plan-visits', 'aria-labelledby': 'plan-visits-heading' },
      h('h3', { id: 'plan-visits-heading' }, t('Next visits')),
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
        : h('p', { class: 'muted' }, t('No visit planned.')),
    ),
  );
}

/**
 * Plan form in the side panel: creation (`plan` null) or edition.
 * @param {HTMLElement} container
 * @param {{ plan: object | null, sites: string[], places: object | null, onClose: () => void,
 *   onSubmit: (values: object, form: HTMLFormElement, assetCode: string) => void }} options
 */
export function renderPlanForm(
  container,
  { plan, sites, places, defaultWeek, onClose, onSubmit, pickAsset },
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
      ? `${asset.code} — ${asset.name}, ${[asset.site, asset.place].filter(Boolean).join(' · ')}`
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
        const chosen = place.value();
        const site = chosen ? placeOf(index, chosen).site : '';
        const asset = await pickAsset({
          ...(form.elements.category.value && { category: form.elements.category.value }),
          ...(sites.includes(site) && { site }),
        });
        if (!asset) return;
        assetCode.value = asset.code;
        assetName.textContent = describe(asset);
        // The place follows the asset (BR-P9, BR-LOC8): clear the chosen one.
        place.set(null);
        assetCode.setAttribute('aria-invalid', 'false');
        assetCode.focus();
      },
    },
    t('Browse assets…'),
  );
  const performer = select(
    'performed_by',
    PERFORMERS.map((p) => [p, valueLabel('performed_by', p)]),
  );
  const supplier = input('supplier', { maxlength: '150' });
  const supplierRow = formRow('p-supplier', t('Contractor'), supplier, { required: true });
  supplierRow.hidden = performer.value !== 'CONTRACTOR';
  performer.addEventListener('change', () => {
    supplierRow.hidden = performer.value !== 'CONTRACTOR';
  });
  // Without an asset, a place of the cached tree (D82).
  const index = placeIndex(places);
  const place = placePicker({ id: 'p-location_id', index });
  place.set(plan && !plan.asset ? plan.location_id : null);
  const frequencyList = h(
    'datalist',
    { id: 'p-frequency-list' },
    FREQUENCIES.map((f) => h('option', { value: String(f) }, frequencyText(f))),
  );
  const active = editing
    ? h('input', { name: 'is_active', type: 'checkbox', checked: plan.is_active })
    : null;

  const assetRow = formRow('p-asset_code', t('Asset code'), assetCode, {
    hint: t('Type a code or browse the assets. The place and trade then follow the asset.'),
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
        raw.location_id = place.value();
        if (active) raw.is_active = active.checked;
        onSubmit(raw, form, assetCode.value.trim());
      },
    },
    h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
    h('p', { class: 'form-help' }, t('Fields marked * are required.')),
    formRow('p-title', t('What is done'), input('title', { maxlength: '200' }), {
      required: true,
      hint: t('e.g. "Quarterly service, Tower A chiller"'),
    }),
    formRow(
      'p-type',
      t('Type'),
      select(
        'type',
        PLAN_TYPES.map((type) => [type, valueLabel('work_order_type', type)]),
      ),
      {
        required: true,
        hint: t('Regulatory visits have a legal deadline.'),
      },
    ),
    assetRow,
    h(
      'div',
      { class: 'form-row' },
      h('label', { for: 'p-location_id' }, t('Place')),
      h(
        'div',
        { class: 'form-control' },
        place.element,
        h('p', { class: 'field-hint' }, t('Without an asset: the site, or a place in it.')),
        h('p', { id: 'p-location_id-error', class: 'field-error' }),
      ),
    ),
    formRow(
      'p-category',
      t('Trade'),
      select(
        'category',
        CATEGORIES.map((c) => [c, valueLabel('category', c)]),
        { empty: t("The asset's trade") },
      ),
    ),
    formRow('p-location', t('Exact location'), input('location', { maxlength: '200' })),
    formRow(
      'p-estimated_hours',
      t('Hours per visit'),
      input('estimated_hours', {
        type: 'number',
        min: '0.5',
        max: '200',
        step: '0.5',
        inputmode: 'decimal',
      }),
      {
        required: true,
        hint: t('In half hours. Above 3 h 30 the visit will be split into several blocks.'),
      },
    ),
    formRow(
      'p-frequency_weeks',
      t('Every (weeks)'),
      input('frequency_weeks', {
        type: 'number',
        min: '1',
        max: '104',
        step: '1',
        list: 'p-frequency-list',
      }),
      { required: true, hint: t('1, 2, 4, 8, 13 (quarterly), 26 or 52 (yearly).') },
    ),
    formRow(
      'p-anchor_week',
      t('First visit'),
      input('anchor_week', {
        type: 'week',
        value: plan?.anchor_week ?? defaultWeek,
        placeholder: '2026-W45',
      }),
      {
        required: true,
        hint: editing
          ? t('Changing it moves every planned visit.')
          : t('The next visits follow every period.'),
      },
    ),
    formRow(
      'p-end_week',
      t('Last week'),
      input('end_week', { type: 'week', placeholder: '2027-W52' }),
      {
        hint: t('End of the contract. Empty: no end.'),
      },
    ),
    formRow(
      'p-schedule_mode',
      t('Calendar'),
      select(
        'schedule_mode',
        SCHEDULE_MODES.map((m) => [m, valueLabel('schedule_mode', m)]),
      ),
      {
        hint: t('"From the last visit": the next visits restart from the week a visit is closed.'),
      },
    ),
    formRow(
      'p-tolerance_weeks',
      t('Tolerance (weeks)'),
      input('tolerance_weeks', { type: 'number', min: '0', max: '8', step: '1' }),
      { hint: t('How far one visit may move. Empty: a quarter of the period, at most 8.') },
    ),
    formRow(
      'p-season_from_week',
      t('Season from week'),
      input('season_from_week', { type: 'number', min: '1', max: '53', step: '1' }),
    ),
    formRow(
      'p-season_to_week',
      t('Season to week'),
      input('season_to_week', { type: 'number', min: '1', max: '53', step: '1' }),
      { hint: t('e.g. 14 to 22 for checks before summer. May run over the new year (45 to 10).') },
    ),
    formRow('p-performed_by', t('Done by'), performer, { required: true }),
    supplierRow,
    formRow(
      'p-description',
      t('Instructions'),
      h('textarea', { name: 'description', rows: '3', maxlength: '4000' }, plan?.description ?? ''),
    ),
    active
      ? formRow('p-is_active', t('Active'), active, {
          hint: t('An inactive plan keeps its history and creates no more visits.'),
        })
      : null,
    frequencyList,
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        { type: 'submit', class: 'button button-primary online-only' },
        editing ? t('Save') : t('Create plan'),
      ),
      h(
        'button',
        { type: 'button', class: 'button button-secondary', onClick: onClose },
        t('Cancel'),
      ),
    ),
  );
  replaceChildren(
    container,
    panelHeader(
      editing ? t('Edit {code}', { code: plan.code }) : t('New maintenance plan'),
      onClose,
    ),
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
    h('option', { value: '' }, t('Every site')),
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
        h('h3', {}, t('Block a week')),
        h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' }),
        formRow(
          'bw-week',
          t('Week'),
          h('input', { name: 'week', type: 'week', placeholder: '2026-W52' }),
          {
            required: true,
          },
        ),
        formRow('bw-site', t('Site'), site),
        formRow(
          'bw-reason',
          t('Reason'),
          h('input', { name: 'reason', type: 'text', maxlength: '200' }),
          {
            required: true,
            hint: t('e.g. "Data center change freeze", "Summer holidays".'),
          },
        ),
        h(
          'div',
          { class: 'form-actions' },
          h(
            'button',
            { type: 'submit', class: 'button button-primary online-only' },
            t('Block week'),
          ),
        ),
      )
    : null;
  replaceChildren(
    container,
    panelHeader(t('Blocked weeks'), onClose),
    h(
      'p',
      {},
      t(
        'Visits should avoid these weeks. The planner warns about visits planned in them (⛔ in the week header, ⚠ on the visit), it does not refuse them.',
      ),
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
              ` · ${item.site ?? t('Every site')} · ${item.reason}`,
              canEdit
                ? h(
                    'button',
                    {
                      type: 'button',
                      class: 'button button-secondary online-only',
                      'aria-label': t('Remove {week}, {value}', {
                        week: formatWeek(item.week),
                        value: item.site ?? t('every site'),
                      }),
                      onClick: () => onRemove(item),
                    },
                    t('Remove'),
                  )
                : null,
            ),
          ),
        )
      : h('p', { class: 'muted' }, t('No week is blocked from this week on.')),
    form,
  );
}

/** 'Week 45' (the year only when it differs from the current week's). Pure. */
const shortWeek = (week, currentWeek) =>
  week.slice(0, 4) === currentWeek.slice(0, 4)
    ? t('Week {week}', { week: Number(week.slice(6)) })
    : formatWeek(week);

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
    line(t('Peak week load'), work(before).peak_load ?? 0, work(after).peak_load ?? 0, formatLoad),
    line(t('Weeks over capacity'), work(before).weeks_over, work(after).weeks_over, String),
    line(t('Tight weeks (85–100%)'), work(before).weeks_tight, work(after).weeks_tight, String),
    line(
      t('Busiest week of one trade'),
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
                  m.type === 'REGULATORY' ? t(' · § regulatory') : ''
                }`,
              ),
              h(
                'span',
                { class: 'muted' },
                t('Due {week}. Load now: {week2} {loadOf}, {week3} {loadOf2}.', {
                  week: week(m.due_week),
                  week2: week(m.from),
                  loadOf: formatLoad(loadOf(m.from)),
                  week3: week(m.to),
                  loadOf2: formatLoad(loadOf(m.to)),
                }),
              ),
            ),
          );
        }),
      )
    : null;
  const count = moves.filter((m) => selected.has(m.occurrence_id)).length;
  replaceChildren(
    container,
    panelHeader(t('Suggested moves'), onClose),
    moves.length
      ? [
          h(
            'p',
            {},
            tn(
              moves.length,
              "{n} visit could move to smooth the weeks shown. Each stays within its plan's tolerance and season, outside blocked weeks, and a regulatory visit only moves earlier. Nothing is saved until you accept.",
              "{n} visits could move to smooth the weeks shown. Each stays within its plan's tolerance and season, outside blocked weeks, and a regulatory visit only moves earlier. Nothing is saved until you accept.",
            ),
          ),
          h(
            'table',
            { class: 'proposal-summary' },
            h(
              'caption',
              { class: 'visually-hidden' },
              t('Figures before and after the moves ticked'),
            ),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col' }, t('Figure')),
                h('th', { scope: 'col' }, t('Now')),
                h('th', { scope: 'col' }, t('With the moves ticked')),
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
                    row.better ? h('span', { class: 'visually-hidden' }, t(' (lower)')) : null,
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
              t('Tick all'),
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'button button-secondary',
                onClick: () => onToggleAll(false),
              },
              t('Untick all'),
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
              tn(count, 'Accept {n} move', 'Accept {n} moves'),
            ),
            h(
              'button',
              { type: 'button', class: 'button button-secondary', onClick: onClose },
              t('Discard'),
            ),
          ),
        ]
      : h(
          'p',
          {},
          t(
            'The weeks shown are already as smooth as the plans allow: no visit can move to lower the load within its rules.',
          ),
        ),
  );
}
