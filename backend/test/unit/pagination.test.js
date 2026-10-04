import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  idParams,
  likePattern,
  orderByClause,
  pageCount,
  pageOffset,
  pageQueryFields,
  rankExpression,
  sortQueryFields,
} from '../../src/lib/pagination.js';

describe('pageCount / pageOffset', () => {
  it.each([
    [500, 50, 10],
    [501, 50, 11],
    [200, 50, 4],
    [1, 50, 1],
    [0, 50, 1], // an empty list still has page 1
  ])('%i rows by %i → %i pages', (total, size, pages) => {
    expect(pageCount(total, size)).toBe(pages);
  });

  it('computes offsets from 1-based pages', () => {
    expect(pageOffset(1, 50)).toBe(0);
    expect(pageOffset(3, 50)).toBe(100);
  });
});

describe('page query fields', () => {
  const schema = z.strictObject(pageQueryFields);

  it('defaults to page 1 of 50 rows and coerces strings', () => {
    expect(schema.parse({})).toEqual({ page: 1, size: 50 });
    expect(schema.parse({ page: '3', size: '20' })).toEqual({ page: 3, size: 20 });
  });

  it.each([{ page: '0' }, { page: '-1' }, { page: '1.5' }, { size: '101' }, { size: '0' }])(
    'rejects %o',
    (query) => {
      expect(schema.safeParse(query).success).toBe(false);
    },
  );
});

describe('idParams', () => {
  it('accepts plain positive integers only', () => {
    expect(idParams.parse({ id: '42' })).toEqual({ id: 42 });
    for (const id of ['0', '-1', 'abc', '1.5', '0x10', '1e3', ' 1', '007']) {
      expect(idParams.safeParse({ id }).success, id).toBe(false);
    }
  });
});

describe('sorting', () => {
  const columns = { code: 'a.code', priority: rankExpression('w.priority', ['LOW', 'HIGH']) };

  it('builds ORDER BY from the whitelist with an id tiebreaker', () => {
    expect(orderByClause(columns, 'code', 'asc', 'a.id')).toBe('ORDER BY a.code ASC, a.id ASC');
    expect(orderByClause(columns, 'priority', 'desc', 'w.id')).toBe(
      "ORDER BY CASE w.priority WHEN 'LOW' THEN 0 WHEN 'HIGH' THEN 1 END DESC, w.id DESC",
    );
  });

  it('refuses keys outside the whitelist', () => {
    expect(() => orderByClause(columns, 'password_hash', 'asc', 'a.id')).toThrow(/Unknown sort/);
    const schema = z.strictObject(sortQueryFields(columns, 'code', 'asc'));
    expect(schema.parse({})).toEqual({ sort: 'code', order: 'asc' });
    expect(schema.safeParse({ sort: 'a.code; DROP TABLE assets' }).success).toBe(false);
    expect(schema.safeParse({ order: 'sideways' }).success).toBe(false);
  });

  it('only builds rank expressions from enum codes', () => {
    expect(() => rankExpression('x', ["LOW' OR 1=1 --"])).toThrow();
  });
});

describe('likePattern', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(likePattern('AST-001')).toBe('%AST-001%');
    expect(likePattern('100%_\\')).toBe('%100\\%\\_\\\\%');
  });
});
