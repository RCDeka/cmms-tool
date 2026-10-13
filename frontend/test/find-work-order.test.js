// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkFindText,
  findPayload,
  matchLevel,
  openFindDialog,
  resultsNotice,
} from '../assets/js/find-work-order.js';

// jsdom has no modal dialogs.
HTMLDialogElement.prototype.showModal ??= function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function close() {
  this.open = false;
};

const ASSET = { id: 42, code: 'AST-0042', name: 'Pump 2' };
const wo = (id, o = {}) => ({
  id,
  number: `WO-2026-000${id}`,
  title: `Job ${id}`,
  status: 'OPEN',
  site: 'Lyon',
  asset: { id: 42, code: 'AST-0042', name: 'Pump 2' },
  ...o,
});

describe('checks and payload', () => {
  it('needs 3 words and at most 2000 characters', () => {
    expect(checkFindText('pump fixed')).toMatch(/3 words/);
    expect(checkFindText(`${'word '.repeat(400)}x`)).toMatch(/2000/);
    expect(checkFindText(' replaced the filter ')).toBe('');
  });

  it('sends the trimmed text with the asset, else the site', () => {
    expect(findPayload('  coil burnt  ', { asset: ASSET, site: 'Lyon' })).toEqual({
      raw_text: 'coil burnt',
      asset_id: 42,
    });
    expect(findPayload('x', { site: 'Lyon' })).toEqual({ raw_text: 'x', site: 'Lyon' });
    expect(findPayload('x', null)).toEqual({ raw_text: 'x' });
  });

  it('labels the match level and the origin of the results', () => {
    expect(matchLevel(0.7)).toBe('Strong');
    expect(matchLevel(0.69)).toBe('Possible');
    expect(matchLevel(null)).toBeNull();
    expect(resultsNotice({ mode: 'ASSISTANT', notice: null })).toBe('');
    expect(resultsNotice({ mode: 'SEARCH', notice: 'NOT_CONFIGURED' })).toMatch(/not set up/);
    expect(resultsNotice({ mode: 'SEARCH', notice: 'UNAVAILABLE' })).toMatch(/not available/);
  });
});

describe('dialog', () => {
  let dialog;
  let options;
  beforeEach(() => {
    document.body.innerHTML = '<dialog id="find-dialog"></dialog>';
    dialog = document.getElementById('find-dialog');
    options = {
      context: { asset: ASSET },
      find: vi.fn(),
      onOpen: vi.fn(),
      onCreate: vi.fn(),
    };
  });
  const textarea = () => dialog.querySelector('#find-text');
  const type = (text) => {
    textarea().value = text;
    textarea().dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    dialog.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(dialog.querySelector('[type="submit"]').disabled).toBe(false));
  };
  const button = (label) =>
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === label);

  it('starts with the asset of the open record, which can be removed', async () => {
    openFindDialog(dialog, options);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.find-context').textContent).toContain('Asset: AST-0042 Pump 2');
    button('Remove').click();
    expect(dialog.querySelector('.find-context').hidden).toBe(true);
    options.find.mockResolvedValue({ mode: 'ASSISTANT', notice: null, candidates: [] });
    type('replaced the burnt coil');
    await submit();
    expect(options.find).toHaveBeenCalledWith({ raw_text: 'replaced the burnt coil' });
  });

  it('refuses a short text without calling the server', async () => {
    openFindDialog(dialog, options);
    type('pump fixed');
    await submit();
    expect(options.find).not.toHaveBeenCalled();
    expect(dialog.querySelector('#find-error').textContent).toMatch(/3 words/);
    expect(textarea().hasAttribute('aria-invalid')).toBe(true);
  });

  it("shows the assistant's matches with their level and reason, as text", async () => {
    options.find.mockResolvedValue({
      mode: 'ASSISTANT',
      notice: null,
      candidates: [
        {
          work_order: wo(1, { title: '<img src=x onerror=alert(1)>' }),
          score: 0.9,
          reason: 'Same asset',
        },
        { work_order: wo(2), score: 0.4, reason: '<b>maybe</b>' },
      ],
    });
    openFindDialog(dialog, options);
    type('replaced the burnt coil');
    await submit();
    const items = dialog.querySelectorAll('.find-result');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Strong Same asset');
    expect(items[1].textContent).toContain('Possible <b>maybe</b>');
    expect(dialog.querySelector('img, b')).toBeNull();
    expect(dialog.querySelector('.find-notice')).toBeNull();
    dialog.querySelector('[aria-label="Open WO-2026-0001"]').click();
    expect(options.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    expect(dialog.open).toBe(false);
  });

  it('says when the results come from the search, without levels', async () => {
    options.find.mockResolvedValue({
      mode: 'SEARCH',
      notice: 'NOT_CONFIGURED',
      candidates: [{ work_order: wo(3), score: null, reason: null }],
    });
    openFindDialog(dialog, options);
    type('replaced the burnt coil');
    await submit();
    expect(dialog.querySelector('.find-notice').textContent).toMatch(/not set up/);
    expect(dialog.querySelector('.find-result-reason')).toBeNull();
  });

  it('offers a new work order with the text when nothing matches', async () => {
    options.find.mockResolvedValue({ mode: 'ASSISTANT', notice: null, candidates: [] });
    openFindDialog(dialog, options);
    type('  replaced the burnt coil  ');
    await submit();
    expect(dialog.querySelector('.empty-state').textContent).toMatch(/No open work order/);
    button('New work order').click();
    expect(options.onCreate).toHaveBeenCalledWith('replaced the burnt coil', { asset: ASSET });
    // The text went to the form: not offered again.
    openFindDialog(dialog, options);
    expect(textarea().value).toBe('');
  });

  it('shows the server message and keeps the text, also for the next opening', async () => {
    options.find.mockRejectedValue(
      Object.assign(new Error('This doesn’t look like a maintenance job.'), { status: 422 }),
    );
    openFindDialog(dialog, options);
    type('write me a poem please');
    await submit();
    expect(dialog.querySelector('#find-error').textContent).toMatch(/maintenance job/);
    button('Close').click();
    openFindDialog(dialog, options);
    expect(textarea().value).toBe('write me a poem please');
  });

  it('explains a network failure', async () => {
    options.find.mockRejectedValue(Object.assign(new Error('x'), { status: 0 }));
    openFindDialog(dialog, options);
    type('replaced the burnt coil');
    await submit();
    expect(dialog.querySelector('#find-error').textContent).toMatch(/cannot be reached/);
  });
});
