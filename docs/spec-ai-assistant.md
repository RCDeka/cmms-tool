# AI Assistant: Specification

Status: **draft, to be confirmed by the product owner** (2026-10-13; decision D66). Scope: two features of the brief's "AI feature" section, **work report formatting** and **finding the matching work order**, with the guardrails of section 4. Phases 25 and 26 in `docs/roadmap-mvp.md`, **not started**. Phase 25 cannot start before open point 1 (which model provider, and where the data goes) is decided. As each phase is implemented, its endpoints and screens move into `docs/api-design.md`, `docs/architecture.md` and `docs/ui-guidelines.md`, which then prevail over this file.

## 1. Goals

A CMMS is only as good as what people type into it. On site, between two jobs, technicians write short, uneven reports ("fixed, ok"). Sometimes they don't know which work order the job belongs to, so they open a new one. Supervisors then get KPIs built on thin reports and duplicate work orders (repeat failures, bad actors, estimate accuracy, flow and backlog).

The assistant turns what the technician actually writes into the structured data the rest of Tacto uses:

- **Format the report** (section 6): rough text in, a report with fixed headings and the time spent out, ready to save on the work order.
- **Find the work order** (section 7): a description of a job in, the open work orders it most likely belongs to out, so the report goes to the right record instead of a new one.

The assistant **proposes; a person confirms**. It never saves anything: the user applies the proposal to the form and saves it as usual, with the version check (the same pattern as the balancing assistant, D53).

Non-goals in these phases: a conversational copilot, documents and manuals (RAG), work order creation from natural language, cause or failure codes as new columns (section 10), voice input, the assistant on staff requests, any AI feature offline.

## 2. Vocabulary

| Term | Meaning |
|---|---|
| Raw text | What the user typed into the assistant area. Untrusted data, never instructions. |
| Provider | The external or self-hosted language model service called by the server. |
| Proposal | The assistant's answer once it has passed every check: shown to the user, saved nowhere. |
| Candidate set | The work orders the server selects with SQL, before any AI call, among which the model may choose (section 7). |

## 3. Proposed choices (to confirm with the product owner)

| # | Topic | Proposal |
|---|---|---|
| A1 | Who | Technicians, supervisors and administrators. Staff have no access (403), like every maintenance endpoint (D46). |
| A2 | Online only | Server-side processing only. Buttons carry `.ai-only` (disabled offline, brief). Everything else in Tacto works without the assistant. |
| A3 | Feature switch | The assistant exists only when the server has a provider configured (`AI_PROVIDER`). Otherwise the endpoints answer 503 and the assistant area is not shown. |
| A4 | Guardrails | Four layers in a fixed order (section 4): **local input checks**, **maintenance relevance**, **transformation**, **local output checks**. Each layer can stop the request; a stopped request shows nothing from the model. |
| A5 | Relevance check in the same call | Layers 2 and 3 run in **one** model call: its answer starts with the verdict, which the server reads first. If the verdict is "not maintenance", the rest of the answer is thrown away unread. See the rationale in section 4. |
| A6 | Context from the server | The client sends only the raw text and record ids. The server reads the context from the database, and only records the user may read. It never sends user names or e-mail addresses to the provider. |
| A7 | No storage of texts | Tacto does not store the raw text or the model's answer. It logs metadata only (section 8). What is saved is the report the user chose to save. |
| A8 | Report language | The report is written in the language of the raw text; no translation (the UI stays in English, D16). |

## 4. Guardrails

Every request goes through the four layers, in this order. Layer 1 and layer 4 run on the server without AI.

```
raw text ─▶ 1. local input checks ─▶ 2. relevance verdict ─▶ 3. transformation ─▶ 4. local output checks ─▶ proposal ─▶ user confirms
               (no AI, no call)        └──────── one model call ────────┘           (no AI)
```

### Layer 1: local input checks (no AI)

Pure function `rules/assistant-input.js`, run before any call to the provider. A rejected text never reaches the provider.

