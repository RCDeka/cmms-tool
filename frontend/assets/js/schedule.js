// Week scheduler (D48, Phase 19, docs/ui-guidelines.md → Week scheduler): the week switcher and
// open weekends, the tiles, the "to schedule" tray, and the grid of people × days with their
// blocks of hours. Needs a connection (P18). Drag and keyboard moves are in
// schedule-editing.js, the side panels in schedule-panel.js.
import { badgeClass, h, replaceChildren } from './dom.js';
import { formatDate, formatWeek, personName } from './format.js';
import { valueLabel } from './labels.js';
import { addWeeks } from './planning-rules.js';
import { appointmentText, dayWarningTexts, formatDuration, leftText } from './schedule-rules.js';

const WEEK = /^\d{4}-W\d{2}$/;
const ID = /^[1-9]\d{0,15}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Side panel of the scheduler from the path after /schedule and the query, null for none,
 * undefined for a path that does not exist. Pure.
 * - /schedule/work-orders/:id[?person=N&day=D]: schedule a work order of the tray (from a drop
 *   on a person's day);
 * - /schedule/blocks/:id: a block (move, resize, note, appointment, remove);
 * - /schedule/time?person=N&day=D: add travel, preparation or other time;
 * - /schedule/capacity?person=N&day=D: a person's hours on a day.
 * @param {string[]} segments
 * @param {URLSearchParams} query
 */
export function parseSchedulePanel(segments, query) {
  const [kind, id, ...more] = segments;
  if (!kind) return null;
  if (more.length) return undefined;
  if (kind === 'blocks' && ID.test(id ?? '')) return { type: 'block', id: Number(id) };
  if (kind === 'work-orders' && ID.test(id ?? '')) {
    // Dropped on a day: the split proposal starts there.
    const person = query.get('person');
    const day = query.get('day');
    return ID.test(person ?? '') && DATE.test(day ?? '')
      ? { type: 'item', id: Number(id), person: Number(person), day }
      : { type: 'item', id: Number(id) };
  }
  if ((kind === 'time' || kind === 'capacity') && !id) {
    const person = query.get('person');
    const day = query.get('day');
    if (!ID.test(person ?? '') || !DATE.test(day ?? '')) return undefined;
    return { type: kind, person: Number(person), day };
  }
  return undefined;
}

/** URL of the scheduler for a week (null: the current week), with a panel. Pure. */
export function scheduleUrl(week = null, panel = null) {
  const query = new URLSearchParams();
  if (week) query.set('week', week);
  let path = '/schedule';
  if (panel?.type === 'item') {
    path += `/work-orders/${panel.id}`;
    if (panel.person && panel.day) {
      query.set('person', String(panel.person));
      query.set('day', panel.day);
    }
  }
  if (panel?.type === 'block') path += `/blocks/${panel.id}`;
  if (panel?.type === 'time' || panel?.type === 'capacity') {
    path += `/${panel.type}`;
    query.set('person', String(panel.person));
    query.set('day', panel.day);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}

/** URL of My week. Pure. */
export const myWeekUrl = (week = null) => (week ? `/my-week?week=${week}` : '/my-week');

/** Week of a `<input type="week">` value, or null. Pure. */
export const weekInput = (value) => (WEEK.test(value) ? value : null);

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const longDayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
/** 'Mon 5 Oct'. Pure. */
export const dayLabel = (day) => dayFormat.format(new Date(`${day}T00:00:00Z`));
/** 'Monday 5 October'. Pure. */
export const longDayLabel = (day) => longDayFormat.format(new Date(`${day}T00:00:00Z`));

const percentFormat = new Intl.NumberFormat('en-GB', { style: 'percent' });
const numberFormat = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** What a person's day header says: "6 h / 7 h", and the reason of an override. Pure. */
export function dayHeadText(day) {
  const reason = day.override ? valueLabel('capacity_reason', day.override.reason) : null;
  const hours = `${formatDuration(day.total)} / ${formatDuration(day.capacity)}`;
  return reason ? `${hours} · ${reason}` : hours;
}

/** Text of one block: what it is, its length, its appointment. Pure. */
export function blockView(block, person) {
  const wo = block.work_order;
  const lock = block.locked_start ? `🔒 ${appointmentText(block.locked_start, block.hours)}` : null;
  const title =
    block.kind === 'WORK'
      ? `${wo.number} · ${wo.title}`
      : valueLabel('allocation_kind', block.kind);
  const where = wo ? [wo.site, wo.building].filter(Boolean).join(' · ') : null;
  const helper = wo && person && wo.assignee_id !== null && wo.assignee_id !== person.id;
  const parts = [
    title,
    formatDuration(block.hours),
    where,
    block.note,
    helper ? 'helper' : null,
    block.locked_start
      ? `appointment ${appointmentText(block.locked_start, block.hours)}, locked by ${personName(block.locked_by)}`
      : null,
  ].filter(Boolean);
  return {
    lock,
    title,
    where,
    hours: formatDuration(block.hours),
    helper,
    label: parts.join(', '),
  };
}

/** The tiles (spec §8) as text. `flagged`: needs attention. Pure. */
export function scheduleTileViews(tiles) {
  const left = tiles.hours_left;
  return [
    {
      key: 'booked',
      label: 'Booked hours',
      value: `${numberFormat.format(tiles.booked_hours)} h / ${numberFormat.format(tiles.available_hours)} h`,
      detail: 'booked vs available, whole team',
      flagged: tiles.booked_hours > tiles.available_hours,
    },
    {
      key: 'left',
      label: 'Left to schedule',
      value: `${numberFormat.format(left.planned + left.carried_over)} h`,
      detail: `planned this week or carried over; ${numberFormat.format(left.not_planned)} h of work without a week`,
      flagged: false,
    },
    {
      key: 'travel',
      label: 'Travel time',
      value: tiles.travel_share === null ? '—' : percentFormat.format(tiles.travel_share),
      detail: 'of the booked hours',
      flagged: false,
    },
    {
      key: 'sites',
      label: 'Sites per day',
      value: numberFormat.format(tiles.sites_per_day.average ?? 0),
      detail: `average per person and working day, ${tiles.sites_per_day.worst} at most`,
      flagged: tiles.sites_per_day.worst >= 2,
    },
    {
      key: 'carried',
      label: 'Carried over',
      value: String(tiles.carried_over),
      detail: 'unfinished work orders from earlier weeks',
      flagged: tiles.carried_over > 0,
    },
  ];
}

const TRAY_TITLES = {
  PLANNED: 'Planned this week',
  CARRIED_OVER: 'Carried over',
  NOT_PLANNED: 'Not planned',
};
/** Tray groups the user closed (the "Not planned" one starts closed: it can be long). */
const closedGroups = new Set(['NOT_PLANNED']);

function priorityBadge(priority) {
  const tone = { URGENT: 'danger', HIGH: 'warning' }[priority] ?? 'neutral';
  return h(
    'span',
    { class: badgeClass('priority', priority, tone) },
    valueLabel('work_order_priority', priority),
  );
}

function trayCard(item, { canEdit, selected, week }) {
  const where = [item.site, item.building].filter(Boolean).join(' · ');
  const left = leftText(item);
  const done = item.needed_hours !== null && item.hours_left === 0;
  return h(
    'li',
    {},
    h(
      'a',
      {
        href: scheduleUrl(week, { type: 'item', id: item.id }),
        'data-link': true,
        draggable: 'false',
        class: `tray-card${done ? ' is-done' : ''}${selected ? ' is-selected' : ''}${canEdit ? ' is-draggable' : ''}`,
        dataset: { item: String(item.id) },
        'aria-current': selected ? 'true' : null,
        'aria-describedby': canEdit ? 'schedule-help' : null,
      },
      h(
        'span',
        { class: 'tray-card-top' },
        h('strong', {}, item.number),
        priorityBadge(item.priority),
      ),
      h('span', { class: 'tray-card-title' }, item.title),
      h('span', { class: 'tray-card-meta' }, where),
      h(
        'span',
        { class: 'tray-card-meta' },
        [
          item.category ? valueLabel('category', item.category) : 'No trade',
          item.due_on ? `due ${formatDate(item.due_on)}` : null,
          item.assignee ? personName(item.assignee) : 'Unassigned',
        ]
          .filter(Boolean)
          .join(' · '),
      ),
      h(
        'span',
        { class: `tray-card-left${done ? '' : ' is-left'}` },
        done ? h('span', { 'aria-hidden': 'true' }, '✓ ') : null,
        left,
      ),
      item.carried_from
        ? h(
            'span',
            { class: 'tray-card-carried' },
            h('span', { 'aria-hidden': 'true' }, '↻ '),
            `Carried over from ${formatWeek(item.carried_from)}`,
          )
        : null,
    ),
  );
}

function trayGroups(data, { canEdit, panel }) {
  return ['PLANNED', 'CARRIED_OVER', 'NOT_PLANNED'].map((group) => {
    const items = data.tray.filter((t) => t.group === group);
    const details = h(
      'details',
      { class: 'tray-group', open: !closedGroups.has(group), dataset: { group } },
      h('summary', {}, `${TRAY_TITLES[group]} (${items.length})`),
      items.length
        ? h(
            'ul',
            { class: 'tray-list' },
            items.map((item) =>
              trayCard(item, {
                canEdit,
                week: data.week,
                selected: panel?.type === 'item' && panel.id === item.id,
              }),
            ),
          )
        : h('p', { class: 'muted' }, 'Nothing here.'),
    );
    details.addEventListener('toggle', () => {
      if (details.open) closedGroups.delete(group);
      else closedGroups.add(group);
    });
    return details;
  });
}

function blockItem(block, person, { canEdit, selected, week }) {
  const view = blockView(block, person);
  return h(
    'li',
    {},
    h(
      'a',
      {
        href: scheduleUrl(week, { type: 'block', id: block.id }),
        'data-link': true,
        draggable: 'false',
        class: `block block-${block.kind.toLowerCase()}${block.locked_start ? ' is-locked' : ''}${selected ? ' is-selected' : ''}${canEdit && !block.locked_start ? ' is-draggable' : ''}`,
        dataset: { block: String(block.id) },
        'aria-label': view.label,
        'aria-current': selected ? 'true' : null,
        title: view.label,
      },
      view.lock ? h('span', { class: 'block-lock' }, view.lock) : null,
      h('span', { class: 'block-title' }, view.title),
      h(
        'span',
        { class: 'block-meta' },
        [view.hours, view.where, view.helper ? 'helper' : null].filter(Boolean).join(' · '),
      ),
      block.note ? h('span', { class: 'block-note' }, block.note) : null,
    ),
  );
}

function dayCell(person, dayInfo, column, { canEdit, panel, week }) {
  const day = person.days.find((d) => d.day === dayInfo.day);
  const blocks = person.blocks.filter((b) => b.day === dayInfo.day);
  const warnings = dayWarningTexts(day);
  const head = dayHeadText(day);
  const name = `${person.first_name} ${person.last_name}`;
  return h(
    'td',
    {
      class: `day-cell${day.warnings.includes('OVER_CAPACITY') ? ' is-over' : ''}${day.capacity === 0 ? ' is-off' : ''}${column.open ? '' : ' is-closed'}`,
      dataset: { person: String(person.id), day: dayInfo.day },
    },
    h(
      'div',
      { class: 'cell-head' },
      canEdit
        ? h(
            'a',
            {
              href: scheduleUrl(week, { type: 'capacity', person: person.id, day: dayInfo.day }),
              'data-link': true,
              class: 'cell-capacity',
              'aria-label': `${head}: hours of ${name} on ${longDayLabel(dayInfo.day)}`,
              title: 'Set leave, part time or weekend hours',
            },
            head,
          )
        : h('span', { class: 'cell-capacity' }, head),
      day.sites.length ? h('span', { class: 'cell-sites' }, day.sites.join(' · ')) : null,
    ),
    warnings.length
      ? h(
          'ul',
          { class: 'cell-warnings' },
          warnings.map((text, i) =>
            h(
              'li',
              {},
              h('span', { 'aria-hidden': 'true' }, '⚠ '),
              text,
              canEdit && day.warnings[i] === 'SEVERAL_SITES'
                ? [
                    ' ',
                    h(
                      'a',
                      {
                        href: scheduleUrl(week, {
                          type: 'time',
                          person: person.id,
                          day: dayInfo.day,
                        }),
                        'data-link': true,
                      },
                      'Add travel time',
                    ),
                  ]
                : null,
            ),
          ),
        )
      : null,
    blocks.length
      ? h(
          'ul',
          { class: 'cell-blocks' },
          blocks.map((b) =>
            blockItem(b, person, {
              canEdit,
              week,
              selected: panel?.type === 'block' && panel.id === b.id,
            }),
          ),
        )
      : null,
    canEdit
      ? h(
          'a',
          {
            href: scheduleUrl(week, { type: 'time', person: person.id, day: dayInfo.day }),
            'data-link': true,
            class: 'add-time',
            'aria-label': `Add time for ${name} on ${longDayLabel(dayInfo.day)}`,
          },
          '+ Time',
        )
      : null,
  );
}

function personHeader(person) {
  const trade = person.specialty ? valueLabel('category', person.specialty) : 'General';
  return h(
    'th',
    { scope: 'row', class: 'person-cell' },
    h('strong', {}, `${person.first_name} ${person.last_name}`),
    h(
      'span',
      { class: 'muted' },
      `${valueLabel('role', person.role)} · ${trade}${person.inactive ? ' · inactive' : ''}`,
    ),
    h(
      'span',
      { class: `person-total${person.week_total > person.week_capacity ? ' is-over' : ''}` },
      `${numberFormat.format(person.week_total)} h / ${numberFormat.format(person.week_capacity)} h`,
    ),
  );
}

function grid(data, options) {
  const today = options.today;
  return h(
    'div',
    { class: 'schedule-scroll', tabindex: '0', 'aria-labelledby': 'schedule-caption' },
    h(
      'table',
      { class: 'schedule-grid' },
      h(
        'caption',
        { id: 'schedule-caption', class: 'visually-hidden' },
        `${formatWeek(data.week)}: hours of each person per day`,
      ),
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col', class: 'person-cell' }, 'Person'),
          data.days.map((d) =>
            h(
              'th',
              {
                scope: 'col',
                class: `day-col${d.day === today ? ' is-today' : ''}${d.weekday > 5 ? ' is-weekend' : ''}`,
              },
              dayLabel(d.day),
              d.day === today ? h('span', { class: 'visually-hidden' }, ' (today)') : null,
              d.open ? null : h('span', { class: 'day-closed' }, 'not open'),
            ),
          ),
        ),
      ),
      h(
        'tbody',
        {},
        data.people.map((person) =>
          h(
            'tr',
            { dataset: { person: String(person.id) } },
            personHeader(person),
            data.days.map((d) => dayCell(person, d, d, { ...options, week: data.week })),
          ),
        ),
      ),
    ),
  );
}

