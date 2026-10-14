# CMMS MVP Specification — Reference document for Computer (Perplexity)

> **Historical document.** This is the original brief of the MVP (phases 0–7, complete). It is kept unchanged as the source of the project's intent; the current scope and contract are in `docs/decisions.md` (D73), `docs/roadmap.md` and the implementation documents.
>
> English translation of the original French brief (`docs/SPEC_MVP_GMAO.md`, kept in git history at commit `4f07659`). Identifiers are translated with the glossary in `docs/decisions.md`. The content is otherwise unchanged: gaps and code samples are kept as written, and their corrections are listed in `docs/decisions.md`.

## Context and objective

You will build an MVP of a CMMS (Computerized Maintenance Management System) application focused on an **advanced user experience**, intended for a **bank's Corporate Real Estate** context (property portfolio: head offices, branches, data centers).

This MVP is the first building block of a broader product vision. It must:
- Demonstrate ultra-smooth navigation through the business databases (assets, work orders)
- Implement a local-first architecture with smart client-side preloading (IndexedDB)
- Lay the foundations for evolving towards AI, Digital Twin and an adaptive interface

---

## Chosen tech stack

| Component | Choice |
|---|---|
| Hosting | VPS (Linux) |
| Server database | SQLite |
| Backend | To be defined (Python/Flask or Node/Express recommended — lightweight, suited to SQLite) |
| Frontend | HTML5 + CSS3 + vanilla JavaScript (ES6+) |
| Client-side storage | IndexedDB (via the `idb` wrapper or Dexie.js) |
| Charts | Chart.js (MIT) |
| Web server | Nginx (reverse proxy in front of the backend) |

No front-end JS framework (React, Vue, etc.) for the MVP. Vanilla JS only.

---

## General architecture

### Server side
- Serves the HTML pages (shell)
- Exposes JSON REST APIs (no server-side HTML rendering for the CMMS views)
- SQLite database with pre-filled mock data (see below)

### Client side
- Lightweight HTML shell page
- Vanilla JavaScript that:
  - synchronizes server data → local IndexedDB
  - handles all interface rendering (table, detail panels)
  - smartly preloads pages and detail records
  - switches the display (table ↔ detail) without a server reload

### Core principle: offline-first with silent revalidation
- IndexedDB is the **primary cache** for navigation
- The server is the **source of truth**
- A silent revalidation (stale-while-revalidate) runs in the background
- If the server is unreachable → the app remains usable with local data
- No AI processing offline. AI features require a connection.

---

## Database structure (SQLite)

### Table `assets`
```sql
CREATE TABLE assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,             -- e.g. "AST-0001"
  name TEXT NOT NULL,             -- e.g. "Fan coil unit, floor 3"
  site TEXT NOT NULL,             -- e.g. "Lyon Part-Dieu Branch"
  building TEXT,                  -- e.g. "Building A"
  floor TEXT,                     -- e.g. "L3"
  category TEXT NOT NULL,         -- HVAC / Electrical / Fire safety / Plumbing / Network cabling / Security
  subcategory TEXT,
  criticality TEXT NOT NULL,      -- Low / Medium / High / Critical
  status TEXT NOT NULL,           -- In service / Broken down / Under maintenance / Out of service
  brand TEXT,
  model TEXT,
  serial_number TEXT,
  commissioned_on DATE,
  last_serviced_on DATE,
  supplier TEXT,
  maintenance_contract TEXT,      -- Yes / No
  responsible_technician TEXT,
  exact_location TEXT,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table `work_orders`
```sql
CREATE TABLE work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL,           -- e.g. "WO-2026-00001"
  type TEXT NOT NULL,             -- Corrective / Preventive / Improvement / Regulatory
  status TEXT NOT NULL,           -- Open / In progress / On hold / Closed / Cancelled
  priority TEXT NOT NULL,         -- Low / Normal / High / Urgent
  title TEXT NOT NULL,
  description TEXT,
  asset_id INTEGER REFERENCES assets(id),
  site TEXT NOT NULL,
  category TEXT,                  -- HVAC / Electrical / Fire safety / etc.
  assignee TEXT,
  supervisor TEXT,
  created_on DATE NOT NULL,
  due_on DATE,
  started_on DATE,
  closed_on DATE,
  estimated_hours REAL,
  actual_hours REAL,
  work_report TEXT,
  version INTEGER DEFAULT 1,      -- For conflict management (optimistic concurrency)
  has_conflict BOOLEAN DEFAULT FALSE, -- TRUE if an unresolved conflict exists
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,             -- technician / supervisor / admin
  site TEXT,
  specialty TEXT,
  power_user BOOLEAN DEFAULT FALSE  -- Enables auto-save when leaving the page
);
```

### Mock data to generate at startup
- 500 assets (spread over 5 fictional sites, several technical categories)
- 200 work orders (spread over the last 30 days, various statuses/types)
- 5 users (1 admin, 2 supervisors, 2 technicians)

---

## REST APIs to implement on the server

### Assets
```
GET  /api/assets?page=N&size=50&sort=code&order=asc
     → { total: 500, page: 1, pages: 10, items: [...50 assets...] }

