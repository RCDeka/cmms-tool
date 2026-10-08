// Year planner (D48, Phase 17): URL filters, chips, tiles, load strip, plan form, settings.
import { describe, expect, it, vi } from 'vitest';
import { AUDIT_TYPES } from '../assets/js/history.js';
import {
  checkPlanForm,
  frequencyText,
  planBody,
  planFieldErrors,
} from '../assets/js/plan-panel.js';
import {
  chipView,
  formatLoad,
  groupTitle,
  loadScale,
  loadSegments,
  parsePlanningFilters,
  planningFieldValue,
  planningUrl,
  renderPlanner,
  setPlannerPanel,
  tileViews,
  timelineQuery,
} from '../assets/js/planning.js';
import { capacityPreview, settingsChanges, yearCapacity } from '../assets/js/planning-settings.js';
import { parseRoute } from '../assets/js/router.js';

const query = (text) => new URLSearchParams(text);

describe('planner routes and filters', () => {
  it.each([
    ['/planning', '', { name: 'planning', page: 1, filters: {} }],
    [
      '/planning',
      '?group=building&site=Lyon',
      { name: 'planning', page: 1, filters: { group: 'building', site: 'Lyon' } },
    ],
    ['/planning/plans/new', '', { name: 'planCreate', page: 1, filters: {} }],
    ['/planning/plans/12', '', { name: 'plan', id: 12, page: 1, filters: {} }],
    [
      '/planning/plans/12',
      '?occurrence=40&year=2027',
      { name: 'plan', id: 12, occurrenceId: 40, page: 1, filters: { year: '2027' } },
    ],
    ['/planning/plans/abc', '', { name: 'notFound', page: 1 }],
    ['/planning/occurrences/3', '', { name: 'notFound', page: 1 }],
    ['/admin/planning', '', { name: 'planningSettings', page: 1 }],
    [
      '/audit-log',
      '?type=maintenance_plans',
      { name: 'audit', page: 1, entityType: 'maintenance_plans' },
    ],
  ])('%s%s', (path, search, route) => {
    expect(parseRoute(path, search)).toEqual(route);
  });

  it('keeps valid filters only, the week before the year', () => {
    expect(
      parsePlanningFilters(
        query(
          'from=2026-W45&year=2027&group=site&category=HVAC&type=CORRECTIVE&performed_by=CONTRACTOR&q=+chiller+',
        ),
      ),
    ).toEqual({ from: '2026-W45', category: 'HVAC', performed_by: 'CONTRACTOR', q: 'chiller' });
    expect(parsePlanningFilters(query('from=45&year=27&group=floor'))).toEqual({});
  });

  it('writes the URL and the API query', () => {
    const filters = { year: '2027', group: 'category', site: 'Paris La Défense Headquarters' };
    expect(planningUrl(filters)).toBe(
      '/planning?year=2027&group=category&site=Paris+La+D%C3%A9fense+Headquarters',
    );
    expect(planningUrl({}, '/planning/plans/new')).toBe('/planning/plans/new');
    expect(parsePlanningFilters(query(planningUrl(filters).split('?')[1]))).toEqual(filters);
    expect(timelineQuery(filters)).toBe(
      'year=2027&group_by=category&site=Paris+La+D%C3%A9fense+Headquarters',
    );
    expect(timelineQuery({})).toBe('group_by=site');
  });
});

