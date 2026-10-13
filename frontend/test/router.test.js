// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from 'vitest';
import {
  cameFrom,
  detailUrl,
  listUrl,
  navigate,
  parseRoute,
  returnPage,
  safeNext,
  startRouter,
} from '../assets/js/router.js';

describe('parseRoute', () => {
  it.each([
    ['/', '', { name: 'root', page: 1 }],
    ['/dashboard', '', { name: 'dashboard', page: 1 }],
    ['/dashboard/7', '', { name: 'dashboard', id: 7, page: 1 }],
    ['/admin/widgets', '', { name: 'widgetSettings', page: 1 }],
    ['/assets', '', { name: 'list', entity: 'assets', page: 1 }],
    ['/assets', '?page=3', { name: 'list', entity: 'assets', page: 3 }],
    ['/assets/', '?page=3', { name: 'list', entity: 'assets', page: 3 }],
    ['/assets/123', '', { name: 'detail', entity: 'assets', id: 123, page: 1 }],
    ['/assets/123', '?page=3', { name: 'detail', entity: 'assets', id: 123, page: 3 }],
    ['/work-orders', '', { name: 'list', entity: 'work_orders', page: 1 }],
    ['/work-orders/456', '', { name: 'detail', entity: 'work_orders', id: 456, page: 1 }],
    ['/work-orders/new', '', { name: 'create', entity: 'work_orders', page: 1 }],
    [
      '/work-orders/new',
      '?asset_id=42',
      { name: 'create', entity: 'work_orders', page: 1, assetId: 42 },
    ],
    ['/assets/new', '', { name: 'create', entity: 'assets', page: 1 }],
    ['/assets/new', '?asset_id=42', { name: 'create', entity: 'assets', page: 1 }],
    ['/conflicts', '', { name: 'conflicts', page: 1 }],
    ['/conflicts/7', '', { name: 'conflict', id: 7, page: 1 }],
  ])('%s%s', (path, search, route) => {
    expect(parseRoute(path, search)).toEqual(route);
  });

  it.each([
    '/nowhere',
    '/assets/abc',
    '/assets/0',
    '/assets/1.5',
    '/assets/1/extra',
    '/work_orders',
    '/conflicts/x',
    '/dashboard/x',
    '/dashboard/0',
    '/dashboard/1/extra',
    '/admin/widgets/by_status',
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

// M1 (docs/mobile-review.md): a message written after `await navigate(...)` was lost, because
// navigate resolved before the new page was rendered and the render then replaced it.
describe('navigate', () => {
  it('resolves only once the new route is rendered', async () => {
    const steps = [];
    startRouter(async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      steps.push(`rendered ${route.name}`);
    });
    await navigate('/schedule?week=2026-W42');
    steps.push('message');
    expect(steps).toEqual(['rendered schedule', 'message']);
    expect(location.pathname + location.search).toBe('/schedule?week=2026-W42');
  });
});

// M8: a work order opened from My week goes back to My week, not to the work order list.
describe('returnPage', () => {
  it.each([
    ['/my-week', 'My week'],
    ['/my-week?week=2026-W41', 'My week'],
    ['/dashboard', 'Dashboard'],
    ['/schedule/blocks/4?week=2026-W41', 'Week scheduler'],
    ['/audit-log?type=work_orders', 'Audit log'],
  ])('%s → %s', (url, name) => {
    expect(returnPage(url)).toBe(name);
  });

  it.each([null, undefined, '', '/work-orders?page=2', '/work-orders/5', '/assets/3', '/nowhere'])(
    '%s → back to the list',
    (url) => {
      expect(returnPage(url)).toBeNull();
    },
  );

  it('remembers the page each entry was opened from; a replacement keeps it', async () => {
    startRouter(async () => {});
    await navigate('/my-week');
    await navigate('/work-orders/5');
    expect(cameFrom()).toBe('/my-week');
    await navigate('/work-orders/5?page=2', { replace: true });
    expect(cameFrom()).toBe('/my-week');
  });
});
