# Acceptance Test Protocol

A manual and semi-automated test campaign covering every feature of Tacto, for every role, run before the first production deployment and again before each release. It complements the automated suites (backend: unit, database and API tests; frontend: logic tests), which cover the rules but not the screens, the browsers, the deployment or the use across several sessions.

Reference documents: `docs/api-design.md` (permission matrix, contracts), `docs/data-model.md` (business rules BR-…), `docs/architecture.md` (routes, offline, save modes), `docs/ui-guidelines.md`, `docs/decisions.md`. When a test and a document disagree, the document is the reference: record the test as failed and say which one is wrong.

## 0. How to run the campaign

### 0.1 Environments

| Environment | Use | Set-up |
|---|---|---|
| **Staging** | Every section | A VPS, or a VM, installed exactly as the README deployment guide says (Nginx, HTTPS, systemd, timers), with `NODE_ENV=production`. Demo data: `npm run db:reset -- --with-conflicts`. |
| **Local** | Sections 1, 3 and quick re-tests | `npm run db:reset -- --with-conflicts && npm run dev`. |
| **Production** | Section 20 only (smoke test) | Never run the destructive tests there (creations, deletions, deactivations, conflicts). |

Reset the staging database before each full campaign. The seed is deterministic for a given date, but its dates follow today, so the counts can change from one day to the next: write down the values you observe, then compare the screens with each other and with the API.

For the tests that depend on time (sections 17.3 and 17.4), use a separate staging copy whose clock can be changed (`faketime`, or a VM with NTP turned off), never the shared staging server.

### 0.2 Accounts (demo data)

The password of every account is `SEED_PASSWORD`.

| Abbr. | Username | Name | Role | Site, specialty | Save mode |
|---|---|---|---|---|---|
| **AD** | `admin` | Claire Martin | ADMIN | Paris La Défense HQ | power user (auto-save) |
| **SU1** | `supervisor1` | Julien Bernard | SUPERVISOR | Paris La Défense HQ | power user |
| **SU2** | `supervisor2` | Sophie Laurent | SUPERVISOR | Saclay Data Center, Electrical | power user |
| **TE1** | `technician1` | Karim Benali | TECHNICIAN | Paris La Défense HQ, HVAC | standard |
| **TE2** | `technician2` | Lucas Moreau | TECHNICIAN | Lyon Part-Dieu, Electrical | standard |
| **ST** | `user1` | Emma Rousseau | STAFF | Paris La Défense HQ | (none) |

In the tables, **SU** means SU1 or SU2, **TE** means TE1 or TE2, and **MAINT** means TE, SU and AD. Create extra accounts in section 13 when needed (an inactive technician, a second admin, a standard-mode supervisor).

### 0.3 Tools

- Two browsers, or two separate profiles (for example Chrome and Firefox), to act as two users at the same time; a private window for "first visit" tests.
- DevTools: Network (Offline, throttling, blocking a URL), Application (IndexedDB `cmms`, Local storage `tacto.token` / `tacto.user`, Service worker), Console (**keep it open throughout: any red error is a failure, even when the screen looks right**).
- `curl` and `jq` for the API tests (section 3).
- A spreadsheet application (CSV exports), an image viewer (JPG exports).
- A screen reader (NVDA on Windows or VoiceOver on macOS/iOS) and the axe DevTools extension.
- Real phones when possible, otherwise DevTools emulation at the sizes in section 18.

### 0.4 Recording results

Copy the IDs into a results sheet with the columns: ID, Result (Pass / Fail / Blocked / N/A), Browser and device, Observed, Severity, Ticket. Attach a screenshot or the response body to every failure.

| Severity | Meaning | Examples |
|---|---|---|
| **S1 Blocker** | Data loss or corruption, security hole, a role can do or see what it must not, a main flow impossible | queued edit lost, staff reads another person's request, cannot log in |
| **S2 Major** | Feature wrong or unusable without a workaround, wrong figure | KPI differs from the list, conflict not detected, offline reload fails |
| **S3 Minor** | Workaround exists, layout broken on one device | button off-screen on one phone, wrong focus after an action |
| **S4 Cosmetic** | Wording, alignment | label typo |

**Exit criteria for a production release:** every test of sections 1, 2, 3, 4, 10, 11, 16, 17 and 19 run; no open S1 or S2; S3 reviewed by the product owner; the blockers of section 21 settled.

### 0.5 Rules that apply to every test

Check these on every screen without repeating them in each test; any breach is a failure of the test in progress:

- G1. No error in the browser console, no failed request other than the ones the test expects.
- G2. Every action a role cannot perform is hidden or disabled; buttons marked as needing a connection are disabled offline, with a tooltip saying why.
- G3. Any text typed by a user is displayed as typed, never interpreted as HTML (see section 16.2 for the payloads).
- G4. Error messages are readable sentences next to the field or in the panel, never a raw status code or JSON.
- G5. After each save, the value shown is the value stored: reload the page and check.
- G6. Dates are shown in the format of the interface, "today" follows `APP_TIMEZONE` (Europe/Paris).

### 0.6 Order of execution

1 → 2 → 3 (automated and API: half a day) → 4 to 15 (functional, by role) → 16 (security) → 17 (concurrency, data, time) → 18 (devices and browsers) → 19 (deployment and operations) → 20 (production smoke test after deployment).

---

## 1. Automated checks and build

| ID | Steps | Expected |
|---|---|---|
| P-01 | `cd backend && npm test` | All tests pass (baseline 2026-10-14: 52 files, 781 tests). |
| P-02 | `cd frontend && npm test` | All tests pass (baseline: 35 files, 476 tests). |
| P-03 | `npm run lint` in `backend` and in `frontend` | No error, no Prettier difference. |
| P-04 | `npm audit --omit=dev` in `backend`; `npm audit` in `frontend` | No high or critical vulnerability in production dependencies. |
| P-05 | Delete the database file, run `npm run db:migrate` | Every migration applies in order, `schema_migrations` lists them all. |
| P-06 | Upgrade path: take a copy of the current staging (later: production) database, run the new version's migrations on it, then `sqlite3 <file> "PRAGMA integrity_check; PRAGMA foreign_key_check;"` | `ok`, no foreign key error, the data still opens in the app (spot-check 3 assets, 3 work orders, 1 plan, 1 dashboard). |
| P-07 | Start the server with: no `JWT_SECRET`; `NODE_ENV=production` and a 20-character secret; the `change-me…` example secret; `APP_TIMEZONE=Mars/Base`; `SEED_PASSWORD=short` | The server refuses to start each time and names the variable at fault. |
| P-08 | `npm run db:reset -- --with-conflicts`, then count | 6 users, 500 assets, about 320 work orders (207 + the history), 62 plans, 3 open conflicts; `db:seed` alone gives 0 conflicts. |
| P-09 | Run the seed twice on the same day, compare a dump of `assets` | Identical (deterministic seed). |
| P-10 | Check the vendored libraries in `frontend/assets/vendor/` | Version named in the file name or header; licenses compatible with the AGPL (idb ISC, Chart.js MIT). |
| P-11 | `npm run check:permissions` against the staging server (section 3) | 0 failed. |

---

## 2. Navigation and access by role (interface)

### 2.1 Sidebar and landing page

Log in with each account and compare the sidebar with this table (✓ shown, – hidden).

| Link | ST | TE | SU | AD |
|---|---|---|---|---|
| My open requests (home), All my requests, New request | ✓ | – | – | – |
| Dashboard (fixed technician dashboard) | – | ✓ | – | – |
| Dashboards (my dashboards list, + New dashboard) | – | – | ✓ | ✓ |
| Assets, Work orders, Week scheduler | – | ✓ | ✓ | ✓ |
| Year planner (hidden under 768 px wide) | – | ✓ | ✓ | ✓ |
| My week | – | ✓ | ✓ | – |
| Conflicts, Audit log | – | – | ✓ | ✓ |
| Users, Suggestions, Planning settings, Dashboard widgets | – | – | – | ✓ |
| Change my password, Log out | ✓ | ✓ | ✓ | ✓ |
| Top bar: Find a work order | – | ✓ | ✓ | ✓ |
| Top bar: Suggest an improvement | ✓ | ✓ | ✓ | ✓ |
| Status bar: `Tacto · AGPL-3.0 · Source code` | ✓ | ✓ | ✓ | ✓ |

| ID | Who | Steps | Expected |
|---|---|---|---|
| NAV-01 | each | Log in | Sidebar exactly as in the table above. Landing page: ST → `/requests`; TE → `/dashboard`; SU, AD → their first dashboard. |
| NAV-02 | each | Open `/` | Same landing page as NAV-01. |

### 2.2 Direct URLs a role must not reach

Type each URL in the address bar (then reload it) with each role that has no access. Expected every time: no data of that page is shown, either a redirect (ST is always sent to `/requests`) or a clear "not available" message; no console error; the API answers 403 to any call the page tries (check the Network tab).