function tilesSection(data) {
  return h(
    'section',
    { class: 'planner-tiles', 'aria-labelledby': 'schedule-tiles-heading' },
    h(
      'h2',
      { id: 'schedule-tiles-heading', class: 'visually-hidden', tabindex: '-1' },
      `Key figures of ${formatWeek(data.week)}`,
    ),
    h(
      'ul',
      { class: 'kpi-grid' },
      scheduleTileViews(data.tiles).map((tile) =>
        h(
          'li',
          {},
          h(
            'div',
            { class: `kpi-tile planner-tile${tile.flagged ? ' is-flagged' : ''}` },
            h('span', { class: 'kpi-label' }, tile.label),
            h('span', { class: 'kpi-value planner-tile-value' }, tile.value),
            h('span', { class: 'planner-tile-detail' }, tile.detail),
            tile.flagged
              ? h(
                  'span',
                  { class: 'badge badge-tone-warning kpi-flag' },
                  h('span', { 'aria-hidden': 'true' }, '⚠'),
                  'Needs attention',
                )
              : null,
          ),
        ),
      ),
    ),
  );
}

/** Week switcher (previous, this week, next, a week field) and the weekend switches. */
function toolbar(data, { canEdit, onWeek, onWeekend, message }) {
  const shown = data.week === data.current_week ? null : data.week;
  const link = (week, text, label) =>
    h(
      'a',
      {
        href: scheduleUrl(week === data.current_week ? null : week),
        'data-link': true,
        class: 'button button-secondary',
        'aria-label': label,
      },
      text,
    );
  const picker = h('input', {
    type: 'week',
    id: 'schedule-week',
    value: data.week,
    'aria-label': 'Week shown',
    onChange: (event) => {
      const week = weekInput(event.target.value);
      if (week) onWeek(week);
    },
  });
  const weekend = (key, label) =>
    h(
      'label',
      { class: 'weekend-switch' },
      h('input', {
        type: 'checkbox',
        class: 'online-only',
        checked: data[key],
        onChange: (event) => onWeekend(key, event.target.checked),
      }),
      ` ${label}`,
    );
  const openDays = [data.saturday_open ? 'Saturday' : null, data.sunday_open ? 'Sunday' : null]
    .filter(Boolean)
    .join(' and ');
  return h(
    'div',
    { class: 'schedule-toolbar' },
    h(
      'div',
      { class: 'schedule-weeks' },
      link(addWeeks(data.week, -1), '← Previous', 'Previous week'),
      h('strong', { class: 'schedule-week-name' }, formatWeek(data.week)),
      link(addWeeks(data.week, 1), 'Next →', 'Next week'),
      shown ? link(data.current_week, 'This week', 'Back to this week') : null,
      picker,
    ),
    canEdit
      ? h(
          'div',
          { class: 'schedule-weekend' },
          weekend('saturday_open', 'Open Saturday'),
          weekend('sunday_open', 'Open Sunday'),
        )
      : h(
          'p',
          { class: 'muted' },
          openDays ? `${openDays} open this week.` : 'Monday to Friday this week.',
        ),
    canEdit
      ? h(
          'p',
          { id: 'schedule-help', class: 'planner-help muted' },
          'Drag a work order from the tray onto a person’s day, or a block to another day or person. With the keyboard, open a card or a block (Enter) to schedule or move it; + and − change a block’s length by half an hour.',
        )
      : null,
    message,
  );
}

