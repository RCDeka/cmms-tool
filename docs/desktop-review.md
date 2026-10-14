# Desktop review

Status: **all findings fixed except DT2** (2026-10-14, D69 in `docs/decisions.md`). DT2 is deferred until the first deployment to users (roadmap backlog), as the repository stays private during development.

## How it was checked

The app ran on a fresh copy of the demo dataset (`db:reset --with-conflicts`, separate database and port, so no real data was touched), driven by headless Chromium in desktop mode (no touch, device pixel ratio 1). Each role was logged in: administrator, supervisor, technician and staff member. A crawler opened every page reachable from the sidebar and from a list of known URLs, then followed every in-app link it found (two samples per URL pattern: lists, filters, drill-downs, records, scheduler and planner panels, users, conflicts, requests), 27 to 53 pages per role. On each page it recorded:

- script errors, console errors and failed requests;
- sideways and vertical scrolling of the page itself (the app scrolls inside its regions, never the whole page);
- text spilling out of its box, elements off the right edge;
- "undefined", "NaN", "null" or "Invalid Date" shown to the user;
- buttons and fields without a name, duplicate ids and broken images;
- every link checked against the app's own router (`parseRoute`), and the external links fetched.

Interactions were then scripted by hand: opening a record from a table, the work order panel down to its history, Escape, the Find and Suggest dialogs, the widget and dashboard menus, Browse assets, column sort, last page, a scheduler tray card and a year planner visit. Screenshots were read one by one.

Screen sizes (CSS pixels):

| Screen | Viewport | Roles crawled |
|---|---|---|
| Small laptop | 1280 × 720 | administrator |
| Common laptop | 1366 × 768 | administrator, supervisor, technician, staff |
| Full HD monitor | 1920 × 1080 | administrator |
| QHD monitor | 2560 × 1440 | administrator (key pages) |

## Measurements

Same at every size unless stated: **no script error, no failed request** (except the two deliberate 404s for `/assets/999999` and `/work-orders/999999`, which show "This asset does not exist" and similar), **no sideways page scrolling**, no "undefined"/"NaN" text, no unnamed control, no duplicate id, no broken image. **All 663 in-app links resolve to a route.** Forbidden pages show "Access denied", and staff members are sent to their requests.

| Check | 1280 × 720 | 1366 × 768 | 1920 × 1080 | 2560 × 1440 |
|---|---|---|---|---|
| Whole page scrolls, technician dashboard (should be 0) | — | 2019 px | — | — |
| Whole page scrolls, technician My week | — | 431 px | — | — |
| Whole page scrolls, any scheduler side panel | 180 px | 60 px | 0 | 0 |
| Week scheduler: days fully visible (no panel) | 3 | 3 | 5 | 5 |
| Work order number on one line in the list | no | no | no | no |
| External link "Source code" | 404 | 404 | 404 | 404 |

## Findings

Severity: **Bug** (wrong behaviour), **Major** (a daily task is hard on a desktop), **Minor**. Decision: the product owner chose to fix every finding (2026-10-14).