| ID | URL | Roles to try |
|---|---|---|
| NAV-10 | `/dashboard`, `/assets`, `/assets/1`, `/work-orders`, `/work-orders/1`, `/work-orders/new`, `/planning`, `/schedule`, `/my-week`, `/conflicts`, `/audit-log`, `/admin/users` | ST |
| NAV-11 | `/conflicts`, `/conflicts/1`, `/audit-log`, `/dashboard/1` (a supervisor's dashboard id), `/admin/users`, `/admin/users/new`, `/admin/feedback`, `/admin/planning`, `/admin/widgets`, `/planning/plans/new`, `/planning/suggestions` | TE |
| NAV-12 | `/admin/users`, `/admin/feedback`, `/admin/planning`, `/admin/widgets`, `/audit-log?type=users` | SU |
| NAV-13 | `/requests/new` | TE, SU, AD: a short notice that requests are for staff (not an error page). |
| NAV-14 | `/my-week` | AD: message that My week is for technicians and supervisors. |
| NAV-15 | `/dashboard/<id of SU1's dashboard>` | SU2: not found (the dashboard is not revealed). |

### 2.3 Shell, router and common elements

| ID | Who | Steps | Expected |
|---|---|---|---|
| NAV-20 | MAINT | Open each route of `docs/architecture.md` → Client routes by its URL, then reload | The same view after reload, including split views (`/assets/12?page=3`, `/work-orders/new?asset_id=5`, `/schedule/blocks/…`). |
| NAV-21 | MAINT | Browse assets page 3 → open a record → open another → Back, Back, Forward | Each step restores the previous view, page and filters; no full page reload (Network: no document request). |
| NAV-22 | any | Open `/does-not-exist` and `/assets/abc` | A "not found" view inside the shell, no blank page. |
| NAV-23 | any | Tab from the top of a page | "Skip to content" appears first and moves focus to the main area. |
| NAV-24 | MAINT | Open each sidebar section, then a record in the side panel | The page title is the section's name; the panel heading names the record; from 768 px the title is one line with an ellipsis. |
| NAV-25 | any | Click "AGPL-3.0" and "Source code" in the status bar, also in a private window not signed in to GitHub | The license and the public repository open (no sign-in, no 404). A deployment of a **modified** version links to its own source instead (README → License). |
| NAV-26 | MAINT | Open any menu (dashboard ⋯, Dashboard ▾, multi-select filters) and press Escape | The menu closes and focus returns to its button. |
| NAV-27 | MAINT | Open a record from My week, the dashboard, the scheduler, the conflicts or the audit log, then press "Back" in the panel | Returns to the page it was opened from, and the button is named after it. |

---

## 3. API authorization matrix (curl)

**Automated:** `cd backend && CHECK_URL=https://staging.example.com npm run check:permissions` runs every check of sections 3.1 to 3.3 (about 340 requests) as the demo accounts and exits with 1 on any failure. It reads the accounts' password from `CHECK_PASSWORD` or `SEED_PASSWORD`, and other usernames from `CHECK_STAFF`, `CHECK_TECHNICIAN`, `CHECK_TECHNICIAN2`, `CHECK_SUPERVISOR`, `CHECK_ADMIN`. It changes no data: refused writes get 403, allowed ones are sent with bodies the server refuses. Its only side effects are those of opening the screens (preventive work orders due are released, as by the daily job; "Overview" is created for an account without dashboards). It logs in 4 times, so at most two runs per 15 minutes from one address. Run it after every deployment to staging; use the manual steps below to investigate a failure.

Manual: run from the staging server (or through HTTPS). Get one token per role:

```bash
API=https://staging.example.com/api
tok() { curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d "{\"username\":\"$1\",\"password\":\"$SEED_PASSWORD\"}" | jq -r .token; }
ST=$(tok user1); TE=$(tok technician1); SU=$(tok supervisor1); AD=$(tok admin)
code() { curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $1" "${@:2}"; }
# example: code $TE $API/users            → 403
```

The login rate limit is 10 attempts per 15 minutes per IP, successes included: get the four tokens once and reuse them.

### 3.1 Access by role

Expected status codes (200/201/204 = allowed; a 400 or 422 caused by a deliberately minimal body also proves access is allowed; **403 is the only acceptable refusal**).

| ID | Request | ST | TE | SU | AD |
|---|---|---|---|---|---|
| API-01 | `GET /health` without a token | 200 | | | |
| API-02 | `GET /assets`, `/work-orders`, `/dashboard` without a token; `GET /nothing-here` without a token | 401 | | | |
| API-03 | `GET /assets`, `/assets/1`, `/assets/search`, `/assets/1/history` | 403 | 200 | 200 | 200 |
| API-04 | `GET /work-orders`, `/work-orders/1`, `/work-orders/stats`, `/work-orders/1/history`, `/work-orders/1/comments` | 403 | 200 | 200 | 200 |
| API-05 | `GET /dashboard` | 403 | 200 | 200 | 200 |
| API-06 | `GET /dashboards`, `GET /dashboard/widgets?keys=open_work_orders` | 403 | 403 | 200 | 200 |
| API-07 | `GET /dashboards/widgets`, `PUT /dashboards/widgets/by_status` | 403 | 403 | 403 | 200 |
| API-08 | `GET /reference-data` | 200 | 200 | 200 | 200 |
| API-09 | `GET /requests`, `POST /requests`, `POST /requests/:id/cancel` (with an unknown field: 400 for ST, nothing cancelled) | 200/201 | 403 | 403 | 403 |
| API-10 | `GET /users` | 403 | 403 | 200 | 200 |
| API-11 | `GET /audit-log` | 403 | 403 | 200 (no `users` entries) | 200 |
| API-12 | `GET /audit-log?entity_type=users` | 403 | 403 | 403 | 200 |
| API-13 | `GET /conflicts`, `GET /conflicts/1` | 403 | 403 | 200/404 | 200/404 |
| API-14 | `POST /assets`, `DELETE /assets/1?version=1` | 403 | 403 | allowed | allowed |
| API-15 | `POST /work-orders` (with `assignee_id` of someone else for TE) | 403 | 403 | allowed | allowed |
| API-16 | `PUT /work-orders/:id/review` | 403 | 403 | allowed | allowed |
| API-17 | `GET /admin/users`, `POST /admin/users`, `POST /admin/users/1/password` | 403 | 403 | 403 | allowed |
| API-18 | `GET /feedback`, `PUT /feedback/1` | 403 | 403 | 403 | allowed |
| API-19 | `POST /feedback` | 201 | 201 | 201 | 201 |
| API-20 | `POST /auth/change-password` (wrong current password) | 400 | 400 | 400 | 400 |
| API-21 | `GET /plans`, `/planning/timeline`, `/planning/settings`, `/planning/blocked-weeks`, `/plan-occurrences/:id` | 403 | 200 | 200 | 200 |
| API-22 | `POST /plans`, `PUT /plans/:id`, `PUT /plans/:id/anchor`, `POST /planning/release`, `POST /planning/suggestions`, `PUT /plan-occurrences/:id`, `…/skip`, `…/restore`, `POST/DELETE /planning/blocked-weeks` | 403 | 403 | allowed | allowed |
| API-23 | `PUT /planning/settings` | 403 | 403 | 403 | allowed |
| API-24 | `GET /schedule`, `/schedule/work-orders/:id`, `/my-week` | 403 | 200 | 200 | 200 |
| API-25 | `POST /schedule/allocations`, `PUT/DELETE /schedule/allocations/:id`, `PUT /schedule/capacity`, `PUT /schedule/weeks/:week` | 403 | 403 | allowed | allowed |
| API-26 | `PUT /schedule/allocations/:id/lock` on **TE1's own** block / on TE2's block | 403 | allowed / 403 | allowed | allowed |
| API-27 | `PUT /schedule/day-order` for TE1's own day / for TE2's day | 403 | allowed / 403 | allowed | allowed |
| API-28 | `POST /assistant/find-work-order` | 403 | allowed | allowed | allowed |
| API-29 | ST: every method on every path under `/assets`, `/work-orders`, `/conflicts`, `/dashboard`, `/dashboards`, `/audit-log`, `/plans`, `/plan-occurrences`, `/planning`, `/schedule`, `/my-week`, `/assistant` | 403 | | | |

### 3.2 Field-level and record-level permissions

| ID | Who | Request | Expected |
|---|---|---|---|
| API-30 | TE | `PUT /assets/:id` with `name` | 403, `details.fields` lists `name`. With only `status`, `comment`, `last_serviced_on`: 200. |
| API-31 | TE1 | `PUT /work-orders/:id` on a work order assigned to TE2 or unassigned | 403. |
| API-32 | TE1 | `PUT /work-orders/:id` on his own work order with `priority`, `assignee_id`, `due_on` or `planned_week` | 403 with `details.fields`. With `status`, `started_on`, `actual_hours`, `work_report`: allowed. |
| API-33 | any | `PUT` with `id`, `number`, `code`, `version` only, `created_at`, `has_conflict`, `review_status`, `plan_id` | 403 or 400 as documented; never applied. |
| API-34 | ST | `GET /requests/:id` and `POST /requests/:id/cancel` of a work order ST did not create (try a few ids, including one of a maintenance work order) | 404 (not 403: existence not revealed); nothing cancelled. |
| API-35 | ST | `POST /requests` with `type`, `assignee_id` or `asset_id` | 400 unknown field. |
| API-36 | SU2 | `GET/PUT/DELETE /dashboards/<SU1's id>` | 404. |
| API-37 | any | Every response checked so far | Never contains `password_hash`: `grep -c password_hash` on saved bodies = 0. |

### 3.3 Input validation (sample on each family)

| ID | Request | Expected |
|---|---|---|
| API-40 | Unknown query parameter (`/assets?pagesize=10`), unknown body field | 400. |
| API-41 | `sort=password_hash`, `sort=name;DROP TABLE assets`, `order=sideways` | 400. |
| API-42 | `/assets/1.5`, `/assets/-1`, `/assets/abc` | 400. |
| API-43 | `size=101`, `page=0`, `page=99999` | 400, 400, 200 with empty `items`. |
| API-44 | `q` of 101 characters; `q=***`; `q="a" OR "b" NEAR(x)` | 400; 200 empty; 200 matching the plain words. |
| API-45 | More than 50 values in a filter; an unknown enum value | 400. |
| API-46 | Body larger than 100 kB | 413 (or 400), the server keeps running. |
| API-47 | Malformed JSON | 400 with the standard error body. |
| API-48 | A week that does not exist (`2027-W53`), a day `2026-02-30` | 400. |

---

## 4. Authentication and session

| ID | Who | Steps | Expected |
|---|---|---|---|
| A-01 | each | Log in with the right password | Landing page of NAV-01, the user's name in the sidebar. |
| A-02 | any | Wrong password; then an unknown username | The same message both times (the username is not revealed); fields kept except the password. |
| A-03 | any | Username typed as `  Technician1 ` (capitals, spaces) | Login succeeds. |
| A-04 | any | Submit with empty fields | Field errors, no request sent or a 400 shown as a sentence. |
| A-05 | any | 11 attempts within 15 minutes from one IP (successes count) | The 11th is refused with a readable "too many attempts" message; a different IP is not blocked (on staging through Nginx: see OPS-12). |
| A-06 | any | Log in, reload, open a second tab | Still logged in, in both tabs. |
| A-07 | TE1 | With a pending offline edit, click Log out | Confirmation that unsent changes will be lost. Cancel keeps everything; confirm logs out. |
| A-08 | any | Log out, then inspect DevTools → Application | `tacto.token` and `tacto.user` removed, IndexedDB `cmms` emptied; Back does not show business data. |
| A-09 | any | Token expiry: staging with `JWT_EXPIRES_IN=2m`; wait; click something | Sent to the login page with a message; after logging in again the user returns to work; a write queued meanwhile is sent after the new login, not lost. |
| A-10 | any | Edit `tacto.token` in local storage (change one character), reload | Login page; no data shown. |
| A-11 | AD + TE1 | TE1 logged in; AD deactivates another technician created for the test, who is logged in in a second browser | That user's next action sends them to the login page; logging in again is refused with the wrong-credentials message. |
| A-12 | AD + any | AD resets the password of a logged-in user | That user's next action asks to log in; old password refused, new one accepted. |
| A-13 | each | `/account`: wrong current password | Error on the current password field; still logged in. |
| A-14 | each | `/account`: new password of 9 characters | Refused with the 10-character rule. |
| A-15 | each | `/account`: correct change, while the same user is also logged in in another browser | Current session stays logged in and keeps working; the other browser is logged out at its next request; the new password works, the old one does not. |
| A-16 | ST | Log in, then type `/assets` | Sent to `/requests`. |

---

## 5. Assets

| ID | Who | Steps | Expected |
|---|---|---|---|
| AS-01 | MAINT | Open Assets | 50 rows, columns of `entities.js`, "Page 1 / 10", record count; pager above and below the table. |
| AS-02 | MAINT | First / Previous / Next / Last, on both pagers | Right page each time; buttons disabled at the bounds; focus stays on the button used. |
| AS-03 | MAINT | Filter down to fewer than 50 assets | No pager at all. |
| AS-04 | MAINT | Click each column title twice | Ascending ▲ then descending ▼, `aria-sort` set; criticality and status in business order (Low < Medium < High < Critical), not alphabetical; sort in the URL; back to page 1. |
| AS-05 | MAINT | Sort by site, open a record, close it, press Back | Sort, filters and page kept. |
| AS-06 | MAINT | Filters: two statuses, two criticalities, a category, two sites; combine with a search | Results match every filter (AND) and any value within a filter (OR); count and pages right; filters in the URL; reload keeps them. |
| AS-07 | MAINT | Search `defense`, `DÉFENSE`, `chil lyon`, `AST-00` | Accent and case ignored; each word is a prefix and all must match. |
| AS-08 | MAINT | Search `"`, `*`, `(`, `OR`, `-x`, `<b>` | No error, plain-text matching; `<b>` shown as text. |
| AS-09 | MAINT | Clear filters | Everything reset (sort kept), URL clean. |
| AS-10 | MAINT | Click a row; open the next row with the keyboard (arrows / Enter) | Split view, panel with every field; opening a cached record feels instant (target < 20 ms: `performance` marks in dev). |
| AS-11 | TE | Edit an asset | Only status, comment and last service date are editable; the rest is read-only. Save → new version, value kept after reload. |
| AS-12 | SU, AD | Edit every editable field, including the maintenance contract box and dates | Saved; blank optional text stored as empty (not a space); invalid date refused on the field. |
| AS-13 | SU, AD | New asset without a code | Created with the next automatic code (`AST-0501`…), opens in the panel. |
| AS-14 | SU, AD | New asset with code `ast-test-1` | Stored as `AST-TEST-1`. With a code already used: error on the code field. With `#$%`: format error. |
| AS-15 | SU, AD | New asset on a new site `Nantes, Annex B` (comma in the name) | Created; the site appears in the suggestions, in the asset site filter and works as a filter value; the work order site list now offers it. |
| AS-16 | SU, AD | Missing name, site, trade or criticality | Field errors, nothing created. |
| AS-17 | SU, AD | Delete the asset created in AS-13 | Confirmation, then gone from the list; its history stays readable in the audit log. |
| AS-18 | SU, AD | Delete an asset that has work orders | Refused with the reason (set it Out of service instead). |
| AS-19 | SU + AD | Both open the same new asset; AD edits it; SU then deletes it | Refused: changed since. |
| AS-20 | TE | Look for New asset and Delete | Not shown. |
| AS-21 | SU | Offline: New asset and Delete | Disabled with the "needs a connection" tooltip; the creation form keeps a draft. |
| AS-22 | MAINT | Open the History section of an asset | Creation and each change with author, date and from → to; a change just made appears at the top. Offline: a message that history needs a connection. |
| AS-23 | MAINT | "New work order" in an asset panel | Creation form with the asset filled in, site and trade from the asset. |

---

## 6. Work orders

### 6.1 List

| ID | Who | Steps | Expected |
|---|---|---|---|
| WO-01 | TE1 | Open Work orders | Only his work orders, "Assigned to me" checked. |
| WO-02 | TE1 | Uncheck "Assigned to me", reload, Back | All work orders (`mine=false` in the URL), kept after reload. Clear filters → back to his own work. |
| WO-03 | SU, AD | Open Work orders | All work orders, newest first. |
| WO-04 | MAINT | Status filter: tick Open, In progress, On hold | The control reads "Not finished". Check each other filter: priority, type, trade, site, assignee (several), overdue, search. |
| WO-05 | SU, AD | "Requests to review" checkbox | Only staff requests waiting for review. TE: the checkbox is not offered. |
| WO-06 | MAINT | Sort by each column twice; especially assignee and due date | Unassigned and undated work orders last in **both** orders; priority Low < Normal < High < Urgent. |
| WO-07 | MAINT | Search a word of a description, of a location, of a work report, a number `WO-2026-0001` | Found. |
| WO-08 | MAINT | Open a dashboard tile or chart, then come back to the list | The list matches the tile's count; the "From the dashboard: …" chip appears for widget drill-downs; ✕ removes the chip and its `drill`/`period`. |

### 6.2 Creation

| ID | Who | Steps | Expected |
|---|---|---|---|
| WO-10 | TE1 | New work order from the list | The assignee is himself and cannot be changed; no supervisor field. Create with title, type, site → "Pending creation" for an instant, then a number `WO-2026-NNNNN` following the last one. |
| WO-11 | SU, AD | New work order: assign TE2, supervisor SU2, due date, estimate | Saved as entered; the assignee list offers only active technicians and supervisors; the supervisor list only supervisors and admins. |
| WO-12 | SU, AD | Leave assignee and supervisor empty | Created unassigned. |
| WO-13 | any MAINT | Missing title or type; neither asset nor site | Field errors, nothing sent. |
| WO-14 | MAINT | Choose an asset by code, then a different site | Refused: the site must be the asset's. With the asset only: site and trade follow the asset. |
| WO-15 | MAINT | "Browse assets…": search, filter, sort, page, pick | The code fills in; the dialog closes; offline the button is disabled. |
| WO-16 | MAINT | Due date before today | Refused with the reason. |
| WO-17 | MAINT | Double-click Create, or press Enter twice quickly | One work order only. |
| WO-18 | MAINT | Fill half the form, go to another page, come back | Standard mode: asked Save/Discard/Cancel or the draft is offered; the creation is **never** sent automatically, in either mode. |
| WO-19 | SU | Assign a technician deactivated in section 13 (API) | 422; the UI never offers inactive users. |

### 6.3 Editing and the status workflow

Allowed transitions (BR-W4): Open → In progress, Cancelled; In progress → On hold, Closed, Cancelled; On hold → In progress, Cancelled; Closed and Cancelled are final.

| ID | Who | Steps | Expected |
|---|---|---|---|
| WO-20 | SU | From a work order in each status, open the status control | Only the allowed targets are offered. |
| WO-21 | SU | Via the API, try every forbidden pair (Open → Closed, Open → On hold, On hold → Closed, Closed → anything, Cancelled → anything) | 422 `BR-W4` each time. |
| WO-22 | TE1 | Start one of his work orders | Status In progress, start date = today. |
| WO-23 | TE1 | Close without a work report | Refused, the report field says why. With a report: Closed, closed date = today. |
| WO-24 | TE1 | Set actual hours `-1`, `abc`, `2.5` | First two refused, last saved. |
| WO-25 | MAINT | Open a Closed and a Cancelled work order | Every field read-only, no Save. |
| WO-26 | SU | Set a closed date before the start date (API) | 422 `BR-W8`. |
| WO-27 | TE1 | Open a work order assigned to TE2 | Read-only for TE1. |
| WO-28 | SU, AD | Change the planned week (week picker; in Firefox/Safari a text field `2026-W45`) | Saved; it appears in that week's scheduler tray. |
| WO-29 | SU | Planned week of a released regulatory visit after its due week; clear the planned week of a plan visit | Refused with the reason (BR-P3, BR-P4). For a preventive visit moved to another week, the year planner shows the visit in its new week. |
| WO-30 | SU | Cancel the work order of a released plan visit | The visit shows as skipped "Work order WO-… cancelled" on the year planner; it cannot be restored. |
| WO-31 | SU | Close the work order of a visit of a **floating** plan | The plan's next visits restart from the closing week + the frequency; the change is in the plan's history. |
| WO-32 | MAINT | Phone width or TE: open a work order | Fields in field-work order (status, priority, description, place, asset, due, report, time), then the rest; Save bar at the bottom. |
| WO-33 | MAINT | Work order with blocks this week and later | "Scheduled" box lists its blocks from today on; offline, those of the weeks saved by My week. |

### 6.4 Comments and history

| ID | Who | Steps | Expected |
|---|---|---|---|
| WO-40 | MAINT | Add a comment on any work order | Shown at the bottom with author and time; the work order version does not change (another user editing it meanwhile gets no conflict). |
| WO-41 | MAINT | Empty comment; 2,000 characters; 2,001 characters | Refused; accepted; refused. |
| WO-42 | MAINT | Comments on a staff request | The requester's comments are marked "(requester)" with a red side line. |
| WO-43 | MAINT | Offline | Send disabled; typed text kept. |
| WO-44 | MAINT | History of a closed seeded work order | Tells the status story with names (not ids), newest first; reviews and conflicts appear as such. |

---

## 7. Staff requests and their review

### 7.1 Staff member (ST)

| ID | Steps | Expected |
|---|---|---|
| R-01 | Log in | "My open requests": cards with title, stage badge (text, not only color), next step, number, location, date, comment count. |
| R-02 | All my requests | Finished and rejected ones too (7 seeded requests in total). |
| R-03 | New request: check defaults | Site = user's site; "Kind of problem" and "How urgent" both on "I don't know". |
| R-04 | Send without a title, then without a location | Field errors. |
| R-05 | Send with "I don't know" twice | Request created, "Waiting for review"; the team sees it as corrective, no trade (Unspecified), priority Normal, unassigned. |
| R-06 | Send with a trade and "Urgent" | Kept as chosen. |
| R-07 | Cut the network after clicking Send but before the answer (DevTools: block the request once), then send again | Exactly one request created (same `client_id`). |
| R-08 | Open a request | Status box with the steps Received → Assigned → In progress → Done, current step marked; details; history; comments. |
| R-09 | Add a comment; empty comment; 2,001 characters | Added; refused; refused. |
| R-10 | Change the id in `/requests/<id>` to one of a maintenance work order | "Not found", nothing revealed. |
| R-11 | Leave the tab, have SU approve the request, come back to the tab | The status updates within 10 seconds of getting the focus back. |
| R-12 | Offline | Pages say they need a connection; the form and the comment keep their text while the app stays open. |
| R-13 | Rejected request | Danger badge "Rejected", the reason quoted in the next step. |
| R-14 | Approved request | "Approved" and the assignee's name. |
| R-15 | Team comment | Shown as "Name (maintenance team)". |
| R-16 | Open a request waiting for review, then an approved one not started | Both offer "Cancel this request"; an in-progress, on-hold or finished request does not. |
| R-17 | Cancel this request → Keep it; then Cancel the request | Nothing changes; then the page shows "Cancelled by you", the history ends with "Cancelled by you", and the request moves to All my requests. SU: the "Staff requests to review" count goes down; the work order shows the review status Withdrawn and user1 in its history. |
| R-18 | Have TE start an approved request while ST has its page open, then click Cancel this request | Refused with a sentence asking to add a comment; nothing changes. |

### 7.2 Review by the maintenance team

| ID | Who | Steps | Expected |
|---|---|---|---|
| R-20 | SU, AD | Dashboard | Tile "Staff requests to review" with the count, attention style above zero; it opens `/work-orders?to_review=true`. TE: no tile. |
| R-21 | SU | Open the request of R-05 | Review box on top: who sent it and when; assignee required (technicians first). |
| R-22 | SU | Approve without an assignee | Refused. |
| R-23 | SU | Approve with TE1, type Improvement, priority High, trade, due date | Saved in one step; SU is the supervisor unless another was chosen; the tile count goes down; ST sees "Approved" with Karim Benali. |
| R-24 | SU | Reject without a reason; then with a reason | Refused; then a confirmation, status Cancelled, ST sees the reason. |
| R-25 | SU | Before the review, try to change the status or the assignee in the edit form | Not offered (API: 422 `BR-R7`); other fields (location, trade) can be corrected. |
| R-26 | SU1 + SU2 | Both open the same pending request; SU1 approves; SU2 then rejects | SU2 is refused (already reviewed) with a readable message; no double decision. |
| R-27 | TE | Open a pending request | An information notice, no review box. |
| R-28 | SU | Offline | Approve and Reject disabled with the tooltip. |
| R-29 | SU | History of the reviewed request | One entry for the review with the decision. |

---

## 8. Save modes, drafts and leaving a form

Technicians are in standard mode, supervisors and admins in power-user mode. To test standard mode for a supervisor, AD switches a test supervisor's auto-save off in Users.

| ID | Who | Steps | Expected |
|---|---|---|---|
| SM-01 | TE1 | Edit a field of his work order, wait 2 s, reload | Banner "Unsaved draft from <date>": Restore puts the edit back, Discard removes it. |
| SM-02 | TE1 | Edit, then click another row | Dialog "Unsaved changes": Save saves then opens the other row; Discard drops the edit; Cancel stays with the edit intact. |
| SM-03 | TE1 | Edit, then click a sidebar link; then Back | Same dialog; Back after Discard shows the stored value. |
| SM-04 | TE1 | Edit, then close the tab | The browser asks to confirm leaving. |
| SM-05 | SU1 | Edit a work order, click another row | No dialog; the edit is saved (new version visible after reload). |
| SM-06 | SU1 | Edit, close the tab within 1 s, reopen the app | The leftover draft is sent automatically at startup; the value is stored. |
| SM-07 | SU1 | Edit, then switch to another browser tab and back | Draft written when the tab is hidden; nothing lost. |
| SM-08 | AD | Switch TE2 to auto-save in Users; TE2 logs out and in | TE2 now behaves as SM-05. Switch back afterwards. |
| SM-09 | any | Restore a draft whose record changed on the server meanwhile, then save | A conflict is created (section 10), not a silent overwrite. |

---

## 9. Offline use and synchronization

Simulate offline in three ways, each at least once: DevTools "Offline"; the real network turned off (Wi-Fi off / airplane mode on a phone); the **server** stopped (`systemctl stop tacto`: network up, API down).

| ID | Who | Steps | Expected |
|---|---|---|---|
| OF-01 | MAINT | Browse assets and work orders, go offline | Status bar "Offline mode — local data"; buttons needing a connection disabled with tooltip. |
| OF-02 | MAINT | Offline: open cached pages and records | Shown from the device. A page never visited: a clear message, no blank screen. |
| OF-03 | MAINT | Offline: reload the page (F5), also on a deep link `/work-orders/12` | The app opens from the service worker and shows the cached data. |
| OF-04 | MAINT | Offline: apply a filter or a sort | Message that search needs a connection, with "Clear filters" / "Default order". |
| OF-05 | TE1 | Offline: edit and save his work order | "Pending sync" on the record; the status bar counts 1 pending write. |
| OF-06 | TE1 | Offline: edit the same work order twice more | Still one pending write (merged). |
| OF-07 | TE1 | Back online | Sent within seconds without action; count back to 0; new version after reload. |
| OF-08 | TE1 | Offline: New work order from an asset; then edit its title | Listed at the top as "Pending creation" with no number; the title edit is merged into the creation. |
| OF-09 | TE1 | Back online | It gets exactly one number; the panel URL becomes `/work-orders/<id>`. Check with SU that only one exists. |
| OF-10 | TE1 | Offline: create a work order that the server will refuse (e.g. via an asset that SU deletes meanwhile, or a due date set in the past while the clock changes) | After sync: "Creation failed" with the reason; fix and retry, or discard. |
| OF-11 | TE1 + SU1 | TE1 edits a work order offline; SU1 edits the same one online; TE1 reconnects | TE1 is told a supervisor will arbitrate; the conflict is in the console (section 10). |
| OF-12 | TE1 | Pending write, then the token expires (A-09 set-up) before reconnecting | Asked to log in again; after login the write is sent. |
| OF-13 | TE1 | Pending write while the server is stopped for 2 minutes | Retries (5 s, 15 s, 60 s…), nothing lost; sent once the server is back. |
| OF-14 | MAINT | DevTools → Application → IndexedDB after browsing 10 pages of assets | At most 5 pages in `asset_pages`: first, previous, current, next, last; records of a draft or pending write are kept. |
| OF-15 | SU, AD | Offline: open a personal dashboard | "Offline: figures saved on this device on <date>"; handles, checkboxes, filters disabled; Figures CSV and JPG still work. |
| OF-16 | TE | Offline: technician dashboard | Last figures shown from the device. |
| OF-17 | TE1 | Open My week for this week and next week online; go offline; open both and a work order in them | Shown with a notice; order and lock changes disabled; the work order panel opens. |
| OF-18 | MAINT | Offline: Year planner, Week scheduler, Conflicts, Audit log, Users | Each says it needs a connection. |
| OF-19 | MAINT | Slow network (DevTools "Slow 3G" or a 6 s delay on `/api`) | Requests over 5 s count as offline, then recover; no double write. |
| OF-20 | any | Deploy a new version on staging (change one CSS rule), then reload the open app online | The new file is used at the next navigation, without clearing the cache. |

---

## 10. Conflicts and arbitration

Use two browsers: **B1** and **B2**.

| ID | Who | Steps | Expected |
|---|---|---|---|
| CF-01 | TE1 (B1) + SU1 (B2) | Both open the same work order of TE1; SU1 changes the priority and saves; TE1 then changes the report and saves | TE1 is told a supervisor will arbitrate; his change is not applied; the record is flagged. |
| CF-02 | any | Look at the list | The row has the amber background, the ⚠ icon and the "Conflict" text badge; the panel shows a banner. |
| CF-03 | TE1 | Edit the locked record again and save | Refused (locked); the edit is kept as a draft. |
| CF-04 | SU, AD | Dashboard tile "Conflicts to arbitrate"; Conflicts page | Count includes it; list shows the record label, each version's author and time. |
| CF-05 | SU | Open the conflict | Versions A and B side by side, divergent fields highlighted. |
| CF-06 | SU | Accept version A | Record keeps A, flag removed, version + 1; TE1's draft can be re-applied. |
| CF-07 | SU | New conflict; accept version B | B applied. |
| CF-08 | SU | New conflict on an **asset** with 2 divergent fields; Merge manually, one from each | Merged values stored; both browsers show them after revalidation (focus the window). |
| CF-09 | SU | Conflict where B closes a work order that A put On hold; accept B | Refused (422, the transition On hold → Closed is not allowed); the conflict stays open. |
| CF-10 | SU1 + SU2 | Both open the same conflict; SU1 resolves; SU2 resolves | SU2 is told it is already resolved. |
| CF-11 | SU | Pending staff request; conflict where B changes its status; accept B | Refused (`BR-R7`). |
| CF-12 | SU | Audit log | `CONFLICT` entry by the author of B, `RESOLVE` entry with the choice by SU. |
| CF-13 | any | Seeded conflicts (`--with-conflicts`) | 3 listed, each resolvable. |

---

## 11. Dashboards

### 11.1 Technician dashboard (TE)

| ID | Steps | Expected |
|---|---|---|
| D-01 | Open Dashboard | "My work" first (Today by default, Next 7 days switch), "Today in My week", then the team tiles; no charts; no conflict or review tile. |
| D-02 | Switch to Next 7 days | Work due today to today + 6 days and late work, by priority then due date. |
| D-03 | Click each tile | The list opens with the same count as the tile. |

### 11.2 Personal dashboards (SU, AD)

| ID | Steps | Expected |
|---|---|---|
| D-10 | First login of a user without dashboards (new supervisor from section 13) | "Overview" created, with the 11 widgets of the former dashboard. |
| D-11 | New dashboard from each template: Empty, Overview, Backlog, Compliance, Assets and people; and Duplicate | Each has the documented widgets; it is added last in the sidebar. |
| D-12 | Rename to an existing name with other case or accents (`overview`, `Óverview`) | Error under the field. |
| D-13 | Create dashboards up to 20, then one more | The 21st is refused with the reason. |
| D-14 | Delete a dashboard; try to delete the last one | Confirmation then gone; Delete disabled on the last one. |
| D-15 | Move up / Move down in the Dashboard ▾ menu | Sidebar order changes and is kept after reload. |
| D-16 | Tick and untick widgets in the sidebar | Added at the end / removed, announced to screen readers. |
| D-17 | Drag a card by its handle with the mouse; on a touch screen; near the top or bottom edge | Placeholder shows the drop place; the page scrolls at the edges; order saved. |
| D-18 | Keyboard: Tab to a handle, Space, arrows, Space; then Space, arrows, Escape | Moved and announced ("…, position 3 of 10"); Escape puts it back. |
| D-19 | Period 30 / 90 / 365, sites, trades | Figures change; each card's scope line names the filters; a widget ignoring a filter says "Site filter not used". |
| D-20 | Reload; open the same account in another browser | Same dashboards, order, widgets, filters. |
| D-21 | Two quick changes in a row (tick 3 widgets fast) | All saved, no conflict with itself. |
| D-22 | Same user in two browsers changes the same dashboard | The second save is refused as stale with a message; reload shows the stored state. |

### 11.3 Every widget

For **each** of the 26 widgets below, on a dashboard with period 90 days, then with a site filter: (a) it renders, or shows its empty state, without a console error; (b) every mark has a tooltip; (c) a click on a bar, slice, point, cell or tile value opens the list of exactly the records counted (compare the list total with the figure); (d) **Figures (CSV)** opens in a spreadsheet with accents intact and equals "Show as a table"; (e) **Work orders / Assets / Visits (CSV)** has as many rows as the figure counts; (f) **Image (JPG)** shows the title, the scope line, the chart or table, the date; (g) ⋯ → Move earlier / later / Remove work.

Key figures: Open work orders · Work orders in progress · Closed this month · Overdue work orders · Assets broken down · Staff requests to review · Conflicts to arbitrate (no records CSV).
Flow and backlog: Opened vs closed · Backlog by age and priority · Backlog in weeks of work · Planned vs reactive work (Count/Hours switch saved).
Compliance: Preventive maintenance compliance · Regulatory visits late · Week schedule kept · Contractors (sortable columns).
Responsiveness, assets, people: Time to start and to close · Staff requests · Assets with the most breakdowns (All / High and critical switch saved; a bar opens the asset) · Repeat failures · Critical assets out of service (opens the asset list) · Workload per person · Estimates vs actual hours.
Charts and lists: Work orders by category · Work orders by status · My work · Recent activity.

| ID | Steps | Expected |
|---|---|---|
| D-30 | Each widget, criteria (a) to (g) above | All met. Record one line per widget. |
| D-31 | Tile figures vs the technician dashboard and the lists | Open, in progress, overdue, closed this month, broken down: identical values everywhere for the same filters. |
| D-32 | Regulatory visits late (demo data) | At least 1 (the seed always leaves one late); it opens that work order. |
| D-33 | Create a work order titled `=SUM(1+1)`, `+cmd`, `-2`, `@x`; export Recent activity Work orders (CSV) | Each cell starts with `'` in the file: shown as text, never run as a formula. |
| D-34 | CSV from a site with accents (`Paris La Défense…`) in Excel and LibreOffice | Accents intact (UTF-8 with BOM), one record per line. |
| D-35 | Exported file names | `tacto-<dashboard>-<widget>[-work-orders]-<YYYY-MM-DD>`. |

### 11.4 Widgets switched off (AD)

| ID | Steps | Expected |
|---|---|---|
| D-40 | AD: Dashboard widgets page: switch "Work orders by status" off | Saved at once, with who and when. |
| D-41 | SU1 (has it on a dashboard) reloads | The widget is gone from the sidebar, grid and templates; its old drill-down URL answers "not allowed" (403 `D65`). |
| D-42 | AD | AD still sees it, marked "Off". |
| D-43 | AD switches it back on; SU1 reloads | It comes back at its former place. |

---

## 12. Preventive maintenance

### 12.1 Plans and year planner

| ID | Who | Steps | Expected |
|---|---|---|---|
| PM-01 | MAINT | Open Year planner | 52 (or 53) weeks from the current week, grouped by site; load strip, tiles (workload, trade balance, peak week, site spread, contractor visits); the release runs first. |
| PM-02 | MAINT | Group by building, by trade; filter by site, trade, type, done by, search; Previous / Next year; `year=2027` | Grid and figures follow; filters in the URL. |
| PM-03 | SU, AD | New plan: quarterly (13 weeks) on an asset, 2 h | Code `PM-00NN`, site and building from the asset; 4 visits a year on the timeline. |
| PM-04 | SU, AD | New plan without an asset: site + trade required; contractor without supplier; end week before the anchor; 2.25 h; season with only one end | Each refused with the reason. |
| PM-05 | SU, AD | Plan of 5 h | Flagged "will be split" (long visit). |
| PM-06 | SU, AD | Contractor plan | Visits shown, the load does not change; contractor visits counted in their tile. |
| PM-07 | SU, AD | Edit the plan's frequency; then deactivate it | Visits rebuilt; deactivated plans disappear from the planner, history kept. |
| PM-08 | SU1 + SU2 | Both open the same plan, both save a change | The second is refused as stale. |
| PM-09 | TE | Planner | Read-only: no New plan, no drag, no skip. |

### 12.2 Editing the planner (SU, AD)

| ID | Steps | Expected |
|---|---|---|
| PM-10 | Drag the first planned visit of a row to a later week | The whole series moves; the tiles change **while** dragging. |
| PM-11 | Drag another visit beyond its tolerance | Refused with "Week N is outside this visit's tolerance of ± k weeks…". |
| PM-12 | Drag a regulatory visit later | Refused: can only move earlier. |
| PM-13 | Drag a visit into the past; a visit that has a work order | Refused with the reason. |
| PM-14 | Keyboard only: move a visit, move a series, skip, restore, undo | Everything possible without a mouse. |
| PM-15 | Undo / Redo (buttons, Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z) after 3 changes | Weeks restored step by step; when another user changed the visit meanwhile, the undo is refused with a message that stays on screen. |
| PM-16 | Skip a visit with a reason; skip without a reason; restore it | Leaves the load; refused; back. |
| PM-17 | Blocked weeks: add one for every site, one for a site; add the same again; delete | Warning on the grid and on visits in it; duplicate refused; removed. TE can read the list but not change it. |
| PM-18 | Plan panel: "Move to week", "Move the series" | Same rules as dragging. |
| PM-19 | "Suggest a smoother plan" on the demo data | Ghost chips; figures before → after; peak week load goes down (about 107 % → 69 % with every move); accept some moves → done, one Undo puts them all back; Discard changes nothing. |
| PM-20 | Accept a proposal after another user moved one of its visits | That move is refused and reported; the others are done. |

### 12.3 Release and settings

| ID | Who | Steps | Expected |
|---|---|---|---|
| PM-30 | SU | Release now twice | First call releases the due visits (count shown), the second releases 0. Each new work order: Open, Normal, unassigned, due on the Friday of its week, title "plan – 2026-Wnn". |
| PM-31 | ops | `npm run pm:release` on the server twice | Same: the second creates nothing. |
| PM-32 | AD | Planning settings: reserve 30 % → 20 % | Every week's capacity rises in the planner; the change appears in the audit log. |
| PM-33 | AD | Daily hours 7.25; reserve 90 %; release weeks 0 | Refused with limits. |
| PM-34 | SU | Planning settings page / `PUT` | Not reachable / 403. |
| PM-35 | AD | Change the release horizon from 4 to 6 weeks, open the planner | More work orders released, once. |

---

## 13. Week scheduler and My week

### 13.1 Scheduler (SU, AD)

| ID | Steps | Expected |
|---|---|---|
| S-01 | Open the scheduler | Current week, people (technicians then supervisors) × days, tray grouped planned / carried over / not planned, tiles. Demo: TE1 has 3 h 30 Monday + 2 h 30 Tuesday, a 10:00 appointment Tuesday locked by SU1, two sites on Wednesday with travel; TE2 on leave Thursday. |
| S-02 | Drop a 6 h work order of the tray on Monday | Split proposed as 3 h 30 + 2 h 30 over Monday and Tuesday, editable; one request creates both. |
| S-03 | Drop a work order without an estimate | Asked for an estimate first. |
| S-04 | Give a 2 h work order a 1 h 30 block | Tray shows "30 min left". |
| S-05 | Fill a day to 8 h 30 | Over-capacity warning, not a refusal. |
| S-06 | Two sites in a day | Warning with "Add travel time". |
| S-07 | Block of 4 h (API or panel) | Refused: longest block 3 h 30. |
| S-08 | Move a block by drag to another day and person; resize with + / −; add a note; remove | Each saved; removed hours go back to the tray. |
| S-09 | Drag the locked 10:00 appointment | Refused in the browser with the reason; unlock first, then it moves. |
| S-10 | Two overlapping appointments for one person | The second is refused. |
| S-11 | Open Saturday for the week | Saturday appears with 0 h; a block on it shows the warning until hours are given. |
| S-12 | Hours of a day: leave (0 h) with reason; part time 3.5 h; back to default | Capacity follows; reason required with hours. |
| S-13 | First block on an unassigned work order without planned week | It gets the week and that person as assignee (visible in the work order and its history). |
| S-14 | Unfinished work of last week | Shown in this week's tray as "carried over". |
| S-15 | Block on a closed work order; on a request waiting for review | Refused. |
| S-16 | Undo / Redo every kind of change (drop, move, resize, note, remove, lock, hours of a day, open weekend) | Each undone and redone; a block removed then put back keeps answering later steps; an undo refused because the block changed says so. |
| S-17 | SU1 and SU2 move the same block | The second is refused as stale. |
| S-18 | Laptop 1280 px wide | Monday to Friday fit without horizontal scroll. Phone: one day at a time with a day switcher, tray folded. |
| S-19 | Deactivate (section 13) a person who has blocks this week | Listed as inactive for that week. |

### 13.2 Technicians

| ID | Steps | Expected |
|---|---|---|
| S-30 | TE1: open the scheduler | Read-only: no drag, no tray actions. |
| S-31 | TE1: My week | Opens on today (scrolled, marked "Today"); past days without buttons; blocks show work order status and priority. |
| S-32 | TE1: lock one of his blocks at 14:00, unlock it | Saved. On TE2's block: not offered (API 403). |
| S-33 | TE1: reorder his day | Saved (appointments stay first). |
| S-34 | TE1: "2 sites on this day" | Shown, without the travel-time action. |

---

## 14. Find a work order (assistant, without a model)

| ID | Who | Steps | Expected |
|---|---|---|---|
| AI-01 | MAINT | Top bar "Find a work order" from an asset panel | Dialog starts from that asset; the context can be removed. From a list filtered on one site: that site. |
| AI-02 | MAINT | Text under 10 characters or under 3 words; 2,001 characters | Refused at once with the reason. |
| AI-03 | MAINT | "chiller noise tower A" | Search results (up to 10) with the "no model configured" notice; Open goes to the work order. |
| AI-04 | MAINT | Text matching nothing | "None of these? New work order" opens the creation form with the text in the description (form dirty). |
| AI-05 | MAINT | Close and reopen the dialog | The unused text is still there. |
| AI-06 | MAINT | Offline | Button disabled with the tooltip. |
| AI-07 | ops | `journalctl -u tacto` after AI-03 | One JSON log line without the typed text. |

---

## 15. Administration, audit log, suggestions

### 15.1 Users (AD)

| ID | Steps | Expected |
|---|---|---|
| U-01 | List, search as you type, filter by role and active | Active users first; focus stays in the search box; click a row opens the user. |
| U-02 | Create a technician `qa.tech1` (password 10+ characters) | Can log in at once; the username is stored lowercase; a taken username gives a field error. |
| U-03 | Usernames `ab`, `Jean Dupont`, `é` ; password of 9 characters | Refused. |
| U-04 | Edit name, role, site, specialty, auto-save mode | Saved; username not editable. |
| U-05 | Deactivate a user with unfinished work orders | Refused: reassign first. |
| U-06 | Deactivate own account | Refused. |
| U-07 | With a single active admin: deactivate them or change their role (via a second admin's session) | Refused (last admin). |
| U-08 | Deactivate and reactivate `qa.tech1` | Deactivated: cannot log in, not offered as assignee; reactivated: works again. |
| U-09 | Reset a password | See A-12. |
| U-10 | Audit log → type Users | Account changes listed, never any password value (only "password reset/changed"). |
| U-11 | Offline | The page says it needs a connection. |

### 15.2 Audit log (SU, AD)

| ID | Steps | Expected |
|---|---|---|
| L-01 | Open the audit log, filter each type, page through | Newest first, readable labels, names; SU never sees user account entries. |
| L-02 | Make one change of each kind (asset, work order, plan, visit, block, setting) | Each appears at the top with its author and from → to. |
| L-03 | Phone width | Entries as cards. |

### 15.3 Suggestions

| ID | Who | Steps | Expected |
|---|---|---|---|
| F-01 | each role | From several pages (one with a record open), "Suggest an improvement" | Dialog over the page; empty text refused; sent; unsent text kept if closed. |
| F-02 | any | Offline | Send disabled, text kept. |
| F-03 | any | 31 suggestions in one hour (API loop) | The 31st is refused with a "too many" message. |
| F-04 | AD | Suggestions page: filter by status and role, set New → Planned → Done → Declined, open the page a suggestion refers to | Works; the link opens the page and record. |
| F-05 | ops | `npm run feedback:export` | Open ideas as Markdown grouped by screen. |

---

## 16. Security

### 16.1 Transport, headers, exposure

| ID | Steps | Expected |
|---|---|---|
| SEC-01 | `curl -sI http://<domain>/` | 301 to HTTPS. |
| SEC-02 | `curl -sI https://<domain>/` and on `/api/health` | `Strict-Transport-Security`, `Content-Security-Policy` (no `unsafe-inline`), `X-Content-Type-Options: nosniff`, frame protection; API: `Cache-Control: no-store`. |
| SEC-03 | SSL Labs test on the domain | Grade A; TLS 1.2 and 1.3 only. |
| SEC-04 | `https://<domain>/package.json`, `/test/`, `/node_modules/idb/package.json`, `/.env`, `/backend/`, `/sw.js.map` | No file content: the shell or 404. `curl http://127.0.0.1:3000/package.json` on the server: 404. |
| SEC-05 | From another machine: `curl http://<server-ip>:3000/api/health` | Connection refused (API on loopback only). |
| SEC-06 | Browse every page with the console open | No CSP violation report. |

### 16.2 Injection and display

Put each payload in a free-text field of each kind (asset name and comment, work order title, description, report, location, comment, request title and location, plan title, block note, dashboard name, suggestion, user first name, blocked week reason), then view it in every place it appears (list, card, panel, history, audit log, dashboard lists, exports, tooltips, page title):

```
<img src=x onerror=alert(1)>
"><svg onload=alert(1)>
javascript:alert(1)
{{7*7}} ${7*7}
'; DROP TABLE work_orders; --
=HYPERLINK("http://example.com","x")
Ünïcödé — 😀 مرحبا
```

| ID | Expected |
|---|---|
| SEC-10 | Shown exactly as typed everywhere; no alert, no broken layout, no 500; CSV cells starting with `=`, `+`, `-`, `@` prefixed with `'`. |
| SEC-11 | Search with each payload: no error, plain-text matching. |

### 16.3 Access control and tokens

| ID | Steps | Expected |
|---|---|---|
| SEC-20 | Section 3 fully run | No unexpected 200. |
| SEC-21 | Change the role in `tacto.user` in local storage to ADMIN, reload | The menu may show more links, but every call answers 403: no data leaks. |
| SEC-22 | Forge a token with `alg: none` or signed with another secret | 401. |
| SEC-23 | Old token after a password change or a deactivation | 401. |
| SEC-24 | Login: response time for an unknown user vs a wrong password | Similar (no obvious username enumeration). |
| SEC-25 | Logout, then use the old token with curl | Still valid until expiry (stateless JWT, documented D22): accepted risk; note it. |

---

## 17. Concurrency, data integrity and time

### 17.1 Several users at once

| ID | Steps | Expected |
|---|---|---|
| C-01 | 5 browsers (or a script) create work orders at the same second | All numbers distinct and consecutive. |
| C-02 | A script sends 50 requests in parallel with the same `client_id` | One work order; the others answer 200 with it. |
| C-03 | Load: 50 simulated users browsing and editing for 10 minutes (k6, autocannon, or a loop of curl) | No 5xx, no `SQLITE_BUSY` in the logs; p95 response time noted and acceptable (< 500 ms for lists). |
| C-04 | During C-03, run `npm run db:backup` | Backup completes and passes its integrity check; the app keeps answering. |

### 17.2 Data checks after the campaign

Run on the staging database at the end:

```sql
PRAGMA integrity_check;
PRAGMA foreign_key_check;
-- work orders that break the rules
SELECT number FROM work_orders WHERE status='CLOSED' AND (work_report IS NULL OR trim(work_report)='' OR closed_on IS NULL);
SELECT number FROM work_orders WHERE due_on < created_on OR closed_on < started_on;
SELECT number FROM work_orders WHERE asset_id IS NOT NULL AND site <> (SELECT site FROM assets a WHERE a.id=asset_id);
-- conflict flags in step with the conflicts table
SELECT 'wo', id FROM work_orders w WHERE has_conflict <> EXISTS(SELECT 1 FROM conflicts c WHERE c.entity_type='work_orders' AND c.entity_id=w.id AND c.status='OPEN')
UNION ALL SELECT 'asset', id FROM assets a WHERE has_conflict <> EXISTS(SELECT 1 FROM conflicts c WHERE c.entity_type='assets' AND c.entity_id=a.id AND c.status='OPEN');
-- one work order per released visit
SELECT work_order_id, count(*) FROM plan_occurrences WHERE work_order_id IS NOT NULL GROUP BY 1 HAVING count(*)>1;
-- every record has its creation in the audit log
SELECT number FROM work_orders w WHERE NOT EXISTS(SELECT 1 FROM audit_log l WHERE l.entity_type='work_orders' AND l.entity_id=w.id AND l.action='CREATE');
```

| ID | Expected |
|---|---|
| C-10 | `ok`, and every other query returns no row. |

### 17.3 Time zone, day and week boundaries (clock-controlled staging)

| ID | Steps | Expected |
|---|---|---|
| T-01 | Server clock 23:30 Paris (21:30 or 22:30 UTC): create a work order; read the dashboard | `created_on` is today in Paris; "today" and "overdue" use the Paris date. |
| T-02 | Same at 00:30 Paris (still the previous day in UTC) | Paris date used. |
| T-03 | Last day of a month at 23:59 then 00:01 | "Closed this month" switches correctly. |
| T-04 | Daylight saving change: Sunday 25 October 2026 (week 2026-W43) | Week scheduler, My week, durations in "Time to start and to close" and downtime days correct on that week; no day shown twice or missing. |
| T-05 | Week 2026-W53 (28 Dec 2026 – 3 Jan 2027) and the move into 2027-W01 | Year planner, scheduler, My week, plan series and release work across it; `2027-W53` refused. |
| T-06 | New year: first work order created on 1 January 2027 | Numbered `WO-2027-00001`. |
| T-07 | An offline edit made more than 30 days ago (`edited_at`, via API) | 422 with the reason, shown on the record. |

### 17.4 Timers on the server

| ID | Steps | Expected |
|---|---|---|
| T-10 | `grep APP_TIMEZONE /etc/tacto/tacto.env`; `grep OnCalendar /etc/systemd/system/tacto-*.timer`; `systemctl list-timers 'tacto*'`; the day-skipped check of README → Deployment, step 4 | `APP_TIMEZONE` is the zone where the app is used (not left at `Europe/Paris` by mistake), both timers name that same zone (D71), the next backup and release fall at 01:30 and 04:00 local time there (`list-timers` shows them in the server's own zone), and the check prints nothing. |
| T-11 | Reboot the VPS during the night window | Missed timers run at boot (`Persistent=true`); the app starts by itself. |

---

## 18. Devices, browsers, accessibility, performance

### 18.1 Devices and browsers

Run the **main flows** below on each line of the matrix: log in; browse a list and open a record; edit and save; create a work order; offline edit and sync (phones: airplane mode); staff request (ST); review (SU); dashboard with one chart and one export; My week (TE); log out.

| Device | Viewport (CSS px) | Browsers |
|---|---|---|
| iPhone 17 | 402 × 874, DPR 3 | Safari |
| iPhone 17 Pro Max | 440 × 956, DPR 3 | Safari |
| Samsung Galaxy S25 | 360 × 780, DPR 3 | Chrome, Samsung Internet |
| Galaxy S25 Ultra | 412 × 891, DPR 3.5 | Chrome |
| Tablet (iPad) | 820 × 1180 portrait and landscape | Safari |
| Laptop | 1280 × 800 and 1366 × 768 | Chrome, Firefox, Edge |
| Desktop | 1920 × 1080 and 2560 × 1440 | Chrome, Firefox, Safari (macOS) |

| ID | Steps | Expected |
|---|---|---|
| DV-01 | Main flows on each line | All work; no horizontal page scroll; tap targets at least 44 px on phones. |
| DV-02 | Phones | Work order list as cards, filters folded behind "Filters (n)"; Year planner link hidden and its URL says it needs a larger screen; audit log as cards. |
| DV-03 | Split view on a laptop (list + panel) | Both readable; pagers keep their arrows; scheduler takes its compact layout next to a panel. |
| DV-04 | Rotate phone and tablet with a form half filled | Nothing lost. |
| DV-05 | Zoom the browser to 200 %; window 320 px wide | Content reflows, nothing cut off. |
| DV-06 | Native date and week fields in each browser | Usable; the week field falls back to `YYYY-Www` text where there is no picker. |
| DV-07 | Install as a home screen app on iPhone and Android (if offered) | Opens, logs in, works offline as in the browser. |

### 18.2 Accessibility

| ID | Steps | Expected |
|---|---|---|
| AX-01 | axe DevTools on: login, dashboards (tech and personal), asset list + panel, work order list + panel + creation, request pages, conflicts console and arbitration, audit log, users, planner, scheduler, My week, every dialog | 0 serious or critical violation. |
| AX-02 | Keyboard only through the main flows | Everything reachable, visible focus, no focus trap, dialogs return focus. |
| AX-03 | Screen reader: log in, open a work order, save, read a conflict, submit a request | Labels and announcements (saved, errors, live region) read out. |
| AX-04 | Conflict, status, priority and stage indicators | Always with text or icon, never color alone. |
| AX-05 | Contrast of text and controls (axe or a contrast checker) | AA. |

### 18.3 Performance (staging, through Nginx and HTTPS)

| ID | Steps | Expected |
|---|---|---|
| PF-01 | Cold cache, DevTools "Fast 4G": first load after login | Usable in under 2 s (asset list and dashboard). |
| PF-02 | Cached record opened from the list | Under 20 ms. |
| PF-03 | Year planner, scheduler, "Assets and people" dashboard | Each loads in under 2 s; drag in the planner stays smooth. |
| PF-04 | Lighthouse on the dashboard | Performance and accessibility scores noted for the record. |

---

## 19. Deployment and operations (staging, then production)

| ID | Steps | Expected |
|---|---|---|
| OPS-01 | Follow the README deployment guide on a fresh VPS, word for word | Works without any step the README does not mention; note every gap. |
| OPS-02 | `systemctl status tacto`; `curl -s http://127.0.0.1:3000/api/health` | Active; `{"status":"ok",…}`. |
| OPS-03 | `systemctl restart tacto` while a user is editing | The user sees at most a short "offline" period; the edit is saved after. |
| OPS-04 | Kill the node process (`kill -9`) | systemd restarts it within 5 s. |
| OPS-05 | `sudo nginx -t`; `certbot renew --dry-run` | Both succeed. |
| OPS-06 | `systemctl start tacto-backup`; list `/var/backups/tacto`; `journalctl -u tacto-offsite-backup -n 3` | A new file; logs show the integrity check passed; then "Off-server copy of … stored and verified" (D72). |
| OPS-07 | **Restore drill**: on a separate VM, restore the latest **off-server** copy following README → Restore from the off-server copies, using only the copy of `offsite.env` kept outside the VPS (D77), by the person who keeps it, without help; also restore yesterday's local backup on staging | The app starts on each restored database and shows the expected data. |
| OPS-08 | Backups older than 14 days | Deleted by the next run. |
| OPS-09 | Off-server copies: `restic snapshots` (README → Operations); stop the network of the VPS or set a wrong key in `/etc/tacto/offsite.env`, then `systemctl start tacto-backup` | One copy per night; with the fault, `tacto-offsite-backup` fails visibly (`systemctl --failed`) and an alert "tacto-offsite-backup.service failed" reaches the ntfy topic (D75), while the local backup still exists. Put the settings back. |
| OPS-10 | Update procedure: install the next release tag with a new migration (README → Operations → Update to a release) | A backup is written into `/var/backups/tacto` before the migration runs at start (named in the log); app works, users keep their session and queued writes. |
| OPS-11 | Permissions: `ls -l /etc/tacto/tacto.env /var/lib/tacto` | env file `640 root:tacto`; database directory `750 tacto`; code owned by root. |
| OPS-12 | Login rate limit through Nginx from two different client IPs | Each IP has its own counter (the real client address is used, not Nginx's). |
| OPS-13 | `journalctl -u tacto` after the campaign | No stack trace other than the ones the tests caused on purpose; no password, token or user text in the logs. |
| OPS-14 | Disk: database, WAL file and logs after the load test | Sizes noted; journald limits set; `systemctl list-timers tacto-disk-check` shows the free space check (D75). |
| OPS-15 | Uptime monitoring on `https://<domain>/api/health` (README → Deployment, step 3, Alerts): `sudo systemctl stop tacto`, wait one check interval, then start it | Alert received at the ntfy topic while the service is stopped, and the monitor back up after the start. |
| OPS-17 | Rollback after OPS-10: README → Operations → Roll back, with the backup named in the log | The previous tag runs (`git describe --tags`), the app starts and shows the data as it was before the update. |
| OPS-16 | On a new empty database: `npm run user:create-admin -- --username qa.admin --first-name QA --last-name Admin`; mistype the second password; then run it correctly; then run it again | Mismatch refused; created, can log in and sees every admin page; the second run is refused because an administrator exists. The password never appears on screen or in `journalctl`. |
| OPS-18 | Alerts on the VPS (D75): `sudo systemctl start tacto-notify@test.service`; then `sudo kill -9 $(systemctl show -p MainPID --value tacto)` | The test alert, then "tacto.service failed", reach the ntfy topic; the API is back within 5 s (OPS-04). |
| OPS-19 | Dead man's switch: after a successful backup the check is green at the monitoring service; then `sudo systemctl disable --now tacto-backup.timer` and wait past the period and grace time (1 day + 2 hours, or shorten the period for the test) | The monitoring service alerts the ntfy topic that the ping is missing. Re-enable the timer (`sudo systemctl enable --now tacto-backup.timer`) and run `sudo systemctl start tacto-backup`: the check is green again. |
| OPS-20 | Disk warning and silence: `echo DISK_ALERT_PERCENT=1 \| sudo tee -a /etc/tacto/notify.env`, `sudo systemctl start tacto-disk-check`; then `date -d '+10 min' -Is \| sudo tee /run/tacto-silence-until` and `sudo systemctl start tacto-notify@test.service`; remove the setting and the silence file | A "disk almost full" alert names the file system; during the silence no alert arrives and `journalctl -u tacto-notify@test.service` shows "Silenced until …". |

---

## 20. Production smoke test (after each deployment, non-destructive)

| ID | Steps | Expected |
|---|---|---|
| PR-01 | `curl -s https://<domain>/api/health` and the headers of SEC-02 | ok, headers present. |
| PR-02 | Log in as a real admin; open the dashboard, assets, work orders, a record | Works, no console error. |
| PR-03 | Log in as a real technician on a phone | Dashboard and My week open; airplane mode → reload → cached data shown. |
| PR-04 | Service worker active (DevTools → Application) | Activated and running. |
| PR-05 | `systemctl list-timers 'tacto*'` | Backup and release scheduled. |
| PR-06 | Next morning: backup file present, release log line present | Yes. |

---

## 21. Points to settle before the first production launch

Found while writing this protocol (2026-10-14). They are not test failures yet, but each would cause trouble in production.

1. ~~**No way to create the first administrator without the demo data.**~~ Fixed by `npm run user:create-admin` (D70), tested by OPS-16. If the demo data is loaded on purpose instead, every demo account shares `SEED_PASSWORD` and must be deactivated or have its password changed.
2. ~~**"Source code" link (DT2, D57)**~~ Fixed: the repository is public since 2026-10-14, so the link opens for every user. Tested by NAV-25.
3. ~~**Server time of the timers**~~ Fixed (D71): the timers run in Paris time, the backup at 01:30 so that it never falls in the hour skipped or repeated by daylight saving. Tested by T-10.
4. ~~**Off-server backups**~~ Automated (D72): an encrypted restic copy after each nightly backup, read back and compared every night. Postponed to roadmap Phase 31, still before launch: choose the storage, keep the whole `offsite.env` outside the VPS (D77), run OPS-07 and OPS-09. A failure sends an alert (D75, OPS-09).
5. **Tokens stay valid after logout until they expire** (SEC-25, D22): known and accepted by design. Confirm the 8-hour lifetime with the product owner.
6. **`deploy/tacto.env.example` does not list `AI_PROVIDER` and `AI_TIMEOUT_MS`.** The defaults are right for now (`none`), but add them so the production settings file shows every option.
