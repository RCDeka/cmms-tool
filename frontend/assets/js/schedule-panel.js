// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Side panels of the week scheduler (Phase 19, spec §8): schedule a work order of the tray
// (with the split proposal), a block (move, resize, note, appointment, remove), travel,
// preparation or other time, and a person's hours on a day. They are also the keyboard and
// screen reader path for everything the grid does by dragging. Online only (P18).
import { formRow, panelHeader } from './admin-users.js';
import { h, replaceChildren } from './dom.js';
import { CAPACITY_REASONS } from './enums.js';
import { formatDate, formatWeek, personName } from './format.js';
import { valueLabel } from './labels.js';
import { blockView, longDayLabel } from './schedule.js';
import {
  appointmentText,
  blockLengths,
  formatDuration,
  hoursToSchedule,
  leftText,
  lockTimes,
  splitProposal,
} from './schedule-rules.js';
import { t, tn } from './i18n.js';

const select = (name, options, value) =>
  h(
    'select',
    { name },
    options.map(([v, label]) =>
      h('option', { value: String(v), selected: String(v) === String(value) }, label),
    ),
  );
const personOptions = (data) =>
  data.people.filter((p) => !p.inactive).map((p) => [p.id, `${p.first_name} ${p.last_name}`]);
const dayOptions = (data) =>
  data.days.map((d) => [d.day, `${longDayLabel(d.day)}${d.open ? '' : t(' (not open)')}`]);
const lengthOptions = (max) => blockLengths(max).map((v) => [v, formatDuration(v)]);

const field = (dt, dd) =>
  dd === null || dd === undefined || dd === '' ? null : [h('dt', {}, dt), h('dd', {}, dd)];

const summary = () => h('p', { class: 'form-summary', role: 'alert', tabindex: '-1' });

const submitButton = (text, extra = '') =>
  h('button', { type: 'submit', class: `button button-primary online-only ${extra}` }, text);

/**
 * Day and person where the blocks of a work order start: the drop target, else the assignee
 * (or the first person) on today (or the first day shown). Pure.
 */
export function startOf(item, data, panel, today) {
  const people = data.people.filter((p) => !p.inactive);
  const person =
    (panel?.person && people.find((p) => p.id === panel.person)?.id) ??
    (item.assignee && people.find((p) => p.id === item.assignee.id)?.id) ??
    people[0]?.id;
  const days = data.days.map((d) => d.day);
  const day =
    panel?.day && days.includes(panel.day) ? panel.day : days.includes(today) ? today : days[0];
  return { person, day };
}

/**
 * Panel to schedule a work order of the tray: what is left, then one row per block (person,
 * day, length) prefilled with the split proposal (BR-S1), editable. Without an estimate, the
 * estimate is asked first (BR-S2).
 * @param {HTMLElement} container
 * @param {{ item: object, data: object, panel: object, today: string, canEdit: boolean,
 *   onClose: () => void,
 *   onSubmit: (input: { blocks: object[], estimate: number | null }, form: HTMLFormElement) => void }} options
 */