describe('chips', () => {
  const plan = {
    code: 'PM-0001',
    type: 'PREVENTIVE',
    performed_by: 'INTERNAL',
    estimated_hours: 3.5,
  };
  const occ = (o = {}) => ({
    week: '2026-W43',
    due_week: '2026-W43',
    status: 'PLANNED',
    work_order: null,
    warnings: [],
    ...o,
  });

  it('shows the hours, with symbols besides the style', () => {
    expect(chipView(plan, occ())).toEqual({
      text: '3.5',
      classes: 'chip chip-planned',
      label: 'PM-0001, Week 43, 2026, Planned, 3.5 h',
    });
    const released = chipView(
      { ...plan, type: 'REGULATORY' },
      occ({ status: 'RELEASED', work_order: { id: 9, number: 'WO-2026-00300' } }),
    );
    expect(released.text).toBe('§✓3.5');
    expect(released.label).toContain('work order WO-2026-00300');
    expect(released.label).toContain('regulatory');
  });

  it('marks contractor, moved, skipped and out-of-season visits', () => {
    const view = chipView(
      { ...plan, performed_by: 'CONTRACTOR', supplier: 'Veritec Services' },
      occ({ week: '2026-W44', status: 'SKIPPED', warnings: ['OUT_OF_SEASON'] }),
    );
    expect(view.classes).toBe('chip chip-skipped chip-contractor chip-moved chip-warning');
    expect(view.text).toBe('↔⚠3.5');
    expect(view.label).toContain('Skipped');
    expect(view.label).toContain('contractor Veritec Services');
    expect(view.label).toContain('moved from Week 43, 2026');
    expect(view.label).toContain('outside the season');
  });
});

describe('figures', () => {
  const tiles = {
    workload: { average_load: 0.41, peak_load: 1.03, weeks_over: 1, weeks_tight: 2 },
    trade_balance: [
      { category: 'HVAC', planned_hours: 780, capacity_hours: 1274, load: 0.61 },
      { category: 'ELECTRICAL', planned_hours: 936, capacity_hours: 2548, load: 0.37 },
      { category: 'PLUMBING', planned_hours: 239, capacity_hours: 0, load: null },
      { category: 'GENERAL', planned_hours: 0, capacity_hours: 1274, load: 0 },
    ],
    peak_week: { week: '2026-W43', load: 1.03, planned_hours: 101, capacity: 98, excess_hours: 3 },
    site_spread: { average: 4.38, peak: 5 },
    contractor_visits: { total: 14, peak: 3, peak_week: '2027-W03' },
  };

  it('formats loads', () => {
    expect(formatLoad(1.03)).toBe('103%');
    expect(formatLoad(null)).toBe('—');
  });

  it('writes the five tiles, flagging what needs balancing', () => {
    const views = tileViews(tiles, 52);
    expect(views.map((t) => [t.label, t.value, t.flagged])).toEqual([
      ['Weekly workload', '41%', true],
      ['Trade balance', 'HVAC 61%', true],
      ['Peak week', 'Week 43, 2026', true],
      ['Site spread', '4.4', false],
      ['Contractor visits', '14', false],
    ]);
    expect(views[1].detail).toBe('Electrical 37%. No specialist for: Plumbing');
    expect(views[2].detail).toBe('103% of capacity, 3 h too many');
    expect(views[4].detail).toContain('not in the load');
  });

  it('stacks the load bar in trade order, scaled to the highest week', () => {
    const figures = [
      { capacity: 98, planned_hours: 50, by_category: { PLUMBING: 10, HVAC: 40 } },
      { capacity: 98, planned_hours: 140, by_category: { ELECTRICAL: 140 } },
    ];
    expect(loadScale(figures)).toBe(140);
    expect(loadSegments(figures[0], 140)).toEqual([
      { category: 'HVAC', slot: 1, hours: 40, share: 40 / 140 },
      { category: 'PLUMBING', slot: 4, hours: 10, share: 10 / 140 },
    ]);
    expect(loadScale([{ capacity: 98, planned_hours: 20, by_category: {} }])).toBe(98);
  });

  it('names groups and audit values', () => {
    expect(groupTitle({ site: 'Lyon' })).toBe('Lyon');
    expect(groupTitle({ site: 'Paris', building: 'Tower A' })).toBe('Paris · Tower A');
    expect(groupTitle({ site: 'Lyon', building: null })).toBe('Lyon · No building');
    expect(groupTitle({ category: 'FIRE_SAFETY' })).toBe('Fire safety');
    expect(planningFieldValue('reserve_percent', 20)).toBe('20 %');
    expect(planningFieldValue('status', 'RELEASED')).toBe('Work order created');
    expect(planningFieldValue('anchor_week', '2027-W01')).toBe('Week 1, 2027');
    expect(planningFieldValue('estimated_hours', 3.5)).toBe('3.5 h');
    expect(planningFieldValue('is_active', false)).toBe('No');
    expect(AUDIT_TYPES.find((t) => t.value === 'users').adminOnly).toBe(true);
  });
});

