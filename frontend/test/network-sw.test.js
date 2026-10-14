// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyToPage, isOnline, reportOffline, reportOnline } from '../assets/js/network.js';

const FRONTEND = path.resolve(import.meta.dirname, '..');

describe('network state on the page', () => {
  afterEach(() => reportOnline());

  it('shows the offline message and disables AI buttons offline', () => {
    document.body.innerHTML =
      '<span id="network-status"></span><button class="ai-only">Format</button>';
    const button = document.querySelector('.ai-only');
    reportOnline();
    applyToPage();
    expect(button.disabled).toBe(false);

    reportOffline();
    expect(isOnline()).toBe(false);
    expect(document.body.classList.contains('is-offline')).toBe(true);
    expect(document.getElementById('network-status').textContent).toBe('Offline mode — local data');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.title).toMatch(/offline/i);

    reportOnline();
    expect(document.getElementById('network-status').textContent).toBe('Online');
    expect(button.disabled).toBe(false);
  });

  it('disables actions that need the server while offline', () => {
    document.body.innerHTML = '<button class="online-only">Delete asset</button>';
    const button = document.querySelector('.online-only');
    reportOffline();
    applyToPage();
    expect(button.disabled).toBe(true);
    expect(button.title).toMatch(/needs a connection/);
    reportOnline();
    expect(button.disabled).toBe(false);
  });
});

describe('service worker', () => {
  it('precaches every file of the app shell', () => {
    const source = fs.readFileSync(path.join(FRONTEND, 'sw.js'), 'utf8');
    const list = source.match(/const SHELL_FILES = \[([\s\S]*?)\];/)[1];
    const precached = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();

    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|css|svg|png|woff2?)$/.test(entry.name)) {
          files.push(`/${path.relative(FRONTEND, full).split(path.sep).join('/')}`);
        }
      }
    };
    walk(path.join(FRONTEND, 'assets'));
    expect(precached).toEqual(['/index.html', ...files].sort());
  });
});

describe('index.html', () => {
  it('preloads every module of the app, so they load in parallel', () => {
    const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
    const preloaded = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)"/g)]
      .map((m) => m[1])
      .sort();
    const modules = fs
      .readdirSync(path.join(FRONTEND, 'assets/js'))
      .filter((f) => f.endsWith('.js') && f !== 'app.js')
      .map((f) => `/assets/js/${f}`);
    expect(preloaded).toEqual([...modules, '/assets/vendor/idb-8.0.4/index.js'].sort());
  });
});
