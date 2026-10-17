# Roadmap

Phases 0 to 7 built the MVP of the brief; the later phases extend it, and the project is now maintained as a production application (D73). Phases are sequential. Each phase has an objective, tasks and acceptance criteria. A phase starts only when the previous one meets its acceptance criteria. Order of work inside the project: data model, then API, then frontend (see `AGENTS.md`).

This file holds only open work and the backlog. Done phases move, with their tasks and acceptance criteria, to `docs/roadmap-done.md`.

## Done

Phases 0–6 (MVP), 8–24 (post-MVP, preventive maintenance, custom dashboards), 26 (finding the work order), 27–30 (production), 32 (location tree) and 34 (French interface); details in `docs/roadmap-done.md`. Phase 7 is done except the steps that need the VPS (below).

## Phase 7: Hardening and deployment

**Status (2026-10-04):** everything that does not need a server is done and verified: accessibility audit (axe-core, 19 views and states: 0 violations; 44 px targets; reflow at 320 px), performance against the budget on a local server (Fast 4G: 1.2–1.5 s), security pass (D31–D32, dependency audit: 0 vulnerabilities), deployment files (Nginx parsed with crossplane, systemd units verified, exposure score 3.0 "OK"), nightly backups (D33), and the README deployment guide, rehearsed on a fresh clone in production mode. **Waiting for a VPS:** HTTPS deployment, `nginx -t` on the real server, and the load-time measure on the VPS.

**Objective:** the MVP runs over HTTPS on the VPS and meets the brief's non-functional requirements.

Tasks:
- Accessibility pass (keyboard, screen reader on the main flows, 44 px targets, contrast); performance measures against the budget in `docs/architecture.md`.
- Security pass: CSP, rate limit, no hash leaks, `.env` only on the server, dependency audit.
- `deploy/nginx/cmms.conf` (static + `/api` proxy + SPA fallback + caching headers), `deploy/systemd/cmms.service`, Let's Encrypt with certbot, daily SQLite backup (`.backup` with WAL-safe copy), deployment steps in `README.md`.
- Close remaining test gaps; README brought up to date.

Acceptance: HTTPS deployment reachable on the VPS; all tests and lint pass; initial load < 2 s on the VPS; a clean clone deploys by following the README alone.

## Locations and asset codes (D82)

Specified in `docs/spec-locations.md` (confirmed; section 11 holds the full acceptance criteria). Both phases come before the import tools (backlog item 14) and the first deployment to users. Phase 32 is done (D83).

- **Phase 33: asset types and codes.** Managed asset types replacing `subcategory`, the default and per-type code patterns, the code proposal and its server-side computation at creation, the admin recode. Acceptance: see the spec, section 11.

## AI assistant (D66)

Specified in `docs/spec-ai-assistant.md` (draft; section 11 holds the full acceptance criteria). Phase 26 is done first (D67); Phase 25 waits for the provider and data-handling decision (open point 1).

- **Phase 25: report formatting.** The chosen provider, `POST /api/assistant/format-report`, the assistant area in the work order panel, logging without texts, the evaluation set. Acceptance: see the spec, section 11.

## Production (D73)

Work that makes the application safe to run for real users. Phase 31 is done at the first deployment to users; Phases 27 to 30 are done.

- **Phase 31: off-server backup storage and drills** (was backlog item 12, postponed on 2026-10-14; script rehearsed locally and restore steps fixed, D77). Choose the storage (S3-compatible or B2 at another provider than the VPS, or an SFTP server), keep the whole `offsite.env` (repository, keys, restic password) outside the VPS, then run the restore drill and the failure test (`docs/test-protocol.md`, OPS-07 and OPS-09). The copy itself is automated (D72). Acceptance: OPS-07 and OPS-09 pass on the production VPS, and the person who keeps the restic password has restored a copy without help.

## Backlog (not scheduled)

Items keep their numbers; done items are listed in `docs/roadmap-done.md` (1–5, 8–12, 15).

- **6.** Staff requests, next steps: ~~notify the maintenance team of new comments~~ (done: requests waiting for a reply, D80; new requests have their dashboard tile, D47), ~~let a requester cancel their own request~~ (done, D79), ~~room list instead of the free-text location~~ (done, D81), photos.
- **7.** Adaptive home tiles, RAG copilot, natural-language work order creation, knowledge graph, IoT-triggered work orders, voice interface, BIM digital twin (product vision in the brief).
- **13.** End-to-end smoke tests (log in, open and edit a work order, save offline, sync): `AGENTS.md` excludes E2E tests; to decide once real users rely on the app, if a regression reaches production that unit and API tests could not catch.
- **14.** Import tools (product owner request, 2026-10-14): the production database starts empty, so supervisors or admins need a way, from their session, to load data on a large scale: rooms, assets, maintenance plans, users, and so on. To specify: the format (CSV is the obvious candidate; pasting rows into a text area avoids file uploads, a non-goal in `AGENTS.md`, while uploading a file needs that rule changed), validation and a preview with the errors per line before anything is written, all-or-nothing writes, what happens to rows that already exist (skip or update), the order between entities (rooms and users before assets, assets before plans), the audit trail, and the size limits (the JSON body limit is 100 kB).