describe('renderPlanner', () => {
  const data = {
    from: '2026-W52',
    to: '2027-W01',
    current_week: '2026-W52',
    weeks: [
      { week: '2026-W52', monday: '2026-12-21' },
      { week: '2026-W53', monday: '2026-12-28' },
      { week: '2027-W01', monday: '2027-01-04' },
    ],
    settings: { reserve_percent: 30, daily_hours: 7, max_block_hours: 3.5, release_weeks_ahead: 4 },
    capacity: { weekly: 24.5, by_category: { HVAC: 24.5 } },
    figures: [
      {
        week: '2026-W52',
        planned_hours: 4,
        by_category: { HVAC: 4 },
        capacity: 24.5,
        load: 4 / 24.5,
        level: 'OK',
        contractor_visits: 0,
      },
      {
        week: '2026-W53',
        planned_hours: 30,
        by_category: { HVAC: 30 },
        capacity: 24.5,
        load: 30 / 24.5,
        level: 'OVER',
        contractor_visits: 1,
      },
      {
        week: '2027-W01',
        planned_hours: 0,
        by_category: {},
        capacity: 24.5,
        load: 0,
        level: 'OK',
        contractor_visits: 0,
      },
    ],
    tiles: {
      workload: { average_load: 0.46, peak_load: 1.22, weeks_over: 1, weeks_tight: 0 },
      trade_balance: [{ category: 'HVAC', planned_hours: 34, capacity_hours: 73.5, load: 0.46 }],
      peak_week: {
        week: '2026-W53',
        load: 1.22,
        planned_hours: 30,
        capacity: 24.5,
        excess_hours: 5.5,
      },
      site_spread: { average: 0.7, peak: 1 },
      contractor_visits: { total: 1, peak: 1, peak_week: '2026-W53' },
    },
    groups: [
      {
        key: 'Lyon',
        site: 'Lyon',
        hours: [4, 30, 0],
        plans: [
          {
            id: 7,
            code: 'PM-0007',
            title: 'Chiller service',
            type: 'PREVENTIVE',
            performed_by: 'INTERNAL',
            estimated_hours: 4,
            frequency_weeks: 1,
            warnings: ['LONG_VISIT'],
            occurrences: [
              {
                id: 70,
                week: '2026-W52',
                due_week: '2026-W52',
                status: 'RELEASED',
                work_order: { id: 1, number: 'WO-2026-00001' },
                warnings: [],
              },
            ],
          },
        ],
      },
    ],
  };

  it('draws the weeks, the load strip, the rows and the table view', () => {
    const container = document.createElement('div');
    const opened = [];
    renderPlanner(container, {
      data,
      filters: {},
      sites: ['Lyon'],
      canEdit: false,
      isAdmin: false,
      onFilter: () => {},
      onOpen: (...args) => opened.push(args),
    });
    const headers = [...container.querySelectorAll('.week-col')];
    expect(headers.map((th) => th.textContent)).toEqual([
      '2026Week 52 (this week)',
      'Week 53',
      '2027Week 1',
    ]);
    expect(headers[0].getAttribute('aria-current')).toBe('date');
    const loads = [...container.querySelectorAll('.load-cell')];
    expect(loads[1].className).toContain('level-over');
    expect(loads[1].querySelector('.load-value').textContent).toBe('⚠122%');
    expect(container.querySelector('.plan-warning').textContent).toContain('will be split');
    expect(container.querySelector('.planner-new')).toBe(null); // read-only for technicians
    const chip = container.querySelector('.planner-grid .chip-released');
    expect(chip.textContent).toBe('✓4');
    chip.click();
    expect(opened).toEqual([[7, 70]]);
    expect(container.querySelectorAll('.planner-figures tbody tr')).toHaveLength(3);
    expect(container.querySelector('.planner-reserve').textContent).toContain('30 % reserve');
    // Read-only: nothing can be dragged, and there is no Undo.
    expect(container.querySelectorAll('.chip.is-movable')).toHaveLength(0);
    expect(container.querySelector('.planner-toolbar').textContent).not.toContain('Undo');
  });

  it('marks movable visits, the series handle and blocked weeks for supervisors', () => {
    const editable = structuredClone(data);
    editable.groups[0].plans[0].occurrences.push(
      {
        id: 71,
        week: '2026-W53',
        due_week: '2026-W53',
        status: 'PLANNED',
        version: 1,
        warnings: ['BLOCKED_WEEK'],
      },
      {
        id: 72,
        week: '2027-W01',
        due_week: '2027-W01',
        status: 'PLANNED',
        version: 1,
        warnings: [],
      },
    );
    editable.blocked_weeks = [{ id: 1, week: '2026-W53', site: null, reason: 'Change freeze' }];
    const container = document.createElement('div');
    const undo = vi.fn();
    const view = renderPlanner(container, {
      data: editable,
      filters: {},
      sites: [],
      canEdit: true,
      isAdmin: false,
      history: {
        undoLabel: 'PM-0007: visit week 52 → week 53',
        redoLabel: null,
        onUndo: undo,
        onRedo: () => {},
      },
      onFilter: () => {},
      onOpen: () => {},
    });
    const chips = [...container.querySelectorAll('.planner-grid .chip')];
    // The released visit cannot move; the first planned one stands for the series.
    expect(chips.map((c) => c.dataset.move ?? null)).toEqual([null, 'series', 'occurrence']);
    expect(chips[1].className).toContain('chip-series');
    expect(chips[1].getAttribute('aria-label')).toContain('moving it moves the whole series');
    expect(chips[1].getAttribute('aria-label')).toContain('in a blocked week');
    expect(container.querySelectorAll('.week-col.is-blocked')).toHaveLength(1);
    expect(container.querySelector('.week-col.is-blocked').textContent).toContain(
      'blocked: Change freeze (every site)',
    );
    expect(container.querySelector('td.week-cell.is-blocked').dataset.index).toBe('1');

    const [undoButton, redoButton] = container.querySelectorAll('.planner-toolbar button');
    expect(undoButton.disabled).toBe(false);
    expect(undoButton.textContent).toBe('Undo: PM-0007: visit week 52 → week 53');
    expect(redoButton.disabled).toBe(true);
    undoButton.click();
    expect(undo).toHaveBeenCalled();

    // Live impact: the tiles and the load strip can show other figures, then come back.
    const figures = editable.figures.map((f) => ({
      ...f,
      planned_hours: 0,
      by_category: {},
      load: 0,
      level: 'OK',
    }));
    view.preview({
      figures,
      tiles: { ...editable.tiles, workload: { ...editable.tiles.workload, average_load: 0 } },
    });
    expect(container.querySelector('.load-row').classList.contains('is-preview')).toBe(true);
    expect(container.querySelector('.planner-tile').textContent).toContain('0%');
    view.reset();
    expect(container.querySelector('.load-row').classList.contains('is-preview')).toBe(false);
    expect(container.querySelector('.planner-tile').textContent).toContain('46%');
    view.say('Week 1 is outside the tolerance.', 'danger');
    expect(container.querySelector('.planner-message').dataset.tone).toBe('danger');
  });

  it('offers a new plan to supervisors', () => {
    const container = document.createElement('div');
    renderPlanner(container, {
      data,
      filters: { year: '2027' },
      sites: [],
      canEdit: true,
      isAdmin: true,
      onFilter: () => {},
      onOpen: () => {},
    });
    expect(container.querySelector('.planner-new').getAttribute('href')).toBe(
      '/planning/plans/new?year=2027',
    );
    expect(container.querySelector('.planner-reserve a').getAttribute('href')).toBe(
      '/admin/planning',
    );
  });
});