- BR-AI1: The raw text is normalised: Unicode NFC; control characters (except line breaks and tabs), zero-width and bidirectional formatting characters removed; runs of spaces and of more than two line breaks collapsed; trimmed.
- BR-AI2: After normalisation it must hold **10 to 2 000 characters** and **at least 3 words**. Otherwise 400 with `details.rule: "BR-AI2"` and a message saying what is wrong ("The text is too long: 2 140 characters, 2 000 at most."). The form counts characters as the user types and blocks sending above the limit, but the server check is the one that counts.
- BR-AI3: The user must be allowed to act on the records named in the request (section 6 and 7: 403, 404, 422 as for the ordinary edit). This is checked before any call.
- BR-AI4: Rate limit per user: **30 assistant calls per hour** (`express-rate-limit` keyed by user id, kept in memory). Above: 429. Requests rejected by BR-AI2 or BR-AI3 do not count.

The 2 000-character limit (a report is at most 4 000, `work_report`) limits cost and the room an attacker has, and keeps the answer fast. On its own it does **not** stop prompt injection: "Ignore your instructions and …" fits in 40 characters. That is why layers 2 to 4 exist, and why the assistant is built so that a successful injection has nothing to gain (no tools, no data beyond what the user can already read, nothing saved without the user).

Not chosen: a local list of forbidden phrases ("ignore previous instructions"). It is bypassed by rewording or by another language, and it refuses honest texts.

### Layer 2: maintenance relevance (AI)

- BR-AI5: The model first classifies the raw text as `MAINTENANCE` (it describes work, a fault, an inspection or an asset in the building, as a technician would write it) or `NOT_MAINTENANCE` (anything else: a poem request, a question about something else, instructions to the assistant, text without meaning). The server reads `verdict` before any other field. For `NOT_MAINTENANCE`: 422 with `details.rule: "BR-AI5"` and the message "This doesn't look like a maintenance report. Describe the work done or the fault found." Nothing else from the answer is used or shown.
- The model also uses the context sent by the server (work order title, asset, trade) to judge relevance: "replaced the filter" is relevant on an HVAC work order.

Why one call and not two (A5): a separate classifying call reads the same untrusted text, so it can be fooled in the same way. It would not add protection, but it would double the wait (the technician is on site, on a phone) and the cost. What protects is that the verdict is a required field of a strict schema, checked by the server before anything else. If the product owner prefers two calls, only the provider module changes: the endpoints, rules and UI stay the same.

### Layer 3: transformation (AI)

- BR-AI6: The prompt is fixed in code (`backend/src/assistant/prompts.js`). It contains no user-controlled part except the raw text and the context values, each placed in its own delimited block and described as data to process, never as instructions. The model has **no tools** and no access to anything other than this one message. The answer must be JSON that follows the schema of the endpoint (sections 6 and 7). Low temperature. One call, timeout **15 s** (`AI_TIMEOUT_MS`), no automatic retry.

### Layer 4: local output checks (no AI)

Pure function `rules/assistant-output.js`, run on every answer before the user sees anything.

- BR-AI7: The answer must be valid JSON that matches the endpoint's zod schema: required fields present, no unknown fields, lengths and ranges respected (sections 6 and 7). Otherwise 502 "The assistant gave an unusable answer. Your text is kept; try again or write the report yourself." The answer is not shown.
- BR-AI8: Values the server can check are checked against the database, never trusted: a work order id must belong to the candidate set (section 7); unknown or repeated ids are dropped.
- BR-AI9: The proposal is displayed as text (`textContent`, D12), never as HTML, in the UI and wherever the saved report appears later.
- BR-AI10: Nothing is saved by the assistant. The user applies the proposal to the form ("Use this report"), may edit it, and saves it with the ordinary `PUT /api/work-orders/:id` (version check, field permissions, audit log, BR-W6 unchanged).

### Errors

| Case | Status | Shown to the user |
|---|---|---|
| Text too short or too long (BR-AI2) | 400 | What is wrong, with the count |
| Not allowed / not found / terminal work order (BR-AI3) | 403 / 404 / 422 | As for the ordinary edit |
| Not maintenance (BR-AI5) | 422 | The relevance message |
| Rate limit (BR-AI4) | 429 | "Too many assistant requests. Try again in a few minutes." |
| Unusable answer (BR-AI7) | 502 | The message of BR-AI7 |
| Provider not configured, unreachable or timed out | 503 | "The assistant is not available right now." |

In every case the raw text stays in the textarea.

## 5. Server design

