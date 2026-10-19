// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it, vi } from 'vitest';
import {
  awaitsReply,
  checkComment,
  commentAuthor,
  commentForm,
  renderConversation,
} from '../assets/js/comments.js';
import {
  canCancelRequest,
  checkRequest,
  renderRequestDetail,
  renderRequestForm,
  renderRequestList,
  requestPayload,
  requestProgress,
  requestsUrl,
} from '../assets/js/requests.js';
import { parseRoute } from '../assets/js/router.js';

const karim = { id: 4, first_name: 'Karim', last_name: 'Benali' };
const emma = { id: 6, first_name: 'Emma', last_name: 'Rousseau' };
const staff = { id: 6, role: 'STAFF' };

const request = (overrides = {}) => ({
  id: 12,
  number: 'WO-2026-00190',
  status: 'OPEN',
  priority: 'NORMAL',
  title: 'Office too cold',
  description: null,
  site: 'Paris La Défense Headquarters',
  location: 'Tower A, floor 12',
  category: null,
  created_on: '2026-10-07',
  created_at: '2026-10-07T08:00:00.000Z',
  due_on: null,
  started_on: null,
  closed_on: null,
  work_report: null,
  assignee: null,
  comment_count: 0,
  last_comment_at: null,
  status_history: [{ status: 'OPEN', at: '2026-10-07T08:00:00.000Z' }],
  comments: [],
  ...overrides,
});

describe('routes', () => {
  it.each([
    ['/requests', '', { name: 'requests', scope: 'open', page: 1 }],
    ['/requests', '?page=2', { name: 'requests', scope: 'open', page: 2 }],
    ['/requests/all', '', { name: 'requests', scope: 'all', page: 1 }],
    ['/requests/new', '', { name: 'requestCreate', page: 1 }],
    ['/requests/12', '', { name: 'request', id: 12, page: 1 }],
    ['/requests/abc', '', { name: 'notFound', page: 1 }],
    ['/requests/12/x', '', { name: 'notFound', page: 1 }],
  ])('%s%s', (path, search, route) => {
    expect(parseRoute(path, search)).toEqual(route);
  });

  it('builds list URLs', () => {
    expect(requestsUrl()).toBe('/requests');
    expect(requestsUrl('all')).toBe('/requests/all');
    expect(requestsUrl('all', 3)).toBe('/requests/all?page=3');
  });
});

describe('requestProgress', () => {
  it('says the team will assign someone while nobody is assigned', () => {
    expect(requestProgress(request())).toMatchObject({ stage: 'RECEIVED', step: 0 });
    expect(requestProgress(request()).next).toMatch(/assign a technician/);
  });

  it('names the technician and the planned date once assigned', () => {
    const p = requestProgress(request({ assignee: karim, due_on: '2026-10-10' }));
    expect(p).toMatchObject({ stage: 'ASSIGNED', step: 1, label: 'Approved' });
    expect(p.next).toBe('Karim Benali will take care of it by 10 Oct 2026.');
  });

  it('waits for the supervisor first, and explains a rejection (D47)', () => {
    const waiting = requestProgress(request({ review_status: 'PENDING' }));
    expect(waiting).toMatchObject({ stage: 'REVIEW', step: 0, label: 'Waiting for review' });
    expect(waiting.next).toMatch(/supervisor will review/);
    const rejected = requestProgress(
      request({ status: 'CANCELLED', review_status: 'REJECTED', review_note: 'Not maintenance.' }),
    );
    expect(rejected).toMatchObject({ stage: 'REJECTED', step: null, tone: 'danger' });
    expect(rejected.next).toMatch(/rejected this request: “Not maintenance\.”/);
    // Approved: the usual stages.
    expect(requestProgress(request({ review_status: 'APPROVED', assignee: karim })).stage).toBe(
      'ASSIGNED',
    );
  });

  it('follows the work: in progress, on hold, done, cancelled', () => {
    expect(requestProgress(request({ status: 'IN_PROGRESS', assignee: karim })).next).toBe(
      'Karim Benali is working on it.',
    );
    expect(requestProgress(request({ status: 'ON_HOLD', assignee: karim }))).toMatchObject({
      stage: 'ON_HOLD',
      step: 2,
      tone: 'warning',
    });
    // Done at the technical end, then closed (D86).
    const done = requestProgress(request({ status: 'COMPLETED', completed_on: '2026-10-08' }));
    expect(done).toMatchObject({ stage: 'DONE', label: 'Done', step: 3 });
    expect(done.next).toMatch(/finished \(8 Oct 2026\).*add a comment/);
    const closed = requestProgress(
      request({ status: 'CLOSED', completed_on: '2026-10-08', closed_on: '2026-10-09' }),
    );
    expect(closed).toMatchObject({ stage: 'CLOSED', label: 'Closed', step: 4 });
    expect(closed.next).toMatch(/finished \(8 Oct 2026\)/);
    expect(requestProgress(request({ status: 'CANCELLED' }))).toMatchObject({
      stage: 'CANCELLED',
      step: null,
    });
  });
});

