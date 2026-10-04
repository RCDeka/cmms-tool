# Spécification MVP GMAO — Document de référence pour Computer (Perplexity)

## Contexte et objectif

Tu vas construire un MVP d'application GMAO (Gestion de Maintenance Assistée par Ordinateur) orientée **expérience utilisateur avancée**, destinée à un contexte de **Corporate Real Estate bancaire** (parc immobilier : sièges, agences, data centers).

Ce MVP est la première brique d'une vision produit plus large. Il doit :
- Démontrer une navigation ultra-fluide sur les bases de données métier (équipements, bons de travaux)
- Implémenter une architecture locale-first avec pré-chargement intelligent côté client (IndexedDB)
- Poser les bases d'une évolution vers IA, Digital Twin, et interface adaptative

---

## Stack technique retenue

| Composant | Choix |
|---|---|
| Hébergement | VPS (Linux) |
| Base de données serveur | SQLite |
| Backend | À définir (Python/Flask ou Node/Express recommandé — léger, adapté à SQLite) |
| Frontend | HTML5 + CSS3 + JavaScript vanilla (ES6+) |
| Stockage côté client | IndexedDB (via wrapper `idb` ou Dexie.js) |
| Graphiques | Chart.js (MIT) |
| Serveur web | Nginx (reverse proxy devant le backend) |

Pas de framework JS front (React, Vue, etc.) pour le MVP. Vanilla JS uniquement.

---

## Architecture générale

### Côté serveur
- Sert les pages HTML (shell)
- Expose des API REST JSON (pas de rendu HTML côté serveur pour les vues GMAO)
- Base SQLite avec données mock pré-remplies (voir ci-dessous)

### Côté client
- Page HTML shell légère
- JavaScript vanilla qui :
  - synchronise les données serveur → IndexedDB local
  - gère tout le rendu de l'interface (tableau, fiches)
  - pré-charge intelligemment les pages et fiches
  - bascule l'affichage (tableau ↔ fiche) sans rechargement serveur

### Principe fondamental : Offline-First avec revalidation silencieuse
- IndexedDB est le **cache primaire** pour la navigation
- Le serveur est la **source de vérité**
- Une revalidation silencieuse (stale-while-revalidate) tourne en arrière-plan
- Si le serveur est injoignable → l'appli reste utilisable avec les données locales
- Pas de traitement IA en offline. Les features IA nécessitent une connexion.

---

## Structure de la base de données (SQLite)

### Table `equipements`
```sql
CREATE TABLE equipements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,           -- ex: "EQ-0001"
  libelle TEXT NOT NULL,        -- ex: "Ventilo-convecteur Étage 3"
  site TEXT NOT NULL,           -- ex: "Agence Lyon Part-Dieu"
  batiment TEXT,                -- ex: "Bâtiment A"
  etage TEXT,                   -- ex: "R+3"
  famille TEXT NOT NULL,        -- CVC / Électricité / SSI / Plomberie / VDI / Sécurité
  sous_famille TEXT,
  criticite TEXT NOT NULL,      -- Faible / Moyenne / Haute / Critique
  statut TEXT NOT NULL,         -- En service / En panne / En maintenance / Hors service
  marque TEXT,
  modele TEXT,
  numero_serie TEXT,
  date_mise_en_service DATE,
  date_derniere_revision DATE,
  fournisseur TEXT,
  contrat_maintenance TEXT,     -- Oui / Non
  technicien_responsable TEXT,
  localisation_precise TEXT,
  commentaire TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table `bons_travaux`
```sql
CREATE TABLE bons_travaux (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL,          -- ex: "BT-2026-00001"
  type TEXT NOT NULL,            -- Correctif / Préventif / Amélioration / Réglementaire
  statut TEXT NOT NULL,          -- Ouvert / En cours / En attente / Clôturé / Annulé
  priorite TEXT NOT NULL,        -- Basse / Normale / Haute / Urgente
  titre TEXT NOT NULL,
  description TEXT,
  equipement_id INTEGER REFERENCES equipements(id),
  site TEXT NOT NULL,
  domaine_technique TEXT,        -- CVC / Électricité / SSI / etc.
  technicien_assigne TEXT,
  superviseur TEXT,
  date_creation DATE NOT NULL,
  date_souhaitee DATE,
  date_debut DATE,
  date_cloture DATE,
  duree_estimee_h REAL,
  duree_reelle_h REAL,
  compte_rendu TEXT,
  version INTEGER DEFAULT 1,     -- Pour la gestion des conflits (optimistic concurrency)
  conflit BOOLEAN DEFAULT FALSE, -- TRUE si conflit non résolu
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  login TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL,            -- operateur / superviseur / admin
  site TEXT,
  domaine_technique TEXT,
  power_user BOOLEAN DEFAULT FALSE  -- Active l'auto-save à la sortie de page
);
```

### Données mock à générer au démarrage
- 500 équipements (répartis sur 5 sites fictifs, plusieurs familles techniques)
- 200 bons de travaux (répartis sur les 30 derniers jours, différents statuts/types)
- 5 utilisateurs (1 admin, 2 superviseurs, 2 opérateurs)

---

## APIs REST à implémenter côté serveur

### Équipements
```
GET  /api/equipements?page=N&size=50&sort=code&order=asc
     → { total: 500, page: 1, pages: 10, items: [...50 équipements...] }

