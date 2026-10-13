// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Editable detail panel and work order creation form. Controls are generated from the field
// definitions (entities.js); values are read back in API form (null for empty).
import { h } from './dom.js';
import { ENTITIES } from './entities.js';
import { ENUMS } from './enums.js';
import { isEmpty, renderValue } from './format.js';
import { valueLabel } from './labels.js';
import { statusOptions } from './rules.js';

const MULTILINE = new Set(['description', 'comment', 'work_report']);
const MAX_LENGTH = { title: 200, name: 200, comment: 2000, description: 4000, work_report: 4000 };

/** Detail field definition for an API field (asset_id → the asset definition). */
function defForApiField(entity, apiField) {
  const { fields } = ENTITIES[entity];
  const field = Object.keys(fields).find((f) => (fields[f].editField ?? f) === apiField);
  return { field, def: fields[field] };
}

/** Fields marked * (the API refuses them empty). */
const REQUIRED_FIELDS = {
  assets: ['name', 'site', 'category', 'criticality', 'status'],
  work_orders: ['title', 'type'],
};

/** Empty strings and blank text become null, as the API expects. */
const textValue = (raw) => (raw.trim() === '' ? null : raw);

/** Values compare equal when both are "no value" or strictly equal. */
export const sameValue = (a, b) => (isEmpty(a) && isEmpty(b)) || a === b;

/**
 * Builds the control of one API field.
 * @returns {{ el: HTMLElement, input: HTMLElement, read: () => unknown, write: (v: unknown) => void }}
 *   read() returns undefined when the input cannot be turned into a value (unknown asset code)
 */
function buildControl(entity, apiField, value, ctx) {
  const { def } = defForApiField(entity, apiField);
  const id = `f-${apiField}`;
  const common = { id, name: apiField, 'aria-describedby': `${id}-error` };

  const select = (options, { allowBlank, blankLabel = '— None —' } = {}) => {
    const el = h(
      'select',
      common,
      allowBlank ? h('option', { value: '' }, blankLabel) : null,
      options.map(([v, label]) => h('option', { value: v }, label)),
    );
    el.value = value ?? '';
    return el;
  };

  if (apiField === 'status' && entity === 'work_orders') {
    const current = ctx.record?.status ?? 'OPEN';
    const el = select(statusOptions(current).map((s) => [s, valueLabel('work_order_status', s)]));
    return { el, input: el, read: () => el.value, write: (v) => (el.value = v ?? current) };
  }
  if (def.type === 'enum') {
    const nullable = entity === 'work_orders' && apiField === 'category';
    // Creation forms never pre-select a required value silently: "— Choose —" first.
    const choose = !nullable && ctx.mode === 'create' && (value === null || value === undefined);
    const el = select(
      ENUMS[def.enum].map((code) => [code, valueLabel(def.enum, code)]),
      { allowBlank: nullable || choose, blankLabel: nullable ? '— None —' : '— Choose —' },
    );
    return {
      el,
      input: el,
      read: () => (el.value === '' ? null : el.value),
      write: (v) => (el.value = v ?? ''),
    };
  }
  if (apiField === 'site' && entity === 'assets') {
    // Assets may be on a new site: free text, with the known sites as suggestions.
    const listId = `${id}-options`;
    const el = h('input', {
      ...common,
      type: 'text',
      maxlength: 200,
      list: listId,
      autocomplete: 'off',
    });
    el.value = value ?? '';
    return {
      el: h(
        'div',
        {},
        el,
        h(
          'datalist',
          { id: listId },
          (ctx.refs.sites ?? []).map((s) => h('option', { value: s })),
        ),
      ),
      input: el,
      read: () => textValue(el.value),
      write: (v) => (el.value = v ?? ''),
    };
  }
  if (apiField === 'site') {
    const sites = [...new Set([...(ctx.refs.sites ?? []), ...(value ? [value] : [])])].sort();
    const el = select(
      sites.map((s) => [s, s]),
      { allowBlank: ctx.mode === 'create', blankLabel: '— Choose a site —' },
    );
    return {
      el,
      input: el,
      read: () => (el.value === '' ? null : el.value),
      write: (v) => (el.value = v ?? ''),
    };
  }
  if (def.type === 'user') {
    const roles =
      apiField === 'supervisor_id' ? ['SUPERVISOR', 'ADMIN'] : ['TECHNICIAN', 'SUPERVISOR'];
    const people = (ctx.refs.users ?? []).filter((u) => roles.includes(u.role));
    const current = ctx.record?.[apiField.replace('_id', '')];
    if (current && !people.some((u) => u.id === current.id)) people.push(current);
    const el = select(
      people.map((u) => [
        String(u.id),
        `${u.first_name} ${u.last_name}${u.role ? ` (${valueLabel('role', u.role)})` : ''}`,
      ]),
      { allowBlank: true, blankLabel: '— Unassigned —' },
    );
    el.value = value === null || value === undefined ? '' : String(value);
    return {
      el,
      input: el,
      read: () => (el.value === '' ? null : Number(el.value)),
      write: (v) => (el.value = v === null || v === undefined ? '' : String(v)),
    };
  }
  if (def.type === 'asset') return buildAssetControl(common, id, value, ctx);
  if (def.type === 'week') {
    // ISO week 'YYYY-Www' (D55); browsers without a week picker show a text field.
    const el = h('input', {
      ...common,
      type: 'week',
      placeholder: 'YYYY-Www, e.g. 2026-W43',
      value: value ?? '',
    });
    return {
      el,
      input: el,
      read: () => (el.value.trim() === '' ? null : el.value.trim()),
      write: (v) => (el.value = v ?? ''),
    };
  }
  if (def.type === 'date') {
    const el = h('input', { ...common, type: 'date', value: value ?? '' });
    return {
      el,
      input: el,
      read: () => (el.value === '' ? null : el.value),
      write: (v) => (el.value = v ?? ''),
    };
  }
  if (def.type === 'boolean') {
    const el = h('input', { ...common, type: 'checkbox', class: 'checkbox' });
    el.checked = Boolean(value);
    return { el, input: el, read: () => el.checked, write: (v) => (el.checked = Boolean(v)) };
  }
  if (def.type === 'hours') {
    const el = h('input', {
      ...common,
      type: 'number',
      min: '0',
      max: '10000',
      step: '0.25',
      inputmode: 'decimal',
      value: value ?? '',
    });
    return {
      el,
      input: el,
      read: () => (el.value === '' ? null : Number(el.value)),
      write: (v) => (el.value = v ?? ''),
    };
  }
  const el = MULTILINE.has(apiField)
    ? h('textarea', { ...common, rows: '4', maxlength: MAX_LENGTH[apiField] ?? 4000 })
    : h('input', { ...common, type: 'text', maxlength: MAX_LENGTH[apiField] ?? 200 });
  el.value = value ?? '';
  return { el, input: el, read: () => textValue(el.value), write: (v) => (el.value = v ?? '') };
}