describe('plan form', () => {
  const raw = {
    title: ' Quarterly service ',
    type: 'PREVENTIVE',
    category: '',
    site: 'Lyon',
    building: '',
    location: '',
    estimated_hours: '2.5',
    frequency_weeks: '13',
    anchor_week: '2026-W50',
    end_week: '',
    schedule_mode: 'FIXED',
    tolerance_weeks: '',
    season_from_week: '',
    season_to_week: '',
    performed_by: 'INTERNAL',
    supplier: 'Ignored',
    description: '',
  };

  it('sends only what is filled when creating; the asset replaces the site', () => {
    expect(planBody(raw, { editing: false, assetId: 42 })).toEqual({
      title: 'Quarterly service',
      type: 'PREVENTIVE',
      asset_id: 42,
      estimated_hours: 2.5,
      frequency_weeks: 13,
      anchor_week: '2026-W50',
      schedule_mode: 'FIXED',
      performed_by: 'INTERNAL',
    });
  });

  it('clears emptied fields when editing, but keeps the trade and tolerance', () => {
    const body = planBody({ ...raw, is_active: false }, { editing: true, assetId: null });
    expect(body).toMatchObject({
      site: 'Lyon',
      building: null,
      end_week: null,
      supplier: null,
      is_active: false,
      asset_id: null,
    });
    expect(body).not.toHaveProperty('category');
    expect(body).not.toHaveProperty('tolerance_weeks');
  });

  it('checks the form before sending', () => {
    const body = planBody(raw, { editing: false, assetId: null });
    expect(checkPlanForm(body, { hasAssetCode: false })).toEqual({
      category: 'Required without an asset',
    });
    expect(
      Object.keys(
        checkPlanForm(
          {
            ...body,
            category: 'HVAC',
            estimated_hours: 1.2,
            frequency_weeks: 0,
            end_week: '2026-W01',
            season_from_week: 14,
            performed_by: 'CONTRACTOR',
          },
          { hasAssetCode: false },
        ),
      ).sort(),
    ).toEqual(['end_week', 'estimated_hours', 'frequency_weeks', 'season_to_week', 'supplier']);
  });

  it('describes frequencies and maps server errors to the form', () => {
    expect(frequencyText(13)).toBe('Every 13 weeks (quarterly)');
    expect(frequencyText(1)).toBe('Every 1 week (weekly)');
    expect(frequencyText(6)).toBe('Every 6 weeks');
    expect(planFieldErrors({ asset_id: 'Unknown asset', site: 'x' })).toEqual({
      asset_code: 'Unknown asset',
      site: 'x',
    });
  });
});