| ID | Area | Severity | Finding | Suggested direction | Decision |
|---|---|---|---|---|---|
| DT1 | Page layout (technician dashboard, My week, scheduler panels) | Bug | The whole page can scroll, although the app is meant to scroll only inside its regions. `#main-content` became `position: relative` for the floating message (M2). So the screen-reader-only texts (`.visually-hidden`, `position: absolute`) inside the scrolling `#table-container` are placed against `#main-content`, outside the scroller, and stretch the document: 2787 px high on the technician dashboard (`#kpi-heading`), 1199 px on My week, +60 to +180 px with a scheduler panel open (the grid caption). The mouse wheel cannot scroll it, but `scrollIntoView` and focus can. **My week** for a technician scrolls to today with `scrollIntoView`, which also scrolls the page: the top bar leaves the screen, the status bar floats in the middle, and an empty band shows below it (screenshot `tech-1366/021`). | Make the scrolling regions (`#table-container`, `#detail-container`) the containing block (`position: relative`), or give the floating message its own wrapper. Regression test: after rendering these pages, `document.documentElement.scrollHeight` equals the window height. || **Fixed**: `#main-content` clips what overflows it (`overflow: clip`); regression test in `test/layout-css.test.js`. Rechecked: the page no longer scrolls on any page, My week keeps its top bar. |
| DT2 | Status bar, licence | Bug | The "Source code" link (`https://github.com/RCDeka/cmms-tool`) answers **404** to anyone not signed in to GitHub with access: the repository is private. The AGPL (D57, section 13) requires offering the source to the app's users. | Make the repository public, or link to a source archive the app serves itself. || **Deferred** until the first deployment to users (roadmap backlog, item 11): no user outside the team yet, and the repository stays private during development. |
| DT3 | Week scheduler | Major | On 1280 and 1366 px screens, only Monday to Wednesday fit; Thursday is cut and Friday needs a sideways scroll inside the grid. The tray (≈ 270 px) and the person column (≈ 150 px) take a third of the width. At 1920 px the whole week fits. | Narrower or foldable tray on screens under ≈ 1600 px; narrower day columns (the block cards already wrap). || **Fixed**: from 1024 to 1599 px, tray 200–220 px, narrower person and day columns; Monday to Friday fit at 1280 px. |
| DT4 | Split view: scheduler, year planner, lists | Major | With a side panel open at 1366 px, the left half keeps the whole toolbar, help text and tiles, stacked in two columns. The scheduler grid and the planner grid start more than a screen down, so the result of "Schedule" or a visit move cannot be seen next to the panel. In the asset, work order and user lists, the filters take five rows and the pager wraps ("Last" alone on a second line). | In split view, fold the tiles into one summary line (as on phones, M13) and the help text behind a "?" button; keep the pager on one line (icons only, or "Page 1 / 7" with ◀ ▶). || **Fixed**: next to a panel, the scheduler takes its phone layout (one line of figures, folded tray, one day at a time) and the planner leaves out its tiles, capacity line and drag help; pagers keep only their arrows. |
| DT5 | Work order list, conflicts | Minor | The number wraps onto two lines ("WO-2026-" / "00330") at every width, even at 2560 px where the title column is about 1000 px wide. Every row becomes two lines high. | `white-space: nowrap` on the number and asset code columns. || **Fixed**: number and code columns 9.5 rem and unbroken; the conflict list, the tray and the blocks keep the code on one line (`codeFirst`). |
| DT6 | Top bar page title | Minor | The title rule differs from page to page. A work order or asset record keeps the list's name ("Work orders", "Assets", also for "New work order"), and so does a conflict ("Conflicts"). A user record shows the person's name, a maintenance plan its full name, and "New user", "New maintenance plan" and "Blocked weeks" name the panel. The browser tab title follows. | One rule: for example the panel's name when a panel is open ("WO-2026-00330", "New work order", "Karim Benali"), the list's name otherwise. || **Fixed**: the top bar names the sidebar section, also while a panel is open; a record opened from another page keeps its kind (D68). |
| DT7 | Top bar | Minor | A long title wraps onto two lines and makes the top bar taller (63 → 77 px), so the red rule and the page below move down. Seen with plan "PM-0034 — Weekly switchboard walk-round, Main building L1" at 1366 px. | One line with an ellipsis (full title in the panel heading). || **Fixed**: one line with an ellipsis from 768 px; phones keep wrapping. |
| DT8 | Dashboard menus | Minor | The widget menu (⋯) and the "Dashboard ▾" menu close on an outside click but **not with Escape**, while the list filter drop-downs do (`filters.js`). Keyboard users have to tab out. | Same Escape handler as `filters.js`, focus back on the menu button. || **Fixed**: Escape closes both menus and returns focus to their button; test in `test/dashboards-page.test.js`. |
| DT9 | Date, week and number fields | Minor | Native fields follow the browser's language, not the app's. On a French browser the English interface shows "Semaine 42, 2026" next to "Week 42, 2026", "jj/mm/aaaa" in the Started and Closed fields, and "3,5" or "1,5" in the hours fields where the rest of the app writes "3.5 h". | Accept as browser behaviour and note it in `docs/ui-guidelines.md`, or set `lang="en"` and check what each browser does with it. A custom week picker is not worth it for the MVP. || **Accepted** and documented in `docs/ui-guidelines.md` → Language: `lang="en"` is already set and the browser keeps its own language in these fields. |
| DT10 | Number format | Minor | The percent sign is spaced in some places ("a 30 % reserve", "Tight weeks (85–100 %)") and not in others ("41%", "107%" in the tiles and charts). | One form (no space, as in the charts) everywhere. || **Fixed**: no space before % anywhere. |
| DT11 | Audit log | Minor | Rows about scheduler blocks show their day in ISO form in the Record column ("WO-2026-00259 · Lucas Moreau · 2026-10-13"), while the Changes column of the same row says "13 Oct 2026". | Format the day of the block label like the other dates. || **Fixed**: the day is formatted at display (`recordLabel`, test in `test/history.test.js`); stored labels are unchanged. |
| DT12 | Pagination | Minor | Assets and Work orders show the pager at the top left (and at the bottom). Users and Suggestions show it only at the bottom, centred, even with a single page or no record: "No suggestion yet." comes with "Page 1 / 1" and four disabled buttons. | One pager layout; hide it when there is only one page. || **Fixed**: no pager on a single page; users, suggestions and the audit log also get the copy above the table. |
| DT13 | Users list | Minor | Filters need the "Search" button, while asset and work order filters apply as you type. Names are underlined links, while asset and work order rows open by clicking anywhere on the row. | Same filtering and row behaviour as the other lists. || **Fixed**: search as you type, no Search button, a click on the row opens the user; tests in `test/admin-users.test.js`. |
| DT14 | Sidebar | Minor | On dashboard pages the widget catalogue makes the sidebar scroll: a light grey scrollbar appears between the black sidebar and the page, and the sidebar is about 15 px narrower than on other pages (234 vs 250 px at 2560 px), so the links shift when changing page. At 1366 × 768 the administrator's "Change my password" and "Log out" sit below the fold of the sidebar on every page. | Dark, thin scrollbar (`scrollbar-color`, `scrollbar-gutter: stable`) on the sidebar; fold the widget catalogue behind a button, or keep the account block pinned at the bottom. || **Fixed**: dark scrollbar with its room kept on every page; the account block stays at the bottom of a scrolling sidebar. |
| DT15 | Panels: spacing | Minor | Some headings sit right under the text before them. In Blocked weeks, "No week is blocked from this week on." touches "Block a week". In the scheduler's Schedule panel, "Blocks" touches the "Left" row. | Usual section spacing above panel headings. || **Fixed**: space above a form section that opens with a heading. |
| DT16 | My week, administrator | Minor | Administrators have no My week link (D52), but `/my-week` still opens for them and says "0 h scheduled of 35 h", as if they were counted as capacity. | Show "My week is for technicians and supervisors" to administrators, as staff requests do for other roles. || **Fixed**: administrators read "My week is for technicians and supervisors"; test in `test/schedule-page.test.js`. |

## What works well

Every page loads without a script error. Permissions hold in the interface: hidden links, "Access denied" pages, staff sent to their requests. The 404 page and missing records are handled. Sorting, the last page, the record panel (Escape closes it and returns to the list), the Find and Suggest dialogs (Escape closes them), Browse assets, the widget and dashboard menus, the scheduler tray and the year planner visits all work.
