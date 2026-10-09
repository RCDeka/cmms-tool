// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Editing and creation in the detail panel (docs/architecture.md → Save modes, Work order
// creation). Every save goes through the sync queue (D11); drafts are kept in IndexedDB (D29).
import { currentUser } from './auth.js';
import * as DB from './db.js';
import { storesOf } from './db.js';
import { notice, renderDetail } from './detail.js';
import { h } from './dom.js';
import { formatDateTime } from './format.js';
import { buildCreateForm, buildEditForm } from './form.js';
import { commentsSection } from './comments.js';
import { historySection } from './history.js';
import { reviewPanel } from './review.js';
import { announce, confirmDialog } from './layout.js';
import { apiFetch } from './api.js';
import { applyToPage, isOnline } from './network.js';
import { enqueue, discard, listEntries, pendingChanges } from './queue.js';
import { findAssetById, findAssetByCode } from './refs.js';
import { openAssetPicker } from './asset-picker.js';
import { detailUrl, listUrl, navigate, parseRoute } from './router.js';
import {
  ASSET_CREATION_FIELDS,
  canManageAssets,
  canReviewRequests,
  checkBeforeCreate,
  checkBeforeCreateAsset,
  checkBeforeSave,
  CREATION_FIELDS,
  editableFields,
} from './rules.js';
import {
  DRAFT_DELAY_MS,
  debounce,
  decideOnLeave,
  deleteDraft,
  getDraft,
  saveDraft,
} from './save-modes.js';

const detailContainer = document.getElementById('detail-container');

/** Lists for dropdowns, set by app.js (loaded in the background). */
let refsPromise = Promise.resolve({ sites: [], users: [] });
/** Asset references seen in forms, to show names for changes waiting to sync. */
const assetRefs = new Map();
/** Called after a save to show the record again (app.js re-renders the current route). */
let rerender = () => {};
/** Tells the view a record changed on the server through a direct (online) action. */
let serverRecordListener = () => {};

/**
 * The form open in the detail panel, or null.
 * @type {null | { kind: 'edit' | 'create' | 'pending', entity: string, id: number | string,
 *   record: object, handle: object, dirty: boolean, draftLater: Function, route: object }}
 */
let editor = null;

export function setRefs(promise) {
  refsPromise = promise;
}

/** Lists for dropdowns and names (sites, users). */
export function getRefs() {
  return refsPromise;
}

export function setRerender(fn) {
  rerender = fn;
}

/** @param {(entity: string, item: object) => void} fn */
export function setServerRecordListener(fn) {
  serverRecordListener = fn;
}

export function currentEditor() {
  return editor;
}

export function clearEditor() {
  editor?.draftLater.flush();
  editor = null;
}

/** Local calendar date 'YYYY-MM-DD' (temporary records; the server sets the real date). */
const localToday = () => new Intl.DateTimeFormat('en-CA').format(new Date());

async function formCtx() {
  const refs = await refsPromise;
  return {
    refs,
    async findAssetByCode(code) {
      const asset = await findAssetByCode(code);
      if (asset) assetRefs.set(asset.id, asset);
      return asset;
    },
    async findAssetById(id) {
      const asset = await findAssetById(id);
      if (asset) assetRefs.set(asset.id, asset);
      return asset;
    },
    async pickAsset() {
      const asset = await openAssetPicker({
        dialog: document.getElementById('asset-dialog'),
        fetchPage: (query) => apiFetch(`/assets?${query}`),
        sites: refs.sites,
      });
      if (asset) assetRefs.set(asset.id, asset);
      return asset;
    },
    onChange: () => onInput(),
  };
}

async function userRefFor(id) {
  if (id === null || id === undefined) return null;
  const user = (await refsPromise).users.find((u) => u.id === id);
  return user
    ? { id, first_name: user.first_name, last_name: user.last_name }
    : { id, first_name: 'User', last_name: `#${id}` };
}

/**
 * A record with the changes waiting in the queue applied on top, so the user sees what they
 * saved even before the server confirms it. Marked `_pending`.
 */