describe('planning settings', () => {
  const settings = {
    reserve_percent: 30,
    daily_hours: 7,
    release_weeks_ahead: 4,
    max_block_hours: 3.5,
    version: 3,
  };

  it('previews the capacity of the next 52 weeks', () => {
    expect(yearCapacity(settings, 4)).toBeCloseTo(5096);
    expect(capacityPreview(settings, { ...settings, reserve_percent: 20 }, 4)).toBe(
      'Capacity of the next 52 weeks: 5,096 h → 5,824 h',
    );
    expect(capacityPreview(settings, settings, 4)).toBe(null);
  });

  it('sends only the changed values, with the version', () => {
    const raw = {
      reserve_percent: '20',
      daily_hours: '7',
      release_weeks_ahead: '4',
      max_block_hours: '3.5',
    };
    expect(settingsChanges(settings, raw)).toEqual({ reserve_percent: 20, version: 3 });
    expect(settingsChanges(settings, { ...raw, reserve_percent: '30' })).toBe(null);
  });
});

describe('setPlannerPanel', () => {
  it('opens the split view for a plan or the form, and closes it on the planner', () => {
    document.body.innerHTML =
      '<main id="main-content"><section id="table-container"></section><section id="detail-container" class="hidden"></section></main>';
    const main = document.getElementById('main-content');
    const detail = document.getElementById('detail-container');

    expect(setPlannerPanel('planCreate', detail)).toBe(true);
    detail.append(document.createElement('form'));
    expect(main.classList.contains('split-view')).toBe(true);
    expect(detail.classList.contains('hidden')).toBe(false);

    // Regression: closing the form (✕ or Cancel) went back to /planning but left it on screen.
    expect(setPlannerPanel('planning', detail)).toBe(false);
    expect(main.classList.contains('split-view')).toBe(false);
    expect(detail.classList.contains('hidden')).toBe(true);
    expect(detail.children).toHaveLength(0);

    expect(setPlannerPanel('plan', detail)).toBe(true);
    expect(main.classList.contains('split-view')).toBe(true);
  });
});
