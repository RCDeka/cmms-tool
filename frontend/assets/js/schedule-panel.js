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
  data.days.map((d) => [d.day, `${longDayLabel(d.day)}${d.open ? '' : ' (not open)'}`]);
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
      formRow(`sb-person-${n}`, 'Person', select('person', personOptions(data), block.person)),
      formRow(`sb-day-${n}`, 'Day', select('day', dayOptions(data), block.day)),
      formRow(`sb-hours-${n}`, 'Length', select('hours', lengthOptions(max), block.hours)),
      h(
        'button',
        {
          type: 'button',
          class: 'button button-secondary',
          'aria-label': `Remove block ${n}`,
          onClick: () => {
            row.remove();
            update();
            rows.querySelector('select')?.focus();
          },
        },
        'Remove',
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
    total.textContent = `${formatDuration(sum)} in ${blocks.length} block${blocks.length === 1 ? '' : 's'}${
      left > 0 ? ` · ${formatDuration(left)} still left after these` : ''
    }`;
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
        h('h3', {}, 'Blocks'),
        summary(),
        estimate
          ? formRow('sb-estimate', 'Estimated time (hours)', estimate, {
              required: true,
              hint: 'This work order has no estimate yet: give one to know what is left (half-hour steps).',
            })
          : null,
        estimate
          ? h(
              'button',
              { type: 'button', class: 'button button-secondary', onClick: propose },
              'Propose blocks for this estimate',
            )
          : null,
        h(
          'p',
          { class: 'field-hint' },
          `Blocks last ${formatDuration(max)} at most; a longer job is split over the following days.`,
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
          '+ Add a block',
        ),
        total,
        h('div', { class: 'form-actions' }, submitButton('Schedule')),
      )
    : null;

  const where = [item.site, item.building].filter(Boolean).join(' · ');
  replaceChildren(
    container,
    panelHeader(`Schedule ${item.number}`, onClose),
    h('p', {}, h('a', { href: `/work-orders/${item.id}`, 'data-link': true }, item.title)),
    h(
      'dl',
      { class: 'detail-fields' },
      field('Where', [where, item.location].filter(Boolean).join(' · ')),
      field('Trade', item.category ? valueLabel('category', item.category) : null),
      field('Priority', valueLabel('work_order_priority', item.priority)),
      field('Due', item.due_on ? formatDate(item.due_on) : null),
      field(
        'Assignee',
        item.assignee ? personName(item.assignee) : 'Unassigned: the first person given a block',
      ),
      field(
        'Estimate',
        item.needed_hours === null ? 'None yet' : formatDuration(item.needed_hours),
      ),
      field(
        'Already scheduled',
        item.scheduled_hours ? formatDuration(item.scheduled_hours) : 'Nothing yet',
      ),
      field('Left', leftText(item)),
      field('Carried over', item.carried_from ? `from ${formatWeek(item.carried_from)}` : null),
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
        h('h3', {}, locked ? 'Note' : 'Move or resize'),
        summary(),
        locked
          ? null
          : [
              formRow(
                'bp-person',
                'Person',
                select('person', personOptions(data), block.technician_id),
              ),
              formRow('bp-day', 'Day', select('day', dayOptions(data), block.day)),
              formRow('bp-hours', 'Length', select('hours', lengthOptions(max), block.hours), {
                hint: 'A shorter block sends the difference back to the tray.',
              }),
            ],
        formRow('bp-note', 'Note', note, { hint: 'e.g. "Keys at reception".' }),
        h('div', { class: 'form-actions' }, submitButton('Save changes')),
      )
    : null;

  const time = h(
    'select',
    { name: 'locked_start' },
    lockTimes(block.hours).map((t) =>
      h('option', { value: t, selected: t === (block.locked_start ?? '09:00') }, t),
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
          h('h3', {}, 'Appointment'),
          summary(),
          locked
            ? h(
                'p',
                {},
                `🔒 ${appointmentText(block.locked_start, block.hours)}, locked by ${personName(block.locked_by)}. Unlock it to move, resize or remove the block.`,
              )
            : formRow('bp-time', 'Start time', time, {
                hint: 'Lock this block at a time, e.g. an appointment with the site. It then keeps its day, person and length.',
              }),
          h(
            'div',
            { class: 'form-actions' },
            h(
              'button',
              { type: 'submit', class: 'button button-secondary online-only' },
              locked ? 'Unlock' : 'Lock at this time',
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
      field('Person', `${person.first_name} ${person.last_name}${view.helper ? ' (helper)' : ''}`),
      field('Day', longDayLabel(block.day)),
      field('Length', view.hours),
      field('Where', view.where),
      field(
        'Appointment',
        locked ? `🔒 ${appointmentText(block.locked_start, block.hours)}` : null,
      ),
      field('Note', block.note),
      field(
        'Work order',
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
            'Remove this block',
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
      'Kind of time',
      select(
        'kind',
        ['TRAVEL', 'PREPARATION', 'OTHER'].map((k) => [k, valueLabel('allocation_kind', k)]),
        'TRAVEL',
      ),
    ),
    formRow('tp-person', 'Person', select('person', personOptions(data), person)),
    formRow('tp-day', 'Day', select('day', dayOptions(data), day)),
    formRow('tp-hours', 'Length', select('hours', lengthOptions(max), 1)),
    formRow('tp-note', 'Note', h('input', { name: 'note', type: 'text', maxlength: '500' }), {
      hint: 'e.g. "Lyon → Saclay", "Collect the parts".',
    }),
    h('div', { class: 'form-actions' }, submitButton('Add time')),
  );
  replaceChildren(container, panelHeader('Add time', onClose), form);
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
    formRow('cp-hours', 'Hours this day', hours, {
      hint: `Without a change: ${formatDuration(standard)}${weekend ? ' (weekend)' : ''}.`,
    }),
    formRow('cp-reason', 'Reason', reason),
    formRow(
      'cp-note',
      'Note',
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
      submitButton('Save hours'),
      current?.override
        ? h(
            'button',
            {
              type: 'button',
              class: 'button button-secondary online-only',
              onClick: () => onSubmit({ hours: null }, form),
            },
            'Back to the usual hours',
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
        ? `${valueLabel('capacity_reason', current.override.reason)}: ${formatDuration(current.capacity)} this day.`
        : `Usual hours: ${formatDuration(standard)}.`,
    ),
    form,
  );
}