/**
 * Asset chooser: the user types an asset code; the hint shows which asset it is.
 * `value` is the asset reference { id, code, name } or null.
 */
function buildAssetControl(common, id, value, ctx) {
  let resolved = value ? value.id : null;
  const input = h('input', {
    ...common,
    type: 'text',
    placeholder: 'Asset code, e.g. AST-0042',
    autocomplete: 'off',
    'aria-describedby': `${id}-hint ${id}-error`,
    value: value?.code ?? '',
  });
  const hint = h(
    'p',
    { id: `${id}-hint`, class: 'field-hint' },
    value ? `${value.code} — ${value.name}` : 'No asset',
  );

  const resolve = async () => {
    const code = input.value.trim();
    if (!code) {
      resolved = null;
      hint.textContent = 'No asset';
      ctx.onAsset?.(null);
      ctx.onChange?.();
      return;
    }
    hint.textContent = 'Looking up…';
    const asset = await ctx.findAssetByCode(code);
    resolved = asset ? asset.id : undefined;
    hint.textContent = asset
      ? `${asset.code} — ${asset.name} (${asset.site})`
      : 'Unknown asset code';
    ctx.onAsset?.(asset);
    ctx.onChange?.();
  };
  input.addEventListener('change', resolve);

  // Browse the asset list instead of typing a code (needs a connection).
  const browse = ctx.pickAsset
    ? h(
        'button',
        {
          type: 'button',
          class: 'button button-secondary online-only',
          onClick: async () => {
            const asset = await ctx.pickAsset();
            if (!asset) return;
            input.value = asset.code;
            resolved = asset.id;
            hint.textContent = `${asset.code} — ${asset.name} (${asset.site})`;
            ctx.onAsset?.(asset);
            ctx.onChange?.();
            input.focus();
          },
        },
        'Browse assets…',
      )
    : null;

  return {
    el: h(
      'div',
      { class: 'asset-control' },
      h('div', { class: 'asset-pick' }, input, browse),
      hint,
    ),
    input,
    read: () => resolved,
    async write(v) {
      resolved = v ?? null;
      if (v === null || v === undefined) {
        input.value = '';
        hint.textContent = 'No asset';
        ctx.onAsset?.(null);
        return;
      }
      const asset = await ctx.findAssetById(v);
      input.value = asset?.code ?? '';
      hint.textContent = asset ? `${asset.code} — ${asset.name} (${asset.site})` : `Asset #${v}`;
      ctx.onAsset?.(asset);
    },
  };
}

