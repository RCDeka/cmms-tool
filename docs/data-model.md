# Data Model

Database: **SQLite** (one file, path from `DATABASE_PATH`), accessed with `better-sqlite3`. Schema changes are plain numbered SQL files in `backend/src/db/migrations/` (`001_init.sql`, `002_...sql`), applied in order by a small runner that records them in `schema_migrations`.

Connection pragmas, set on every open: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, `synchronous = NORMAL`.

Conventions:
- Primary keys: `INTEGER PRIMARY KEY AUTOINCREMENT`.
- Datetimes (`*_at`): `TEXT`, ISO 8601 UTC with milliseconds (`2026-10-04T08:15:30.123Z`), set by the application. Dates (`date_*`): `TEXT` `YYYY-MM-DD`.
- Booleans: `INTEGER` 0/1 in the database, `true`/`false` in JSON.
- Names of tables, columns and enum values follow the product brief (French, `snake_case`); see decision D16.
- Columns added to the brief are marked **(added)** with the decision ID in `docs/decisions.md`.

## Entity overview

```
users 1───* bons_travaux (technicien_assigne_id)
users 1───* bons_travaux (superviseur_id)
users 1───* equipements / bons_travaux (updated_by)
equipements 1───* bons_travaux (equipement_id, optional)
equipements / bons_travaux 1───* conflits (entity_type + entity_id)
```

## Enumerated values

| Name | Values |
|---|---|
| Role | `operateur`, `superviseur`, `admin` |
| Famille / domaine technique | `CVC`, `Électricité`, `SSI`, `Plomberie`, `VDI`, `Sécurité` |
| Criticité | `Faible`, `Moyenne`, `Haute`, `Critique` |
| Statut équipement | `En service`, `En panne`, `En maintenance`, `Hors service` |
| Contrat maintenance | `Oui`, `Non` |
| Type BT | `Correctif`, `Préventif`, `Amélioration`, `Réglementaire` |
| Statut BT | `Ouvert`, `En cours`, `En attente`, `Clôturé`, `Annulé` |
| Priorité BT | `Basse`, `Normale`, `Haute`, `Urgente` |
| Statut conflit | `ouvert`, `resolu` |

- Terminal BT statuses: `Clôturé`, `Annulé`. Non-terminal: `Ouvert`, `En cours`, `En attente`.
- The values are defined once per side: `backend/src/rules/enums.js` and `frontend/assets/js/enums.js`. Both must match this table.
- In the database, every enumerated column has a `CHECK (col IN (...))` constraint (D6).

## Tables

### users
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| nom | TEXT | no | | |
| prenom | TEXT | no | | |
| login | TEXT | no | UNIQUE (stored lowercase) | |
| password_hash | TEXT | no | | argon2 **(added, D1)** |
| role | TEXT | no | CHECK Role | |
| site | TEXT | yes | | |
| domaine_technique | TEXT | yes | CHECK Famille | |
| power_user | INTEGER | no | default 0 | enables auto-save mode (D21) |
| created_at / updated_at | TEXT | no | default now | **(added)** |

### equipements
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| code | TEXT | no | UNIQUE | e.g. `EQ-0001`; immutable |
| libelle | TEXT | no | | |
| site | TEXT | no | | |
| batiment | TEXT | yes | | |
| etage | TEXT | yes | | e.g. `R+3` |
| famille | TEXT | no | CHECK Famille | |
| sous_famille | TEXT | yes | | |
| criticite | TEXT | no | CHECK Criticité | |
| statut | TEXT | no | CHECK Statut équipement | |
| marque | TEXT | yes | | |
| modele | TEXT | yes | | |
| numero_serie | TEXT | yes | | |
| date_mise_en_service | TEXT | yes | | date |
| date_derniere_revision | TEXT | yes | | date |
| fournisseur | TEXT | yes | | |
| contrat_maintenance | TEXT | yes | CHECK Contrat | |
| technicien_responsable | TEXT | yes | | free text (D5) |
| localisation_precise | TEXT | yes | | |
| commentaire | TEXT | yes | | |
| version | INTEGER | no | default 1 | optimistic concurrency **(added, D2)** |
| conflit | INTEGER | no | default 0 | 1 while a conflict is open **(added, D2)** |
| updated_by | INTEGER | yes | FK → users.id | last writer **(added, D2)** |
| created_at / updated_at | TEXT | no | default now | |