GET  /api/equipements/:id
     → { ...équipement complet... }

PUT  /api/equipements/:id
     Body: { ...champs modifiés..., version: N }
     → 200 OK { updated: true, version: N+1 }
     → 409 CONFLICT { conflict: true, serverVersion: { ... }, clientVersion: { ... } }

GET  /api/equipements/search?q=texte&site=X&famille=Y
     → { items: [...résultats...] }
```

### Bons de travaux
```
GET  /api/bons_travaux?page=N&size=50&sort=date_creation&order=desc
     → { total: 200, page: 1, pages: 4, items: [...50 BT...] }

GET  /api/bons_travaux/:id
     → { ...BT complet + équipement lié... }

PUT  /api/bons_travaux/:id
     Body: { ...champs modifiés..., version: N }
     → 200 OK { updated: true, version: N+1 }
     → 409 CONFLICT { conflict: true, serverVersion: { ... }, clientVersion: { ... } }

GET  /api/bons_travaux/stats?periode=30
     → { par_domaine: [{domaine: "CVC", count: 42}, ...], par_statut: [...], par_type: [...] }
```

### Authentification (simple pour le MVP)
```
POST /api/auth/login
     Body: { login, password }
     → { token: "...", user: { id, nom, prenom, role, power_user } }

POST /api/auth/logout
```

---

## Structure de fichiers front-end

```
/frontend/
  index.html              ← Shell HTML (structure sans contenu)
  /assets/
    /css/
      base.css            ← Reset + variables CSS + tokens design
      layout.css          ← CSS Grid global (sidebar + main + split view)
      table.css           ← Styles du tableau et pagination
      fiche.css           ← Styles de la fiche détaillée
      components.css      ← Boutons, badges, états (conflit, statut, priorité)
    /js/
      db.js               ← Gestion IndexedDB (open, CRUD, éviction)
      sync.js             ← Synchronisation serveur → IndexedDB (revalidation)
      preload.js          ← Pré-chargement des pages et fiches adjacentes
      table.js            ← Rendu et interactions du tableau paginé
      fiche.js            ← Rendu et interactions de la fiche
      router.js           ← Gestion history.pushState / popstate
      conflicts.js        ← Détection et affichage des conflits
      auth.js             ← Gestion session utilisateur
      app.js              ← Point d'entrée, init, orchestration
```

---

## Layout général (CSS Grid)

```
┌─────────────────────────────────────────────────────┐
│  <body> display: grid, 100dvh                       │
│  ┌───────────┬─────────────────────────────────────┐│
│  │  #sidebar │  #main-content                      ││
│  │  250px    │  display: grid                      ││
│  │  fixe     │  ┌──────────────┬────────────────┐  ││
│  │  vertical │  │ #table-cont  │ #fiche-cont    │  ││
│  │           │  │ (1fr)        │ (1fr)          │  ││
│  │           │  │              │ .hidden par    │  ││
│  │           │  │              │  défaut        │  ││
│  │           │  └──────────────┴────────────────┘  ││
│  └───────────┴─────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘

Mode par défaut : #main-content grid-template-columns: 1fr
Mode split (fiche ouverte) : #main-content.split-view grid-template-columns: 1fr 1fr

Mobile (<768px) :
  - sidebar masquée (menu burger)
  - split-view : tableau masqué, fiche plein écran
```

---

## Module IndexedDB (db.js)

### Object stores
- `eq_pages` : pages d'équipements, clé = `pageKey` (ex: "eq-page-3")
- `eq_fiches` : fiches équipements, clé = `id`
- `bt_pages` : pages de bons de travaux, clé = `pageKey`
- `bt_fiches` : fiches BT, clé = `id`
- `config` : configuration user (page courante, préférences, etc.)

### API fournie
```javascript
DB.init()                          // Ouvre / crée la base
DB.savePage(store, key, data)      // Sauvegarde une page
DB.getPage(store, key)             // Récupère une page
DB.saveFiche(store, id, data)      // Sauvegarde une fiche
DB.getFiche(store, id)             // Récupère une fiche
DB.evict(store, keepKeys)          // Purge les clés absentes de keepKeys
DB.getConfig(key)
DB.setConfig(key, value)
```

---

## Pré-chargement (preload.js)

### Stratégie
Quand l'utilisateur est sur la page N :
- Pré-charger et stocker en IndexedDB : pages N-1, N+1, page 1, dernière page
- Pré-charger les fiches de chaque ligne de la page courante

### Implémentation
```javascript
async function prefetchPages(currentPage, totalPages, entityType) {
  const pagesToLoad = new Set([1, currentPage-1, currentPage+1, totalPages].filter(p => p >= 1 && p <= totalPages));
  pagesToLoad.delete(currentPage); // déjà chargée
  for (const page of pagesToLoad) {
    const cached = await DB.getPage(`${entityType}_pages`, `${entityType}-page-${page}`);
    if (!cached) {
      const data = await fetch(`/api/${entityType}?page=${page}&size=50`).then(r => r.json());
      await DB.savePage(`${entityType}_pages`, `${entityType}-page-${page}`, data);
    }
  }
  await DB.evict(`${entityType}_pages`, [...pagesToLoad].map(p => `${entityType}-page-${p}`));
}

async function prefetchFiches(rows, entityType) {
  for (const row of rows) {
    const cached = await DB.getFiche(`${entityType}_fiches`, row.id);
    if (!cached) {
      const fiche = await fetch(`/api/${entityType}/${row.id}`).then(r => r.json());
      await DB.saveFiche(`${entityType}_fiches`, row.id, fiche);
    }
  }
}
```

### Revalidation silencieuse
- Quand l'utilisateur arrive sur une page déjà en cache, afficher immédiatement les données locales
- Puis revalider en arrière-plan : `fetch` → comparer `updated_at` → mettre à jour si plus récent
- Si mise à jour détectée sur une fiche actuellement affichée : indicateur visuel discret (badge "Mise à jour disponible")

---

## Rendu du tableau (table.js)

### Pagination
- 50 lignes par page
- Contrôles : ◀◀ Première / ◀ Précédente / Page X / Y / ▶ Suivante / ▶▶ Dernière

### Structure d'une ligne de tableau (équipements)
```html
<tr data-id="123" class="table-row">
  <td>EQ-0123</td>
  <td>Ventilo-convecteur R+3</td>
  <td>Agence Lyon</td>
  <td><span class="badge badge-famille-cvc">CVC</span></td>
  <td><span class="badge badge-criticite-haute">Haute</span></td>
  <td><span class="badge badge-statut-en-service">En service</span></td>
</tr>
```

### Comportement au clic
1. Récupérer l'id depuis `dataset.id`
2. `DB.getFiche('eq_fiches', id)` → si trouvé, afficher immédiatement
3. Sinon, `fetch('/api/equipements/' + id)` puis afficher
4. `#main-content.classList.add('split-view')`
5. `#fiche-container.classList.remove('hidden')`

### Indicateurs visuels
- Fond de ligne différent si `conflit === true` : couleur d'alerte douce (orange/amber)
- Fond de ligne différent si statut "En panne" : indicateur rouge discret
- Ligne sélectionnée : surlignage accent primaire