export function renderItemPanel(
  container,
  { item, data, panel, today, canEdit, onClose, onSubmit },
) {
  const max = data.settings.max_block_hours;
  const days = data.days.map((d) => d.day);
  const start = startOf(item, data, panel, today);
  const rows = h('ol', { class: 'block-rows' });
  const total = h('p', { class: 'block-total', role: 'status' });
  const estimate =
    item.needed_hours === null
      ? h('input', {
          name: 'estimate',
          type: 'number',
          min: '0.5',
          step: '0.5',
          inputmode: 'decimal',
        })
      : null;

  const needed = () => (estimate ? Number(estimate.value) || 0 : item.hours_left);
  let seq = 0;
  function addRow(block) {
    const n = ++seq;
    const row = h(
      'li',
      { class: 'block-row' },
      formRow(`sb-person-${n}`, t('Person'), select('person', personOptions(data), block.person)),
      formRow(`sb-day-${n}`, t('Day'), select('day', dayOptions(data), block.day)),
      formRow(`sb-hours-${n}`, t('Length'), select('hours', lengthOptions(max), block.hours)),
      h(
        'button',
        {
          type: 'button',
          class: 'button button-secondary',
          'aria-label': t('Remove block {n}', { n }),
          onClick: () => {
            row.remove();
            update();
            rows.querySelector('select')?.focus();
          },
        },
        t('block|Remove'),
      ),
    );
    rows.append(row);
  }
  function propose() {
    replaceChildren(rows);
    const hours = estimate ? needed() : hoursToSchedule(item, max);
    if (!hours) return update();
    for (const b of splitProposal(hours, start.day, days, max))
      addRow({ ...b, person: start.person });
    update();
  }
  function read() {
    return [...rows.querySelectorAll('.block-row')].map((row) => ({
      technician_id: Number(row.querySelector('[name="person"]').value),
      day: row.querySelector('[name="day"]').value,
      hours: Number(row.querySelector('[name="hours"]').value),
    }));
  }
  function update() {
    const blocks = read();
    const sum = blocks.reduce((s, b) => s + b.hours, 0);
    const left = needed() - sum;
    total.textContent = `${tn(blocks.length, '{hours} in {n} block', '{hours} in {n} blocks', {
      hours: formatDuration(sum),
    })}${left > 0 ? t(' · {left} still left after these', { left: formatDuration(left) }) : ''}`;
  }

  const form = canEdit
    ? h(
        'form',
        {
          class: 'detail-form schedule-form',
          novalidate: true,
          onChange: update,
          onSubmit: (event) => {
            event.preventDefault();
            onSubmit(
              {
                blocks: read().map((b) => ({ kind: 'WORK', work_order_id: item.id, ...b })),
                estimate: estimate ? Number(estimate.value) : null,
              },
              form,
            );
          },
        },
        h('h3', {}, t('Blocks')),
        summary(),
        estimate
          ? formRow('sb-estimate', t('Estimated time (hours)'), estimate, {
              required: true,
              hint: t(
                'This work order has no estimate yet: give one to know what is left (half-hour steps).',
              ),
            })
          : null,
        estimate
          ? h(
              'button',
              { type: 'button', class: 'button button-secondary', onClick: propose },
              t('Propose blocks for this estimate'),
            )
          : null,
        h(
          'p',
          { class: 'field-hint' },
          t('Blocks last {max} at most; a longer job is split over the following days.', {
            max: formatDuration(max),
          }),
        ),
        rows,
        h(
          'button',
          {
            type: 'button',
            class: 'button button-secondary',
            onClick: () => {
              const last = read().at(-1);
              addRow(last ?? { person: start.person, day: start.day, hours: Math.min(1, max) });
              update();
              rows.querySelector('.block-row:last-child select')?.focus();
            },
          },
          t('+ Add a block'),
        ),
        total,
        h('div', { class: 'form-actions' }, submitButton(t('Schedule'))),
      )
    : null;

  const where = [item.site, item.place].filter(Boolean).join(' · ');
  replaceChildren(
    container,
    panelHeader(t('Schedule {number}', { number: item.number }), onClose),
    h('p', {}, h('a', { href: `/work-orders/${item.id}`, 'data-link': true }, item.title)),
    h(
      'dl',
      { class: 'detail-fields' },
      field(t('Where'), [where, item.location].filter(Boolean).join(' · ')),
      field(t('Trade'), item.category ? valueLabel('category', item.category) : null),
      field(t('Priority'), valueLabel('work_order_priority', item.priority)),
      field(t('Due'), item.due_on ? formatDate(item.due_on) : null),
      field(
        t('Assignee'),
        item.assignee ? personName(item.assignee) : t('Unassigned: the first person given a block'),
      ),
      field(
        t('Estimate'),
        item.needed_hours === null ? t('None yet') : formatDuration(item.needed_hours),
      ),
      field(
        t('Already scheduled'),
        item.scheduled_hours ? formatDuration(item.scheduled_hours) : t('Nothing yet'),
      ),
      field(t('Left'), leftText(item)),
      field(
        t('Carried over'),
        item.carried_from
          ? t('from {carried_from}', { carried_from: formatWeek(item.carried_from) })
          : null,
      ),
    ),
    form,
  );
  if (form) propose();
}