Indexes: `code` (unique), `site`, `famille`, `statut`, `updated_at`.

### bons_travaux
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| numero | TEXT | no | UNIQUE | e.g. `BT-2026-00001`; immutable |
| type | TEXT | no | CHECK Type BT | |
| statut | TEXT | no | CHECK Statut BT | |
| priorite | TEXT | no | CHECK Priorité BT | |
| titre | TEXT | no | | |
| description | TEXT | yes | | |
| equipement_id | INTEGER | yes | FK → equipements.id | optional (brief) |
| site | TEXT | no | | equals the équipement's site when `equipement_id` is set |
| domaine_technique | TEXT | yes | CHECK Famille | |
| technicien_assigne_id | INTEGER | yes | FK → users.id | replaces `technicien_assigne` (D5) |
| superviseur_id | INTEGER | yes | FK → users.id | replaces `superviseur` (D5) |
| date_creation | TEXT | no | | date |
| date_souhaitee | TEXT | yes | | date |
| date_debut | TEXT | yes | | date |
| date_cloture | TEXT | yes | | date |
| duree_estimee_h | REAL | yes | CHECK ≥ 0 | |
| duree_reelle_h | REAL | yes | CHECK ≥ 0 | |
| compte_rendu | TEXT | yes | | |
| version | INTEGER | no | default 1 | |
| conflit | INTEGER | no | default 0 | |
| updated_by | INTEGER | yes | FK → users.id | **(added, D2)** |
| created_at / updated_at | TEXT | no | default now | |

Indexes: `numero` (unique), `statut`, `equipement_id`, `technicien_assigne_id`, `date_creation`, `updated_at`.

### conflits (added, D3)
| Column | Type | Null | Constraints / default | Notes |
|---|---|---|---|---|
| id | INTEGER | no | PK | |
| entity_type | TEXT | no | CHECK IN (`equipements`, `bons_travaux`) | |
| entity_id | INTEGER | no | | id in the entity table |
| base_version | INTEGER | no | | version the client edited from |
| server_version | INTEGER | no | | version in the database when the conflict occurred |
| server_snapshot | TEXT | no | | JSON of the server record at that time ("version A") |
| client_changes | TEXT | no | | JSON of the fields the client tried to change ("version B") |
| server_updated_by | INTEGER | yes | FK → users.id | author of version A |
| server_updated_at | TEXT | no | | timestamp of version A |
| client_user_id | INTEGER | no | FK → users.id | author of version B |
| client_edited_at | TEXT | no | | when the client made the edit (may be earlier than the submission if it was queued offline) |
| statut | TEXT | no | CHECK Statut conflit, default `ouvert` | |
| resolution | TEXT | yes | CHECK IN (`A`, `B`, `merge`) | |
| resolved_by | INTEGER | yes | FK → users.id | |
| resolved_at | TEXT | yes | | |
| created_at | TEXT | no | default now | |

Indexes: unique partial index on (`entity_type`, `entity_id`) `WHERE statut = 'ouvert'` (at most one open conflict per record, D4); `statut`.

### schema_migrations
| Column | Type | Notes |
|---|---|---|
| name | TEXT PK | migration file name |
| applied_at | TEXT | |

## Business rules

### Users and authentication
- BR-U1: `login` is unique and case-insensitive (stored lowercase).
- BR-U2: Passwords are hashed with argon2; minimum length 10.
- BR-U3: Users are created by the seed only in the MVP (no user management screen; see backlog).