---

## Rendu de la fiche (fiche.js)

### Génération dynamique (pas de champs câblés en dur)
```javascript
const fieldLabels = {
  code: "Code équipement",
  libelle: "Libellé",
  site: "Site",
  batiment: "Bâtiment",
  etage: "Étage",
  famille: "Famille technique",
  criticite: "Criticité",
  statut: "Statut",
  // ... tous les champs
};

const fieldsToDisplay = ['code', 'libelle', 'site', 'batiment', 'etage', 'famille',
  'sous_famille', 'criticite', 'statut', 'marque', 'modele', 'numero_serie',
  'date_mise_en_service', 'date_derniere_revision', 'fournisseur',
  'contrat_maintenance', 'technicien_responsable', 'localisation_precise', 'commentaire'];

function renderFiche(data) {
  let html = `<div class="fiche-header"><h2>${data.code} — ${data.libelle}</h2>
    <button id="btn-close-fiche" aria-label="Fermer la fiche">✕</button></div>
    <dl class="fiche-fields">`;
  for (const key of fieldsToDisplay) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      html += `<dt>${fieldLabels[key] || key}</dt><dd>${data[key]}</dd>`;
    }
  }
  html += `</dl>`;
  // Si conflit, ajouter le bloc d'alerte conflit
  if (data.conflit) html += renderConflictBanner(data);
  return html;
}
```

### Fermeture de la fiche
- Bouton ✕ en haut à droite
- `history.pushState` pour gestion du bouton navigateur
- Retirer `.split-view`, masquer `#fiche-container`

---

## Gestion des conflits (conflicts.js)

### Principe
Quand deux utilisateurs modifient la même fiche simultanément :

1. **Détection** : le serveur compare le `version` envoyé par le client avec le `version` actuel en base. Si différent → HTTP 409 avec les deux versions.

2. **Stockage** : les deux versions sont conservées en base (colonne `conflit = TRUE`).

3. **Signalétique** :
   - Fond de la ligne dans le tableau : couleur ambre/orange douce (ex: `--color-warning-highlight`)
   - Badge "⚠ Conflit" visible dans la fiche
   - Console superviseur : liste des fiches en conflit avec timestamp des deux modifications

4. **Arbitrage** (console superviseur) :
   - Affiche côte à côte les deux versions
   - Met en surbrillance les champs divergents
   - Boutons "Valider version A" / "Valider version B" / "Merger manuellement"
   - Timestamp de chaque version affiché

5. **Résolution** :
   - Superviseur valide → `PUT /api/[entity]/:id/resolve-conflict` → `conflit = FALSE`, `version` incrémenté

### Accessibilité
⚠ Ne pas transmettre l'information de conflit uniquement par la couleur.
Toujours combiner : couleur de fond + icône + badge textuel "Conflit".

---

## Modes de sauvegarde

### Mode Standard (opérateurs)
- Les modifications sont stockées localement (IndexedDB + dirty flag)
- Bouton "Sauvegarder" explicite → `PUT /api/[entity]/:id`
- Si fermeture avec modifications non sauvegardées → alert "Modifications non sauvegardées"
- Draft auto toutes les 60s en IndexedDB (récupérable à la prochaine session)

### Mode Power User (superviseurs + admins)
- Auto-save à chaque sortie de fiche
- Déclencheur : `beforeunload` de la section fiche + navigation vers autre fiche
- Si hors ligne au moment du save → mise en file d'attente (queue IndexedDB) avec retry au retour réseau
- Indicateur visuel "En attente de synchronisation" si queue non vide

---

## Router client (router.js)

### URLs
```
/equipements          → vue tableau équipements, page 1
/equipements?page=3   → vue tableau équipements, page 3
/equipements/123      → vue fiche équipement id 123
/bons-travaux         → vue tableau bons de travaux
/bons-travaux/456     → vue fiche BT id 456
/dashboard            → page d'accueil avec graphiques
```

### Comportement
- `history.pushState` à chaque navigation
- `popstate` pour gérer le bouton Précédent du navigateur
- Au chargement → parser l'URL et afficher la bonne vue

---