/**
 * Builds labelled rows: a control for each editable field, the value as text for the others.
 * @returns {{ rows: HTMLElement[], controls: Map<string, object> }}
 */
function buildRows(entity, fieldOrder, editable, values, ctx) {
  const cfg = ENTITIES[entity];
  const controls = new Map();
  const rows = [];
  for (const field of fieldOrder) {
    const def = cfg.fields[field];
    const apiField = def.editField ?? field;
    if (editable.includes(apiField)) {
      const control = buildControl(
        entity,
        apiField,
        def.type === 'asset' ? values[field] : values[apiField],
        ctx,
      );
      controls.set(apiField, control);
      control.input.addEventListener('input', () => {
        // The user is fixing this field: its error message no longer applies.
        control.input.removeAttribute('aria-invalid');
        const error = control.input.closest('.form-control')?.querySelector('.field-error');
        if (error) error.textContent = '';
        ctx.onChange?.();
      });
      control.input.addEventListener('change', () => ctx.onChange?.());
      const required =
        REQUIRED_FIELDS[entity].includes(apiField) ||
        (entity === 'work_orders' && apiField === 'site' && ctx.mode !== 'create');
      rows.push(
        h(
          'div',
          { class: 'form-row' },
          h(
            'label',
            { for: `f-${apiField}` },
            def.label,
            required ? h('span', { class: 'required', 'aria-hidden': 'true' }, ' *') : null,
          ),
          h(
            'div',
            { class: 'form-control' },
            control.el,
            h('p', { id: `f-${apiField}-error`, class: 'field-error' }),
          ),
        ),
      );
    } else if (!isEmpty(values[field])) {
      rows.push(
        h(
          'div',
          { class: 'form-row is-readonly' },
          h('span', { class: 'field-label' }, def.label),
          h('div', { class: 'field-value' }, renderValue(field, def, values[field])),
        ),
      );
    }
  }
  // The site follows the asset (BR-W2): disabled while an asset is chosen.
  const site = controls.get('site');
  if (site && controls.has('asset_id')) {
    ctx.onAsset = (asset) => {
      if (asset) site.write(asset.site);
      site.input.disabled = Boolean(asset) || controls.get('asset_id').read() !== null;
    };
    site.input.disabled = values.asset_id !== null && values.asset_id !== undefined;
  }
  return { rows, controls };
}

/** Shared error display for both forms. */
function errorApi(form, controls, summary) {
  return {
    /** @param {Record<string, string>} fields @param {string} [message] */
    setErrors(fields = {}, message = '') {
      for (const [apiField, control] of controls) {
        const text = fields[apiField] ?? '';
        form.querySelector(`#f-${apiField}-error`).textContent = text;
        if (text) control.input.setAttribute('aria-invalid', 'true');
        else control.input.removeAttribute('aria-invalid');
      }
      const unknownFields = Object.keys(fields).filter((f) => !controls.has(f));
      summary.textContent = [message, ...unknownFields.map((f) => `${f}: ${fields[f]}`)]
        .filter(Boolean)
        .join(' ');
    },
    focusFirstError() {
      const invalid = form.querySelector('[aria-invalid="true"]');
      (invalid ?? summary).focus();
    },
  };
}

/**
 * Editable detail panel body: form with controls for `editable` fields (API names) and the
 * other fields as text. Save and Discard are enabled when something changed.
 * @returns {object} handle: getChanges, setValues, setErrors, focusFirstError, setDirty
 */