GET  /api/assets/:id
     → { ...full asset... }

PUT  /api/assets/:id
     Body: { ...changed fields..., version: N }
     → 200 OK { updated: true, version: N+1 }
     → 409 CONFLICT { conflict: true, serverVersion: { ... }, clientVersion: { ... } }

GET  /api/assets/search?q=text&site=X&category=Y
     → { items: [...results...] }
```

### Work orders
```
GET  /api/work-orders?page=N&size=50&sort=created_on&order=desc
     → { total: 200, page: 1, pages: 4, items: [...50 work orders...] }

GET  /api/work-orders/:id
     → { ...full work order + linked asset... }

PUT  /api/work-orders/:id
     Body: { ...changed fields..., version: N }
     → 200 OK { updated: true, version: N+1 }
     → 409 CONFLICT { conflict: true, serverVersion: { ... }, clientVersion: { ... } }

GET  /api/work-orders/stats?period=30
     → { by_category: [{category: "HVAC", count: 42}, ...], by_status: [...], by_type: [...] }
```

### Authentication (simple for the MVP)
```
POST /api/auth/login
     Body: { username, password }
     → { token: "...", user: { id, last_name, first_name, role, power_user } }

POST /api/auth/logout
```

---

## Front-end file structure

```
/frontend/
  index.html              ← HTML shell (structure without content)
  /assets/
    /css/
      base.css            ← Reset + CSS variables + design tokens
      layout.css          ← Global CSS Grid (sidebar + main + split view)
      table.css           ← Table and pagination styles
      detail.css          ← Detail panel styles
      components.css      ← Buttons, badges, states (conflict, status, priority)
    /js/
      db.js               ← IndexedDB management (open, CRUD, eviction)
      sync.js             ← Server → IndexedDB synchronization (revalidation)
      preload.js          ← Preloading of adjacent pages and detail records
      table.js            ← Rendering and interactions of the paginated table
      detail.js           ← Rendering and interactions of the detail panel
      router.js           ← history.pushState / popstate handling
      conflicts.js        ← Conflict detection and display
      auth.js             ← User session management
      app.js              ← Entry point, init, orchestration
```

---

## General layout (CSS Grid)

```
┌─────────────────────────────────────────────────────┐
│  <body> display: grid, 100dvh                       │
│  ┌───────────┬─────────────────────────────────────┐│
│  │  #sidebar │  #main-content                      ││
│  │  250px    │  display: grid                      ││
│  │  fixed    │  ┌──────────────┬────────────────┐  ││
│  │  vertical │  │ #table-cont  │ #detail-cont   │  ││
│  │           │  │ (1fr)        │ (1fr)          │  ││
│  │           │  │              │ .hidden by     │  ││
│  │           │  │              │  default       │  ││
│  │           │  └──────────────┴────────────────┘  ││
│  └───────────┴─────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘

Default mode: #main-content grid-template-columns: 1fr
Split mode (detail open): #main-content.split-view grid-template-columns: 1fr 1fr

Mobile (<768px):
  - sidebar hidden (burger menu)
  - split-view: table hidden, detail panel full screen
```

---

## IndexedDB module (db.js)

### Object stores
- `asset_pages`: asset pages, key = `pageKey` (e.g. "asset-page-3")
- `asset_records`: asset detail records, key = `id`
- `wo_pages`: work order pages, key = `pageKey`
- `wo_records`: work order detail records, key = `id`
- `config`: user configuration (current page, preferences, etc.)

### Provided API
```javascript
DB.init()                          // Opens / creates the database
DB.savePage(store, key, data)      // Saves a page
DB.getPage(store, key)             // Gets a page
DB.saveRecord(store, id, data)     // Saves a detail record
DB.getRecord(store, id)            // Gets a detail record
DB.evict(store, keepKeys)          // Purges the keys missing from keepKeys
DB.getConfig(key)
DB.setConfig(key, value)
```

---

## Preloading (preload.js)

### Strategy
When the user is on page N:
- Preload and store in IndexedDB: pages N-1, N+1, page 1, last page
- Preload the detail record of each row on the current page

### Implementation
```javascript
async function prefetchPages(currentPage, totalPages, entityType) {
  const pagesToLoad = new Set([1, currentPage-1, currentPage+1, totalPages].filter(p => p >= 1 && p <= totalPages));
  pagesToLoad.delete(currentPage); // already loaded
  for (const page of pagesToLoad) {
    const cached = await DB.getPage(`${entityType}_pages`, `${entityType}-page-${page}`);
    if (!cached) {
      const data = await fetch(`/api/${entityType}?page=${page}&size=50`).then(r => r.json());
      await DB.savePage(`${entityType}_pages`, `${entityType}-page-${page}`, data);
    }
  }
  await DB.evict(`${entityType}_pages`, [...pagesToLoad].map(p => `${entityType}-page-${p}`));
}

