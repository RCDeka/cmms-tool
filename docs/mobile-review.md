# Mobile review

Status: **findings recorded, nothing changed yet** (2026-10-08). Which features must work on a phone, and which only if possible, is to be decided with the product owner; the **Decision** column below is filled in during that discussion. Fixes then go through the usual decisions (`docs/decisions.md`) and the roadmap.

## How it was checked

The app ran on the demo dataset (`npm run db:reset`), driven by headless Chromium with phone emulation (CSS viewport, device pixel ratio, touch, mobile user agent behaviour). Each role did its daily tasks: a technician reads the day's work, opens a work order, starts it and reaches the work report; a supervisor schedules a work order and opens the year planner. Measured on each screen: sideways scrolling, tap targets under 44 px (links inside running text excepted, as in WCAG 2.5.8), and how far down the key content sits. Screenshots were read one by one.

Devices (CSS viewport × device pixel ratio). The iPhone sizes come from published device data; the Android sizes are estimates from screen resolution and pixel ratio, to be confirmed on a real device or in Chrome DevTools:

| Device | Viewport | DPR |
|---|---|---|
| iPhone 17 | 402 × 874 | 3 |
| iPhone 17 Pro Max | 440 × 956 | 3 |
| Samsung Galaxy S25 (narrowest common width) | 360 × 780 | 3 |
| Samsung Galaxy S25 Ultra | 412 × 891 | 3.5 |

Sources: [yesviz.com, iPhone 17](https://yesviz.com/devices/iphone-17/), [yesviz.com, iPhone 17 Pro Max](https://yesviz.com/devices/iphone-17-pro-max/), [yesviz.com, Galaxy S25](https://yesviz.com/devices/samsung-s25/), [yesviz.com, Galaxy S25 Ultra](https://yesviz.com/devices/samsung-s25-ultra/), [whatismyscreensize.com, Galaxy S25](https://www.whatismyscreensize.com/blog/galaxy-s25-s26-screen-size).

## Measurements

The same on every device unless stated: **no sideways scrolling on any screen, no script error.** "Screens" = how many screen heights down the content starts.

| Screen | iPhone 17 | iPhone 17 Pro Max | Galaxy S25 | Galaxy S25 Ultra |
|---|---|---|---|---|
| Technician dashboard: "My work" starts at | 0.5 | 0.5 | 0.7 | 0.5 |
| My week (on a Thursday): today's day starts at | 2.0 | 1.8 | 2.4 | 2.0 |
| Work order panel: work report field at | 1.4 | 1.3 | 1.6 | 1.4 |
| Work order list: columns visible without scrolling the table | 1 of 7 | 2 of 7 | 1 of 7 | 1 of 7 |
| Week scheduler (supervisor): grid starts at | 4.3 | 3.9 | 5.0 | 4.2 |
| Week scheduler: days fully visible | 1 | 1 | 1 | 1 |

Tap targets under 44 px, on every device: "Change my password" in the open menu (20 px), the capacity link of a scheduler cell (32 px), the plan names of the year planner (39 px), the asset link in the work order panel (20 px).

## Findings

Severity: **Bug** (wrong behaviour), **Major** (a daily task is hard on a phone), **Minor**. Decision: *Must* (must work on a phone), *If possible*, *Not on mobile* — to be filled in.

| ID | Area | Severity | Finding | Suggested direction | Decision |
|---|---|---|---|---|---|
| M1 | Scheduler, year planner (also desktop) | Bug | After saving from a side panel (Schedule, Add time, hours of a day, Accept a proposal), the confirmation message is lost: `navigate()` starts the new render without waiting for it, so the message is written to the page about to be replaced. The earlier browser checks passed only because the message flashes. | `navigate()` resolves when the render is done; then say the message. Regression test. | |
| M2 | Scheduler on a phone | Major | After a panel closes, the page stays where it was scrolled (about 700 px down): even a working message line is off screen; only screen readers hear it. | A message area that stays in view (toast or sticky line) on small screens. | |
| M3 | My week | Major | Opens on Monday; on a Thursday, today starts about two screens down, after days already done; today is not marked. | Open on today (scrolled to it, or a one-day view with the week around it); mark "Today". | |
| M4 | My week | Major | Each block shows Move up, Move down, a time picker and "Lock at this time", on past days too: the buttons take more room than the job. | Actions behind a "Change…" button; none on past days. | |
| M5 | My week | Minor | A block does not show its work order's status (open, in progress, on hold) or priority. | Status and priority badges on the block. | |
| M6 | My week | Minor | "2 sites: add travel time" is a supervisor's hint: technicians cannot add travel time. | Technicians read "2 sites today". | |
| M7 | Technician dashboard | Major | "My work" lists work by due date, under five team-wide tiles; the day's scheduled blocks are only in My week. | On phones, "Today in my week" first (or a link to it), team tiles after. | |
| M8 | Work order panel | Major | "Back to list" goes to the work order list, not back to My week where the technician came from; the page title says "Work orders". | Return to where the user came from (history back when they came from the app). | |
| M9 | Work order panel | Major | Field order suits office work: Number and Title first, the description and location lower, the work report and actual time 1.3 to 1.6 screens down among "Created by" and "Last modified". | On phones (or for technicians), field work first: status, description, location, asset, work report, actual time; the record details after. | |
| M10 | Work order panel | Minor | The technician's own blocks and appointment time for this job are not shown. | A "Scheduled" line: days, hours, appointment. | |
| M11 | Work order panel | Minor | Content shows through a gap under the sticky Save bar. | Close the gap (bar flush with the bottom, or opaque below it). | |
| M12 | Work order list | Major | The seven filters fill the first screen; the table then shows 1 of 7 columns (2 on the largest phone); status and priority need a sideways scroll of the table. | On phones, cards (number, title, status, priority, due) and filters folded behind a "Filters" button. | |
| M13 | Week scheduler | Major | Drag and drop cannot work on a phone: the grid starts 3.9 to 5 screens down, under the toolbar, the keyboard help, five tiles and the tray; a card and a day are never on screen together, and a drag does not scroll the page. Tapping a card and using its panel works (checked end to end), but nothing points to it. | On phones, say "Tap a work order to schedule it"; tiles as one summary line; tray collapsed. | |
| M14 | Week scheduler | Major | The sticky person column takes about 40 % of the width: one day fits on screen. | A one-day view on phones (people as rows, a day switcher). | |
| M15 | Week scheduler | Minor | The help text speaks of dragging, Ctrl + Z and + / − keys, which phones do not have. | Help text by input type (`pointer: coarse`). | |
| M16 | Tap targets | Minor | "Change my password" in the menu (20 px), scheduler cell capacity links (32 px), year planner plan names (39 px), the asset link in the work order panel (20 px). | At least 44 px high. | |
| M17 | Year planner | Minor | The planner (52 weeks × plans) needs sideways scrolling inside its frame; usable for reading, editing by drag is a desktop task. | Decide whether the planner is offered on phones at all, or read-only. | |

What works well on phones already: login, the menu, no sideways page scrolling anywhere, 44 px buttons and form fields, the work order form (status change and save checked), the scheduler's panels (full screen, split proposal, Schedule saved), My week offline.
