import { describe, expect, it } from 'vitest';
import { detailUrl, listUrl, parseRoute, safeNext } from '../assets/js/router.js';

describe('parseRoute', () => {
  it.each([
    ['/', '', { name: 'root', page: 1 }],
    ['/dashboard', '', { name: 'dashboard', page: 1 }],
    ['/assets', '', { name: 'list', entity: 'assets', page: 1 }],
    ['/assets', '?page=3', { name: 'list', entity: 'assets', page: 3 }],
    ['/assets/', '?page=3', { name: 'list', entity: 'assets', page: 3 }],
    ['/assets/123', '', { name: 'detail', entity: 'assets', id: 123, page: 1 }],
    ['/assets/123', '?page=3', { name: 'detail', entity: 'assets', id: 123, page: 3 }],
    ['/work-orders', '', { name: 'list', entity: 'work_orders', page: 1 }],
    ['/work-orders/456', '', { name: 'detail', entity: 'work_orders', id: 456, page: 1 }],
    ['/work-orders/new', '', { name: 'create', entity: 'work_orders', page: 1 }],
    ['/conflicts', '', { name: 'conflicts', page: 1 }],
    ['/conflicts/7', '', { name: 'conflict', id: 7, page: 1 }],
  ])('%s%s', (path, search, route) => {
    expect(parseRoute(path, search)).toEqual(route);
  });

  it.each([
    '/nowhere',
    '/assets/new', // creation exists for work orders only (D15)
    '/assets/abc',
    '/assets/0',
    '/assets/1.5',
    '/assets/1/extra',
    '/work_orders',
    '/conflicts/x',
    '/dashboard/1',
  ])('%s is not found', (path) => {
    expect(parseRoute(path).name).toBe('notFound');
  });

  it.each(['?page=0', '?page=-2', '?page=abc', '?page=1.5', '?page='])(
    'falls back to page 1 for %s',
    (search) => {
      expect(parseRoute('/assets', search).page).toBe(1);
    },
  );

  it('parses the login destination safely', () => {
    expect(parseRoute('/login', '?next=%2Fassets%2F12%3Fpage%3D3')).toMatchObject({
      name: 'login',
      next: '/assets/12?page=3',
    });
    expect(parseRoute('/login').next).toBe('/dashboard');
  });
});

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/work-orders/5')).toBe('/work-orders/5');
  });

  it.each([
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'assets',
    '/login',
    '/login?next=/x',
  ])('replaces %s with the dashboard', (value) => {
    expect(safeNext(value)).toBe('/dashboard');
  });
});

describe('URL builders', () => {
  it('omit page 1 and use the entity UI path', () => {
    expect(listUrl('assets')).toBe('/assets');
    expect(listUrl('work_orders', 2)).toBe('/work-orders?page=2');
    expect(detailUrl('assets', 12, 1)).toBe('/assets/12');
    expect(detailUrl('work_orders', 12, 3)).toBe('/work-orders/12?page=3');
  });

  it('round-trip through parseRoute', () => {
    const url = new URL(detailUrl('work_orders', 9, 4), 'http://x');
    expect(parseRoute(url.pathname, url.search)).toEqual({
      name: 'detail',
      entity: 'work_orders',
      id: 9,
      page: 4,
    });
  });
});