## Page d'accueil / Dashboard (/dashboard)

### Blocs prévus
1. **KPIs en tuiles** :
   - BT ouverts / En cours / Clôturés ce mois
   - Équipements en panne actuellement
   - BT en retard (date souhaitée dépassée)
   - Conflits en attente d'arbitrage (si superviseur/admin)

2. **Graphique "BT par domaine technique — 30 derniers jours"**
   - Bar chart horizontal (Chart.js)
   - Données depuis `/api/bons_travaux/stats?periode=30`

3. **"Dernières activités"** (liste des 5 derniers BT modifiés)

4. **Tuile "Mes interventions du jour"** (BT assignés au user connecté, non clôturés)

---

## Fonctionnalité IA (online uniquement, future)

### Principe
- Disponible uniquement si `navigator.onLine === true` et serveur joignable
- Tous les boutons IA portent la classe `.ai-only` → désactivés automatiquement hors ligne
- Le traitement se fait 100% côté serveur

### Endpoints prévus (à implémenter dans une phase suivante)
```
POST /api/assistant/cr-format
     Body: { texte_brut, contexte: { site, equipement_id, technicien } }
     → { cr_formate: "...", code_eq: "...", date: "...", type: "..." }

POST /api/assistant/find-bt
     Body: { texte, code_eq, date, site }
     → { bt_candidates: [{ id, score, resume }, ...] }
```

### UI côté client
- Zone "Assistant IA" dans la fiche
- Textarea pour saisir le texte brut du CR
- Bouton "Mettre en forme" (`.ai-only`)
- Bouton "Trouver le BT correspondant" (`.ai-only`)
- Résultats affichés directement dans les champs de la fiche

---

## Exigences non-fonctionnelles

### Performance
- Première navigation tableau → fiche : < 20ms (données en IndexedDB)
- Chargement initial de la page : < 2s
- IndexedDB ne stocke que les 5 pages actives (éviction automatique des autres)

### Dégradé offline
- Tableau et fiches restent consultables (données en cache)
- Modifications enregistrées localement, synchronisées au retour du réseau
- Message clair "Mode hors ligne — données locales" dans la barre de statut

### Sécurité (minimum MVP)
- Authentification par token JWT (simple)
- Les endpoints API vérifient le token
- HTTPS obligatoire (certificat Let's Encrypt sur le VPS)
- Pas de données sensibles dans IndexedDB (pour ce prototype)

### Accessibilité
- Semantic HTML (`<main>`, `<nav>`, `<table>`, `<th scope="col">`, etc.)
- Indicateurs de conflit : couleur + icône + texte (jamais couleur seule)
- Touch targets ≥ 44x44px
- Navigation clavier complète
- Labels ARIA sur les boutons icônes

---

## Ce qu'il reste à préciser

Avant de coder le MVP, les points suivants doivent être décidés :

1. **Backend** : Python/Flask ou Node/Express ?
2. **Authentification** : Simple token maison ou JWT avec lib ?
3. **Design système** : Couleurs, typographie, identité visuelle de l'application ?
4. **Entité principale du MVP** : Équipements seuls, BT seuls, ou les deux ?
5. **Données mock** : Les 500 équipements et 200 BT peuvent-ils être entièrement fictifs (noms de sites, équipes, etc.) ?
6. **Nom de l'application** : Pour le logo SVG et les titres ?
7. **Nombre d'utilisateurs simultanés à viser** : Impacte les choix de concurrence SQLite.

---

## Résumé de la vision produit (pour contexte)

Ce MVP est la brique 1 d'une GMAO pensée pour innover dans le secteur. Les briques suivantes prévues sont :

- **Tuiles adaptatives** : page d'accueil personnalisée par IA selon profil, historique, contexte
- **Copilote IA** : assistant conversationnel contextuel dans la fiche (RAG sur documentation technique)
- **Création de BT en langage naturel** (NLP + extraction de champs)
- **Knowledge Graph** des équipements et chaînes de causalité
- **Intégration IoT** : création automatique de BT sur dépassement de seuils capteurs
- **Interface vocale** mains-libres pour les techniciens sur site
- **Digital Twin BIM** : navigation dans la maquette 3D plutôt que dans un tableau