describe('cancellation by the requester (BR-R10, D79)', () => {
  it('is offered until work starts, reviewed or not', () => {
    expect(canCancelRequest(request({ review_status: 'PENDING' }))).toBe(true);
    expect(canCancelRequest(request({ review_status: 'APPROVED', assignee: karim }))).toBe(true);
    for (const status of ['IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED']) {
      expect(canCancelRequest(request({ status }))).toBe(false);
    }
  });

  it('says the requester cancelled it, even after an approval', () => {
    expect(
      requestProgress(
        request({ status: 'CANCELLED', review_status: 'WITHDRAWN', assignee: karim }),
      ),
    ).toMatchObject({ stage: 'WITHDRAWN', label: 'Cancelled by you', step: null });
  });

  it('shows the button on an open request only, and the error when it fails', async () => {
    const container = document.createElement('div');
    const cancelRequest = vi.fn(async () => {
      throw Object.assign(new Error('Work on this request has started.'), { status: 422 });
    });
    renderRequestDetail(container, { request: request(), viewer: staff, cancelRequest });
    const button = container.querySelector('.request-cancel button');
    expect(button.textContent).toBe('Cancel this request');
    button.click();
    await vi.waitFor(() =>
      expect(container.querySelector('.request-cancel .field-error').textContent).toBe(
        'Work on this request has started.',
      ),
    );
    expect(cancelRequest).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);

    renderRequestDetail(container, {
      request: request({
        status: 'CANCELLED',
        review_status: 'WITHDRAWN',
        status_history: [
          { status: 'OPEN', at: '2026-10-07T08:00:00.000Z' },
          { status: 'WITHDRAWN', at: '2026-10-07T09:00:00.000Z' },
        ],
      }),
      viewer: staff,
      cancelRequest,
    });
    expect(container.querySelector('.request-cancel')).toBeNull();
    expect(container.querySelectorAll('.timeline-head strong')[1].textContent).toBe(
      'Cancelled by you',
    );
  });
});

describe('request form logic', () => {
  const values = {
    title: ' Leak ',
    site: 'Lyon Part-Dieu Branch',
    location: ' Floor 2, kitchen ',
    category: '',
    priority: '',
    description: '  ',
  };

  it('requires a title, a site and a location', () => {
    expect(checkRequest(values)).toEqual({});
    expect(checkRequest({ ...values, title: ' ', site: '', location: '' })).toEqual({
      title: 'Required',
      site: 'Required',
      location: 'Required: say where the problem is.',
    });
  });

  it("leaves out what the requester doesn't know", () => {
    expect(requestPayload(values, 'id-1')).toEqual({
      client_id: 'id-1',
      title: 'Leak',
      site: 'Lyon Part-Dieu Branch',
      location: 'Floor 2, kitchen',
    });
    expect(
      requestPayload({ ...values, category: 'PLUMBING', priority: 'HIGH', description: 'x' }, 'id'),
    ).toMatchObject({ category: 'PLUMBING', priority: 'HIGH', description: 'x' });
  });

  it('offers "I don\'t know" first in both lists, preselected', () => {
    const container = document.createElement('div');
    renderRequestForm(container, { sites: ['A', 'B'], defaultSite: 'B', onSubmit: vi.fn() });
    for (const name of ['category', 'priority']) {
      const select = container.querySelector(`[name="${name}"]`);
      expect(select.options[0].textContent).toBe("I don't know");
      expect(select.value).toBe('');
    }
    expect(container.querySelector('[name="site"]').value).toBe('B');
  });

  it('sends the same client_id again after a failure, a new one after a success', async () => {
    const container = document.createElement('div');
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const fill = () => {
      renderRequestForm(container, { sites: ['A'], defaultSite: 'A', onSubmit });
      const form = container.querySelector('form');
      container.querySelector('[name="title"]').value = 'Leak';
      container.querySelector('[name="location"]').value = 'Kitchen';
      return form;
    };
    const submit = async (form) => {
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.waitFor(() => expect(form.querySelector('[type="submit"]').disabled).toBe(false));
    };
    await submit(fill());
    await submit(fill());
    expect(onSubmit.mock.calls[0][0].client_id).toBe(onSubmit.mock.calls[1][0].client_id);
    onSubmit.mockResolvedValueOnce(true);
    await submit(fill());
    expect(onSubmit.mock.calls[2][0].client_id).not.toBe(onSubmit.mock.calls[1][0].client_id);
  });
});