export function withPending(entity, record) {
  const changes = pendingChanges(entity, record.id);
  if (!changes) return record;
  const out = { ...record, ...changes, _pending: true };
  if ('asset_id' in changes && changes.asset_id !== record.asset_id) {
    const ref = assetRefs.get(changes.asset_id);
    out.asset =
      changes.asset_id === null
        ? null
        : (ref ?? { id: changes.asset_id, code: `#${changes.asset_id}`, name: '' });
  }
  return out;
}

/** Work orders created on this device and not yet on the server, newest first. */
export async function loadPendingCreations() {
  const records = await DB.getAll(storesOf('work_orders').records);
  return records
    .filter((r) => typeof r.id === 'string' && r.id.startsWith('tmp-'))
    .map((r) => ({ ...withPending('work_orders', r), _pendingCreate: true }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

// --- Drafts -------------------------------------------------------------------------------

function persistDraftOf(ed) {
  return debounce(async () => {
    if (!ed.dirty) {
      await deleteDraft(ed.entity, ed.id);
      return;
    }
    if (ed.kind === 'edit') {
      await saveDraft({
        entity: ed.entity,
        id: ed.id,
        base_version: ed.record.version,
        changes: ed.handle.getChanges().changes,
      });
    } else {
      await saveDraft({ entity: ed.entity, id: ed.id, changes: ed.handle.getValues().values });
    }
  }, DRAFT_DELAY_MS);
}

function onInput() {
  const ed = editor;
  if (!ed) return;
  if (ed.kind === 'edit') {
    ed.dirty = Object.keys(ed.handle.getChanges().changes).length > 0;
    ed.handle.setDirty(ed.dirty);
  } else {
    ed.dirty = JSON.stringify(ed.handle.getValues().values) !== ed.initial;
  }
  ed.draftLater();
}

function draftNotice(draft, onRestore, onDiscard) {
  return notice(
    'info',
    `Unsaved draft from ${formatDateTime(draft.updated_at)}. `,
    h(
      'button',
      { type: 'button', class: 'button button-secondary', onClick: onRestore },
      'Restore',
    ),
    ' ',
    h(
      'button',
      { type: 'button', class: 'button button-secondary', onClick: onDiscard },
      'Discard',
    ),
  );
}

// --- Existing records ---------------------------------------------------------------------

/**
 * Shows a record in the detail panel: an edit form if the user may change something, else
 * read-only fields.
 * @param {{ route: object, record: object, onClose: () => void }} options record already
 *   includes pending changes (withPending)
 */
export async function showRecord({ route, record, onClose }) {
  const entity = route.entity;
  const user = currentUser();
  const draft = await getDraft(entity, route.id);
  const editable = editableFields(entity, user, record);

  const notices = [];
  if (entity === 'work_orders' && record.review_status === 'PENDING') {
    notices.push(
      canReviewRequests(user)
        ? reviewPanel({
            record,
            users: (await getRefs()).users,
            onReview: (body) => submitReview(record, body),
          })
        : notice(
            'info',
            'This staff request is waiting for a supervisor’s review: it will then be assigned.',
          ),
    );
  }
  if (record._pending) {
    notices.push(
      notice(
        'info',
        h('span', { 'aria-hidden': 'true' }, '⟳ '),
        'Your changes are saved on this device and waiting to be sent to the server.',
      ),
    );
  }
  if (draft?.error) {
    notices.push(
      notice(
        draft.error.locked ? 'warning' : 'danger',
        h('strong', {}, 'Your last change was not saved. '),
        draft.error.message,
        editable.length ? ' Your edits are shown below.' : '',
      ),
    );
  }
  const actions = [];
  if (entity === 'assets') {
    actions.push(
      h(
        'a',
        {
          href: `/work-orders/new?asset_id=${record.id}`,
          'data-link': true,
          class: 'button button-secondary',
        },
        '+ New work order for this asset',
      ),
    );
    if (canManageAssets(user)) {
      actions.push(
        h(
          'button',
          {
            type: 'button',
            class: 'button button-danger online-only',
            onClick: () => deleteAsset(route, record),
          },
          'Delete asset',
        ),
      );
    }
  }

  const consoleLink = ['SUPERVISOR', 'ADMIN'].includes(user.role);
  if (!editable.length) {
    editor = null;
    renderDetail(detailContainer, { entity, record, onClose, notices, actions, consoleLink });
    detailContainer.append(...recordSections(entity, record, user));
    applyToPage(detailContainer);
    return;
  }

  const ed = { kind: 'edit', entity, id: route.id, record, dirty: false, route };
  ed.handle = buildEditForm({
    entity,
    record,
    editable,
    ctx: await formCtx(),
    onSave: () => saveRecord(),
    onDiscard: async () => {
      ed.draftLater.cancel();
      ed.dirty = false;
      await deleteDraft(entity, route.id);
      rerender();
    },
  });
  ed.draftLater = persistDraftOf(ed);

  const restore = async () => {
    await ed.handle.setValues(draft.changes);
    onInput();
    detailContainer.querySelector('.banner-info button')?.closest('.banner')?.remove();
    ed.handle.focusFirstError();
  };
  if (draft && !draft.error && Object.keys(draft.changes ?? {}).length) {
    notices.push(
      draftNotice(draft, restore, async () => {
        await deleteDraft(entity, route.id);
        rerender();
      }),
    );
  }

  editor = ed;
  renderDetail(detailContainer, {
    entity,
    record,
    onClose,
    notices,
    actions,
    body: ed.handle.form,
  });
  detailContainer.append(...recordSections(entity, record, user));
  applyToPage(detailContainer);
  if (draft?.error && editable.length) {
    await ed.handle.setValues(draft.changes);
    ed.handle.setErrors(mapErrorFields(draft.error.fields), '');
    onInput();
  }
}

/**
 * Sections below a record: the conversation with the requester (work orders, D46) and the
 * history. A work order not yet created on the server has neither.
 */
function recordSections(entity, record, user) {
  const sections = [historySection(entity, record.id, historyLookups)];
  if (entity === 'work_orders' && typeof record.id === 'number') {
    sections.unshift(commentsSection(record.id, user));
  }
  return sections;
}

/** Names of people and assets that appear in history entries. */
async function historyLookups(entries) {
  const ids = new Set(
    entries
      .flatMap((e) => [e.changes.asset_id?.from, e.changes.asset_id?.to])
      .filter((v) => v !== null && v !== undefined),
  );
  const assets = new Map();
  for (const id of ids) {
    const asset = await findAssetById(id);
    if (asset) assets.set(id, asset);
  }
  return { users: (await refsPromise).users, assets };
}

/** Field errors from the API: { field: message } (400) — other shapes are ignored. */
function mapErrorFields(fields) {
  return fields && !Array.isArray(fields) ? fields : {};
}

/** Queues the changes of the open edit form. Resolves to false when they are invalid. */
export async function saveRecord() {
  const ed = editor;
  if (!ed || ed.kind !== 'edit') return true;
  const { changes, invalid } = ed.handle.getChanges();
  if (invalid.length) {
    ed.handle.setErrors(
      Object.fromEntries(invalid.map((f) => [f, 'Unknown asset code'])),
      'Check the highlighted fields.',
    );
    ed.handle.focusFirstError();
    return false;
  }
  if (!Object.keys(changes).length) return true;
  const errors = checkBeforeSave(ed.entity, ed.record, changes);
  if (Object.keys(errors).length) {
    ed.handle.setErrors(errors, 'Check the highlighted fields.');
    ed.handle.focusFirstError();
    return false;
  }
  ed.draftLater.cancel();
  ed.dirty = false;
  await enqueue({
    op: 'update',
    entity: ed.entity,
    record_id: ed.id,
    base_version: ed.record.version,
    changes,
  });
  await deleteDraft(ed.entity, ed.id);
  announce(
    isOnline() ? 'Saving…' : 'Saved on this device. It will be sent when you are back online.',
  );
  if (editor === ed) rerender();
  return true;
}

// --- Assets: creation and deletion (online only, D34–D36) ---------------------------------

/**
 * Deletes an asset after confirmation (BR-A3). The server refuses assets with work orders,
 * a stale version or an open conflict, and says why.
 */
async function deleteAsset(route, record) {
  const choice = await confirmDialog({
    title: 'Delete this asset?',
    message: `${record.code} — ${record.name} will be deleted for good. Only assets without any work order can be deleted; otherwise set the status to Out of service.`,
    actions: [
      { value: 'delete', label: 'Delete', primary: true },
      { value: 'cancel', label: 'Cancel' },
    ],
  });
  if (choice !== 'delete') return;
  try {
    await apiFetch(`/assets/${record.id}?version=${record.version}`, { method: 'DELETE' });
  } catch (err) {
    await confirmDialog({
      title: 'The asset was not deleted',
      message: err.status === 0 ? 'The server cannot be reached.' : err.message,
      actions: [{ value: 'ok', label: 'OK', primary: true }],
    });
    return;
  }
  editor = null;
  await DB.remove(storesOf('assets').records, record.id);
  await deleteDraft('assets', record.id);
  await DB.evict(storesOf('assets').pages, []); // page contents changed: fetch them again
  announce(`${record.code} was deleted.`);
  navigate(listUrl('assets', route.page), { force: true });
}

/**
 * Sends the review of a staff request (D47). Resolves to the errors to show in the review
 * box, or null when it is done (or the user changed their mind).
 */
async function submitReview(record, body) {
  if (body.decision === 'REJECT') {
    const choice = await confirmDialog({
      title: 'Reject this request?',
      message: `${record.number} will be cancelled. The requester will see your reason.`,
      actions: [
        { value: 'reject', label: 'Reject', primary: true },
        { value: 'cancel', label: 'Cancel' },
      ],
    });
    if (choice !== 'reject') return null;
  }
  let item;
  try {
    ({ item } = await apiFetch(`/work-orders/${record.id}/review`, { method: 'PUT', body }));
  } catch (err) {
    const fields = err.body?.details?.fields;
    return {
      fields: fields && !Array.isArray(fields) ? fields : {},
      message:
        err.status === 0 ? 'The server cannot be reached: try again once connected.' : err.message,
    };
  }
  await DB.saveRecord(storesOf('work_orders').records, item.id, {
    ...item,
    _fetched_at: new Date().toISOString(),
  });
  await deleteDraft('work_orders', item.id);
  editor = null;
  serverRecordListener('work_orders', item);
  announce(
    body.decision === 'APPROVE'
      ? `${item.number} approved and assigned to ${item.assignee.first_name} ${item.assignee.last_name}.`
      : `${item.number} rejected.`,
  );
  rerender();
  return null;
}

/** Asset creation form (/assets/new): supervisors and admins, online. */
export async function showCreateAsset({ route, onClose }) {
  const draft = await getDraft('assets', 'new');
  const ed = { kind: 'create', entity: 'assets', id: 'new', record: null, dirty: false, route };
  ed.handle = buildCreateForm({
    entity: 'assets',
    fields: ASSET_CREATION_FIELDS,
    values: {},
    ctx: await formCtx(),
    submitLabel: 'Create asset',
    onlineOnly: true,
    onSubmit: () => submitCreateAsset(),
  });
  ed.initial = JSON.stringify(ed.handle.getValues().values);
  ed.draftLater = persistDraftOf(ed);

  const notices = [];
  if (!isOnline()) {
    notices.push(
      notice('warning', 'Creating an asset needs a connection. Your entries are kept as a draft.'),
    );
  }
  if (draft && Object.keys(draft.changes ?? {}).length) {
    notices.push(
      draftNotice(
        draft,
        async () => {
          await ed.handle.setValues(draft.changes);
          onInput();
          detailContainer.querySelector('.banner-info')?.remove();
          detailContainer.querySelector('#f-name')?.focus();
        },
        async () => {
          await deleteDraft('assets', 'new');
          detailContainer.querySelector('.banner-info')?.remove();
        },
      ),
    );
  }
  editor = ed;
  renderDetail(detailContainer, {
    entity: 'assets',
    record: {},
    title: 'New asset',
    onClose,
    notices,
    body: ed.handle.form,
  });
  applyToPage(detailContainer);
}

async function submitCreateAsset() {
  const ed = editor;
  if (!ed || ed.kind !== 'create' || ed.entity !== 'assets') return;
  const { values } = ed.handle.getValues();
  const errors = checkBeforeCreateAsset(values);
  if (Object.keys(errors).length) {
    ed.handle.setErrors(errors, 'Check the highlighted fields.');
    ed.handle.focusFirstError();
    return;
  }
  let item;
  try {
    ({ item } = await apiFetch('/assets', { method: 'POST', body: values }));
  } catch (err) {
    const fields = err.body?.details?.fields;
    ed.handle.setErrors(
      fields && !Array.isArray(fields) ? fields : {},
      err.status === 0
        ? 'The server cannot be reached. Your entries are kept as a draft.'
        : err.message,
    );
    ed.handle.focusFirstError();
    return;
  }
  ed.draftLater.cancel();
  await deleteDraft('assets', 'new');
  await DB.saveRecord(storesOf('assets').records, item.id, {
    ...item,
    _fetched_at: new Date().toISOString(),
  });
  await DB.evict(storesOf('assets').pages, []); // the new asset changes the page contents
  editor = null;
  announce(`Asset ${item.code} created.`);
  navigate(detailUrl('assets', item.id, ed.route.page), { replace: true, force: true });
}

// --- Creation -----------------------------------------------------------------------------

/** Creation form for /work-orders/new (?asset_id= pre-fills the asset). */
export async function showCreate({ route, onClose }) {
  const user = currentUser();
  const draft = await getDraft('work_orders', 'new');
  let prefill = {};
  if (route.assetId) {
    const asset = await findAssetById(route.assetId);
    if (asset) {
      assetRefs.set(asset.id, asset);
      prefill = { asset_id: asset.id, asset, site: asset.site, category: asset.category };
    }
  }
  const ed = {
    kind: 'create',
    entity: 'work_orders',
    id: 'new',
    record: null,
    dirty: false,
    route,
  };
  ed.handle = buildCreateForm({
    fields: CREATION_FIELDS[user.role],
    values: prefill,
    ctx: await formCtx(),
    submitLabel: 'Create work order',
    onSubmit: () => submitCreate(),
  });
  ed.initial = JSON.stringify(ed.handle.getValues().values);
  ed.draftLater = persistDraftOf(ed);

  const notices = [];
  if (draft && Object.keys(draft.changes ?? {}).length) {
    notices.push(
      draftNotice(
        draft,
        async () => {
          await ed.handle.setValues(draft.changes);
          onInput();
          detailContainer.querySelector('.banner-info')?.remove();
          detailContainer.querySelector('#f-title')?.focus();
        },
        async () => {
          await deleteDraft('work_orders', 'new');
          detailContainer.querySelector('.banner-info')?.remove();
        },
      ),
    );
  }
  editor = ed;
  renderDetail(detailContainer, {
    entity: 'work_orders',
    record: {},
    title: 'New work order',
    onClose,
    notices,
    body: ed.handle.form,
  });
}

/** Builds the temporary record shown until the server creates the work order. */
async function temporaryRecord(tmpId, clientId, values, editedAt) {
  const user = currentUser();
  const asset = values.asset_id
    ? (assetRefs.get(values.asset_id) ?? (await findAssetById(values.asset_id)))
    : null;
  const assigneeId = user.role === 'TECHNICIAN' ? user.id : (values.assignee_id ?? null);
  return {
    id: tmpId,
    client_id: clientId,
    number: null,
    status: 'OPEN',
    type: values.type,
    priority: values.priority ?? 'NORMAL',
    title: values.title,
    description: values.description ?? null,
    asset_id: values.asset_id ?? null,
    asset: asset
      ? { id: asset.id, code: asset.code, name: asset.name, site: asset.site, status: asset.status }
      : null,
    site: asset?.site ?? values.site ?? null,
    category: values.category ?? asset?.category ?? null,
    assignee_id: assigneeId,
    assignee: await userRefFor(assigneeId),
    supervisor_id: values.supervisor_id ?? null,
    supervisor: await userRefFor(values.supervisor_id),
    created_on: localToday(),
    due_on: values.due_on ?? null,
    estimated_hours: values.estimated_hours ?? null,
    created_by: { id: user.id, first_name: user.first_name, last_name: user.last_name },
    version: 0,
    has_conflict: false,
    updated_at: editedAt,
  };
}

/** Validates the creation form; returns its values or null (errors shown). */
function readCreateForm(ed) {
  const { values, invalid } = ed.handle.getValues();
  const errors = {
    ...checkBeforeCreate(values),
    ...Object.fromEntries(invalid.map((f) => [f, 'Unknown asset code'])),
  };
  if (Object.keys(errors).length) {
    ed.handle.setErrors(errors, 'Check the highlighted fields.');
    ed.handle.focusFirstError();
    return null;
  }
  return values;
}

/** Create: temporary record + queued creation, then show it (docs/architecture.md). */
async function submitCreate() {
  const ed = editor;
  if (!ed || ed.kind !== 'create') return;
  const values = readCreateForm(ed);
  if (!values) return;
  const clientId = crypto.randomUUID();
  const tmpId = `tmp-${clientId}`;
  const editedAt = new Date().toISOString();
  await DB.saveRecord(
    storesOf('work_orders').records,
    tmpId,
    await temporaryRecord(tmpId, clientId, values, editedAt),
  );
  ed.draftLater.cancel();
  await enqueue({
    op: 'create',
    entity: 'work_orders',
    record_id: tmpId,
    client_id: clientId,
    changes: values,
    edited_at: editedAt,
  });
  await deleteDraft('work_orders', 'new');
  editor = null;
  announce(
    isOnline()
      ? 'Creating the work order…'
      : 'Work order saved on this device. It will be created when you are back online.',
  );
  navigate(detailUrl('work_orders', tmpId, ed.route.page), { replace: true, force: true });
}

/** Optional creation fields: cleared ones must be sent as null when updating a pending creation. */
const CLEARABLE = [
  'description',
  'asset_id',
  'category',
  'assignee_id',
  'supervisor_id',
  'due_on',
  'estimated_hours',
];

/** Detail panel of a work order waiting to be created (`/work-orders/tmp-<uuid>`). */
export async function showPendingCreation({ route, onClose }) {
  const user = currentUser();
  const stored = await DB.getRecord(storesOf('work_orders').records, route.id);
  if (!stored) {
    editor = null;
    renderDetail(detailContainer, {
      entity: 'work_orders',
      record: {},
      title: 'New work order',
      onClose,
      notices: [
        notice(
          'info',
          'This work order has been created or discarded. ',
          h('a', { href: listUrl('work_orders'), 'data-link': true }, 'Back to the list'),
        ),
      ],
    });
    return;
  }
  const record = withPending('work_orders', stored);
  const entry = listEntries().find((e) => e.record_id === route.id);
  const draft = await getDraft('work_orders', route.id);
  const values = draft?.changes ? { ...record, ...draft.changes } : record;

  const ed = { kind: 'pending', entity: 'work_orders', id: route.id, record, dirty: false, route };
  ed.handle = buildCreateForm({
    fields: CREATION_FIELDS[user.role],
    values,
    ctx: await formCtx(),
    submitLabel: entry ? 'Update' : 'Retry creation',
    onSubmit: async () => {
      const next = readCreateForm(ed);
      if (!next) return;
      const changes = { ...Object.fromEntries(CLEARABLE.map((f) => [f, null])), ...next };
      if (user.role === 'TECHNICIAN') {
        delete changes.assignee_id;
        delete changes.supervisor_id;
      }
      await DB.saveRecord(storesOf('work_orders').records, route.id, {
        ...(await temporaryRecord(route.id, stored.client_id, next, new Date().toISOString())),
      });
      await enqueue({
        op: 'create',
        entity: 'work_orders',
        record_id: route.id,
        client_id: stored.client_id,
        changes,
      });
      await deleteDraft('work_orders', route.id);
      announce('Saved. The work order will be created with these values.');
      rerender();
    },
  });
  ed.initial = JSON.stringify(ed.handle.getValues().values);
  ed.draftLater = persistDraftOf(ed);

  const discardButton = h(
    'button',
    {
      type: 'button',
      class: 'button button-secondary',
      onClick: async () => {
        const choice = await confirmDialog({
          title: 'Discard this work order?',
          message: 'It has not been created on the server. Its details will be lost.',
          actions: [
            { value: 'discard', label: 'Discard', primary: true },
            { value: 'cancel', label: 'Cancel' },
          ],
        });
        if (choice !== 'discard') return;
        if (entry) await discard(entry.id);
        await DB.remove(storesOf('work_orders').records, route.id);
        await deleteDraft('work_orders', route.id);
        editor = null;
        announce('The work order was discarded.');
        navigate(listUrl('work_orders', route.page), { force: true });
      },
    },
    'Discard this work order',
  );

  const notices = [
    entry
      ? notice(
          'info',
          h('span', { 'aria-hidden': 'true' }, '⟳ '),
          'Waiting to be created on the server. It gets its number then.',
        )
      : null,
    draft?.error
      ? notice(
          'danger',
          h('strong', {}, 'The server refused this work order. '),
          draft.error.message,
          ' Fix it below and retry, or discard it.',
        )
      : null,
  ].filter(Boolean);

  editor = ed;
  renderDetail(detailContainer, {
    entity: 'work_orders',
    record,
    title: 'New work order (pending creation)',
    onClose,
    notices,
    actions: [discardButton],
    body: ed.handle.form,
  });
  if (draft?.error) ed.handle.setErrors(mapErrorFields(draft.error.fields), '');
}

// --- Leaving ------------------------------------------------------------------------------

/**
 * Navigation guard (router): what happens to unsaved changes when leaving the record.
 * Power users: queued automatically. Standard users: Save / Discard / Cancel.
 * Creation forms are never sent automatically; their draft is kept.
 * @returns {Promise<boolean>} false to stay
 */
export async function leaveGuard(toUrl) {
  const ed = editor;
  if (!ed) return true;
  const url = new URL(toUrl, location.origin);
  const to = parseRoute(url.pathname, url.search);
  if (to.name === 'detail' && to.entity === ed.entity && to.id === ed.id) return true;
  if (ed.kind !== 'edit') {
    ed.draftLater.flush();
    return true;
  }
  const decision = decideOnLeave({
    dirty: ed.dirty,
    powerUser: Boolean(currentUser()?.power_user),
  });
  if (decision === 'leave') return true;
  if (decision === 'save') return saveRecord();
  const choice = await confirmDialog({
    title: 'Unsaved changes',
    message: 'You changed this record but did not save it.',
    actions: [
      { value: 'save', label: 'Save', primary: true },
      { value: 'discard', label: 'Discard' },
      { value: 'cancel', label: 'Cancel' },
    ],
  });
  if (choice === 'save') return saveRecord();
  if (choice === 'discard') {
    ed.draftLater.cancel();
    ed.dirty = false;
    await deleteDraft(ed.entity, ed.id);
    return true;
  }
  return false;
}

/** Page unload: keep the draft; standard users also get the browser's "leave page?" prompt. */
export function onBeforeUnload(event) {
  if (!editor?.dirty) return;
  editor.draftLater.flush();
  if (editor.kind === 'edit' && !currentUser()?.power_user) {
    event.preventDefault();
    event.returnValue = '';
  }
}

/** Saves the draft immediately (tab hidden or closed). */
export function flushDraft() {
  editor?.draftLater.flush();
}

/**
 * Power users: drafts left by a tab closed before leaving the record are queued at startup
 * (docs/architecture.md → Power-user mode). Refused changes stay as drafts.
 */
export async function enqueueLeftoverDrafts(user) {
  if (!user?.power_user) return;
  for (const draft of await DB.getAll('drafts')) {
    if (draft.error || typeof draft.id !== 'number') continue;
    if (!Object.keys(draft.changes ?? {}).length) continue;
    await enqueue({
      op: 'update',
      entity: draft.entity,
      record_id: draft.id,
      base_version: draft.base_version,
      changes: draft.changes,
      edited_at: draft.updated_at,
    });
    await deleteDraft(draft.entity, draft.id);
  }
}