export function buildEditForm({
  entity,
  record,
  editable,
  ctx,
  onSave,
  onDiscard,
  fields = ENTITIES[entity].detailFields,
}) {
  const fullCtx = { ...ctx, record, mode: 'edit' };
  const { rows, controls } = buildRows(entity, fields, editable, record, fullCtx);
  const summary = h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' });
  const save = h(
    'button',
    { type: 'submit', class: 'button button-primary', disabled: true },
    'Save',
  );
  const discard = h(
    'button',
    { type: 'button', class: 'button button-secondary', disabled: true, onClick: onDiscard },
    'Discard changes',
  );
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        onSave();
      },
    },
    summary,
    rows,
    h('div', { class: 'form-actions' }, save, discard),
  );

  return {
    form,
    /** Changes against the record; `invalid` lists fields that could not be read. */
    getChanges() {
      const changes = {};
      const invalid = [];
      for (const [apiField, control] of controls) {
        const value = control.read();
        if (value === undefined) invalid.push(apiField);
        else if (!sameValue(value, record[apiField])) changes[apiField] = value;
      }
      return { changes, invalid };
    },
    async setValues(values) {
      for (const [apiField, value] of Object.entries(values))
        await controls.get(apiField)?.write(value);
    },
    setDirty(dirty) {
      save.disabled = !dirty;
      discard.disabled = !dirty;
    },
    ...errorApi(form, controls, summary),
  };
}

/** Field order of the creation forms. */
export const ASSET_CREATION_ORDER = [
  'code',
  'name',
  'site',
  'building',
  'floor',
  'exact_location',
  'category',
  'subcategory',
  'criticality',
  'status',
  'brand',
  'model',
  'serial_number',
  'commissioned_on',
  'last_serviced_on',
  'supplier',
  'maintenance_contract',
  'responsible_technician',
  'comment',
];
const CREATION_ORDER = [
  'title',
  'type',
  'priority',
  'asset',
  'site',
  'location',
  'category',
  'description',
  'assignee',
  'supervisor',
  'due_on',
  'estimated_hours',
];

const CREATION = {
  work_orders: {
    order: CREATION_ORDER,
    defaults: { type: 'CORRECTIVE', priority: 'NORMAL' },
    help: 'Fields marked * are required. Choose an asset, or a site if the work is not about one asset.',
  },
  assets: {
    order: ASSET_CREATION_ORDER,
    defaults: { status: 'IN_SERVICE' },
    help: 'Fields marked * are required. Leave the asset code empty to number the asset automatically (AST-0501, …).',
  },
};

/**
 * Creation form: work orders (D15, D26) or assets. `fields`: API fields the user may set.
 * @param {object} options
 * @param {'work_orders' | 'assets'} [options.entity]
 * @param {boolean} [options.onlineOnly] submit needs a connection (disabled offline)
 * @returns {object} handle: form, getValues, setValues, setErrors, focusFirstError
 */
export function buildCreateForm({
  entity = 'work_orders',
  fields,
  values,
  ctx,
  submitLabel,
  onSubmit,
  onlineOnly = false,
}) {
  const spec = CREATION[entity];
  const fullCtx = { ...ctx, record: null, mode: 'create' };
  const display = { ...spec.defaults, ...values };
  // buildRows reads detail field names; the asset row needs the asset reference object.
  if (entity === 'work_orders') display.asset = values.asset ?? null;
  const { rows, controls } = buildRows(entity, spec.order, fields, display, fullCtx);
  const summary = h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' });
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        onSubmit();
      },
    },
    summary,
    h('p', { class: 'form-help' }, spec.help),
    rows,
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        { type: 'submit', class: `button button-primary${onlineOnly ? ' online-only' : ''}` },
        submitLabel,
      ),
    ),
  );
  return {
    form,
    /** Values to send; `invalid` lists fields that could not be read. */
    getValues() {
      const out = {};
      const invalid = [];
      for (const [apiField, control] of controls) {
        const value = control.read();
        if (value === undefined) invalid.push(apiField);
        else if (!isEmpty(value)) out[apiField] = value;
      }
      return { values: out, invalid };
    },
    async setValues(next) {
      for (const [apiField, value] of Object.entries(next))
        await controls.get(apiField)?.write(value);
    },
    ...errorApi(form, controls, summary),
  };
}