async function prefetchRecords(rows, entityType) {
  for (const row of rows) {
    const cached = await DB.getRecord(`${entityType}_records`, row.id);
    if (!cached) {
      const record = await fetch(`/api/${entityType}/${row.id}`).then(r => r.json());
      await DB.saveRecord(`${entityType}_records`, row.id, record);
    }
  }
}
```

### Silent revalidation
- When the user arrives on a page that is already cached, display the local data immediately
- Then revalidate in the background: `fetch` → compare `updated_at` → update if more recent
- If an update is detected on a record currently displayed: discreet visual indicator ("Update available" badge)

---

## Table rendering (table.js)

### Pagination
- 50 rows per page
- Controls: ◀◀ First / ◀ Previous / Page X / Y / ▶ Next / ▶▶ Last

### Structure of a table row (assets)
```html
<tr data-id="123" class="table-row">
  <td>AST-0123</td>
  <td>Fan coil unit L3</td>
  <td>Lyon Branch</td>
  <td><span class="badge badge-category-hvac">HVAC</span></td>
  <td><span class="badge badge-criticality-high">High</span></td>
  <td><span class="badge badge-status-in-service">In service</span></td>
</tr>
```

### Click behavior
1. Get the id from `dataset.id`
2. `DB.getRecord('asset_records', id)` → if found, display immediately
3. Otherwise, `fetch('/api/assets/' + id)` then display
4. `#main-content.classList.add('split-view')`
5. `#detail-container.classList.remove('hidden')`

### Visual indicators
- Different row background if `has_conflict === true`: soft alert color (orange/amber)
- Different row background if status is "Broken down": discreet red indicator
- Selected row: primary accent highlight

---

## Detail panel rendering (detail.js)

### Dynamic generation (no hard-wired fields)
```javascript
const fieldLabels = {
  code: "Asset code",
  name: "Name",
  site: "Site",
  building: "Building",
  floor: "Floor",
  category: "Technical category",
  criticality: "Criticality",
  status: "Status",
  // ... all fields
};

const fieldsToDisplay = ['code', 'name', 'site', 'building', 'floor', 'category',
  'subcategory', 'criticality', 'status', 'brand', 'model', 'serial_number',
  'commissioned_on', 'last_serviced_on', 'supplier',
  'maintenance_contract', 'responsible_technician', 'exact_location', 'comment'];

function renderDetail(data) {
  let html = `<div class="detail-header"><h2>${data.code} — ${data.name}</h2>
    <button id="btn-close-detail" aria-label="Close details">✕</button></div>
    <dl class="detail-fields">`;
  for (const key of fieldsToDisplay) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      html += `<dt>${fieldLabels[key] || key}</dt><dd>${data[key]}</dd>`;
    }
  }
  html += `</dl>`;
  // If there is a conflict, add the conflict alert block
  if (data.has_conflict) html += renderConflictBanner(data);
  return html;
}
```

### Closing the detail panel
- ✕ button at the top right
- `history.pushState` to handle the browser back button
- Remove `.split-view`, hide `#detail-container`

---

## Conflict management (conflicts.js)

### Principle
When two users edit the same record at the same time:

1. **Detection**: the server compares the `version` sent by the client with the current `version` in the database. If different → HTTP 409 with both versions.

2. **Storage**: both versions are kept in the database (column `has_conflict = TRUE`).

3. **Signage**:
   - Row background in the table: soft amber/orange color (e.g. `--color-warning-highlight`)
   - "⚠ Conflict" badge visible in the detail panel
   - Supervisor console: list of records in conflict with the timestamp of both edits

4. **Arbitration** (supervisor console):
   - Shows both versions side by side
   - Highlights the divergent fields
   - Buttons "Accept version A" / "Accept version B" / "Merge manually"
   - Timestamp of each version displayed

5. **Resolution**:
   - Supervisor accepts → `PUT /api/[entity]/:id/resolve-conflict` → `has_conflict = FALSE`, `version` incremented