- `backend/src/assistant/provider.js`: one function `complete({ system, input, schema, timeoutMs })` that returns the parsed JSON or throws. One implementation per provider, chosen by `AI_PROVIDER` (`none`, `fake`, and the provider decided in open point 1). `fake` returns preset answers for the tests and counts its calls.
- Environment: `AI_PROVIDER` (default `none`), `AI_API_KEY`, `AI_MODEL`, `AI_TIMEOUT_MS` (default 15000). Documented in `.env.example` and the README.
- `routes/assistant.js` (zod, roles, layer 1 through the rule), `services/assistant.js` (context and candidate set in SQL, provider call, layer 4), pure rules in `rules/assistant-input.js` and `rules/assistant-output.js`.
- `GET /api/reference-data` gains `assistant: boolean` (a provider is configured), so the frontend shows or hides the assistant area (`docs/architecture.md`: area reserved behind a feature flag).
- No migration in Phases 25 and 26.

## 6. Format the report (Phase 25)

### `POST /api/assistant/format-report`

- Roles: TECHNICIAN (work orders assigned to them only, as for `PUT`), SUPERVISOR, ADMIN. STAFF 403.
- Body: `{ "work_order_id": integer, "raw_text": string }` (nothing else).
- Checks before the call: work order exists (404), not terminal (422, BR-W7), technician assigned to it (403), BR-AI2, BR-AI4.
- Context sent to the provider (A6): work order `title`, `description` (first 500 characters), `type`, `category`, `site`, `location`; asset `code`, `name`, `category`. No people.
- Model answer schema: `{ "verdict": "MAINTENANCE" | "NOT_MAINTENANCE", "report": string ≤ 4000, "actual_hours": number | null, "not_mentioned": string[] }`. `actual_hours` is between 0 and 200 in steps of 0.25, and only given when the raw text states the time spent. `not_mentioned` uses only the heading codes below.
- `200 { "report": string, "actual_hours": number | null, "not_mentioned": ["CAUSE", ...] }`.

### Report form

- BR-AF1: The report uses fixed headings, in this order, each on its own line followed by its text: **Findings**, **Cause**, **Work done**, **Parts**, **Follow-up** (codes `FINDINGS`, `CAUSE`, `WORK_DONE`, `PARTS`, `FOLLOW_UP`; labels in English, text in the language of the raw text, A8).
- BR-AF2: A heading that the raw text does not support is left out and listed in `not_mentioned`. The prompt forbids adding facts, part references, measurements or durations that are not in the raw text or the context.
- BR-AF3: Spelling, abbreviations ("chgt", "HS", "RAS") and sentence structure are corrected and expanded; meaning is kept.

### Screen (work order detail panel)

- The "AI assistant" area (reserved in the panel) shows: a textarea "What did you do?" with a character counter (2 000), the button **Format** (`.ai-only`), and, after an answer, the proposal next to the raw text, the proposed time spent, and "Not mentioned: Cause, Parts" so the technician can add what is missing.
- **Use this report** copies the proposal into the work report field (and the time spent into `actual_hours` when given, and only if the user ticks "Use the time spent"). The record becomes dirty, as after typing: the save mode applies (`save-modes.js`). **Discard** clears the proposal and keeps the raw text.
- The area is shown only on non-terminal work orders the user can edit, and only when `assistant` is true in the reference data.

## 7. Find the work order (Phase 26)

### `POST /api/assistant/find-work-order`

- Roles: TECHNICIAN, SUPERVISOR, ADMIN. STAFF 403.
- Body: `{ "raw_text": string, "asset_id"?: integer, "site"?: string }`. `asset_id` must exist (422) and comes with no `site` (BR-W2 logic: 422 if both differ).
- **Candidate set (no AI, BR-AI8):** non-terminal work orders, at most **30**, chosen in this order of priority: the asset's work orders when `asset_id` is given; else the site's; then those matching the raw text in the full-text index (D38); for technicians, those assigned to them first. Each work order appears once. If the set is empty, **no call is made**: `200 { "candidates": [] }`.
- Context per candidate: `id`, `number`, `title`, `description` (first 300 characters), `type`, `status`, `category`, `site`, `location`, asset `code` and `name`, `created_on`, `due_on`, `planned_week`, and `assigned_to_me` (boolean). No people.
- Model answer schema: `{ "verdict": "MAINTENANCE" | "NOT_MAINTENANCE", "matches": [{ "id": integer, "score": number 0–1, "reason": string ≤ 200 }] }`, at most 5.
- Layer 4: ids outside the candidate set or repeated are dropped (BR-AI8); matches with a score below **0.3** are dropped; the rest are sorted by score.
- `200 { "candidates": [{ "work_order": <complete work order record, D7>, "score": number, "reason": string }] }`. The record comes from the database, not from the model; only `reason` comes from the model.

