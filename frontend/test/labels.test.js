import { describe, expect, it } from 'vitest';
import * as backend from '../../backend/src/rules/enums.js';
import { ENTITIES } from '../assets/js/entities.js';
import { ENUMS } from '../assets/js/enums.js';
import * as frontend from '../assets/js/enums.js';
import { VALUE_LABELS, VALUE_TONES } from '../assets/js/labels.js';

describe('enums', () => {
  it.each([
    'ROLES',
    'CATEGORIES',
    'CRITICALITIES',
    'ASSET_STATUSES',
    'WORK_ORDER_TYPES',
    'WORK_ORDER_STATUSES',
    'TERMINAL_WORK_ORDER_STATUSES',
    'WORK_ORDER_PRIORITIES',
    'PLAN_TYPES',
    'SCHEDULE_MODES',
    'OCCURRENCE_STATUSES',
  ])('%s matches the backend', (name) => {
    expect(frontend[name]).toEqual(backend[name]);
  });

  it('PERFORMERS matches the backend', () => {
    expect(frontend.PERFORMERS).toEqual(backend.PERFORMERS);
  });
});

describe('labels', () => {
  it.each(Object.entries(ENUMS))('every %s code has a label', (enumName, codes) => {
    for (const code of codes) expect(VALUE_LABELS[enumName][code], code).toBeTruthy();
  });

  it('tones exist only for known codes', () => {
    for (const [enumName, tones] of Object.entries(VALUE_TONES)) {
      expect(Object.keys(tones).sort()).toEqual([...ENUMS[enumName]].sort());
    }
  });
});

describe('entity definitions', () => {
  it.each(Object.values(ENTITIES))('$key columns and detail fields are all defined', (entity) => {
    for (const field of [...entity.columns, ...entity.detailFields]) {
      expect(entity.fields[field], field).toBeDefined();
      expect(entity.fields[field].label).toBeTruthy();
      if (entity.fields[field].type === 'enum') {
        expect(ENUMS[entity.fields[field].enum], field).toBeDefined();
      }
    }
  });
});
