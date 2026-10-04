# API Design

Base path: `/api`. Format: JSON (UTF-8). Auth: `Authorization: Bearer <jwt>` on every endpoint except `POST /api/auth/login` and `GET /api/health`.

Endpoints from the product brief are kept as written there. Endpoints marked **(added)** are listed in decision D8.

## Conventions

- IDs: integers. Datetimes: ISO 8601 UTC. Dates: `YYYY-MM-DD`. Booleans: `true`/`false`.
- JSON field names are the database column names (`snake_case`, French; D16).
- Pagination (brief): `page` (default 1), `size` (default 50, max 100). Response: `{ "total", "page", "pages", "items": [...] }`. A `page` above `pages` returns an empty `items` array.
- Sorting: `sort` (whitelisted column, see each endpoint) and `order` (`asc`|`desc`). Any other value → 400.
- List items are **complete records**, identical to the `GET /:id` response (D7).
- Error body (all errors except version conflicts): `{ "statusCode": number, "error": string, "message": string, "details"?: object }`. `details` holds per-field validation errors or the violated business rule (e.g. `{ "rule": "BR-B4" }`).
- Status codes: `400` invalid input, `401` missing/invalid/expired token, `403` role or field not allowed, `404` not found, `409` version conflict or record locked by a conflict, `422` business rule violated (status transition, required field, invalid reference), `429` rate limit.
- Unknown body fields are rejected (400). The input is validated with zod.

## Permission matrix (D23)

| Action | operateur | superviseur | admin |
|---|---|---|---|
| Read équipements, BT, referentiels, dashboard | yes | yes | yes |
| `PUT /equipements/:id` | only `statut`, `commentaire`, `date_derniere_revision` | all editable fields | all editable fields |
| `PUT /bons_travaux/:id` | only BT assigned to them; only `statut`, `date_debut`, `duree_reelle_h`, `compte_rendu` | all editable fields | all editable fields |
| `GET /users` | no | yes | yes |
| Conflict console and resolution | no | yes | yes |

Editable fields:
- **Équipements**: every column except `id`, `code`, `version`, `conflit`, `updated_by`, `created_at`, `updated_at`.
- **BT**: every column except `id`, `numero`, `date_creation`, `version`, `conflit`, `updated_by`, `created_at`, `updated_at`.

Sending a field the role may not edit → 403 with `details.fields`.

## Shared shapes

```
User         { id, nom, prenom, login, role, site, domaine_technique, power_user }
UserRef      { id, nom, prenom }
Equipement   { id, code, libelle, site, batiment, etage, famille, sous_famille, criticite,
               statut, marque, modele, numero_serie, date_mise_en_service,
               date_derniere_revision, fournisseur, contrat_maintenance,
               technicien_responsable, localisation_precise, commentaire,
               version, conflit, updated_by: UserRef|null, created_at, updated_at }
BonTravaux   { id, numero, type, statut, priorite, titre, description,
               equipement_id, equipement: { id, code, libelle, site, statut } | null,
               site, domaine_technique,
               technicien_assigne_id, technicien_assigne: UserRef|null,
               superviseur_id, superviseur: UserRef|null,
               date_creation, date_souhaitee, date_debut, date_cloture,
               duree_estimee_h, duree_reelle_h, compte_rendu,
               version, conflit, updated_by: UserRef|null, created_at, updated_at }
Page<T>      { total, page, pages, items: T[] }
```

`password_hash` is never returned.

---

## Health (added)

### GET /api/health
- Public. `200 { "status": "ok", "time": "<ISO>" }`. The client also uses it to check whether the server can be reached.

## Authentication

### POST /api/auth/login
- Public, rate limited (10 attempts per 15 min per IP).
- Body: `{ "login": string, "password": string }`
- `200 { "token": string, "expires_in": number, "user": { id, nom, prenom, role, power_user } }`
- Errors: 400; 401 invalid credentials; 429.

### POST /api/auth/logout
- `204`. JWTs are stateless: the server keeps no session, and the client deletes its token and local data (D22).

### GET /api/auth/me (added)
- `200 User`. Errors: 401.

## Équipements

### GET /api/equipements
- Query: `page`, `size`, `sort` (`code`|`libelle`|`site`|`famille`|`criticite`|`statut`|`updated_at`, default `code`), `order` (default `asc`).
- `200 Page<Equipement>`

### GET /api/equipements/search
- Query: `q` (matches `code`, `libelle`, `marque`, `modele`, `numero_serie`; case-insensitive), `site?`, `famille?`, `statut?`, `criticite?`, `limit` (default 50, max 200).
- `200 { "items": Equipement[], "total": number }` (`total` = number of matches before `limit`).
- Declared before `/:id` in the router.

### GET /api/equipements/:id
- `200 Equipement`. Errors: 404.