/**
 * Panel of a block: what it is, then for supervisors and admins the move form (person, day,
 * length, note) and Remove; the appointment lock for them and for the person of the block
 * (BR-S6, BR-S7). A locked block keeps its day, person and length.
 * @param {HTMLElement} container
 * @param {{ block: object, person: object, data: object, canEdit: boolean, canLock: boolean,
 *   onClose: () => void, onUpdate: (changes: object, form: HTMLFormElement) => void,
 *   onDelete: () => void, onLock: (start: string | null, form: HTMLFormElement) => void }} options
 */
export function renderBlockPanel(
  container,
  { block, person, data, canEdit, canLock, onClose, onUpdate, onDelete, onLock },
) {
  const view = blockView(block, person);
  const max = data.settings.max_block_hours;
  const locked = Boolean(block.locked_start);

  const note = h('input', {
    name: 'note',
    type: 'text',
    maxlength: '500',
    value: block.note ?? '',
  });
  const moveForm = canEdit
    ? h(
        'form',
        {
          class: 'detail-form',
          novalidate: true,
          onSubmit: (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(moveForm));
            const changes = { note: values.note.trim() || null };
            if (!locked) {
              Object.assign(changes, {
                technician_id: Number(values.person),
                day: values.day,
                hours: Number(values.hours),
              });
            }
            for (const [key, value] of Object.entries(changes)) {
              if (value === (block[key] ?? null)) delete changes[key];
            }
            onUpdate(changes, moveForm);
          },
        },
        h('h3', {}, locked ? t('Note') : t('Move or resize')),
        summary(),
        locked
          ? null
          : [
              formRow(
                'bp-person',
                t('Person'),
                select('person', personOptions(data), block.technician_id),
              ),
              formRow('bp-day', t('Day'), select('day', dayOptions(data), block.day)),
              formRow('bp-hours', t('Length'), select('hours', lengthOptions(max), block.hours), {
                hint: t('A shorter block sends the difference back to the tray.'),
              }),
            ],
        formRow('bp-note', t('Note'), note, { hint: t('e.g. "Keys at reception".') }),
        h('div', { class: 'form-actions' }, submitButton(t('Save changes'))),
      )
    : null;

  const time = h(
    'select',
    { name: 'locked_start' },
    lockTimes(block.hours).map((time) =>
      h('option', { value: time, selected: time === (block.locked_start ?? '09:00') }, time),
    ),
  );
  const lockForm =
    canLock && block.kind === 'WORK'
      ? h(
          'form',
          {
            class: 'detail-form',
            novalidate: true,
            onSubmit: (event) => {
              event.preventDefault();
              onLock(locked ? null : time.value, lockForm);
            },
          },
          h('h3', {}, t('Appointment')),
          summary(),
          locked
            ? h(
                'p',
                {},
                t(
                  '🔒 {appointmentText}, locked by {locked_by}. Unlock it to move, resize or remove the block.',
                  {
                    appointmentText: appointmentText(block.locked_start, block.hours),
                    locked_by: personName(block.locked_by),
                  },
                ),
              )
            : formRow('bp-time', t('Start time'), time, {
                hint: t(
                  'Lock this block at a time, e.g. an appointment with the site. It then keeps its day, person and length.',
                ),
              }),
          h(
            'div',
            { class: 'form-actions' },
            h(
              'button',
              { type: 'submit', class: 'button button-secondary online-only' },
              locked ? t('Unlock') : t('Lock at this time'),
            ),
          ),
        )
      : null;

  replaceChildren(
    container,
    panelHeader(view.title, onClose),
    h(
      'dl',
      { class: 'detail-fields' },
      field(
        t('Person'),
        `${person.first_name} ${person.last_name}${view.helper ? t(' (helper)') : ''}`,
      ),
      field(t('Day'), longDayLabel(block.day)),
      field(t('Length'), view.hours),
      field(t('Where'), view.where),
      field(
        t('Appointment'),
        locked ? `🔒 ${appointmentText(block.locked_start, block.hours)}` : null,
      ),
      field(t('Note'), block.note),
      field(
        t('Work order'),
        block.work_order
          ? h(
              'a',
              { href: `/work-orders/${block.work_order.id}`, 'data-link': true },
              `${block.work_order.number} — ${block.work_order.title}`,
            )
          : null,
      ),
    ),
    lockForm,
    moveForm,
    canEdit && !locked
      ? h(
          'div',
          { class: 'form-actions' },
          h(
            'button',
            { type: 'button', class: 'button button-danger online-only', onClick: onDelete },
            t('Remove this block'),
          ),
        )
      : null,
  );
}