describe('request pages', () => {
  it('lists requests with their next step, as text only', () => {
    const container = document.createElement('div');
    renderRequestList(container, {
      data: {
        total: 1,
        page: 1,
        pages: 1,
        items: [request({ title: '<img src=x onerror=alert(1)>' })],
      },
      scope: 'open',
      pagination: document.createElement('nav'),
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.request-card-title a').textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
    expect(container.querySelector('.request-card-title a').getAttribute('href')).toBe(
      '/requests/12',
    );
    expect(container.querySelector('.request-next').textContent).toMatch(/^Next step: /);
  });

  it('says so when there is no open request', () => {
    const container = document.createElement('div');
    renderRequestList(container, {
      data: { total: 0, page: 1, pages: 1, items: [] },
      scope: 'open',
      pagination: document.createElement('nav'),
    });
    expect(container.querySelector('.empty-state').textContent).toMatch(/no open request/);
  });

  it('shows the steps, the work report, the history and the conversation', () => {
    const container = document.createElement('div');
    renderRequestDetail(container, {
      request: request({
        status: 'CLOSED',
        assignee: karim,
        completed_on: '2026-10-08',
        closed_on: '2026-10-08',
        work_report: 'Seal replaced.',
        status_history: [
          { status: 'OPEN', at: '2026-10-07T08:00:00.000Z' },
          { status: 'IN_PROGRESS', at: '2026-10-07T10:00:00.000Z' },
          { status: 'COMPLETED', at: '2026-10-08T09:00:00.000Z' },
          { status: 'CLOSED', at: '2026-10-08T10:00:00.000Z' },
        ],
        comments: [
          {
            id: 1,
            body: 'Thanks',
            user: emma,
            user_role: 'STAFF',
            created_at: '2026-10-08T11:00:00.000Z',
          },
        ],
      }),
      viewer: staff,
      sendComment: vi.fn(),
    });
    const steps = [...container.querySelectorAll('.request-step')];
    expect(steps.map((s) => s.className)).toEqual([
      'request-step is-done',
      'request-step is-done',
      'request-step is-done',
      'request-step is-done',
      'request-step is-current',
    ]);
    expect(steps[4].getAttribute('aria-current')).toBe('step');
    expect(container.querySelector('.request-report').textContent).toBe('Seal replaced.');
    expect(container.querySelectorAll('.timeline-entry')).toHaveLength(4);
    expect(container.querySelector('.comment-head strong').textContent).toBe('You');
    expect(container.querySelector('a[href="/requests/all"]')).not.toBeNull();
  });

  it('adds a sent comment to the conversation', async () => {
    const container = document.createElement('div');
    const sendComment = vi.fn(async (body) => ({
      id: 2,
      body,
      user: karim,
      user_role: 'TECHNICIAN',
      created_at: '2026-10-08T12:00:00.000Z',
    }));
    renderRequestDetail(container, { request: request(), viewer: staff, sendComment });
    const textarea = container.querySelector('.comment-form textarea');
    textarea.value = '  Any news?  ';
    container
      .querySelector('.comment-form')
      .dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(container.querySelectorAll('.comment')).toHaveLength(1));
    expect(sendComment).toHaveBeenCalledWith('Any news?');
    expect(container.querySelector('.comment-head strong').textContent).toBe(
      'Karim Benali (maintenance team)',
    );
    expect(textarea.value).toBe('');
  });
});

describe('comments', () => {
  it('checks the text', () => {
    expect(checkComment('  ')).toMatch(/Write/);
    expect(checkComment('x'.repeat(2001))).toMatch(/2000/);
    expect(checkComment('Hello')).toBe('');
  });

  it('names authors for staff and for the maintenance team', () => {
    const fromKarim = { user: karim, user_role: 'TECHNICIAN' };
    const fromEmma = { user: emma, user_role: 'STAFF' };
    expect(commentAuthor(fromKarim, staff)).toBe('Karim Benali (maintenance team)');
    expect(commentAuthor(fromEmma, staff)).toBe('You');
    const supervisor = { id: 2, role: 'SUPERVISOR' };
    expect(commentAuthor(fromKarim, supervisor)).toBe('Karim Benali (technician)');
    expect(commentAuthor(fromEmma, supervisor)).toBe('Emma Rousseau (requester)');
  });

  it('waits for a reply when the requester wrote last (D80)', () => {
    expect(awaitsReply([])).toBe(false);
    expect(awaitsReply([{ user_role: 'STAFF' }])).toBe(true);
    expect(awaitsReply([{ user_role: 'STAFF' }, { user_role: 'TECHNICIAN' }])).toBe(false);
    expect(awaitsReply([{ user_role: 'SUPERVISOR' }, { user_role: 'STAFF' }])).toBe(true);
  });

  it('renders comment text as text', () => {
    const list = renderConversation(
      [
        {
          id: 1,
          body: '<b>hi</b>',
          user: emma,
          user_role: 'STAFF',
          created_at: '2026-10-08T11:00:00.000Z',
        },
      ],
      { id: 2, role: 'SUPERVISOR' },
    );
    expect(list.querySelector('b')).toBeNull();
    expect(list.querySelector('.comment-body').textContent).toBe('<b>hi</b>');
    expect(renderConversation([], staff).textContent).toBe('No comment yet.');
  });

  it('keeps unsent text when sending fails', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { status: 0 }));
    const form = commentForm({ key: 'k1', label: 'L', hint: 'H', send, onSent: vi.fn() });
    form.querySelector('textarea').value = 'Follow-up';
    form.querySelector('textarea').dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
      expect(form.querySelector('.field-error').textContent).toMatch(/offline/),
    );
    // The same form built again (e.g. after navigating back) still has the text.
    const again = commentForm({ key: 'k1', label: 'L', hint: 'H', send, onSent: vi.fn() });
    expect(again.querySelector('textarea').value).toBe('Follow-up');
  });
});