### PUT /api/equipements/:id
- Body: `{ ...changed fields..., "version": number, "edited_at"?: ISO }`. `edited_at` is when the user made the edit (used for queued offline edits); it defaults to now.
- `200 { "updated": true, "version": N+1, "item": Equipement }`
- `409` version mismatch (BR-V3):
  ```
  { "conflict": true, "conflictId": 12,
    "serverVersion": { ...Equipement as stored... },
    "clientVersion": { ...fields sent by the client..., "version": N } }
  ```
- `409` record locked (BR-V4): `{ "conflict": true, "locked": true, "conflictId": 12 }`
- Errors: 400; 403; 404; 422.

### PUT /api/equipements/:id/resolve-conflict
- Roles: superviseur, admin.
- Body: `{ "conflictId": number, "choice": "A" | "B" | "merge", "fields"?: { ... } }`. `fields` is required for `merge` and contains the final value of each divergent field.
- `200 { "resolved": true, "version": N+1, "item": Equipement }`
- Errors: 400; 403; 404 conflict or record not found; 409 conflict already resolved; 422 merged values break a rule.

## Bons de travaux

### GET /api/bons_travaux
- Query: `page`, `size`, `sort` (`numero`|`date_creation`|`date_souhaitee`|`priorite`|`statut`|`updated_at`, default `date_creation`), `order` (default `desc`).
- `200 Page<BonTravaux>`

### GET /api/bons_travaux/stats
- Query: `periode` (days, default 30, max 365).
- `200`:
  ```
  { "periode": 30,
    "par_domaine": [{ "domaine": "CVC", "count": 42 }, ...],
    "par_statut":  [{ "statut": "Ouvert", "count": 18 }, ...],
    "par_type":    [{ "type": "Correctif", "count": 120 }, ...] }
  ```
- Declared before `/:id` in the router.

### GET /api/bons_travaux/:id
- `200 BonTravaux` (with the linked équipement). Errors: 404.

### PUT /api/bons_travaux/:id
- Same contract as `PUT /api/equipements/:id`, plus the BT rules BR-B2 to BR-B8 (422 on violation).

### PUT /api/bons_travaux/:id/resolve-conflict
- Same contract as for équipements.

## Conflicts (added)

### GET /api/conflits
- Roles: superviseur, admin. Query: `statut` (default `ouvert`).
- `200`:
  ```
  { "items": [{ "id", "entity_type", "entity_id", "label": "EQ-0123 — Ventilo-convecteur R+3",
                "server_updated_at", "server_updated_by": UserRef,
                "client_edited_at", "client_user": UserRef, "created_at" }] }
  ```

### GET /api/conflits/:id
- Roles: superviseur, admin.
- `200 { ...list item..., "versionA": { ...server snapshot... }, "versionB": { ...client changes... }, "current": { ...current record... }, "divergent_fields": ["statut", "commentaire"] }`

## Reference data and users (added)

### GET /api/referentiels
- `200 { "sites": string[], "familles": string[], "criticites": [...], "statuts_equipement": [...], "types_bt": [...], "statuts_bt": [...], "priorites_bt": [...] }`. `sites` comes from the data; the other lists are the enums.

### GET /api/users
- Roles: superviseur, admin. Returns the users that can be assigned to a BT (for dropdowns).
- `200 [{ id, nom, prenom, role, site, domaine_technique }]`

## Dashboard (added)

### GET /api/dashboard
- `200`:
  ```
  { "kpis": { "bt_ouverts": 18, "bt_en_cours": 25, "bt_clotures_mois": 40,
              "equipements_en_panne": 21, "bt_en_retard": 9,
              "conflits_en_attente": 2 },
    "dernieres_activites": [BonTravaux x5],
    "mes_interventions": [BonTravaux] }
  ```
- `conflits_en_attente` is present for superviseur and admin only. Definitions: `docs/data-model.md` → KPI definitions.
- The chart uses `GET /api/bons_travaux/stats?periode=30`.

## Future AI endpoints (not in the MVP)

`POST /api/assistant/cr-format` and `POST /api/assistant/find-bt` are described in the brief. They are not implemented. The UI only prepares the `.ai-only` mechanism (see `docs/architecture.md`).

## Endpoint summary

| Area | Endpoints |
|---|---|
| Ops | `GET /api/health` |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Équipements | `GET /api/equipements`, `GET /api/equipements/search`, `GET/PUT /api/equipements/:id`, `PUT /api/equipements/:id/resolve-conflict` |
| BT | `GET /api/bons_travaux`, `GET /api/bons_travaux/stats`, `GET/PUT /api/bons_travaux/:id`, `PUT /api/bons_travaux/:id/resolve-conflict` |
| Conflicts | `GET /api/conflits`, `GET /api/conflits/:id` |
| Reference | `GET /api/referentiels`, `GET /api/users` |
| Dashboard | `GET /api/dashboard` |