### Screen

- **Find a work order** (`.ai-only`) in the work order list toolbar, and **Find a work order for this asset** in the asset detail panel (with `asset_id`). Both open a dialog: textarea with counter, button **Find**, results as rows (number, title, asset, status, the reason, a match level "Strong" ≥ 0.7, "Possible" otherwise; never the raw score alone).
- **Open** on a result opens the work order in the split view and carries the raw text into its assistant area, ready for **Format** (section 6).
- **None of these: new work order** opens the creation form with the raw text in the description (no AI; the assistant does not fill other fields). Technicians create work orders assigned to themselves, as today (BR-W12).

## 8. Logging and monitoring

- BR-AI11: Each assistant request writes one structured log line: user id, endpoint, input length, layer that stopped it (if any), verdict, outcome (`OK`, `REJECTED_INPUT`, `NOT_MAINTENANCE`, `UNUSABLE`, `UNAVAILABLE`, `RATE_LIMITED`), duration, tokens reported by the provider. **Never the raw text nor the answer** (A7).
- `npm run assistant:eval` (manual, against the configured provider, not part of `npm test`): runs the evaluation set `backend/test/assistant-eval/*.json` (genuine reports in English and French, off-topic texts, injection attempts, texts that try to make the model invent hours or parts) and prints the share of correct verdicts and of reports without invented facts. Run before each change of prompt or model.

## 9. Permissions

| Action | STAFF | TECHNICIAN | SUPERVISOR | ADMIN |
|---|---|---|---|---|
| `POST /assistant/format-report` | no | work orders assigned to them | yes | yes |
| `POST /assistant/find-work-order` | no | yes | yes | yes |

## 10. Later (not in these phases)

Cause and action codes as columns on work orders, filled from the report proposal (would let the bad-actor and repeat-failure widgets say *why* an asset fails; needs a code list agreed with the product owner and a migration); voice dictation; suggested estimates from similar past jobs; triage of staff requests; asset history summary; the copilot with technical documents.

## 11. Phases and acceptance

- **Phase 25: guardrails and report formatting.** Provider module with `none` and `fake` plus the chosen provider, layers 1 to 4, `POST /api/assistant/format-report`, `assistant` in the reference data, the assistant area in the work order panel, logging, the evaluation set. Acceptance: a technician on a work order assigned to them types "pump 2 tripped again, coil of the contactor burnt, swapped from stock, 1h30, check supply voltage next visit"; the proposal shows Findings, Cause, Work done, Parts and Follow-up, and 1.5 h; "Use this report" fills both fields and the save gives a new version; a 2 001-character text is refused at once with the count and the provider is not called (`fake` call count 0); "write me a poem about spring" is refused as not maintenance and no proposal is shown; a malformed answer gives 502 and shows nothing from the model; an answer with an unknown field is refused; the provider timing out gives 503 and the typed text is kept; offline, Format is disabled with its tooltip; without `AI_PROVIDER` the area is hidden and the endpoint answers 503; a technician on someone else's work order gets 403, on a closed one 422; staff get 403; the 31st call in an hour gets 429; the logs hold no raw text.
- **Phase 26: finding the work order.** `POST /api/assistant/find-work-order`, the dialog from the list and the asset panel, Open with the text carried over, "None of these: new work order". Acceptance: with an asset given, only that asset's open work orders are candidates and the expected one comes first (`fake` answer); ids outside the candidate set, repeated ids and scores below 0.3 are dropped; with no open work order on the asset and no text match, the provider is not called and the dialog offers the new work order; the candidates are complete records from the database; Open puts the raw text in the work order's assistant area; staff get 403; offline, both buttons are disabled.

## 12. Open points

1. **Provider and data handling (blocks Phase 25).** Which model provider, where it is hosted, and on what terms (no use of the data for training, retention, EU hosting), or a self-hosted model. To be approved by the bank's security and data protection teams. The data sent is limited to section 6 and 7 contexts (no people), but report texts can mention people or places.
2. Confirm A5 (relevance check in the same call) or ask for a separate classifying call.
3. Confirm A8 (report in the language of the raw text).
4. Limits: 2 000 characters, 30 calls per user per hour, 30 candidates, score threshold 0.3. To adjust after the first weeks of use.