/**
 * Panel to add travel, preparation or other time to a person's day (P10).
 * @param {HTMLElement} container
 * @param {{ data: object, person: number, day: string, onClose: () => void,
 *   onSubmit: (block: object, form: HTMLFormElement) => void }} options
 */
export function renderTimePanel(container, { data, person, day, onClose, onSubmit }) {
  const max = data.settings.max_block_hours;
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        onSubmit(
          {
            kind: values.kind,
            technician_id: Number(values.person),
            day: values.day,
            hours: Number(values.hours),
            note: values.note.trim() || null,
          },
          form,
        );
      },
    },
    summary(),
    formRow(
      'tp-kind',
      t('Kind of time'),
      select(
        'kind',
        ['TRAVEL', 'PREPARATION', 'OTHER'].map((k) => [k, valueLabel('allocation_kind', k)]),
        'TRAVEL',
      ),
    ),
    formRow('tp-person', t('Person'), select('person', personOptions(data), person)),
    formRow('tp-day', t('Day'), select('day', dayOptions(data), day)),
    formRow('tp-hours', t('Length'), select('hours', lengthOptions(max), 1)),
    formRow('tp-note', t('Note'), h('input', { name: 'note', type: 'text', maxlength: '500' }), {
      hint: t('e.g. "Lyon → Saclay", "Collect the parts".'),
    }),
    h('div', { class: 'form-actions' }, submitButton(t('Add time'))),
  );
  replaceChildren(container, panelHeader(t('Add time'), onClose), form);
}

/**
 * Panel of a person's hours on a day: leave, part time, training or weekend work (P5, P11),
 * or back to the default.
 * @param {HTMLElement} container
 * @param {{ data: object, person: object, day: string, onClose: () => void,
 *   onSubmit: (input: { hours: number | null, reason?: string, note?: string | null },
 *     form: HTMLFormElement) => void }} options
 */
export function renderCapacityPanel(container, { data, person, day, onClose, onSubmit }) {
  const current = person.days.find((d) => d.day === day);
  const weekend = data.days.find((d) => d.day === day)?.weekday > 5;
  const standard = weekend ? 0 : data.settings.daily_hours;
  const hours = select(
    'hours',
    Array.from({ length: 25 }, (_, i) => [i / 2, i ? formatDuration(i / 2) : '0 h (absent)']),
    current?.capacity ?? standard,
  );
  const reason = select(
    'reason',
    CAPACITY_REASONS.map((r) => [r, valueLabel('capacity_reason', r)]),
    current?.override?.reason ?? (weekend ? 'WEEKEND' : 'LEAVE'),
  );
  const form = h(
    'form',
    {
      class: 'detail-form',
      novalidate: true,
      onSubmit: (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(form));
        onSubmit(
          { hours: Number(values.hours), reason: values.reason, note: values.note.trim() || null },
          form,
        );
      },
    },
    summary(),
    formRow('cp-hours', t('Hours this day'), hours, {
      hint: weekend
        ? t('Without a change: {hours} (weekend).', { hours: formatDuration(standard) })
        : t('Without a change: {hours}.', { hours: formatDuration(standard) }),
    }),
    formRow('cp-reason', t('Reason'), reason),
    formRow(
      'cp-note',
      t('Note'),
      h('input', {
        name: 'note',
        type: 'text',
        maxlength: '200',
        value: current?.override?.note ?? '',
      }),
    ),
    h(
      'div',
      { class: 'form-actions' },
      submitButton(t('Save hours')),
      current?.override
        ? h(
            'button',
            {
              type: 'button',
              class: 'button button-secondary online-only',
              onClick: () => onSubmit({ hours: null }, form),
            },
            t('Back to the usual hours'),
          )
        : null,
    ),
  );
  replaceChildren(
    container,
    panelHeader(`${person.first_name} ${person.last_name}, ${longDayLabel(day)}`, onClose),
    h(
      'p',
      {},
      current?.override
        ? t('{reason}: {capacity} this day.', {
            reason: valueLabel('capacity_reason', current.override.reason),
            capacity: formatDuration(current.capacity),
          })
        : t('Usual hours: {standard}.', { standard: formatDuration(standard) }),
    ),
    form,
  );
}
