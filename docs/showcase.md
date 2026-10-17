# Showcase

A tour of Tacto in pictures: what each role sees and does, screen by screen. Tacto manages the maintenance of a bank's buildings (head offices, branches, data centers): assets, work orders, staff requests, preventive maintenance and dashboards, fast and usable offline.

Every picture comes from the mock data: the people, sites and assets are made up. `cd backend && npm run docs:screenshots` takes them again from a throwaway database (`docs/ui-guidelines.md` → Screenshots); `npm run docs:screenshots -- showcase/` takes only the ones of this page. Computer pictures are 1440 × 900; phone pictures are an iPhone 17 (402 × 874).

**Contents**

1. [Signing in and roles](#1-signing-in-and-roles)
2. [Dashboards](#2-dashboards)
3. [Assets](#3-assets)
4. [Work orders](#4-work-orders)
5. [Offline use](#5-offline-use)
6. [Conflicts and arbitration](#6-conflicts-and-arbitration)
7. [Staff requests](#7-staff-requests)
8. [Preventive maintenance](#8-preventive-maintenance)
9. [Places](#9-places)
10. [Administration](#10-administration)
11. [On a phone](#11-on-a-phone)

The mock users, one per role:

| Person | Username | Role | What they do |
|---|---|---|---|
| Emma Rousseau | `user1` | Staff | Bank employee: reports problems and follows them |
| Karim Benali | `technician1` | Technician | Does the work: his work orders and his week |
| Julien Bernard | `supervisor1` | Supervisor | Reviews requests, plans, schedules, arbitrates conflicts |
| Claire Martin | `admin` | Administrator | Everything a supervisor does, plus users and settings |

## 1. Signing in and roles

![Login page](img/showcase/login.png)

One login page for everyone. The menu then depends on the role: staff see only their requests; technicians get the dashboard, assets, work orders, the planners and My week; supervisors add their own dashboards, conflicts, the audit log and places; administrators add users, suggestions and settings. The server checks every permission again: hiding a button is only for comfort.

![The work orders in French](img/showcase/french.png)

The flags at the end of the top bar, and in the corner of the login page, switch the interface between English and French (D85). The browser remembers the choice, even after logging out. Everything Tacto writes is translated, with the vocabulary of French maintenance teams (bon de travaux, équipement, domaine technique, compte rendu); what people typed (titles, reports, comments, names of places) stays as it was written. The other pictures of this page are in English.

## 2. Dashboards

**Supervisor dashboard.** Key figures first (open, in progress, closed this month, overdue, assets broken down, staff requests to review, requests waiting for a reply, conflicts), with "Needs attention" when a figure calls for action. Then charts, "My work" and the latest activity. The period (30, 90 or 365 days), the sites and the trades filter the whole page. The sidebar lists the widgets: ticking one adds it; each widget can be dragged into place, shown as a table, or exported as CSV or a JPG image.

![Supervisor dashboard, whole page, with the widget list in the sidebar](img/showcase/dashboard-full.png)

**Flow and backlog.** Work orders opened against closed each week, and how the unfinished pile grows or shrinks.

![Opened vs closed widget](img/showcase/dashboard-flow.png)

**Planned vs reactive work and compliance.** The share of planned work, preventive visits done on time (by trade, with regulatory visits apart), regulatory visits late and the week schedule kept.

![Planned vs reactive work and compliance widgets](img/showcase/dashboard-compliance.png)

**Staff requests and assets.** How fast requests are reviewed and done, the assets with the most breakdowns (with the cumulative share, Pareto style), repeat failures and critical assets out of service.

![Staff request service and asset widgets](img/showcase/dashboard-assets.png)

**People.** Workload per person by priority against the hours booked this week, and how actual hours compare with estimates by trade.

![Workload per person and estimates vs actual hours](img/showcase/dashboard-people.png)

**From a figure to the records.** Every tile, bar or slice opens the list of work orders or assets it counts, with the filters already set: here, the overdue work orders.

![Work order list filtered on overdue work orders](img/showcase/dashboard-drill.png)

**Technician dashboard.** A technician gets one page: their work due today, late or without a date (or the next 7 days), with a link to today in My week.

![Technician dashboard with My work](img/showcase/dashboard-technician.png)

## 3. Assets

**Asset list.** 500 mock assets across five sites. Search on code, name, brand or serial number; filter by site, category, status and criticality; sort any column. Pages load from the device first, the next and previous ones are fetched in advance, so moving through the list feels instant. Broken-down assets are marked in the margin.

![Assets filtered on broken down and out of service](img/showcase/assets.png)

**Asset panel.** The table stays on the left, the record opens on the right (on a phone, it takes the whole screen). Every field is edited in place; the place comes from the location tree (site, building, floor, room). "New work order for this asset" starts a work order with the asset filled in. A conflict badge flags an asset two people changed at the same time (section 6).

![Asset detail panel next to the table](img/showcase/asset.png)

## 4. Work orders

**Table and detail.** The same split view: filters on status, priority, type, trade, site, assignee, "Assigned to me", "Overdue", "Requests to review" and "Waiting for a reply". The panel shows what the role may change as fields, the rest as text. Status changes follow the allowed transitions (open, in progress, on hold, closed, cancelled); a work order is never deleted, only cancelled.

![Work order table with the detail panel](img/work-orders.png)

**Comments and history.** The comments are a conversation with the requester when the work order comes from a staff request. The history lists every change: who, when, and each field before and after.

![Comments and history of a work order](img/showcase/work-order-history.png)

**New work order.** Opened from an asset, the form already has the asset and its place. Required fields are marked; it works offline too (section 5).

![New work order form with the asset filled in](img/showcase/work-order-new.png)

**Find a work order.** From any page, a technician describes the job in their own words and Tacto proposes the open work orders it belongs to. The AI assistant behind it waits for a model provider (`docs/spec-ai-assistant.md`); until then, a text search answers, as the notice above the results says.

![Find a work order dialog with results](img/showcase/find-work-order.png)

**Suggest an improvement.** On every page, anyone can send an idea; it is saved with the page it was sent from and its width, for the administrators (section 10).

![Suggest an improvement dialog](img/showcase/feedback.png)

## 5. Offline use

The connection dropped: the status bar turns to "Offline mode — local data", pages already visited still open from the device, and changes are still saved. Here the technician wrote a work report offline: the panel says it waits on this device, the status bar counts "1 change waiting to sync", and it is sent by itself when the network comes back. Features that need the server (the assistant, administration) are greyed out with the reason.

![Work order saved offline, waiting to sync](img/showcase/offline.png)

## 6. Conflicts and arbitration

**Conflict console.** Two people changed the same record from the same starting version, for example one of them offline. Nothing is lost: the second change is kept aside and the record is flagged. The supervisor console lists them with both authors.

![List of open conflicts](img/showcase/conflicts.png)

**Locked record.** Until a supervisor decides, the record shows a banner and cannot be edited, so the two versions cannot drift further.

![Work order locked by a conflict](img/showcase/conflict-locked.png)

**Arbitration.** Both versions side by side, the differing fields highlighted. The supervisor keeps version A, version B, or picks field by field; the history records the decision.

![Side-by-side arbitration of a conflict](img/conflict.png)

## 7. Staff requests

**For the bank's staff, on a phone.** A staff member sees their open requests, each with a status and the next step in plain words, and all their past requests. A new request takes a short title, the site, the room from the list (or "Not in the list" and where exactly), and "I don't know" is a valid answer for the kind of problem and the urgency.

<table>
  <tr>
    <td><img src="img/requests-phone.png" alt="Open requests of a staff member" width="260"></td>
    <td><img src="img/showcase/requests-all-phone.png" alt="All requests of a staff member" width="260"></td>
    <td><img src="img/showcase/request-new-phone.png" alt="New request form" width="260"></td>
  </tr>
</table>

**Following a request.** Its progress, the next step, the details, the history (received, approved, work started, on hold…) and a conversation with the maintenance team. A requester can withdraw a request until work starts.

<table>
  <tr>
    <td><img src="img/request-phone.png" alt="Progress of a request" width="260"></td>
    <td><img src="img/showcase/request-conversation-phone.png" alt="History and comments of a request" width="260"></td>
  </tr>
</table>

**Review by a supervisor.** Every request is reviewed first: approve it and assign someone (with type, priority, trade and due date), or reject it with a reason the requester will read.

![Staff request waiting for review](img/showcase/review-request.png)

**Waiting for a reply.** When the requester wrote last, the work order says so, and the "Waiting for a reply" filter and dashboard tile collect these requests.

![Request whose requester is waiting for a reply](img/showcase/request-conversation.png)

## 8. Preventive maintenance

**Year planner.** Every maintenance plan over 52 weeks, grouped by site, area or trade. Each chip is a visit with its hours (planned, work order created, skipped, regulatory, contractor, moved); the load strip compares each week's hours with the team's capacity, by trade. Visits are dragged to another week, with undo and redo.

![Year planner](img/year-planner.png)

**A plan and its visit.** Clicking a visit opens its plan: the visit's status and work order, the series that can be moved from its first visit, and the plan itself (asset, place, hours, frequency). Work orders are created by themselves a few weeks ahead.

![Plan panel with a visit](img/showcase/plan.png)

**Blocked weeks.** Weeks to avoid, for every site or one (a year-end closure, a data center change freeze). The planner marks them and warns about visits planned there.

![Blocked weeks panel](img/showcase/blocked-weeks.png)

**Smoother plan.** The balancing assistant proposes moves that lower the peaks, each within its plan's tolerance and season, never into a blocked week, and regulatory visits only earlier. The figures show the effect before anything is saved; the supervisor ticks the moves to accept.

![Suggested moves to balance the year](img/showcase/suggestions.png)

**Week scheduler.** The work orders to schedule (the tray) on one side, the team's days on the other, with hours booked against each day's capacity. A work order is dropped on a person's day; travel, preparation and other time can be added.

![Week scheduler](img/week-scheduler.png)

**Scheduling a work order.** Its estimate, what is already booked and what is left, split into blocks of at most 3 h 30 over the person's days.

![Panel scheduling a work order](img/showcase/schedule-work-order.png)

**My week, on a phone.** Each technician's days and blocks, with the place and notes ("Keys at reception"), readable offline.

<table>
  <tr>
    <td><img src="img/my-week-phone.png" alt="My week on a phone" width="260"></td>
  </tr>
</table>

## 9. Places

**Location tree.** One tree per site: buildings, floors, rooms, and any other level an administrator defines. Assets, work orders and plans point to a place, shown as its path ("Tower B › L8"); lists can filter on a place and everything below it.

![Tree of places](img/showcase/places.png)

**A place.** Its name, optional code (used in asset codes) and whether it is in use; "Add a place inside" grows the tree.

![Panel of a site](img/showcase/place.png)

**Level types.** The kinds of places, which ones staff may pick in a request, and their token for asset code patterns.

![Level types](img/showcase/level-types.png)

## 10. Administration

**Audit log.** Every change of every record, with who, when, and the values before and after; a filter per kind of record.

![Audit log](img/showcase/audit-log.png)

**Users.** Accounts are created and deactivated, never deleted. Role, site, specialty, auto-save (power user mode: changes saved when leaving a record) and a new password are set here.

![User administration with a user's panel](img/showcase/users.png)

**Suggestions.** The ideas sent with "Suggest an improvement", with who sent them, from which page and screen width, and a status (new, planned, done, declined).

![Suggestions inbox](img/showcase/feedback-inbox.png)

**Planning settings.** The corrective reserve kept free each week, the daily capacity, how far ahead preventive work orders are created and the longest block, with the capacity they give for the year.

![Planning settings](img/showcase/planning-settings.png)

**Dashboard widgets.** Widgets still in development, or not working, can be switched off for supervisors.

![Dashboard widget settings](img/showcase/widget-settings.png)

## 11. On a phone

Technicians work from their phone: the same pages in one column. The work order list becomes cards with the status, priority and due date; filters fold into one button; a record takes the whole screen with a "Back to list" button; the menu slides in from the left.

<table>
  <tr>
    <td><img src="img/showcase/work-orders-phone.png" alt="Work orders as cards on a phone" width="260"></td>
    <td><img src="img/showcase/work-order-phone.png" alt="A work order on a phone" width="260"></td>
    <td><img src="img/showcase/menu-phone.png" alt="Menu open on a phone" width="260"></td>
  </tr>
</table>