### Versioning and conflicts (both entities)
- BR-V1: Every update request carries the `version` the client edited from. A missing `version` is rejected (400).
- BR-V2: If the request's `version` equals the stored `version`: apply the changes, `version = version + 1`, set `updated_at` and `updated_by`, in one transaction.
- BR-V3: If it differs: in one transaction, insert a `conflits` row (version A = current server record, version B = client changes), set the entity's `conflit = 1` and its `updated_at` (but not `version`), and answer 409.
- BR-V4: While `conflit = 1`, every regular update is rejected with 409 and `locked: true` (D4).
- BR-V5: Resolution (supervisor or admin only) applies version A, version B, or a merged set of fields. Then `version = version + 1`, `conflit = 0`, and the `conflits` row is marked `resolu` with `resolution`, `resolved_by` and `resolved_at`, all in one transaction.
- BR-V6: The fields shown as "divergent" in arbitration are those in `client_changes` whose value differs from `server_snapshot`.

### Équipements
- BR-E1: `code` is unique and immutable.
- BR-E2: Fields editable per role are listed in `docs/api-design.md` (permission matrix).

### Bons de travaux
- BR-B1: `numero` is unique and immutable; format `BT-YYYY-NNNNN`.
- BR-B2: If `equipement_id` is set, it must reference an existing équipement, and `site` takes the équipement's site.
- BR-B3: `technicien_assigne_id` must reference a user with role `operateur` or `superviseur`.
- BR-B4: Allowed status transitions (any other is rejected with 422):

| From | To |
|---|---|
| Ouvert | En cours, Annulé |
| En cours | En attente, Clôturé, Annulé |
| En attente | En cours, Annulé |
| Clôturé | (terminal) |
| Annulé | (terminal) |

- BR-B5: Entering `En cours` for the first time sets `date_debut` to today if it is empty.
- BR-B6: Entering `Clôturé` requires a non-empty `compte_rendu` (already stored or sent in the same request) and sets `date_cloture` to today if empty.
- BR-B7: Terminal BT are read-only (except for conflict resolution).
- BR-B8: `date_souhaitee`, if set, is not earlier than `date_creation`. `date_cloture`, if set, is not earlier than `date_debut`.

### KPI definitions (dashboard)
"Today" and "this month" use `APP_TIMEZONE` (D13).
- BT ouverts: `statut = 'Ouvert'`. BT en cours: `statut = 'En cours'`.
- BT clôturés ce mois: `statut = 'Clôturé'` and `date_cloture` in the current calendar month.
- Équipements en panne: `statut = 'En panne'`.
- BT en retard: non-terminal and `date_souhaitee < today`.
- Conflits en attente: `conflits.statut = 'ouvert'` (only for supervisors and admins).
- BT par domaine / statut / type (`stats?periode=N`): BT with `date_creation` within the last N days; BT without `domaine_technique` are counted under `Non renseigné`.
- Dernières activités: the 5 BT with the most recent `updated_at`.
- Mes interventions du jour: non-terminal BT with `technicien_assigne_id` = current user and (`date_souhaitee` ≤ today or empty), sorted by priority (Urgente first) then `date_souhaitee`.

## Seed data (mock)

Generated by `backend/src/db/seed/` with a fixed random seed (the output is the same on every run). All names are fictional (Q5).

- **5 sites**: Siège Paris La Défense, Data Center Saclay, Agence Lyon Part-Dieu, Agence Marseille Prado, Agence Lille Grand Place. Each has buildings, floors and precise locations.
- **5 users**: 1 `admin`, 2 `superviseur`, 2 `operateur`. Logins: `admin`, `superviseur1`, `superviseur2`, `operateur1`, `operateur2`. The password is `SEED_PASSWORD` for all of them. `power_user = 1` for admin and supervisors.
- **500 équipements**, spread across all sites and families, with realistic `sous_famille`, brands and models per family (e.g. CVC → CTA, ventilo-convecteur, groupe froid). About 3–5 % are `En panne`.
- **200 bons de travaux**: `date_creation` spread over the last 30 days, every status, type and priority represented, about 90 % linked to an équipement. Dates and fields follow BR-B4 to BR-B8 (e.g. closed BT have a `compte_rendu` and a `date_cloture`), and some are overdue.
- **0 conflicts** by default. A dev-only option (`npm run db:seed -- --with-conflicts`) creates 3 open conflicts to demonstrate the arbitration console.