/**
 * Renders the week scheduler.
 * @param {HTMLElement} container
 * @param {{ data: object, canEdit: boolean, panel: object | null, today: string,
 *   onWeek: (week: string) => void,
 *   onWeekend: (key: 'saturday_open' | 'sunday_open', open: boolean) => void }} options
 * @returns {{ say: (text: string, tone?: string) => void }}
 */
export function renderScheduler(container, { data, canEdit, panel, today, onWeek, onWeekend }) {
  const message = h('p', { class: 'planner-message', role: 'status' });
  const people = data.people.length;
  replaceChildren(
    container,
    h(
      'div',
      { class: 'scheduler' },
      toolbar(data, { canEdit, onWeek, onWeekend, message }),
      tilesSection(data),
      h(
        'div',
        { class: 'schedule-layout' },
        h(
          'aside',
          { class: 'schedule-tray', 'aria-labelledby': 'tray-heading' },
          h('h2', { id: 'tray-heading' }, 'To schedule'),
          trayGroups(data, { canEdit, panel }),
        ),
        people
          ? grid(data, { canEdit, panel, today })
          : h('p', { class: 'empty-state' }, 'No active technician or supervisor.'),
      ),
    ),
  );
  return {
    say: (text, tone = 'info') => {
      message.textContent = text;
      message.dataset.tone = tone;
    },
  };
}
