import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  checkFeedback,
  feedbackPayload,
  feedbackUrl,
  openFeedbackDialog,
  parseFeedbackFilters,
  renderFeedbackLog,
} from '../assets/js/feedback.js';
import { parseRoute } from '../assets/js/router.js';

// jsdom has no modal dialogs.
HTMLDialogElement.prototype.showModal ??= function showModal() {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function close() {
  this.open = false;
};

describe('payload and checks', () => {
  it('sends the trimmed text with the page path, query and title', () => {
    expect(
      feedbackPayload(
        '  Add a pie chart  ',
        { pathname: '/dashboard', search: '?x=1' },
        ' Dashboard ',
        1280,
      ),
    ).toEqual({
      message: 'Add a pie chart',
      page_path: '/dashboard?x=1',
      page_title: 'Dashboard',
      viewport_width: 1280,
    });
    expect(
      feedbackPayload('x', { pathname: '/', search: '' }, 'T', undefined).viewport_width,
    ).toBeNull();
  });

  it('requires some text, at most 2000 characters', () => {
    expect(checkFeedback('   ')).toMatch(/Describe/);
    expect(checkFeedback('x'.repeat(2001))).toMatch(/2000/);
    expect(checkFeedback('Fine')).toBe('');
  });
});

describe('feedback log route', () => {
  it('parses /admin/feedback with a known status only', () => {
    expect(parseRoute('/admin/feedback', '?status=DONE&page=2')).toEqual({
      name: 'feedback',
      page: 2,
      filters: { status: 'DONE' },
    });
    expect(parseRoute('/admin/feedback', '?status=MAYBE')).toEqual({ name: 'feedback', page: 1 });
    expect(parseRoute('/admin/feedback/3', '')).toEqual({ name: 'notFound', page: 1 });
    expect(parseFeedbackFilters(new URLSearchParams('status=NEW'))).toEqual({ status: 'NEW' });
    expect(feedbackUrl({ status: 'NEW', page: 2 })).toBe('/admin/feedback?status=NEW&page=2');
    expect(feedbackUrl()).toBe('/admin/feedback');
  });
});

describe('suggestion dialog', () => {
  afterEach(() => document.body.replaceChildren());

  const open = (send = vi.fn().mockResolvedValue(undefined), onSent = vi.fn()) => {
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    openFeedbackDialog(dialog, { pageTitle: 'Work orders', send, onSent });
    return { dialog, send, onSent, submit: () => dialog.querySelector('form').requestSubmit() };
  };

  it('shows the page and refuses an empty suggestion', () => {
    const { dialog, send, submit } = open();
    expect(dialog.textContent).toContain('Work orders');
    submit();
    expect(send).not.toHaveBeenCalled();
    expect(dialog.querySelector('#feedback-error').textContent).toMatch(/Describe/);
  });

  it('sends, closes and forgets the text', async () => {
    const { dialog, send, onSent, submit } = open();
    dialog.querySelector('textarea').value = 'Add a pie chart';
    submit();
    await vi.waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(send.mock.calls[0][0]).toMatchObject({ message: 'Add a pie chart', page_path: '/' });
    expect(dialog.open).toBe(false);
    const again = open();
    expect(again.dialog.querySelector('textarea').value).toBe('');
  });

  it('keeps the text when sending fails or the dialog is cancelled', async () => {
    const failing = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 0 }));
    const first = open(failing);
    const textarea = first.dialog.querySelector('textarea');
    textarea.value = 'Bigger buttons';
    textarea.dispatchEvent(new Event('input'));
    first.submit();
    await vi.waitFor(() =>
      expect(first.dialog.querySelector('#feedback-error').textContent).toMatch(/offline/),
    );
    first.dialog.querySelector('.button-secondary').click();
    expect(open().dialog.querySelector('textarea').value).toBe('Bigger buttons');
  });
});

describe('feedback log', () => {
  it('lists suggestions with author, page link and status control', () => {
    const container = document.createElement('div');
    const onStatus = vi.fn();
    renderFeedbackLog(container, {
      data: {
        total: 1,
        page: 1,
        pages: 1,
        items: [
          {
            id: 4,
            message: 'Add a <b>pie</b> chart',
            page_path: '/dashboard',
            page_title: 'Dashboard',
            viewport_width: 390,
            user: { id: 4, first_name: 'Karim', last_name: 'Benali' },
            user_role: 'TECHNICIAN',
            status: 'NEW',
            created_at: '2026-10-04T08:00:00.000Z',
          },
        ],
      },
      filters: {},
      onFilter: () => {},
      onStatus,
      pagination: null,
    });
    const text = container.textContent;
    expect(text).toContain('Karim Benali');
    expect(text).toContain('Technician');
    expect(text).toContain('390 px wide');
    expect(container.querySelector('.feedback-message').innerHTML).toBe(
      'Add a &lt;b&gt;pie&lt;/b&gt; chart',
    );
    expect(container.querySelector('a[href="/dashboard"]').textContent).toBe('Dashboard');
    const select = container.querySelector('.feedback-status-select');
    select.value = 'PLANNED';
    select.dispatchEvent(new Event('change'));
    expect(onStatus).toHaveBeenCalledWith(4, 'PLANNED', select);
  });
});

describe('error message', () => {
  it('goes away once the text is valid', () => {
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    openFeedbackDialog(dialog, { pageTitle: 'T', send: vi.fn(), onSent: vi.fn() });
    const textarea = dialog.querySelector('textarea');
    textarea.value = '';
    dialog.querySelector('form').requestSubmit();
    expect(textarea.hasAttribute('aria-invalid')).toBe(true);
    textarea.value = 'An idea';
    textarea.dispatchEvent(new Event('input'));
    expect(dialog.querySelector('#feedback-error').textContent).toBe('');
    expect(textarea.hasAttribute('aria-invalid')).toBe(false);
  });
});