### Accessibility
⚠ Never convey the conflict information through color alone.
Always combine: background color + icon + text badge "Conflict".

---

## Save modes

### Standard mode (technicians)
- Changes are stored locally (IndexedDB + dirty flag)
- Explicit "Save" button → `PUT /api/[entity]/:id`
- If closing with unsaved changes → "Unsaved changes" alert
- Automatic draft every 60 s in IndexedDB (recoverable at the next session)

### Power User mode (supervisors + admins)
- Auto-save each time a detail record is left
- Trigger: `beforeunload` of the detail section + navigation to another record
- If offline at save time → queued (IndexedDB queue) with retry when the network returns
- "Pending sync" visual indicator if the queue is not empty

---

## Client router (router.js)

### URLs
```
/assets               → assets table view, page 1
/assets?page=3        → assets table view, page 3
/assets/123           → asset detail view, id 123
/work-orders          → work orders table view
/work-orders/456      → work order detail view, id 456
/dashboard            → home page with charts
```

### Behavior
- `history.pushState` on every navigation
- `popstate` to handle the browser Back button
- On load → parse the URL and show the right view

---

## Home page / Dashboard (/dashboard)

### Planned blocks
1. **KPI tiles**:
   - Work orders open / in progress / closed this month
   - Assets currently broken down
   - Overdue work orders (due date passed)
   - Conflicts awaiting arbitration (if supervisor/admin)

2. **Chart "Work orders by technical category — last 30 days"**
   - Horizontal bar chart (Chart.js)
   - Data from `/api/work-orders/stats?period=30`

3. **"Recent activity"** (list of the 5 most recently modified work orders)

4. **"My work today" tile** (work orders assigned to the logged-in user, not closed)

---

## AI feature (online only, future)

### Principle
- Available only if `navigator.onLine === true` and the server is reachable
- All AI buttons carry the `.ai-only` class → automatically disabled offline
- Processing happens 100% on the server

### Planned endpoints (to implement in a later phase)
```
POST /api/assistant/format-report
     Body: { raw_text, context: { site, asset_id, technician } }
     → { formatted_report: "...", asset_code: "...", date: "...", type: "..." }

POST /api/assistant/find-work-order
     Body: { text, asset_code, date, site }
     → { candidates: [{ id, score, summary }, ...] }
```

### Client-side UI
- "AI assistant" area in the detail panel
- Textarea to type the raw text of the work report
- "Format" button (`.ai-only`)
- "Find the matching work order" button (`.ai-only`)
- Results shown directly in the detail fields

---

## Non-functional requirements

### Performance
- First table → detail navigation: < 20 ms (data in IndexedDB)
- Initial page load: < 2 s
- IndexedDB stores only the 5 active pages (automatic eviction of the others)

### Offline degradation
- Table and detail records remain viewable (cached data)
- Changes saved locally, synchronized when the network returns
- Clear "Offline mode — local data" message in the status bar

### Security (MVP minimum)
- JWT token authentication (simple)
- API endpoints check the token
- HTTPS mandatory (Let's Encrypt certificate on the VPS)
- No sensitive data in IndexedDB (for this prototype)

### Accessibility
- Semantic HTML (`<main>`, `<nav>`, `<table>`, `<th scope="col">`, etc.)
- Conflict indicators: color + icon + text (never color alone)
- Touch targets ≥ 44x44 px
- Full keyboard navigation
- ARIA labels on icon buttons

---

## Open points

Before coding the MVP, the following points must be decided (answers in `docs/decisions.md`):

1. **Backend**: Python/Flask or Node/Express?
2. **Authentication**: simple home-made token or JWT with a library?
3. **Design system**: colors, typography, visual identity of the application?
4. **Main entity of the MVP**: assets only, work orders only, or both?
5. **Mock data**: can the 500 assets and 200 work orders be entirely fictional (site names, teams, etc.)?
6. **Application name**: for the SVG logo and titles?
7. **Target number of concurrent users**: affects the SQLite concurrency choices.

---

## Product vision summary (for context)

This MVP is building block 1 of a CMMS designed to innovate in the sector. The planned next building blocks are:

- **Adaptive tiles**: home page personalized by AI according to profile, history, context
- **AI copilot**: contextual conversational assistant in the detail panel (RAG on technical documentation)
- **Natural-language work order creation** (NLP + field extraction)
- **Knowledge graph** of assets and causality chains
- **IoT integration**: automatic work order creation when sensor thresholds are exceeded
- **Hands-free voice interface** for technicians on site
- **BIM Digital Twin**: navigation in the 3D model rather than in a table
