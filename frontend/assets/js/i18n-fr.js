// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// French texts of the interface (D85), keyed by the English text given to t(), tx(), tn() and
// plural() (i18n.js), in the order of the modules that use them. A key may start with a
// context ('count|Closed') when one English text needs two French ones. French typography:
// a no-break space (\u00a0) before : ; ? ! and inside « », so they never start a line.
// Vocabulary of the original French brief (docs/decisions.md → Terminology): équipement,
// bon de travaux, demande d'intervention, domaine technique, compte rendu, criticité.
// test/i18n.test.js checks that every key of the code is here, and nothing else.

export const FR = {
  // index.html
  'Skip to content': 'Aller au contenu',
  'My open requests': 'Mes demandes en cours',
  'All my requests': 'Toutes mes demandes',
  'New request': 'Nouvelle demande',
  Dashboard: 'Tableau de bord',
  Dashboards: 'Tableaux de bord',
  Assets: 'Équipements',
  'Work orders': 'Bons de travaux',
  'Year planner': 'Planning annuel',
  'Week scheduler': 'Planning hebdomadaire',
  'My week': 'Ma semaine',
  Conflicts: 'Conflits',
  'Audit log': "Journal d'audit",
  Places: 'Lieux',
  Users: 'Utilisateurs',
  Suggestions: 'Suggestions',
  'Planning settings': 'Paramètres du planning',
  'Dashboard widgets': 'Indicateurs des tableaux de bord',
  'Change my password': 'Changer mon mot de passe',
  'Log out': 'Se déconnecter',
  'Find a work order': 'Trouver un bon de travaux',
  'Suggest an improvement': 'Suggérer une amélioration',
  'Source code': 'Code source',
  'Main navigation': 'Navigation principale',
  'Open menu': 'Ouvrir le menu',
  Details: 'Détails',
  // layout.js
  'Language of the interface': "Langue de l'interface",
  'Close menu': 'Fermer le menu',
  'Signed in as {first_name} {last_name}': 'Connecté en tant que {first_name} {last_name}',
  '{n} change waiting to sync': '{n} modification en attente de synchronisation',
  '{n} changes waiting to sync': '{n} modifications en attente de synchronisation',
  // network.js
  Online: 'En ligne',
  'Offline mode — local data': 'Mode hors ligne — données locales',
  'Not available offline: AI features need a connection.':
    "Indisponible hors ligne\u00a0: les fonctions d'IA ont besoin d'une connexion.",
  'Not available offline: this action needs a connection.':
    "Indisponible hors ligne\u00a0: cette action a besoin d'une connexion.",
  // api.js
  'The server cannot be reached.': 'Le serveur est injoignable.',
  'Request failed ({status})': 'La requête a échoué ({status})',
  // dom.js
  'Dismiss the message': 'Fermer le message',
  // entities.js
  Site: 'Site',
  Category: 'Domaine technique',
  'Last modified by': 'Dernière modification par',
  'Last modified': 'Dernière modification',
  Asset: 'Équipement',
  'No asset matches this search.': 'Aucun équipement ne correspond à cette recherche.',
  'No assets on this page.': 'Aucun équipement sur cette page.',
  'Loading assets…': 'Chargement des équipements…',
  'Loading the asset…': "Chargement de l'équipement…",
  'This asset does not exist.': "Cet équipement n'existe pas.",
  'This asset is not available offline.': "Cet équipement n'est pas disponible hors ligne.",
  'Asset saved.': 'Équipement enregistré.',
  'Page {page} of the assets has not been loaded before, so it is not available offline.':
    "La page {page} des équipements n'a pas encore été chargée\u00a0: elle n'est pas disponible hors ligne.",
  'Asset code': 'Code équipement',
  'asset|Name': 'Libellé',
  Place: 'Lieu',
  Subcategory: 'Sous-famille',
  Criticality: 'Criticité',
  Status: 'Statut',
  Brand: 'Marque',
  Model: 'Modèle',
  'Serial number': 'Numéro de série',
  'Commissioning date': 'Date de mise en service',
  'Last service date': 'Date de dernière révision',
  Supplier: 'Fournisseur',
  'Maintenance contract': 'Contrat de maintenance',
  'Responsible technician': 'Technicien responsable',
  'Exact location': 'Localisation précise',
  Comment: 'Commentaire',
  'Work order': 'Bon de travaux',
  'No work order matches this search.': 'Aucun bon de travaux ne correspond à cette recherche.',
  'No work orders on this page.': 'Aucun bon de travaux sur cette page.',
  'Loading work orders…': 'Chargement des bons de travaux…',
  'Loading the work order…': 'Chargement du bon de travaux…',
  'This work order does not exist.': "Ce bon de travaux n'existe pas.",
  'This work order is not available offline.': "Ce bon de travaux n'est pas disponible hors ligne.",
  'Work order saved.': 'Bon de travaux enregistré.',
  'Page {page} of the work orders has not been loaded before, so it is not available offline.':
    "La page {page} des bons de travaux n'a pas encore été chargée\u00a0: elle n'est pas disponible hors ligne.",
  Number: 'Numéro',
  Title: 'Titre',
  Type: 'Type',
  Priority: 'Priorité',
  Description: 'Description',
  Assignee: 'Technicien assigné',
  Supervisor: 'Superviseur',
  Created: 'Création',
  Due: 'Date souhaitée',
  Started: 'Début',
  Closed: 'Clôture',
  'Estimated time': 'Durée estimée',
  'Actual time': 'Durée réelle',
  'Work report': 'Compte rendu',
  'Created by': 'Créé par',
  'Request review': 'Examen de la demande',
  'Reviewed by': 'Examinée par',
  Reviewed: 'Examinée le',
  'Reason for rejection': 'Motif du refus',
  'Maintenance plan': 'Plan de maintenance',
  'Planned week': 'Semaine prévue',
  'Hold reason': 'Motif de mise en attente',
  'Hold note': 'Note sur la mise en attente',
  'Technically done': 'Terminé techniquement',
  // format.js
  'Week {n}, {year}': 'Semaine {n}, {year}',
  Yes: 'Oui',
  No: 'Non',
  '· assigned': '· assigné',
  // detail.js
  'Back to list': 'Retour à la liste',
  'Close details': 'Fermer les détails',
  Conflict: 'Conflit',
  ' — two versions of this record are waiting for a supervisor to arbitrate.':
    " — deux versions de cette fiche attendent l'arbitrage d'un superviseur.",
  'Open the conflict console': 'Ouvrir la console des conflits',
  Retry: 'Réessayer',
  'Update available — show the latest version':
    'Mise à jour disponible — afficher la dernière version',
  // table.js
  '{label}, page {page} of {pages}': '{label}, page {page} sur {pages}',
  '{n} matching record': '{n} fiche correspondante',
  '{n} matching records': '{n} fiches correspondantes',
  '{n} record': '{n} fiche',
  '{n} records': '{n} fiches',
  'Use the up and down arrow keys to move between rows, and Enter to open one.':
    "Utilisez les flèches haut et bas pour passer d'une ligne à l'autre, et Entrée pour en ouvrir une.",
  'card|Due': 'Pour le',
  'Pending creation': 'Création en attente',
  'Pending sync': 'Synchronisation en attente',
  'Pagination, top': 'Pagination, haut',
  Pagination: 'Pagination',
  First: 'Première',
  Previous: 'Précédente',
  'Page {page} / {pages}': 'Page {page} / {pages}',
  Next: 'Suivante',
  Last: 'Dernière',
  // form.js
  '— None —': '— Aucun —',
  '— Choose —': '— Choisir —',
  '— Choose a site —': '— Choisir un site —',
  '— Unassigned —': '— Non assigné —',
  'YYYY-Www, e.g. 2026-W43': 'AAAA-Sss, p. ex. 2026-W43',
  'Asset code, e.g. AST-0042': 'Code équipement, p. ex. AST-0042',
  'No asset': 'Aucun équipement',
  'Looking up…': 'Recherche…',
  'Unknown asset code': 'Code équipement inconnu',
  'Browse assets…': 'Parcourir les équipements…',
  'Asset #{v}': 'Équipement n° {v}',
  '{label}: {value}': '{label}\u00a0: {value}',
  Save: 'Enregistrer',
  'Discard changes': 'Abandonner les modifications',
  'Fields marked * are required. Choose an asset, or a place if the work is not about one asset.':
    "Les champs marqués * sont obligatoires. Choisissez un équipement, ou un lieu si l'intervention ne porte pas sur un équipement précis.",
  'Fields marked * are required. Leave the asset code empty to number the asset automatically (AST-0501, …).':
    "Les champs marqués * sont obligatoires. Laissez le code équipement vide pour numéroter l'équipement automatiquement (AST-0501, …).",
  // rules.js
  'Choose who will do the work': "Choisissez qui réalisera l'intervention",
  'Say why the request is rejected': 'Indiquez pourquoi la demande est refusée',
  Required: 'Obligatoire',
  'Write the work report first: the work cannot be marked technically done without it.':
    "Rédigez d'abord le compte rendu\u00a0: l'intervention ne peut pas être marquée terminée techniquement sans lui.",
  'Say why the work order is on hold.': 'Indiquez pourquoi le bon de travaux est en attente.',
  'The completion date cannot be earlier than the start date.':
    'La date de fin technique ne peut pas être antérieure à la date de début.',
  'The due date cannot be earlier than the creation date.':
    'La date souhaitée ne peut pas précéder la date de création.',
  'The closing date cannot be earlier than the start date.':
    'La date de clôture ne peut pas précéder la date de début.',
  'Capitals, digits and hyphens only, 2 to 50 characters':
    'Majuscules, chiffres et tirets uniquement, de 2 à 50 caractères',
  'Choose an asset or a place': 'Choisissez un équipement ou un lieu',
  // editor.js
  User: 'Utilisateur',
  'Unsaved draft from {updated_at}. ': 'Brouillon non enregistré du {updated_at}. ',
  Restore: 'Restaurer',
  'Report waived: marked technically done without a work report.':
    'Compte rendu dispensé\u00a0: marqué terminé techniquement sans compte rendu.',
  'action|Put on hold': 'Mettre en attente',
  'Mark technically done': 'Marquer terminé techniquement',
  'Mark done without a report': 'Marquer terminé sans compte rendu',
  'action|Close': 'Clôturer',
  Reopen: 'Rouvrir',
  'Change status': 'Changer le statut',
  'Mark done without a report?': 'Marquer terminé sans compte rendu\u00a0?',
  '{number} will be marked technically done without a work report. The waiver is kept on the work order and in its history.':
    '{number} sera marqué terminé techniquement sans compte rendu. La dispense est conservée sur le bon de travaux et dans son historique.',
  'Change the status outside the usual steps?':
    'Changer le statut hors des étapes habituelles\u00a0?',
  'The change from {from} to {to} is logged in the history as an administrator override.':
    "Le passage de {from} à {to} est inscrit dans l'historique comme une décision d'administrateur.",
  Discard: 'Abandonner',
  'This staff request is waiting for a supervisor’s review: it will then be assigned.':
    "Cette demande d'intervention attend l'examen d'un superviseur\u00a0: elle sera ensuite assignée.",
  'Your changes are saved on this device and waiting to be sent to the server.':
    "Vos modifications sont enregistrées sur cet appareil et attendent d'être envoyées au serveur.",
  'Your last change was not saved. ': "Votre dernière modification n'a pas été enregistrée. ",
  ' Your edits are shown below.': ' Vos modifications sont affichées ci-dessous.',
  '+ New work order for this asset': '+ Nouveau bon de travaux pour cet équipement',
  'Delete asset': "Supprimer l'équipement",
  'Check the highlighted fields.': 'Vérifiez les champs signalés.',
  'Saving…': 'Enregistrement…',
  'Saved on this device. It will be sent when you are back online.':
    'Enregistré sur cet appareil. Ce sera envoyé dès que vous serez de nouveau en ligne.',
  'Delete this asset?': 'Supprimer cet équipement\u00a0?',
  '{code} — {name} will be deleted for good. Only assets without any work order can be deleted; otherwise set the status to Out of service.':
    '{code} — {name} sera supprimé définitivement. Seuls les équipements sans aucun bon de travaux peuvent être supprimés\u00a0; sinon, passez son statut à Hors service.',
  Delete: 'Supprimer',
  Cancel: 'Annuler',
  'The asset was not deleted': "L'équipement n'a pas été supprimé",
  '{code} was deleted.': '{code} a été supprimé.',
  'Reject this request?': 'Refuser cette demande\u00a0?',
  '{number} will be cancelled. The requester will see your reason.':
    '{number} sera annulé. Le demandeur verra votre motif.',
  Reject: 'Refuser',
  'The server cannot be reached: try again once connected.':
    'Le serveur est injoignable\u00a0: réessayez une fois connecté.',
  '{number} approved and assigned to {first_name} {last_name}.':
    '{number} approuvé et assigné à {first_name} {last_name}.',
  '{number} rejected.': '{number} refusé.',
  'Create asset': "Créer l'équipement",
  'Creating an asset needs a connection. Your entries are kept as a draft.':
    "La création d'un équipement nécessite une connexion. Votre saisie est conservée comme brouillon.",
  'New asset': 'Nouvel équipement',
  'The server cannot be reached. Your entries are kept as a draft.':
    'Le serveur est injoignable. Votre saisie est conservée comme brouillon.',
  'Asset {code} created.': 'Équipement {code} créé.',
  'Create work order': 'Créer le bon de travaux',
  'New work order': 'Nouveau bon de travaux',
  'Creating the work order…': 'Création du bon de travaux…',
  'Work order saved on this device. It will be created when you are back online.':
    'Bon de travaux enregistré sur cet appareil. Il sera créé dès que vous serez de nouveau en ligne.',
  'This work order has been created or discarded. ': 'Ce bon de travaux a été créé ou abandonné. ',
  'Back to the list': 'Retour à la liste',
  Update: 'Mettre à jour',
  'Retry creation': 'Relancer la création',
  'Saved. The work order will be created with these values.':
    'Enregistré. Le bon de travaux sera créé avec ces valeurs.',
  'Discard this work order?': 'Abandonner ce bon de travaux\u00a0?',
  'It has not been created on the server. Its details will be lost.':
    "Il n'a pas été créé sur le serveur. Son contenu sera perdu.",
  'The work order was discarded.': 'Le bon de travaux a été abandonné.',
  'Discard this work order': 'Abandonner ce bon de travaux',
  'Waiting to be created on the server. It gets its number then.':
    'En attente de création sur le serveur. Il recevra alors son numéro.',
  'The server refused this work order. ': 'Le serveur a refusé ce bon de travaux. ',
  ' Fix it below and retry, or discard it.':
    ' Corrigez-le ci-dessous et réessayez, ou abandonnez-le.',
  'New work order (pending creation)': 'Nouveau bon de travaux (création en attente)',
  'Unsaved changes': 'Modifications non enregistrées',
  'You changed this record but did not save it.':
    "Vous avez modifié cette fiche sans l'enregistrer.",
  // app.js
  'Log in': 'Se connecter',
  'Access denied': 'Accès refusé',
  'Only supervisors and administrators can open this page.':
    'Seuls les superviseurs et les administrateurs peuvent ouvrir cette page.',
  'Only administrators can open this page.': 'Seuls les administrateurs peuvent ouvrir cette page.',
  'The year planner needs a larger screen: open it on a tablet or a computer.':
    "Le planning annuel a besoin d'un écran plus grand\u00a0: ouvrez-le sur une tablette ou un ordinateur.",
  'Only supervisors and administrators can rebalance the plans.':
    'Seuls les superviseurs et les administrateurs peuvent rééquilibrer les plans.',
  'Only supervisors and administrators can create plans.':
    'Seuls les superviseurs et les administrateurs peuvent créer des plans.',
  'Staff requests': "Demandes d'intervention",
  'This page is for staff members. Their requests are listed under Work orders.':
    'Cette page est réservée aux collaborateurs. Leurs demandes figurent dans les bons de travaux.',
  'Page not found': 'Page introuvable',
  'This page does not exist.': "Cette page n'existe pas.",
  'Go to my open requests': 'Aller à mes demandes en cours',
  'Go to the dashboard': 'Aller au tableau de bord',
  'Your requests need a connection to the server.':
    "Vos demandes ont besoin d'une connexion au serveur.",
  'Loading your requests…': 'Chargement de vos demandes…',
  'Request {number} sent to the maintenance team.':
    "Demande {number} envoyée à l'équipe de maintenance.",
  'You are offline: your request is kept on this page, send it once connected.':
    'Vous êtes hors ligne\u00a0: votre demande est conservée sur cette page, envoyez-la une fois connecté.',
  'Loading the request…': 'Chargement de la demande…',
  'Request not found': 'Demande introuvable',
  'This request does not exist, or another person sent it.':
    "Cette demande n'existe pas, ou une autre personne l'a envoyée.",
  'Cancel this request?': 'Annuler cette demande\u00a0?',
  'The maintenance team will not work on it, and this cannot be undone. To tell them why, add a comment. If the problem comes back, send a new request.':
    "L'équipe de maintenance ne la traitera pas, et c'est définitif. Pour lui en dire la raison, ajoutez un commentaire. Si le problème revient, envoyez une nouvelle demande.",
  'Cancel the request': 'Annuler la demande',
  'Keep it': 'La garder',
  'Loading the dashboard…': 'Chargement du tableau de bord…',
  'The dashboard has not been loaded on this device yet, so it is not available offline.':
    "Le tableau de bord n'a pas encore été chargé sur cet appareil\u00a0: il n'est pas disponible hors ligne.",
  'Loading the audit log…': "Chargement du journal d'audit…",
  'The audit log needs a connection to the server.':
    "Le journal d'audit a besoin d'une connexion au serveur.",
  'Loading users…': 'Chargement des utilisateurs…',
  'User not found': 'Utilisateur introuvable',
  'This user does not exist.': "Cet utilisateur n'existe pas.",
  'User administration needs a connection to the server.':
    "L'administration des utilisateurs a besoin d'une connexion au serveur.",
  'User {username} created.': 'Utilisateur {username} créé.',
  'Changes saved.': 'Modifications enregistrées.',
  'Nothing to save.': 'Rien à enregistrer.',
  'Set a new password?': 'Définir un nouveau mot de passe\u00a0?',
  '{first_name} {last_name} will have to log in again with the new password.':
    '{first_name} {last_name} devra se reconnecter avec le nouveau mot de passe.',
  'Set password': 'Définir le mot de passe',
  'New password set. Give it to the user privately.':
    "Nouveau mot de passe défini. Communiquez-le à l'utilisateur en privé.",
  'Loading places…': 'Chargement des lieux…',
  'The places need a connection to the server.': "Les lieux ont besoin d'une connexion au serveur.",
  'Place not found': 'Lieu introuvable',
  'This place does not exist.': "Ce lieu n'existe pas.",
  'Only administrators change level types.':
    'Seuls les administrateurs modifient les types de niveau.',
  'Level type saved.': 'Type de niveau enregistré.',
  'Level type {name} added.': 'Type de niveau {name} ajouté.',
  'Only administrators create sites.': 'Seuls les administrateurs créent des sites.',
  '{name} created.': '{name} créé.',
  'Your password has been changed.': 'Votre mot de passe a été changé.',
  'Password changed. Your other sessions have ended.':
    'Mot de passe changé. Vos autres sessions ont été fermées.',
  'You are offline: try again once connected.':
    'Vous êtes hors ligne\u00a0: réessayez une fois connecté.',
  'Thank you: your suggestion has been saved.': 'Merci\u00a0: votre suggestion a été enregistrée.',
  'Loading suggestions…': 'Chargement des suggestions…',
  'The suggestions need a connection to the server.':
    "Les suggestions ont besoin d'une connexion au serveur.",
  'Status saved.': 'Statut enregistré.',
  'You are offline: the status was not changed.':
    "Vous êtes hors ligne\u00a0: le statut n'a pas été modifié.",
  'The conflict console needs a connection to the server.':
    "La console des conflits a besoin d'une connexion au serveur.",
  'Loading conflicts…': 'Chargement des conflits…',
  'Loading the conflict…': 'Chargement du conflit…',
  'Conflict not found': 'Conflit introuvable',
  'Back to the conflicts': 'Retour aux conflits',
  'Resolve this conflict?': 'Résoudre ce conflit\u00a0?',
  '{resolutionSummary} This cannot be undone.': "{resolutionSummary} C'est définitif.",
  Resolve: 'Résoudre',
  'Conflict on {label} resolved.': 'Conflit sur {label} résolu.',
  'This conflict was already resolved by someone else.':
    "Ce conflit a déjà été résolu par quelqu'un d'autre.",
  '+ New work order': '+ Nouveau bon de travaux',
  '+ New asset': '+ Nouvel équipement',
  'Only supervisors and administrators can create assets.':
    'Seuls les superviseurs et les administrateurs peuvent créer des équipements.',
  'The record now shows the latest version.': 'La fiche affiche maintenant la dernière version.',
  'An update is available for the open record.':
    'Une mise à jour est disponible pour la fiche ouverte.',
  'Back to {origin}': 'Retour\u00a0: {origin}',
  'Search and filters need a connection to the server. Without filters, the pages saved on this device are available.':
    "La recherche et les filtres ont besoin d'une connexion au serveur. Sans filtre, les pages enregistrées sur cet appareil restent disponibles.",
  'Sorting needs a connection to the server. In the default order, the pages saved on this device are available.':
    "Le tri a besoin d'une connexion au serveur. Dans l'ordre par défaut, les pages enregistrées sur cet appareil restent disponibles.",
  'Clear filters': 'Effacer les filtres',
  'Default order': 'Ordre par défaut',
  'Work order {number} created.': 'Bon de travaux {number} créé.',
  'Not saved: this record is waiting for a supervisor to resolve a conflict. Your edits are kept as a draft.':
    "Non enregistré\u00a0: cette fiche attend qu'un superviseur résolve un conflit. Vos modifications sont conservées comme brouillon.",
  'Conflict: someone changed this record before you. A supervisor will choose which version to keep.':
    "Conflit\u00a0: quelqu'un a modifié cette fiche avant vous. Un superviseur choisira la version à garder.",
  'Not saved: {message}': 'Non enregistré\u00a0: {message}',
  'Changes not sent': 'Modifications non envoyées',
  '{n} change has not been sent to the server yet. If you log out now, it will be lost.':
    "{n} modification n'a pas encore été envoyée au serveur. Si vous vous déconnectez maintenant, elle sera perdue.",
  '{n} changes have not been sent to the server yet. If you log out now, they will be lost.':
    "{n} modifications n'ont pas encore été envoyées au serveur. Si vous vous déconnectez maintenant, elles seront perdues.",
  'Stay logged in': 'Rester connecté',
  'Log out anyway': 'Se déconnecter quand même',
  'You are logged out.': 'Vous êtes déconnecté.',
  'Your session has expired. Log in again.': 'Votre session a expiré. Reconnectez-vous.',
  'Back online.': 'De nouveau en ligne.',
  'You are offline. Local data is shown.':
    'Vous êtes hors ligne. Les données locales sont affichées.',
  // login.js
  'Wrong username or password.': 'Identifiant ou mot de passe incorrect.',
  'Too many attempts. Wait a few minutes and try again.':
    'Trop de tentatives. Patientez quelques minutes puis réessayez.',
  'The server cannot be reached. Check your connection and try again.':
    'Le serveur est injoignable. Vérifiez votre connexion puis réessayez.',
  'Login failed. Try again later.': 'La connexion a échoué. Réessayez plus tard.',
  'Enter your username and password.': 'Saisissez votre identifiant et votre mot de passe.',
  'Logging in…': 'Connexion…',
  Username: 'Identifiant',
  Password: 'Mot de passe',
  'Maintenance management': 'Gestion de la maintenance',
  // account.js
  'At least {PASSWORD_MIN_LENGTH} characters': 'Au moins {PASSWORD_MIN_LENGTH} caractères',
  'Choose a password different from the current one':
    "Choisissez un mot de passe différent de l'actuel",
  'The two passwords differ': 'Les deux mots de passe diffèrent',
  'Current password': 'Mot de passe actuel',
  'New password': 'Nouveau mot de passe',
  'At least {PASSWORD_MIN_LENGTH} characters.': 'Au moins {PASSWORD_MIN_LENGTH} caractères.',
  'Repeat the new password': 'Répétez le nouveau mot de passe',
  'Your other sessions (other browsers or devices) will end; this one stays open.':
    'Vos autres sessions (autres navigateurs ou appareils) seront fermées\u00a0; celle-ci reste ouverte.',
  'Change password': 'Changer le mot de passe',
  // admin-users.js
  'Letters, digits, dot, dash or underscore, 3 to 50 characters':
    'Lettres, chiffres, point, tiret ou tiret bas, de 3 à 50 caractères',
  Active: 'Actif',
  Inactive: 'Inactif',
  'Name or username': 'Nom ou identifiant',
  Any: 'Tous',
  'Search users': 'Rechercher des utilisateurs',
  Search: 'Rechercher',
  Role: 'Rôle',
  Account: 'Compte',
  '{n} user': '{n} utilisateur',
  '{n} users': '{n} utilisateurs',
  '+ New user': '+ Nouvel utilisateur',
  'Users, page {page} of {pages}': 'Utilisateurs, page {page} sur {pages}',
  Name: 'Nom',
  'No user matches this search.': 'Aucun utilisateur ne correspond à cette recherche.',
  'Used to log in; cannot be changed later.':
    'Sert à se connecter\u00a0; ne peut plus être modifié ensuite.',
  'First name': 'Prénom',
  'Last name': 'Nom',
  Specialty: 'Spécialité',
  'Auto-save': 'Enregistrement automatique',
  'Changes are saved when leaving a record (power user).':
    'Les modifications sont enregistrées en quittant une fiche (utilisateur avancé).',
  'Account active': 'Compte actif',
  'Inactive users cannot log in; their sessions end at once.':
    'Les utilisateurs inactifs ne peuvent pas se connecter\u00a0; leurs sessions sont fermées immédiatement.',
  'At least {PASSWORD_MIN_LENGTH} characters. Give it to the user privately.':
    "Au moins {PASSWORD_MIN_LENGTH} caractères. Communiquez-le à l'utilisateur en privé.",
  '← Back to list': '← Retour à la liste',
  'Reset password': 'Réinitialiser le mot de passe',
  "The user's open sessions end at once.":
    "Les sessions ouvertes de l'utilisateur sont fermées immédiatement.",
  'Set new password': 'Définir le nouveau mot de passe',
  ' · Last changed {updated_at}': ' · Dernière modification le {updated_at}',
  'To change your own password, use {link}.':
    'Pour changer votre propre mot de passe, utilisez {link}.',
  'Fields marked * are required.': 'Les champs marqués * sont obligatoires.',
  'Create user': "Créer l'utilisateur",
  'New user': 'Nouvel utilisateur',
  // asset-picker.js
  Code: 'Code',
  Location: 'Localisation',
  Trade: 'Domaine technique',
  All: 'Tous',
  'Code, name, place, location, brand…': 'Code, libellé, lieu, localisation, marque…',
  'Choose {code} — {name}': 'Choisir {code} — {name}',
  Choose: 'Choisir',
  '{n} asset': '{n} équipement',
  '{n} assets': '{n} équipements',
  'Assets, page {page} of {pages}': 'Équipements, page {page} sur {pages}',
  'The asset list needs a connection to the server.':
    "La liste des équipements a besoin d'une connexion au serveur.",
  'Choose an asset': 'Choisir un équipement',
  'Close without choosing': 'Fermer sans choisir',
  // comments.js
  'Write your comment first.': "Écrivez d'abord votre commentaire.",
  'At most {COMMENT_MAX_LENGTH} characters.': '{COMMENT_MAX_LENGTH} caractères au maximum.',
  You: 'Vous',
  '{name} (requester)': '{name} (demandeur)',
  '{name} (maintenance team)': '{name} (équipe de maintenance)',
  'No comment yet.': "Aucun commentaire pour l'instant.",
  'Send comment': 'Envoyer le commentaire',
  'You are offline: your text is kept, send it once connected.':
    'Vous êtes hors ligne\u00a0: votre texte est conservé, envoyez-le une fois connecté.',
  'The requester is waiting for a reply.': 'Le demandeur attend une réponse.',
  'Loading the comments…': 'Chargement des commentaires…',
  'The comments need a connection to the server.':
    "Les commentaires ont besoin d'une connexion au serveur.",
  Comments: 'Commentaires',
  'Add a comment': 'Ajouter un commentaire',
  'The requester sees your comments: use them to give news or ask for details.':
    'Le demandeur voit vos commentaires\u00a0: servez-vous-en pour donner des nouvelles ou demander des précisions.',
  // conflicts.js
  'No value': 'Aucune valeur',
  'User #{value}': 'Utilisateur n° {value}',
  'Asset #{value}': 'Équipement n° {value}',
  'Plan #{value}': 'Plan n° {value}',
  'Place #{value}': 'Lieu n° {value}',
  'Open conflicts': 'Conflits ouverts',
  'Two people changed the same record at the same time. Compare both versions and choose what to keep.':
    "Deux personnes ont modifié la même fiche en même temps. Comparez les deux versions et choisissez ce qu'il faut garder.",
  '{n} open conflict': '{n} conflit ouvert',
  '{n} open conflicts': '{n} conflits ouverts',
  Record: 'Fiche',
  'Version A (server)': 'Version A (serveur)',
  'Version B (rejected edit)': 'Version B (modification rejetée)',
  Detected: 'Détecté le',
  'No open conflict. Nothing to arbitrate.': 'Aucun conflit ouvert. Rien à arbitrer.',
  'Same value': 'Valeur identique',
  '{label}: version to keep': '{label}\u00a0: version à garder',
  'Keep A': 'Garder A',
  'Keep B': 'Garder B',
  Differs: 'Diffère',
  'Conflict on asset {record}': "Conflit sur l'équipement {record}",
  'Conflict on work order {record}': 'Conflit sur le bon de travaux {record}',
  '← All conflicts': '← Tous les conflits',
  'Not resolved. ': 'Non résolu. ',
  'Resolved ({resolution}) by {person} on {resolved_at}.':
    'Résolu ({resolution}) par {person} le {resolved_at}.',
  merge: 'fusion',
  'Version A — server': 'Version A — serveur',
  'Saved by {person} on {server_updated_at}': 'Enregistrée par {person} le {server_updated_at}',
  unknown: 'inconnu',
  'Version B — rejected edit': 'Version B — modification rejetée',
  'Made by {client_user} on {client_edited_at}, based on an older version':
    "Faite par {client_user} le {client_edited_at}, à partir d'une version plus ancienne",
  'Fields changed in version B ({n} differs from version A)':
    'Champs modifiés dans la version B ({n} diffère de la version A)',
  'Fields changed in version B ({n} differ from version A)':
    'Champs modifiés dans la version B ({n} diffèrent de la version A)',
  Field: 'Champ',
  'Version A': 'Version A',
  'Version B': 'Version B',
  'Merge: keep': 'Fusion\u00a0: garder',
  'Accept version A': 'Accepter la version A',
  'Accept version B': 'Accepter la version B',
  'Merge the chosen values': 'Fusionner les valeurs choisies',
  'Keep version A for {label}. The edit made by {client_user} will be dropped.':
    'Garder la version A pour {label}. La modification faite par {client_user} sera abandonnée.',
  'Apply version B to {label}: the edit made by {client_user} replaces the server values.':
    'Appliquer la version B à {label}\u00a0: la modification faite par {client_user} remplace les valeurs du serveur.',
  'Save the values you chose for {label}.': 'Enregistrer les valeurs choisies pour {label}.',
  // dashboard.js
  'Open work orders': 'Bons de travaux ouverts',
  'In progress': 'En cours',
  'Done this month': 'Terminés ce mois-ci',
  'To close': 'À clôturer',
  'Overdue work orders': 'Bons de travaux en retard',
  'Assets broken down': 'Équipements en panne',
  'Staff requests to review': 'Demandes à examiner',
  'Requests waiting for a reply': 'Demandes en attente de réponse',
  'Requests waiting for my reply': 'Demandes attendant ma réponse',
  'Conflicts to arbitrate': 'Conflits à arbitrer',
  'Bar chart': 'Graphique en barres',
  Today: "Aujourd'hui",
  'Next 7 days': '7 prochains jours',
  'The chart library could not be loaded.':
    "La bibliothèque de graphiques n'a pas pu être chargée.",
  'Key figures': 'Chiffres clés',
  'Needs attention': 'À traiter',
  'Show as a table': 'Afficher sous forme de tableau',
  'Work orders by category, last {period} days':
    'Bons de travaux par domaine technique, {period} derniers jours',
  'Work orders by category — last {period} days':
    'Bons de travaux par domaine technique — {period} derniers jours',
  '{n} work order created': '{n} bon de travaux créé',
  '{n} work orders created': '{n} bons de travaux créés',
  'Pie chart': 'Graphique circulaire',
  'Work orders by status': 'Bons de travaux par statut',
  'No work order was created in this period.':
    "Aucun bon de travaux n'a été créé sur cette période.",
  'Work orders by status — last {period} days':
    'Bons de travaux par statut — {period} derniers jours',
  '{n} work order created, by current status': '{n} bon de travaux créé, par statut actuel',
  '{n} work orders created, by current status': '{n} bons de travaux créés, par statut actuel',
  'Updated {updated_at} by {person}': 'Mis à jour le {updated_at} par {person}',
  'Updated {updated_at}': 'Mis à jour le {updated_at}',
  'No activity yet.': "Aucune activité pour l'instant.",
  'Recent activity': 'Activité récente',
  Period: 'Période',
  'Due by {weekEnd}, late or without a due date.':
    "À faire d'ici le {weekEnd}, en retard ou sans date souhaitée.",
  'Due today, late or without a due date.':
    "À faire aujourd'hui, en retard ou sans date souhaitée.",
  'My work': 'Mon travail',
  'Today in My week →': "Aujourd'hui dans Ma semaine →",
  'Due {due_on}': 'Pour le {due_on}',
  'No due date': 'Sans date souhaitée',
  Overdue: 'En retard',
  'No work order assigned to you is due in the next 7 days.':
    "Aucun bon de travaux qui vous est assigné n'est attendu dans les 7 prochains jours.",
  'No work order assigned to you is due today.':
    "Aucun bon de travaux qui vous est assigné n'est attendu aujourd'hui.",
  'Offline: figures saved on this device on {fetchedAt}.':
    'Hors ligne\u00a0: chiffres enregistrés sur cet appareil le {fetchedAt}.',
  '{n} work order': '{n} bon de travaux',
  '{n} work orders': '{n} bons de travaux',
  '{n} work order ({share})': '{n} bon de travaux ({share})',
  '{n} work orders ({share})': '{n} bons de travaux ({share})',
  // dashboards-page.js
  '+ New dashboard': '+ Nouveau tableau de bord',
  Widgets: 'Indicateurs',
  'Tick the widgets to show on “{name}”.':
    'Cochez les indicateurs à afficher sur «\u00a0{name}\u00a0».',
  'Switched off for supervisors': 'Désactivé pour les superviseurs',
  Off: 'Désactivé',
  'Loading the widgets…': 'Chargement des indicateurs…',
  'The dashboard widgets need a connection to the server.':
    "Les indicateurs des tableaux de bord ont besoin d'une connexion au serveur.",
  '{label} switched on for supervisors.': '{label} activé pour les superviseurs.',
  '{label} switched off for supervisors.': '{label} désactivé pour les superviseurs.',
  'You are offline: {label} was not changed.':
    "Vous êtes hors ligne\u00a0: {label} n'a pas été modifié.",
  'Your dashboards have not been loaded on this device yet, so they are not available offline.':
    "Vos tableaux de bord n'ont pas encore été chargés sur cet appareil\u00a0: ils ne sont pas disponibles hors ligne.",
  'Loading your dashboards…': 'Chargement de vos tableaux de bord…',
  'Dashboard not found': 'Tableau de bord introuvable',
  'This dashboard does not exist, or it is not one of yours.':
    "Ce tableau de bord n'existe pas, ou ce n'est pas l'un des vôtres.",
  'Widgets of {name}': 'Indicateurs de {name}',
  'Press Space to pick the widget up, the arrow keys to move it, and Space to drop it.':
    "Appuyez sur Espace pour saisir l'indicateur, sur les flèches pour le déplacer, et sur Espace pour le déposer.",
  'No widget yet: tick widgets in the sidebar.':
    "Aucun indicateur pour l'instant\u00a0: cochez des indicateurs dans la barre latérale.",
  '{days} days': '{days} jours',
  'All sites': 'Tous les sites',
  'All trades': 'Tous les domaines',
  'Filters of this dashboard': 'Filtres de ce tableau de bord',
  Sites: 'Sites',
  Trades: 'Domaines techniques',
  'New dashboard…': 'Nouveau tableau de bord…',
  'Rename…': 'Renommer…',
  'Duplicate…': 'Dupliquer…',
  'Move up in the sidebar': 'Monter dans la barre latérale',
  'Move down in the sidebar': 'Descendre dans la barre latérale',
  'Delete…': 'Supprimer…',
  'Loading…': 'Chargement…',
  'Not saved on this device yet.': 'Pas encore enregistré sur cet appareil.',
  'Move {label}': 'Déplacer {label}',
  'Actions: {label}': 'Actions\u00a0: {label}',
  'Figures (CSV)': 'Chiffres (CSV)',
  'Assets (CSV)': 'Équipements (CSV)',
  'Visits (CSV)': 'Visites (CSV)',
  'Work orders (CSV)': 'Bons de travaux (CSV)',
  'Image (JPG)': 'Image (JPG)',
  'Move earlier': 'Avancer',
  'Move later': 'Reculer',
  'Remove from dashboard': 'Retirer du tableau de bord',
  'This dashboard was changed elsewhere: it is shown again as saved.':
    "Ce tableau de bord a été modifié ailleurs\u00a0: il est de nouveau affiché tel qu'enregistré.",
  'The change could not be saved: the server cannot be reached.':
    "La modification n'a pas pu être enregistrée\u00a0: le serveur est injoignable.",
  '{label} added at the end of the dashboard.': '{label} ajouté à la fin du tableau de bord.',
  '{label} removed from the dashboard.': '{label} retiré du tableau de bord.',
  '{label}, position {value} of {length}.': '{label}, position {value} sur {length}.',
  'Start from': 'Partir de',
  'Give the dashboard a name.': 'Donnez un nom au tableau de bord.',
  'You already have a dashboard with this name.':
    'Vous avez déjà un tableau de bord portant ce nom.',
  'An empty dashboard': 'Un tableau de bord vide',
  'The overview (every key figure and chart)':
    "La vue d'ensemble (tous les chiffres clés et graphiques)",
  'The backlog (flow, age, weeks of work, planned vs reactive)':
    'Le carnet de travaux (flux, ancienneté, semaines de travail, planifié ou non)',
  'Compliance (preventive, regulatory, schedule, contractors)':
    'La conformité (préventif, réglementaire, planning, prestataires)',
  'Assets and people (breakdowns, response times, estimates)':
    'Équipements et personnes (pannes, délais de prise en charge, estimations)',
  'A copy of “{name}”': 'Une copie de «\u00a0{name}\u00a0»',
  'New dashboard': 'Nouveau tableau de bord',
  Create: 'Créer',
  'Dashboard {name} created.': 'Tableau de bord {name} créé.',
  'Rename the dashboard': 'Renommer le tableau de bord',
  Rename: 'Renommer',
  'Dashboard renamed {name}.': 'Tableau de bord renommé {name}.',
  'Duplicate the dashboard': 'Dupliquer le tableau de bord',
  Duplicate: 'Dupliquer',
  '{name} (copy)': '{name} (copie)',
  '{name} moved up in the sidebar.': '{name} monté dans la barre latérale.',
  '{name} moved down in the sidebar.': '{name} descendu dans la barre latérale.',
  'Delete this dashboard?': 'Supprimer ce tableau de bord\u00a0?',
  '“{name}” and its layout will be deleted. The work orders and figures are not affected.':
    '«\u00a0{name}\u00a0» et sa disposition seront supprimés. Les bons de travaux et les chiffres ne sont pas touchés.',
  'Delete dashboard': 'Supprimer le tableau de bord',
  'Dashboard {name} deleted.': 'Tableau de bord {name} supprimé.',
  'Preparing the file…': 'Préparation du fichier…',
  assets: 'equipements',
  visits: 'visites',
  'work orders': 'bons de travaux',
  'The file holds the first {length} of {total} records.':
    'Le fichier contient les {length} premières fiches sur {total}.',
  '{n} record exported.': '{n} fiche exportée.',
  '{n} records exported.': '{n} fiches exportées.',
  'on time': 'dans les délais',
  kept: 'tenu',
  'Tacto · {name} · figures of {fetchedAt}': 'Tacto · {name} · chiffres du {fetchedAt}',
  '⚠ Needs attention': '⚠ À traiter',
  // export.js
  'The image could not be created.': "L'image n'a pas pu être créée.",
  // feedback.js
  'suggestion|New': 'Nouvelle',
  'suggestion|Planned': 'Prévue',
  'suggestion|Done': 'Faite',
  'suggestion|Declined': 'Refusée',
  'Describe what could be improved on this page.':
    'Décrivez ce qui pourrait être amélioré sur cette page.',
  'At most {MESSAGE_MAX_LENGTH} characters.': '{MESSAGE_MAX_LENGTH} caractères au maximum.',
  'Example: it would be interesting to include a pie chart of work orders by category.':
    "Exemple\u00a0: il serait intéressant d'ajouter un graphique circulaire des bons de travaux par domaine technique.",
  '{length} / {MESSAGE_MAX_LENGTH} characters': '{length} / {MESSAGE_MAX_LENGTH} caractères',
  Send: 'Envoyer',
  'What should be updated or improved on this page? Your idea is saved with the page you are on, for the next updates of the tool.':
    "Que faudrait-il mettre à jour ou améliorer sur cette page\u00a0? Votre idée est enregistrée avec la page où vous êtes, pour les prochaines évolutions de l'outil.",
  'Page: ': 'Page\u00a0: ',
  'Your suggestion': 'Votre suggestion',
  'All suggestions': 'Toutes les suggestions',
  'Status of suggestion {id}': 'Statut de la suggestion {id}',
  '{viewport_width} px wide': '{viewport_width} px de large',
  Show: 'Afficher',
  '{n} suggestion': '{n} suggestion',
  '{n} suggestions': '{n} suggestions',
  'Suggestions, page {page} of {pages}': 'Suggestions, page {page} sur {pages}',
  Sent: 'Envoyée le',
  By: 'Par',
  Page: 'Page',
  Suggestion: 'Suggestion',
  'No suggestion yet.': "Aucune suggestion pour l'instant.",
  // filters.js
  'Assigned to me': 'Assignés à moi',
  'Requests to review': 'Demandes à examiner',
  'Waiting for a reply': 'En attente de réponse',
  'one|{n} selected': '{n} sélectionné',
  '{n} selected': '{n} sélectionnés',
  'Not finished': 'Non terminés',
  'Code, name, brand, serial number…': 'Code, libellé, marque, numéro de série…',
  'Number, title, description, report…': 'Numéro, titre, description, compte rendu…',
  'From the dashboard': 'Depuis le tableau de bord',
  'From the dashboard: ': 'Depuis le tableau de bord\u00a0: ',
  'Remove the dashboard filter': 'Retirer le filtre du tableau de bord',
  Filters: 'Filtres',
  'Search and filter assets': 'Rechercher et filtrer les équipements',
  'Search and filter work orders': 'Rechercher et filtrer les bons de travaux',
  'Filters ({count})': 'Filtres ({count})',
  // find-work-order.js
  'Search results: the assistant is not set up yet.':
    "Résultats de recherche\u00a0: l'assistant n'est pas encore configuré.",
  'Search results: the assistant is not available right now.':
    "Résultats de recherche\u00a0: l'assistant n'est pas disponible pour le moment.",
  'Search results: the assistant’s answer could not be used.':
    "Résultats de recherche\u00a0: la réponse de l'assistant n'a pas pu être utilisée.",
  'Describe the job in at least 3 words.': "Décrivez l'intervention en 3 mots au moins.",
  'At most {FIND_TEXT_MAX_LENGTH} characters.': '{FIND_TEXT_MAX_LENGTH} caractères au maximum.',
  Strong: 'Forte',
  Possible: 'Possible',
  'Search results.': 'Résultats de recherche.',
  'Open {number}': 'Ouvrir {number}',
  Open: 'Ouvrir',
  'Example: replaced the burnt contactor coil of pump 2, motor tested, 1 h 30.':
    'Exemple\u00a0: remplacé la bobine grillée du contacteur de la pompe 2, moteur testé, 1 h 30.',
  '{length} / {FIND_TEXT_MAX_LENGTH} characters': '{length} / {FIND_TEXT_MAX_LENGTH} caractères',
  Find: 'Rechercher',
  'Asset: {code} {name}': 'Équipement\u00a0: {code} {name}',
  'Site: {site}': 'Site\u00a0: {site}',
  'Remove the asset: search everywhere': "Retirer l'équipement\u00a0: chercher partout",
  'Remove the site: search everywhere': 'Retirer le site\u00a0: chercher partout',
  Remove: 'Retirer',
  'Matching work orders': 'Bons de travaux correspondants',
  'No open work order matches this job.':
    'Aucun bon de travaux ouvert ne correspond à cette intervention.',
  'None of these? ': 'Aucun de ceux-ci\u00a0? ',
  'Finding…': 'Recherche…',
  'The server cannot be reached: your text is kept, try again once connected.':
    'Le serveur est injoignable\u00a0: votre texte est conservé, réessayez une fois connecté.',
  'Describe the job you did or the fault you found: Tacto looks for the open work order it belongs to.':
    "Décrivez l'intervention réalisée ou le défaut constaté\u00a0: Tacto cherche le bon de travaux ouvert auquel il se rattache.",
  'What did you do?': "Qu'avez-vous fait\u00a0?",
  Close: 'Fermer',
  // history.js
  'Status changed by an administrator (override)':
    'Statut changé par un administrateur (hors étapes)',
  Changed: 'Modification',
  Deleted: 'Suppression',
  'Edit not applied (conflict)': 'Modification non appliquée (conflit)',
  'Conflict resolved': 'Conflit résolu',
  'kept version A': 'version A gardée',
  'applied version B': 'version B appliquée',
  merged: 'fusion',
  Kind: 'Nature',
  Person: 'Personne',
  Day: 'Jour',
  Length: 'Durée',
  Appointment: 'Rendez-vous',
  Note: 'Note',
  'Not locked': 'Non verrouillé',
  'Maintenance plans': 'Plans de maintenance',
  'Plan visits': 'Visites des plans',
  'Scheduled blocks': 'Créneaux planifiés',
  'User accounts': 'Comptes utilisateur',
  'Password reset by an administrator': 'Mot de passe réinitialisé par un administrateur',
  'Password changed by the user': "Mot de passe changé par l'utilisateur",
  Building: 'Bâtiment',
  Floor: 'Étage',
  Room: 'Local',
  '{label}: ': '{label}\u00a0: ',
  'No change recorded yet.': "Aucune modification enregistrée pour l'instant.",
  'Loading the history…': "Chargement de l'historique…",
  'The history needs a connection to the server.':
    "L'historique a besoin d'une connexion au serveur.",
  History: 'Historique',
  'All records': 'Toutes les fiches',
  '{n} change': '{n} modification',
  '{n} changes': '{n} modifications',
  'Audit log, page {page} of {pages}': "Journal d'audit, page {page} sur {pages}",
  When: 'Quand',
  Who: 'Qui',
  What: 'Quoi',
  Changes: 'Modifications',
  // my-week.js
  'Start time of {number}': 'Heure de début de {number}',
  'Start time of this block': 'Heure de début de ce créneau',
  'Change…': 'Modifier…',
  'Move up': 'Monter',
  'Move down': 'Descendre',
  'Unlock the time': "Déverrouiller l'heure",
  'Lock at this time': 'Verrouiller à cette heure',
  '🔒 {appointmentText} · locked by {locked_by}':
    '🔒 {appointmentText} · verrouillé par {locked_by}',
  'Nothing scheduled.': 'Rien de planifié.',
  '← Previous': '← Précédente',
  'Previous week': 'Semaine précédente',
  'Next →': 'Suivante →',
  'Next week': 'Semaine suivante',
  'This week': 'Cette semaine',
  'Back to this week': 'Revenir à cette semaine',
  '{week_total} scheduled of {week_capacity}. Appointments come first; order the rest of each day as you like.':
    '{week_total} planifiés sur {week_capacity}. Les rendez-vous passent en premier\u00a0; ordonnez le reste de chaque journée comme vous le souhaitez.',
  'Offline: your week as saved on this device on {generated_at}. Changes need a connection.':
    "Hors ligne\u00a0: votre semaine telle qu'enregistrée sur cet appareil le {generated_at}. Les modifications ont besoin d'une connexion.",
  // places.js
  'Search, e.g. “12.02” or “Tower A L3”':
    'Rechercher, p. ex. «\u00a012.02\u00a0» ou «\u00a0Tour A L3\u00a0»',
  '— {value} itself —': '— {value} lui-même —',
  '{name} (not in use)': '{name} (hors usage)',
  'Not in the list': 'Absent de la liste',
  'No place found.': 'Aucun lieu trouvé.',
  'Find a place': 'Trouver un lieu',
  'The character › is not allowed': "Le caractère › n'est pas autorisé",
  'Capitals and digits only, 1 to 10 characters':
    'Majuscules et chiffres uniquement, de 1 à 10 caractères',
  'In use': 'En usage',
  'Not in use': 'Hors usage',
  'Name or path, e.g. “Tower A L12”': 'Nom ou chemin, p. ex. «\u00a0Tour A L12\u00a0»',
  Fold: 'Replier',
  Unfold: 'Déplier',
  'Search places': 'Rechercher des lieux',
  'Show places not in use': 'Afficher les lieux hors usage',
  '{n} place matches': '{n} lieu correspond',
  '{n} places match': '{n} lieux correspondent',
  '{n} place': '{n} lieu',
  '{n} places': '{n} lieux',
  'Level types': 'Types de niveau',
  '+ New site': '+ Nouveau site',
  'No place matches this search.': 'Aucun lieu ne correspond à cette recherche.',
  'No place yet.': "Aucun lieu pour l'instant.",
  'Records copy the site’s name: it can change only while nothing uses the site.':
    "Les fiches recopient le nom du site\u00a0: il ne peut changer que tant que rien n'utilise le site.",
  'The name people use, e.g. “Tower A”, “L12” or “Meeting room 12.02”.':
    'Le nom que les gens emploient, p. ex. «\u00a0Tour A\u00a0», «\u00a0L12\u00a0» ou «\u00a0Salle de réunion 12.02\u00a0».',
  'Level type': 'Type de niveau',
  'Optional, for asset codes: capitals and digits, e.g. “2” for Tower 2, “01” for the first basement.':
    'Facultatif, pour les codes équipement\u00a0: majuscules et chiffres, p. ex. «\u00a02\u00a0» pour la Tour 2, «\u00a001\u00a0» pour le premier sous-sol.',
  'A site is the top of a branch: an office tower, a branch, a data center. Fields marked * are required.':
    "Un site est le sommet d'une branche\u00a0: une tour de bureaux, une agence, un centre de données. Les champs marqués * sont obligatoires.",
  'In {fullPath}. Fields marked * are required.':
    'Dans {fullPath}. Les champs marqués * sont obligatoires.',
  'Create site': 'Créer le site',
  'Create place': 'Créer le lieu',
  'New site': 'Nouveau site',
  'New place': 'Nouveau lieu',
  Inside: "À l'intérieur de",
  'Move the place within its site: the records below follow, with their new path.':
    'Déplacez le lieu au sein de son site\u00a0: les fiches qui en dépendent suivent, avec leur nouveau chemin.',
  'A place not in use is no longer offered, nor the places below it; records keep it.':
    "Un lieu hors usage n'est plus proposé, pas plus que les lieux qu'il contient\u00a0; les fiches le conservent.",
  '+ Add a place inside': "+ Ajouter un lieu à l'intérieur",
  'Only administrators change sites.': 'Seuls les administrateurs modifient les sites.',
  'A capital letter, then capitals, digits or _':
    'Une majuscule, puis des majuscules, chiffres ou _',
  'New level type': 'Nouveau type de niveau',
  Token: 'Balise',
  'The site type keeps its token.': 'Le type site garde sa balise.',
  'Its name in asset code patterns, e.g. BUILDING for {BUILDING}.':
    'Son nom dans les modèles de code équipement, p. ex. BUILDING pour {BUILDING}.',
  'Offered to staff': 'Proposé aux collaborateurs',
  'Staff can pick places of this type when they send a request.':
    'Les collaborateurs peuvent choisir des lieux de ce type quand ils envoient une demande.',
  'Add level type': 'Ajouter le type de niveau',
  'The kinds of places: any type can sit under any place, so each site follows its own layout.':
    "Les sortes de lieux\u00a0: n'importe quel type peut se trouver sous n'importe quel lieu, chaque site suit donc sa propre organisation.",
  // plan-panel.js
  weekly: 'hebdomadaire',
  'every other week': 'une semaine sur deux',
  monthly: 'mensuel',
  quarterly: 'trimestriel',
  'twice a year': 'semestriel',
  yearly: 'annuel',
  'Every {n} week': 'Toutes les semaines',
  'Every {n} weeks': 'Toutes les {n} semaines',
  'Required without an asset': 'Obligatoire sans équipement',
  'Hours in steps of half an hour': "Heures par pas d'une demi-heure",
  'Between 1 and 104 weeks': 'Entre 1 et 104 semaines',
  'Choose a week': 'Choisissez une semaine',
  'The end week cannot be before the first visit.':
    'La semaine de fin ne peut pas précéder la première visite.',
  'Give both ends of the season, or neither.': 'Indiquez les deux bornes de la saison, ou aucune.',
  'Name the contractor who performs the visits.':
    'Indiquez le prestataire qui réalise les visites.',
  'No week is available any more.': "Plus aucune semaine n'est disponible.",
  'Only {from}': 'Uniquement {from}',
  '{from} to {to}': '{from} à {to}',
  'regulatory: earlier only, up to week {due_week}':
    "réglementaire\u00a0: seulement plus tôt, jusqu'à la semaine {due_week}",
  '± {n} week around week {due}': '± {n} semaine autour de la semaine {due}',
  '± {n} weeks around week {due}': '± {n} semaines autour de la semaine {due}',
  'Allowed: {range} ({why}).': 'Autorisé\u00a0: {range} ({why}).',
  'Restore this visit': 'Rétablir cette visite',
  'Move this visit to week': 'Déplacer cette visite à la semaine',
  'Move visit': 'Déplacer la visite',
  'Choose a week.': 'Choisissez une semaine.',
  'The visit is already in this week.': 'La visite est déjà dans cette semaine.',
  'Skip this visit': 'Sauter cette visite',
  'Skip visit': 'Sauter la visite',
  'Say why the visit is skipped.': 'Indiquez pourquoi la visite est sautée.',
  'e.g. "Building closed for works". The visit leaves the load; it can be restored.':
    'p. ex. «\u00a0Bâtiment fermé pour travaux\u00a0». La visite sort de la charge\u00a0; elle peut être rétablie.',
  'Visit of {week}': 'Visite\u00a0: {week}',
  'Due week': 'Semaine limite',
  '{week} (moved)': '{week} (déplacée)',
  'Created {n} week before the visit': 'Créé {n} semaine avant la visite',
  'Created {n} weeks before the visit': 'Créé {n} semaines avant la visite',
  'Reason for skipping': 'Motif de la visite sautée',
  Warning: 'Avertissement',
  '⚠ Outside the season (weeks {season_from_week} to {season_to_week}). ':
    '⚠ Hors saison (semaines {season_from_week} à {season_to_week}). ',
  '⚠ In a blocked week.': '⚠ Dans une semaine bloquée.',
  'Move the series': 'Déplacer la série',
  'First visit of the series': 'Première visite de la série',
  'Move series': 'Déplacer la série',
  'The series already starts this week.': 'La série commence déjà cette semaine.',
  'The planned visits follow; visits moved by hand keep their offset; visits with a work order stay.':
    'Les visites planifiées suivent\u00a0; les visites déplacées à la main gardent leur décalage\u00a0; les visites ayant un bon de travaux restent en place.',
  'This plan is inactive: it creates no more visits.':
    'Ce plan est inactif\u00a0: il ne crée plus de visites.',
  'Edit plan': 'Modifier le plan',
  'Hours per visit': 'Heures par visite',
  Frequency: 'Fréquence',
  'First visit': 'Première visite',
  'Last week': 'Dernière semaine',
  'Open-ended': 'Sans fin',
  Calendar: 'Calendrier',
  Tolerance: 'Tolérance',
  '± {n} week': '± {n} semaine',
  '± {n} weeks': '± {n} semaines',
  Season: 'Saison',
  'Weeks {season_from_week} to {season_to_week}': 'Semaines {season_from_week} à {season_to_week}',
  'Done by': 'Réalisé par',
  'Contractor: {supplier}': 'Prestataire\u00a0: {supplier}',
  'Internal team': 'Équipe interne',
  Instructions: 'Consignes',
  ' by {updated_by}': ' par {updated_by}',
  'Next visits': 'Prochaines visites',
  'No visit planned.': 'Aucune visite planifiée.',
  Contractor: 'Prestataire',
  'Type a code or browse the assets. The place and trade then follow the asset.':
    "Saisissez un code ou parcourez les équipements. Le lieu et le domaine technique suivent alors l'équipement.",
  'What is done': 'Opération réalisée',
  'e.g. "Quarterly service, Tower A chiller"':
    'p. ex. «\u00a0Entretien trimestriel, groupe froid Tour A\u00a0»',
  'Regulatory visits have a legal deadline.': 'Les visites réglementaires ont une échéance légale.',
  'Without an asset: the site, or a place in it.':
    'Sans équipement\u00a0: le site, ou un lieu de ce site.',
  "The asset's trade": "Le domaine technique de l'équipement",
  'In half hours. Above 3 h 30 the visit will be split into several blocks.':
    'Par demi-heures. Au-delà de 3 h 30, la visite sera découpée en plusieurs créneaux.',
  'Every (weeks)': 'Périodicité (semaines)',
  '1, 2, 4, 8, 13 (quarterly), 26 or 52 (yearly).':
    '1, 2, 4, 8, 13 (trimestriel), 26 ou 52 (annuel).',
  'Changing it moves every planned visit.': 'La modifier déplace toutes les visites planifiées.',
  'The next visits follow every period.': 'Les visites suivantes se succèdent à chaque période.',
  'End of the contract. Empty: no end.': 'Fin du contrat. Vide\u00a0: sans fin.',
  '"From the last visit": the next visits restart from the week a visit is closed.':
    '«\u00a0Depuis la dernière visite\u00a0»\u00a0: les visites suivantes repartent de la semaine où une visite est clôturée.',
  'Tolerance (weeks)': 'Tolérance (semaines)',
  'How far one visit may move. Empty: a quarter of the period, at most 8.':
    'De combien une visite peut se déplacer. Vide\u00a0: un quart de la période, 8 au maximum.',
  'Season from week': 'Saison à partir de la semaine',
  'Season to week': "Saison jusqu'à la semaine",
  'e.g. 14 to 22 for checks before summer. May run over the new year (45 to 10).':
    "p. ex. 14 à 22 pour des contrôles avant l'été. Peut chevaucher le nouvel an (45 à 10).",
  'An inactive plan keeps its history and creates no more visits.':
    'Un plan inactif garde son historique et ne crée plus de visites.',
  'Create plan': 'Créer le plan',
  'Edit {code}': 'Modifier {code}',
  'New maintenance plan': 'Nouveau plan de maintenance',
  'Every site': 'Tous les sites',
  'Block a week': 'Bloquer une semaine',
  Week: 'Semaine',
  Reason: 'Motif',
  'e.g. "Data center change freeze", "Summer holidays".':
    "p. ex. «\u00a0Gel des changements au centre de données\u00a0», «\u00a0Vacances d'été\u00a0».",
  'Block week': 'Bloquer la semaine',
  'Blocked weeks': 'Semaines bloquées',
  'Visits should avoid these weeks. The planner warns about visits planned in them (⛔ in the week header, ⚠ on the visit), it does not refuse them.':
    "Les visites devraient éviter ces semaines. Le planning signale les visites prévues dedans (⛔ dans l'en-tête de la semaine, ⚠ sur la visite), sans les refuser.",
  'Remove {week}, {value}': 'Retirer {week}, {value}',
  'every site': 'tous les sites',
  'No week is blocked from this week on.':
    "Aucune semaine n'est bloquée à partir de cette semaine.",
  'Week {week}': 'Semaine {week}',
  'Peak week load': 'Charge de la semaine de pointe',
  'Weeks over capacity': 'Semaines en surcharge',
  'Tight weeks (85–100%)': 'Semaines tendues (85–100\u00a0%)',
  'Busiest week of one trade': "Semaine la plus chargée d'un domaine",
  ' · § regulatory': ' · § réglementaire',
  'Due {week}. Load now: {week2} {loadOf}, {week3} {loadOf2}.':
    'Échéance {week}. Charge actuelle\u00a0: {week2} {loadOf}, {week3} {loadOf2}.',
  'Suggested moves': 'Déplacements proposés',
  "{n} visit could move to smooth the weeks shown. Each stays within its plan's tolerance and season, outside blocked weeks, and a regulatory visit only moves earlier. Nothing is saved until you accept.":
    "{n} visite pourrait être déplacée pour lisser les semaines affichées. Chacune reste dans la tolérance et la saison de son plan, hors semaines bloquées, et une visite réglementaire ne peut qu'avancer. Rien n'est enregistré tant que vous n'acceptez pas.",
  "{n} visits could move to smooth the weeks shown. Each stays within its plan's tolerance and season, outside blocked weeks, and a regulatory visit only moves earlier. Nothing is saved until you accept.":
    "{n} visites pourraient être déplacées pour lisser les semaines affichées. Chacune reste dans la tolérance et la saison de son plan, hors semaines bloquées, et une visite réglementaire ne peut qu'avancer. Rien n'est enregistré tant que vous n'acceptez pas.",
  'Figures before and after the moves ticked': 'Chiffres avant et après les déplacements cochés',
  Figure: 'Indicateur',
  Now: 'Actuellement',
  'With the moves ticked': 'Avec les déplacements cochés',
  ' (lower)': ' (plus bas)',
  'Tick all': 'Tout cocher',
  'Untick all': 'Tout décocher',
  'Accept {n} move': 'Accepter {n} déplacement',
  'Accept {n} moves': 'Accepter {n} déplacements',
  'The weeks shown are already as smooth as the plans allow: no visit can move to lower the load within its rules.':
    'Les semaines affichées sont déjà aussi lisses que les plans le permettent\u00a0: aucune visite ne peut se déplacer pour réduire la charge en respectant ses règles.',
  // planner-editing.js
  'Move cancelled.': 'Déplacement annulé.',
  'Nothing moved.': "Rien n'a été déplacé.",
  'This visit cannot be moved: only planned visits from this week on can.':
    'Cette visite ne peut pas être déplacée\u00a0: seules les visites planifiées à partir de cette semaine le peuvent.',
  Series: 'Série',
  Visit: 'Visite',
  '{week}: where it is now.': '{week}\u00a0: là où elle est déjà.',
  ', load {value}%': ', charge {value}\u00a0%',
  '{what} to {week}{share}. Enter to confirm, Escape to cancel.':
    '{what} vers {week}{share}. Entrée pour confirmer, Échap pour annuler.',
  // planner-page.js
  '{code}: visit {week} → {week2}': '{code}\u00a0: visite {week} → {week2}',
  '{code}: series from {week} → {week2}': '{code}\u00a0: série à partir de {week} → {week2}',
  '{code}: visit of {week} skipped': '{code}\u00a0: visite ({week}) sautée',
  'Balancing: {n} visit moved': 'Lissage\u00a0: {n} visite déplacée',
  'Balancing: {n} visits moved': 'Lissage\u00a0: {n} visites déplacées',
  '{code}: visit of {week} restored': '{code}\u00a0: visite ({week}) rétablie',
  'This plan changed since: reload it.': 'Ce plan a changé entre-temps\u00a0: rechargez-le.',
  'This visit changed since: reload the planner.':
    'Cette visite a changé entre-temps\u00a0: rechargez le planning.',
  'You are offline: nothing was changed.': "Vous êtes hors ligne\u00a0: rien n'a été modifié.",
  'Not changed: {message}': 'Non modifié\u00a0: {message}',
  'Undone: ': 'Annulé\u00a0: ',
  'Redone: ': 'Rétabli\u00a0: ',
  'Loading the year planner…': 'Chargement du planning annuel…',
  'Plan not found': 'Plan introuvable',
  'This maintenance plan does not exist.': "Ce plan de maintenance n'existe pas.",
  'The year planner needs a connection to the server.':
    "Le planning annuel a besoin d'une connexion au serveur.",
  '{week} blocked.': '{week} bloquée.',
  'You are offline: nothing was saved.': "Vous êtes hors ligne\u00a0: rien n'a été enregistré.",
  '{week} is no longer blocked.': "{week} n'est plus bloquée.",
  'You are offline: nothing was removed.': "Vous êtes hors ligne\u00a0: rien n'a été retiré.",
  'you are offline': 'vous êtes hors ligne',
  'No visit was moved.': "Aucune visite n'a été déplacée.",
  '{n} not moved ({code}: {message})': '{n} non déplacée(s) ({code}\u00a0: {message})',
  'No asset has this code': "Aucun équipement n'a ce code",
  'Plan saved.': 'Plan enregistré.',
  'Plan {code} created.': 'Plan {code} créé.',
  'You are offline: the plan was not saved.':
    "Vous êtes hors ligne\u00a0: le plan n'a pas été enregistré.",
  'Loading the settings…': 'Chargement des paramètres…',
  'The planning settings need a connection to the server.':
    "Les paramètres du planning ont besoin d'une connexion au serveur.",
  'Nothing to save: no value was changed.':
    "Rien à enregistrer\u00a0: aucune valeur n'a été modifiée.",
  'Planning settings saved.': 'Paramètres du planning enregistrés.',
  // sla.js and its page in app.js (D86)
  'Service levels': 'Niveaux de service',
  'Loading the service levels…': 'Chargement des niveaux de service…',
  'The service levels need a connection to the server.':
    'Les niveaux de service nécessitent une connexion au serveur.',
  'Service levels saved.': 'Niveaux de service enregistrés.',
  'You are offline: the service levels were not saved.':
    "Vous êtes hors ligne\u00a0: les niveaux de service n'ont pas été enregistrés.",
  'Holiday added.': 'Jour férié ajouté.',
  'You are offline: the holiday was not added.':
    "Vous êtes hors ligne\u00a0: le jour férié n'a pas été ajouté.",
  'Holiday removed.': 'Jour férié supprimé.',
  'You are offline: the holiday was not removed.':
    "Vous êtes hors ligne\u00a0: le jour férié n'a pas été supprimé.",
  'Service level': 'Niveau de service',
  'At risk': 'À risque',
  Met: 'Respecté',
  Missed: 'Dépassé',
  Paused: 'En pause',
  Running: 'En cours',
  'SLA missed': 'SLA dépassé',
  'SLA at risk': 'SLA à risque',
  'No target for this priority.': "Pas d'objectif pour cette priorité.",
  '{at}, due {due}': '{at}, échéance {due}',
  'Due {due}': 'Échéance {due}',
  Response: 'Prise en charge',
  Resolution: 'Résolution',
  'The clocks stop while the work waits for access or an approval.':
    "Les délais sont suspendus tant que l'intervention attend un accès ou une validation.",
  'Response stops at': 'Fin de la prise en charge',
  'SLA hours': 'Heures du SLA',
  'Business days': 'Jours ouvrés',
  Opening: 'Ouverture',
  Closing: 'Fermeture',
  Holiday: 'Jour férié',
  'Response target, {priority}': 'Objectif de prise en charge, {priority}',
  'Resolution target, {priority}': 'Objectif de résolution, {priority}',
  'No target': "Pas d'objectif",
  'Targets in hours (empty: no target)': "Objectifs en heures (vide\u00a0: pas d'objectif)",
  'The first start of the work, or its first assignment to someone.':
    "Le premier démarrage de l'intervention, ou sa première affectation à quelqu'un.",
  'Business hours count the business days and opening hours below, without the holidays.':
    'Les heures ouvrées comptent les jours ouvrés et les horaires ci-dessous, sans les jours fériés.',
  'Corrective work and staff requests reported since {date} are measured.':
    "Les interventions correctives et les demandes d'intervention signalées depuis le {date} sont mesurées.",
  'Save service levels': 'Enregistrer les niveaux de service',
  'Add holiday': 'Ajouter le jour férié',
  Holidays: 'Jours fériés',
  'Days without business hours, on every site. Used in business hours only.':
    'Jours sans heures ouvrées, sur tous les sites. Utilisés en heures ouvrées seulement.',
  'Remove the holiday {name} of {day}': 'Supprimer le jour férié {name} du {day}',
  'No holiday.': 'Aucun jour férié.',
  'Response and resolution targets of corrective work, per priority. A change recomputes the deadlines of the unfinished work orders and is recorded in the audit log.':
    "Objectifs de prise en charge et de résolution des interventions correctives, par priorité. Un changement recalcule les échéances des bons de travaux non terminés et est enregistré dans le journal d'audit.",
  'Response and resolution targets of corrective work, per priority. Only administrators can change them.':
    'Objectifs de prise en charge et de résolution des interventions correctives, par priorité. Seuls les administrateurs peuvent les modifier.',
  'You are offline: the settings were not saved.':
    "Vous êtes hors ligne\u00a0: les paramètres n'ont pas été enregistrés.",
  // planning-rules.js
  'week {weekNumber}': 'semaine {weekNumber}',
  'This visit already has its work order: change the work order instead of the visit.':
    'Cette visite a déjà son bon de travaux\u00a0: modifiez le bon de travaux plutôt que la visite.',
  'This visit is skipped: restore it first.':
    "Cette visite est sautée\u00a0: rétablissez-la d'abord.",
  'A visit cannot be moved into the past.': 'Une visite ne peut pas être déplacée dans le passé.',
  'A regulatory visit can only move earlier: {weekWords} is its deadline.':
    "Une visite réglementaire ne peut qu'avancer\u00a0: la {weekWords} est son échéance.",
  "{week} is outside this visit's tolerance of ± {n} week around {due}.":
    '{week} est hors de la tolérance de cette visite (± {n} semaine autour de la {due}).',
  "{week} is outside this visit's tolerance of ± {n} weeks around {due}.":
    '{week} est hors de la tolérance de cette visite (± {n} semaines autour de la {due}).',
  'The series cannot be moved into the past.': 'La série ne peut pas être déplacée dans le passé.',
  // planning-settings.js
  'Capacity of the next {WEEKS} weeks: {before} h → {after} h':
    'Capacité des {WEEKS} prochaines semaines\u00a0: {before} h → {after} h',
  'Capacity of the next {WEEKS} weeks: {yearCapacity} h':
    'Capacité des {WEEKS} prochaines semaines\u00a0: {yearCapacity} h',
  'Corrective reserve (%)': 'Réserve pour le correctif (%)',
  'Share of each week kept free for breakdowns and staff requests (0 to 80).':
    "Part de chaque semaine gardée libre pour les pannes et les demandes d'intervention (0 à 80).",
  'Daily capacity (hours)': 'Capacité journalière (heures)',
  'Hours each technician and supervisor works on a working day.':
    'Heures travaillées par chaque technicien et superviseur un jour ouvré.',
  'Release horizon (weeks)': 'Horizon de création (semaines)',
  'Work orders of plan visits are created this many weeks ahead.':
    "Les bons de travaux des visites des plans sont créés autant de semaines à l'avance.",
  'Longest block (hours)': 'Créneau le plus long (heures)',
  'Longer visits are flagged in the year planner: they will be split.':
    'Les visites plus longues sont signalées dans le planning annuel\u00a0: elles seront découpées.',
  '{n} technician or supervisor counts as capacity.':
    '{n} technicien ou superviseur compte dans la capacité.',
  '{n} technicians and supervisors count as capacity.':
    '{n} techniciens et superviseurs comptent dans la capacité.',
  ' Last changed by {updated_by} on {updated_at}.':
    ' Dernière modification par {updated_by} le {updated_at}.',
  'Save settings': 'Enregistrer les paramètres',
  'These settings apply at once to every figure of the year planner. Each change is recorded in the audit log.':
    "Ces paramètres s'appliquent immédiatement à tous les chiffres du planning annuel. Chaque modification est enregistrée dans le journal d'audit.",
  // planning.js
  'The site itself': 'Le site lui-même',
  'work order {number}': 'bon de travaux {number}',
  regulatory: 'réglementaire',
  'contractor {value}': 'prestataire {value}',
  'moved from {due_week}': 'déplacée, prévue en\u00a0: {due_week}',
  'outside the season': 'hors saison',
  'in a blocked week': 'dans une semaine bloquée',
  'first planned visit: moving it moves the whole series':
    'première visite planifiée\u00a0: la déplacer déplace toute la série',
  'Longer than {max_block_hours}: will be split':
    'Plus long que {max_block_hours}\u00a0: sera découpé',
  'No specialist for: {uncovered}': 'Aucun spécialiste pour\u00a0: {uncovered}',
  'Weekly workload': 'Charge hebdomadaire',
  'average · peak {peak_load} · {n} week over capacity, {weeks_tight} tight':
    'moyenne · pointe {peak_load} · {n} semaine en surcharge, {weeks_tight} tendue(s)',
  'average · peak {peak_load} · {n} weeks over capacity, {weeks_tight} tight':
    'moyenne · pointe {peak_load} · {n} semaines en surcharge, {weeks_tight} tendue(s)',
  'Trade balance': 'Équilibre des domaines',
  'No specialist': 'Aucun spécialiste',
  'Nothing planned': 'Rien de planifié',
  'over {weekCount} weeks': 'sur {weekCount} semaines',
  'Peak week': 'Semaine de pointe',
  '{load} of capacity, {excess} too many': '{load} de la capacité, {excess} de trop',
  '{load} of capacity': '{load} de la capacité',
  'No capacity counted': 'Aucune capacité comptée',
  'Site spread': 'Dispersion des sites',
  'sites with internal visits a week on average, {peak} at most':
    'sites avec des visites internes par semaine en moyenne, {peak} au maximum',
  'Contractor visits': 'Visites des prestataires',
  'at most {peak} in a week ({peak_week}), not in the load':
    '{peak} au maximum dans une semaine ({peak_week}), hors charge',
  'none in these weeks': 'aucune sur ces semaines',
  'Daily capacity': 'Capacité journalière',
  'Corrective reserve': 'Réserve pour le correctif',
  'Longest block': 'Créneau le plus long',
  'Next 52 weeks': '52 prochaines semaines',
  'Year {y}': 'Année {y}',
  '52 weeks from…': '52 semaines à partir de…',
  'First week': 'Première semaine',
  'Code, title, place…': 'Code, titre, lieu…',
  'Planner filters': 'Filtres du planning',
  'Weeks shown': 'Semaines affichées',
  'Group by': 'Regrouper par',
  '+ New plan': '+ Nouveau plan',
  'Key figures of the weeks shown': 'Chiffres clés des semaines affichées',
  'Needs balancing': 'À lisser',
  'Capacity: {weekly} a week ({daily} a day per technician and supervisor), keeping a {reserve}% reserve for breakdowns and staff requests, set by the administrators.':
    "Capacité\u00a0: {weekly} par semaine ({daily} par jour et par technicien ou superviseur), en gardant une réserve de {reserve}\u00a0% pour les pannes et les demandes d'intervention, fixée par les administrateurs.",
  'Change the settings': 'Modifier les paramètres',
  ' (preview)': ' (aperçu)',
  Load: 'Charge',
  'planned vs {capacity} a week': 'planifié par rapport à {capacity} par semaine',
  '{planned_hours} planned of {capacity}': '{planned_hours} planifiés sur {capacity}',
  '{n} contractor visit, not counted': '{n} visite de prestataire, non comptée',
  '{n} contractor visits, not counted': '{n} visites de prestataires, non comptées',
  Plan: 'Plan',
  '{week}, Monday {monday}. Blocked: {blocked}': '{week}, lundi {monday}. Bloquée\u00a0: {blocked}',
  '{week}, Monday {monday}': '{week}, lundi {monday}',
  'Week ': 'Semaine ',
  ' (this week)': ' (cette semaine)',
  ' blocked: {blocked}': ' bloquée\u00a0: {blocked}',
  'one|{estimated_hours} · every {n} wk': '{estimated_hours} · chaque semaine',
  '{estimated_hours} · every {n} wk': '{estimated_hours} · toutes les {n} sem.',
  contractor: 'prestataire',
  '{n} plan': '{n} plan',
  '{n} plans': '{n} plans',
  'Visits (hours): ': 'Visites (heures)\u00a0: ',
  ' planned': ' planifiée',
  ' work order created': ' bon de travaux créé',
  ' skipped': ' sautée',
  ' regulatory': ' réglementaire',
  ' contractor': ' prestataire',
  ' outside its season or blocked': ' hors saison ou bloquée',
  ' moved': ' déplacée',
  ' first visit: moves the series': ' première visite\u00a0: déplace la série',
  ' blocked week': ' semaine bloquée',
  'Load by trade: ': 'Charge par domaine\u00a0: ',
  capacity: 'capacité',
  'Show the weekly figures as a table': 'Afficher les chiffres hebdomadaires sous forme de tableau',
  'Planned hours and capacity per week': 'Heures planifiées et capacité par semaine',
  Planned: 'Planifié',
  Capacity: 'Capacité',
  'By trade': 'Par domaine',
  ' (tight)': ' (tendue)',
  ' (over)': ' (surcharge)',
  'Maintenance plans, {range}: {n} plan': 'Plans de maintenance, {range}\u00a0: {n} plan',
  'Maintenance plans, {range}: {n} plans': 'Plans de maintenance, {range}\u00a0: {n} plans',
  'No plan matches these filters.': 'Aucun plan ne correspond à ces filtres.',
  'No maintenance plan yet.': "Aucun plan de maintenance pour l'instant.",
  'Nothing to {label}': 'Rien à {label}',
  Undo: 'Annuler',
  'Ctrl+Z': 'Ctrl+Z',
  Redo: 'Rétablir',
  'Ctrl+Y': 'Ctrl+Y',
  'Suggest a smoother plan': 'Proposer un planning plus lisse',
  'Drag a planned visit to another week, or select it and press Shift + arrow keys, then Enter (Escape cancels). The first planned visit of a row moves the whole series; Alt + Shift + arrows move the series from any visit.':
    "Faites glisser une visite planifiée vers une autre semaine, ou sélectionnez-la et appuyez sur Maj + flèches, puis Entrée (Échap annule). La première visite planifiée d'une ligne déplace toute la série\u00a0; Alt + Maj + flèches déplacent la série depuis n'importe quelle visite.",
  // queue.js
  'This record is waiting for a supervisor to resolve a conflict.':
    "Cette fiche attend qu'un superviseur résolve un conflit.",
  // requests.js
  'request|Closed': 'Clôturée',
  Received: 'Reçue',
  'Approved and assigned': 'Approuvée et assignée',
  Done: 'Terminée',
  'Low: it can wait': 'Basse\u00a0: cela peut attendre',
  Normal: 'Normale',
  'High: it disturbs work': 'Haute\u00a0: cela gêne le travail',
  'Urgent: safety risk, or work is impossible':
    'Urgente\u00a0: risque pour la sécurité, ou travail impossible',
  "I don't know": 'Je ne sais pas',
  'Waiting for review': "En attente d'examen",
  'A supervisor will review your request, then assign a technician to it.':
    "Un superviseur va examiner votre demande, puis l'assigner à un technicien.",
  'Cancelled by you': 'Annulée par vous',
  'Nothing: you cancelled this request. If the problem comes back, send a new request.':
    'Rien\u00a0: vous avez annulé cette demande. Si le problème revient, envoyez une nouvelle demande.',
  Rejected: 'Refusée',
  'A supervisor rejected this request: “{note}”. If you disagree or the problem is still there, add a comment or send a new request.':
    "Un superviseur a refusé cette demande\u00a0: «\u00a0{note}\u00a0». Si vous n'êtes pas d'accord ou si le problème persiste, ajoutez un commentaire ou envoyez une nouvelle demande.",
  'A supervisor rejected this request. If you disagree or the problem is still there, add a comment or send a new request.':
    "Un superviseur a refusé cette demande. Si vous n'êtes pas d'accord ou si le problème persiste, ajoutez un commentaire ou envoyez une nouvelle demande.",
  Cancelled: 'Annulée',
  'The maintenance team cancelled this request: the comments may say why. If the problem is still there, send a new request.':
    "L'équipe de maintenance a annulé cette demande\u00a0: les commentaires en donnent peut-être la raison. Si le problème persiste, envoyez une nouvelle demande.",
  'The work is finished ({completed_on}). If the problem is still there, add a comment.':
    'Les travaux sont terminés ({completed_on}). Si le problème persiste, ajoutez un commentaire.',
  'The work is finished. If the problem is still there, add a comment.':
    'Les travaux sont terminés. Si le problème persiste, ajoutez un commentaire.',
  'On hold': 'En attente',
  'The work is paused, for example while waiting for a part, a supplier or access to the room. The comments give the details.':
    "Les travaux sont suspendus, par exemple dans l'attente d'une pièce, d'un fournisseur ou d'un accès au local. Les commentaires donnent les détails.",
  '{who} is working on it, planned to be done by {due}.':
    "{who} s'en occupe, avec une fin prévue d'ici le {due}.",
  'A technician': 'Un technicien',
  '{who} is working on it.': "{who} s'en occupe.",
  Approved: 'Approuvée',
  '{who} will take care of it by {due}.': "{who} s'en chargera d'ici le {due}.",
  '{who} will take care of it.': "{who} s'en chargera.",
  'The maintenance team will review your request and assign a technician.':
    "L'équipe de maintenance va examiner votre demande et l'assigner à un technicien.",
  'Required: pick a room, or say where the problem is.':
    'Obligatoire\u00a0: choisissez un local, ou indiquez où se trouve le problème.',
  'Required: say where the problem is.': 'Obligatoire\u00a0: indiquez où se trouve le problème.',
  'Next step: ': 'Prochaine étape\u00a0: ',
  'sent {created_on}': 'envoyée le {created_on}',
  '{n} comment': '{n} commentaire',
  '{n} comments': '{n} commentaires',
  'Requests the maintenance team is still working on. Finished ones are under All my requests.':
    "Les demandes que l'équipe de maintenance traite encore. Les demandes terminées sont dans Toutes mes demandes.",
  'Every request you sent, newest first.':
    "Toutes les demandes que vous avez envoyées, les plus récentes d'abord.",
  '+ New request': '+ Nouvelle demande',
  '{n} request': '{n} demande',
  '{n} requests': '{n} demandes',
  'You have no open request. Something to fix? Send a new request.':
    "Vous n'avez aucune demande en cours. Quelque chose à réparer\u00a0? Envoyez une nouvelle demande.",
  'You have not sent any request yet.': "Vous n'avez encore envoyé aucune demande.",
  'Where exactly?': 'Où exactement\u00a0?',
  'Optional: anything that helps find the place, e.g. “desk 12-21” or “by the window”.':
    "Facultatif\u00a0: tout ce qui aide à trouver l'endroit, p. ex. «\u00a0bureau 12-21\u00a0» ou «\u00a0près de la fenêtre\u00a0».",
  'Required when the room is not in the list: building, floor and room or desk.':
    "Obligatoire quand le local n'est pas dans la liste\u00a0: bâtiment, étage et local ou bureau.",
  'Building, floor and room or desk, e.g. “Tower A, floor 12, desk 12-21”.':
    'Bâtiment, étage et local ou bureau, p. ex. «\u00a0Tour A, étage 12, bureau 12-21\u00a0».',
  'Not in the list? Choose “Not in the list” and say where it is below.':
    "Absent de la liste\u00a0? Choisissez «\u00a0Absent de la liste\u00a0» et indiquez l'endroit ci-dessous.",
  'Send request': 'Envoyer la demande',
  'Describe the problem and where it is: the maintenance team takes it from there. Fields marked * are required.':
    "Décrivez le problème et l'endroit où il se trouve\u00a0: l'équipe de maintenance prend le relais. Les champs marqués * sont obligatoires.",
  'What is the problem?': 'Quel est le problème\u00a0?',
  'A short summary, e.g. “Light flickering in meeting room 8.03”.':
    'Un résumé court, p. ex. «\u00a0Éclairage qui clignote en salle de réunion 8.03\u00a0».',
  'Kind of problem': 'Nature du problème',
  'Not sure? Keep “{DONT_KNOW}”: the maintenance team will decide.':
    "Vous hésitez\u00a0? Gardez «\u00a0{DONT_KNOW}\u00a0»\u00a0: l'équipe de maintenance décidera.",
  'How urgent is it?': "Quelle est l'urgence\u00a0?",
  'Not sure? Keep “{DONT_KNOW}”.': 'Vous hésitez\u00a0? Gardez «\u00a0{DONT_KNOW}\u00a0».',
  'What happens, since when, and anything that can help the technician.':
    'Ce qui se passe, depuis quand, et tout ce qui peut aider le technicien.',
  Progress: 'Avancement',
  ' (done)': ' (faite)',
  ' (current step)': ' (étape en cours)',
  ' (to come)': ' (à venir)',
  'Approved by a supervisor': 'Approuvée par un superviseur',
  'Rejected by a supervisor': 'Refusée par un superviseur',
  'Work started': 'Travaux commencés',
  'Put on hold': 'Mise en attente',
  'Work finished': 'Travaux terminés',
  'Cancel this request': 'Annuler cette demande',
  'Not needed any more? You can cancel it until a technician starts the work.':
    "Plus nécessaire\u00a0? Vous pouvez l'annuler tant qu'un technicien n'a pas commencé les travaux.",
  '← All my requests': '← Toutes mes demandes',
  '← My open requests': '← Mes demandes en cours',
  '{number} · sent {created_at}': '{number} · envoyée le {created_at}',
  'Status: ': 'Statut\u00a0: ',
  'What was done': 'Ce qui a été fait',
  'Your request': 'Votre demande',
  Where: 'Où',
  'Not specified yet': 'Pas encore précisé',
  Urgency: 'Urgence',
  Technician: 'Technicien',
  'Not assigned yet': 'Pas encore assignée',
  'Planned by': 'Prévue pour le',
  'More information, a question or a follow-up: the maintenance team reads your comments.':
    "Plus d'informations, une question ou un suivi\u00a0: l'équipe de maintenance lit vos commentaires.",
  // review.js
  'Shown to the requester': 'Visible par le demandeur',
  'Approve and assign': 'Approuver et assigner',
  'Reject request': 'Refuser la demande',
  'A staff member': 'Un collaborateur',
  'Staff request to review': "Demande d'intervention à examiner",
  '{author} sent this request on {created_at}. Approve it and choose who will do the work, or reject it: the requester sees your decision.':
    "{author} a envoyé cette demande le {created_at}. Approuvez-la en choisissant qui réalisera l'intervention, ou refusez-la\u00a0: le demandeur voit votre décision.",
  'Assign to': 'Assigner à',
  'Due date': 'Date souhaitée',
  // schedule-editing.js
  'This appointment is locked at {locked_start}: unlock it before moving it.':
    'Ce rendez-vous est verrouillé à {locked_start}\u00a0: déverrouillez-le avant de le déplacer.',
  'Half an hour is the shortest block: remove it from its panel instead.':
    'Une demi-heure est le créneau le plus court\u00a0: supprimez-le plutôt depuis son panneau.',
  'A block lasts {max} h at most.': 'Un créneau dure {max} h au maximum.',
  // schedule-page.js
  'The change could not be undone.': "La modification n'a pas pu être annulée.",
  'The change could not be redone.': "La modification n'a pas pu être rétablie.",
  Undone: 'Annulé',
  Redone: 'Rétabli',
  'Loading the week…': 'Chargement de la semaine…',
  'The week scheduler needs a connection to the server. Technicians find their own week, saved on the device, under My week.':
    "Le planning hebdomadaire a besoin d'une connexion au serveur. Les techniciens retrouvent leur propre semaine, enregistrée sur l'appareil, dans Ma semaine.",
  'Saturday opened for {week}.': 'Samedi ouvert\u00a0: {week}.',
  'Saturday closed for {week}.': 'Samedi fermé\u00a0: {week}.',
  'Sunday opened for {week}.': 'Dimanche ouvert\u00a0: {week}.',
  'Sunday closed for {week}.': 'Dimanche fermé\u00a0: {week}.',
  '{number}: {hours} for {who} on {when}.': '{number}\u00a0: {hours} pour {who} le {when}.',
  'Block moved to {who}, {when}.': 'Créneau déplacé vers {who}, {when}.',
  'Block now {hours}.': 'Créneau désormais de {hours}.',
  'Back to the week': 'Retour à la semaine',
  'This work order is not in this week’s tray':
    "Ce bon de travaux n'est pas dans les éléments à planifier de cette semaine",
  'Add at least one block.': 'Ajoutez au moins un créneau.',
  '{number}: estimate set to {estimate}.': '{number}\u00a0: estimation fixée à {estimate}.',
  '{number}: {hours} scheduled in {n} block.': '{number}\u00a0: {hours} planifiés en {n} créneau.',
  '{number}: {hours} scheduled in {n} blocks.':
    '{number}\u00a0: {hours} planifiés en {n} créneaux.',
  'This block is not in this week': "Ce créneau n'est pas dans cette semaine",
  'Block saved.': 'Créneau enregistré.',
  'Remove this block?': 'Supprimer ce créneau\u00a0?',
  'Its hours go back to the tray.': 'Ses heures retournent dans les éléments à planifier.',
  'block|Remove': 'Supprimer',
  'Block removed: its hours are back in the tray.':
    'Créneau supprimé\u00a0: ses heures sont de retour dans les éléments à planifier.',
  'Appointment locked at {start}.': 'Rendez-vous verrouillé à {start}.',
  'Appointment unlocked.': 'Rendez-vous déverrouillé.',
  'This day is not in this week': "Ce jour n'est pas dans cette semaine",
  'Only supervisors and administrators change the week':
    'Seuls les superviseurs et les administrateurs modifient la semaine',
  '{kind}: {hours} for {person} on {longDay}.': '{kind}\u00a0: {hours} pour {person} le {longDay}.',
  '{person}: usual hours on {longDay}.': '{person}\u00a0: horaires habituels le {longDay}.',
  '{person}: {hours} on {longDay}.': '{person}\u00a0: {hours} le {longDay}.',
  'My week is for technicians and supervisors: administrators are not counted as capacity.':
    'Ma semaine est destinée aux techniciens et aux superviseurs\u00a0: les administrateurs ne comptent pas dans la capacité.',
  'Loading your week…': 'Chargement de votre semaine…',
  'This week has not been saved on this device yet: open My week once with a connection.':
    "Cette semaine n'a pas encore été enregistrée sur cet appareil\u00a0: ouvrez Ma semaine une fois avec une connexion.",
  'Moved up.': 'Monté.',
  'Moved down.': 'Descendu.',
  'Locked at {start}.': 'Verrouillé à {start}.',
  'Time unlocked.': 'Heure déverrouillée.',
  // schedule-panel.js
  ' (not open)': ' (non ouvert)',
  'Remove block {n}': 'Supprimer le créneau {n}',
  '{hours} in {n} block': '{hours} en {n} créneau',
  '{hours} in {n} blocks': '{hours} en {n} créneaux',
  ' · {left} still left after these': ' · encore {left} à planifier après ceux-ci',
  Blocks: 'Créneaux',
  'Estimated time (hours)': 'Durée estimée (heures)',
  'This work order has no estimate yet: give one to know what is left (half-hour steps).':
    "Ce bon de travaux n'a pas encore d'estimation\u00a0: indiquez-en une pour savoir ce qu'il reste (par pas d'une demi-heure).",
  'Propose blocks for this estimate': 'Proposer des créneaux pour cette estimation',
  'Blocks last {max} at most; a longer job is split over the following days.':
    'Les créneaux durent {max} au maximum\u00a0; une intervention plus longue est répartie sur les jours suivants.',
  '+ Add a block': '+ Ajouter un créneau',
  Schedule: 'Planifier',
  'Schedule {number}': 'Planifier {number}',
  'Unassigned: the first person given a block':
    'Non assigné\u00a0: la première personne qui reçoit un créneau',
  Estimate: 'Estimation',
  'None yet': "Aucune pour l'instant",
  'Already scheduled': 'Déjà planifié',
  'Nothing yet': "Rien pour l'instant",
  Left: 'Reste',
  'Carried over': 'Reporté',
  'from {carried_from}': 'depuis\u00a0: {carried_from}',
  'Move or resize': 'Déplacer ou redimensionner',
  'A shorter block sends the difference back to the tray.':
    'Un créneau plus court renvoie la différence dans les éléments à planifier.',
  'e.g. "Keys at reception".': "p. ex. «\u00a0Clés à l'accueil\u00a0».",
  'Save changes': 'Enregistrer les modifications',
  '🔒 {appointmentText}, locked by {locked_by}. Unlock it to move, resize or remove the block.':
    '🔒 {appointmentText}, verrouillé par {locked_by}. Déverrouillez-le pour déplacer, redimensionner ou supprimer le créneau.',
  'Start time': 'Heure de début',
  'Lock this block at a time, e.g. an appointment with the site. It then keeps its day, person and length.':
    'Verrouillez ce créneau à une heure, p. ex. un rendez-vous avec le site. Il garde alors son jour, sa personne et sa durée.',
  Unlock: 'Déverrouiller',
  ' (helper)': ' (renfort)',
  'Remove this block': 'Supprimer ce créneau',
  'Kind of time': 'Nature du temps',
  'e.g. "Lyon → Saclay", "Collect the parts".':
    'p. ex. «\u00a0Lyon → Saclay\u00a0», «\u00a0Récupérer les pièces\u00a0».',
  'Add time': 'Ajouter du temps',
  'Hours this day': 'Heures ce jour-là',
  'Without a change: {hours} (weekend).': 'Sans changement\u00a0: {hours} (week-end).',
  'Without a change: {hours}.': 'Sans changement\u00a0: {hours}.',
  'Save hours': 'Enregistrer les heures',
  'Back to the usual hours': 'Revenir aux horaires habituels',
  '{reason}: {capacity} this day.': '{reason}\u00a0: {capacity} ce jour-là.',
  'Usual hours: {standard}.': 'Horaires habituels\u00a0: {standard}.',
  // schedule-rules.js
  '{minutes} min': '{minutes} min',
  'No estimate yet': "Pas encore d'estimation",
  '{hours_left} left': '{hours_left} restantes',
  'Fully scheduled': 'Entièrement planifié',
  'Over capacity: {total} / {capacity}': 'Surcharge\u00a0: {total} / {capacity}',
  'Work on a day off': 'Travail un jour non travaillé',
  'Weekend day not open': 'Jour de week-end non ouvert',
  '{length} sites: add travel time': '{length} sites\u00a0: ajoutez du temps de déplacement',
  '{length} sites on this day': '{length} sites ce jour-là',
  // schedule.js
  helper: 'renfort',
  'appointment {appointmentText}, locked by {locked_by}':
    'rendez-vous {appointmentText}, verrouillé par {locked_by}',
  'Booked hours': 'Heures réservées',
  'booked vs available, whole team': "réservées par rapport aux disponibles, toute l'équipe",
  'Left to schedule': 'Reste à planifier',
  'planned this week or carried over; {not_planned} h of work without a week':
    'prévu cette semaine ou reporté\u00a0; {not_planned} h de travail sans semaine',
  'Travel time': 'Temps de déplacement',
  'of the booked hours': 'des heures réservées',
  'Sites per day': 'Sites par jour',
  'average per person and working day, {worst} at most':
    'moyenne par personne et par jour travaillé, {worst} au maximum',
  'unfinished work orders from earlier weeks':
    'bons de travaux non terminés des semaines précédentes',
  'Planned this week': 'Prévus cette semaine',
  'Not planned': 'Non planifiés',
  'No trade': 'Sans domaine',
  'due {due_on}': 'pour le {due_on}',
  Unassigned: 'Non assigné',
  'Carried over from {carried_from}': 'Reporté depuis\u00a0: {carried_from}',
  'Nothing here.': 'Rien ici.',
  '{head}: hours of {name} on {longDayLabel}': '{head}\u00a0: heures de {name} le {longDayLabel}',
  'Set leave, part time or weekend hours':
    'Saisir des congés, un temps partiel ou des heures de week-end',
  'Add travel time': 'Ajouter du temps de déplacement',
  'Add time for {name} on {longDayLabel}': 'Ajouter du temps pour {name} le {longDayLabel}',
  '+ Time': '+ Temps',
  General: 'Polyvalent',
  ' · inactive': ' · inactif',
  '{week}: hours of each person per day': '{week}\u00a0: heures de chaque personne par jour',
  ' (today)': " (aujourd'hui)",
  'not open': 'non ouvert',
  '{booked_hours} h booked of {available_hours} h':
    '{booked_hours} h réservées sur {available_hours} h',
  '{value} h left to schedule': '{value} h restant à planifier',
  '{carried_over} carried over': '{carried_over} reporté(s)',
  'Key figures of {week}': 'Chiffres clés — {week}',
  'Week shown': 'Semaine affichée',
  Saturday: 'Samedi',
  Sunday: 'Dimanche',
  'Open Saturday': 'Ouvrir le samedi',
  'Open Sunday': 'Ouvrir le dimanche',
  '{openDays} open this week.': '{openDays} ouvert(s) cette semaine.',
  'Monday to Friday this week.': 'Du lundi au vendredi cette semaine.',
  'Drag a work order from the tray onto a person’s day, or a block to another day or person. With the keyboard, open a card or a block (Enter) to schedule or move it; + and − change a block’s length by half an hour; Ctrl + Z undoes, Ctrl + Y redoes.':
    "Faites glisser un bon de travaux des éléments à planifier vers la journée d'une personne, ou un créneau vers un autre jour ou une autre personne. Au clavier, ouvrez une carte ou un créneau (Entrée) pour le planifier ou le déplacer\u00a0; + et − modifient la durée d'un créneau d'une demi-heure\u00a0; Ctrl + Z annule, Ctrl + Y rétablit.",
  'Tap a work order in “To schedule” to schedule it, or a block to move, resize or remove it.':
    'Touchez un bon de travaux dans «\u00a0À planifier\u00a0» pour le planifier, ou un créneau pour le déplacer, le redimensionner ou le supprimer.',
  'Hide the work orders to schedule': 'Masquer les bons de travaux à planifier',
  'Show the work orders to schedule ({count})':
    'Afficher les bons de travaux à planifier ({count})',
  'Day shown': 'Jour affiché',
  'To schedule': 'À planifier',
  'No active technician or supervisor.': 'Aucun technicien ni superviseur actif.',
  // widget-charts.js
  '{v} wk': '{v} sem.',
  'Weeks of work': 'Semaines de travail',
  'On time': 'Dans les délais',
  'no work scheduled': 'aucun travail planifié',
  Value: 'Valeur',
  'None in this period': 'Aucun sur cette période',
  'Median: {medians}': 'Médiane\u00a0: {medians}',
  '90% within: {p90s}': '90\u00a0% en moins de\u00a0: {p90s}',
  'Up to the 90th percentile': "Jusqu'au 90e centile",
  Median: 'Médiane',
  // widget-order.js
  '{key}, position {value} of {length}': '{key}, position {value} sur {length}',
  '{key}: move cancelled.': '{key}\u00a0: déplacement annulé.',
  '{position}. Dropped.': '{position}. Déposé.',
  '{position}. Picked up: move it with the arrow keys, drop it with Space, or press Escape to cancel.':
    '{position}. Saisi\u00a0: déplacez-le avec les flèches, déposez-le avec Espace, ou appuyez sur Échap pour annuler.',
  // widget-settings.js
  'Switched on by {by} on {at}.': 'Activé par {by} le {at}.',
  'Switched off by {by} on {at}.': 'Désactivé par {by} le {at}.',
  'Switched on on {at}.': 'Activé le {at}.',
  'Switched off on {at}.': 'Désactivé le {at}.',
  'Ticked widgets are offered to supervisors. Untick a widget still in development or not working: supervisors no longer see it in the sidebar or on their dashboards, and get it back, where it was, once it is ticked again. You keep seeing every widget, marked “Off” in the sidebar when it is switched off.':
    "Les indicateurs cochés sont proposés aux superviseurs. Décochez un indicateur encore en développement ou qui ne fonctionne pas\u00a0: les superviseurs ne le voient plus dans la barre latérale ni sur leurs tableaux de bord, et le retrouvent, à sa place, dès qu'il est de nouveau coché. Vous continuez à voir tous les indicateurs, marqués «\u00a0Désactivé\u00a0» dans la barre latérale quand ils sont désactivés.",
  '{off} of {length} widgets switched off.': '{off} indicateur(s) désactivé(s) sur {length}.',
  'Every widget is switched on.': 'Tous les indicateurs sont activés.',
  // widgets-compliance.js
  Late: 'En retard',
  Skipped: 'Sautées',
  'On time %': 'Dans les délais (%)',
  'No preventive visit had its deadline in this period.':
    "Aucune visite préventive n'avait son échéance sur cette période.",
  'Bar chart, visits on time per trade. {map}.':
    'Graphique en barres, visites dans les délais par domaine technique. {map}.',
  ' on time': ' dans les délais',
  '{on_time} of {n} visit done by their deadline; {late}':
    '{on_time} visite sur {n} réalisée avant son échéance\u00a0; {late}',
  '{on_time} of {n} visits done by their deadline; {late}':
    '{on_time} visites sur {n} réalisées avant leur échéance\u00a0; {late}',
  '{late} late': '{late} en retard',
  '; {skipped} skipped (not counted).': '\u00a0; {skipped} sautée(s) (non comptées).',
  Regulatory: 'Réglementaire',
  ' Regulatory visits: {on_time} on time, {late} late, {skipped} skipped.':
    ' Visites réglementaires\u00a0: {on_time} dans les délais, {late} en retard, {skipped} sautée(s).',
  ' Regulatory visits: {on_time} on time, {late} late.':
    ' Visites réglementaires\u00a0: {on_time} dans les délais, {late} en retard.',
  'A visit counts once its deadline week is over: the planned week plus the plan’s tolerance; for a regulatory visit, its due week.':
    "Une visite est comptée une fois sa semaine d'échéance passée\u00a0: la semaine prévue plus la tolérance du plan\u00a0; pour une visite réglementaire, sa semaine limite.",
  'Preventive visits by trade and outcome': 'Visites préventives par domaine technique et résultat',
  'all skipped': 'toutes sautées',
  '{on_time} on time, {late} late': '{on_time} dans les délais, {late} en retard',
  '{skipped} skipped': '{skipped} sautée(s)',
  Month: 'Mois',
  Scheduled: 'Planifiés',
  'Finished in the week': 'Terminés dans la semaine',
  'Kept %': 'Tenus (%)',
  'Hours booked': 'Heures réservées',
  'Booked late %': 'Réservées en retard (%)',
  'No finished week of this period had work orders scheduled in the week scheduler.':
    "Aucune semaine terminée de cette période n'avait de bons de travaux planifiés dans le planning hebdomadaire.",
  'Column chart, share of scheduled work orders finished in their week, per week. {map}.':
    'Histogramme, part des bons de travaux planifiés terminés dans leur semaine, par semaine. {map}.',
  'Column chart, share of scheduled work orders finished in their week, per month. {map}.':
    'Histogramme, part des bons de travaux planifiés terminés dans leur semaine, par mois. {map}.',
  ' kept': ' tenu',
  '{kept} of {n} scheduled work order finished in their week; {missed}.':
    '{kept} bon de travaux planifié sur {n} terminé dans sa semaine\u00a0; {missed}.',
  '{kept} of {n} scheduled work orders finished in their week; {missed}.':
    '{kept} bons de travaux planifiés sur {n} terminés dans leur semaine\u00a0; {missed}.',
  '{missed} not': '{missed} non',
  'Hours booked after the week started': 'Heures réservées après le début de la semaine',
  'Finished weeks only. Hours booked late are blocks added once the week had begun: work that broke into the plan.':
    'Semaines terminées uniquement. Les heures réservées en retard sont des créneaux ajoutés une fois la semaine commencée\u00a0: du travail qui a bousculé le planning.',
  'Schedule kept per week': 'Planning tenu par semaine',
  'Schedule kept per month': 'Planning tenu par mois',
  'Booked after the week started': 'Réservées après le début de la semaine',
  '{kept} of {scheduled} work orders': '{kept} bons de travaux sur {scheduled}',
  '{break_in_hours} of {hours} h booked late':
    '{break_in_hours} h sur {hours} h réservées en retard',
  'Unnamed contractor': 'Prestataire sans nom',
  Visits: 'Visites',
  'No contractor visit had its deadline in this period.':
    "Aucune visite de prestataire n'avait son échéance sur cette période.",
  'Contractor visits by outcome': 'Visites des prestataires par résultat',
  'No contractor visit counted (all skipped).':
    'Aucune visite de prestataire comptée (toutes sautées).',
  'Contractor visits on time: {rate}.': 'Visites des prestataires dans les délais\u00a0: {rate}.',
  'The worst first. Select a column title to sort by it.':
    'Les moins bons en premier. Sélectionnez un titre de colonne pour trier.',
  scheduled: 'planifiés',
  'finished in their week': 'terminés dans leur semaine',
  'not finished in their week': 'non terminés dans leur semaine',
  Deadline: 'Échéance',
  Outcome: 'Résultat',
  'Reason skipped': 'Motif de la visite sautée',
  // widgets-flow.js
  'W{key}': 'S{key}',
  'Week {key}: {days}': 'Semaine {key}\u00a0: {days}',
  week: 'semaine',
  '0–7 days': '0–7 jours',
  '8–30 days': '8–30 jours',
  '31–90 days': '31–90 jours',
  '91+ days': '91 jours et plus',
  Reactive: 'Réactif',
  Improvement: 'Amélioration',
  Opened: 'Ouverts',
  'count|Done': 'Terminés',
  'count|Cancelled': 'Annulés',
  'Unfinished at the end': 'Non terminés à la fin',
  'Column chart, opened and done per week. {map}.':
    'Histogramme, ouverts et terminés par semaine. {map}.',
  'Column chart, opened and done per month. {map}.':
    'Histogramme, ouverts et terminés par mois. {map}.',
  '{title}: {opened} opened, {closed} done': '{title}\u00a0: {opened} ouverts, {closed} terminés',
  'Line chart, unfinished work orders at the end of each week. {map}.':
    'Courbe, bons de travaux non terminés à la fin de chaque semaine. {map}.',
  'Line chart, unfinished work orders at the end of each month. {map}.':
    'Courbe, bons de travaux non terminés à la fin de chaque mois. {map}.',
  'Unfinished at the end of each week': 'Non terminés à la fin de chaque semaine',
  'Unfinished at the end of each month': 'Non terminés à la fin de chaque mois',
  '{opened} opened, {closed} done, {cancelled} cancelled. ':
    '{opened} ouverts, {closed} terminés, {cancelled} annulés. ',
  'The backlog grew by {value}.': 'Le carnet de travaux a augmenté de {value}.',
  'The backlog shrank by {value}.': 'Le carnet de travaux a diminué de {value}.',
  'The backlog is stable.': 'Le carnet de travaux est stable.',
  ' (now {unfinished})': ' (actuellement {unfinished})',
  'Opened and done per week': 'Ouverts et terminés par semaine',
  'Opened and done per month': 'Ouverts et terminés par mois',
  Unfinished: 'Non terminés',
  Total: 'Total',
  ' {n} urgent or high-priority work order is more than 30 days old.':
    ' {n} bon de travaux urgent ou de priorité haute a plus de 30 jours.',
  ' {n} urgent or high-priority work orders are more than 30 days old.':
    ' {n} bons de travaux urgents ou de priorité haute ont plus de 30 jours.',
  'Unfinished work orders by priority and age':
    'Bons de travaux non terminés par priorité et ancienneté',
  '{total} unfinished work orders, by days since they were created. Darker cells hold more.':
    '{total} bons de travaux non terminés, selon le nombre de jours depuis leur création. Plus la case est foncée, plus il y en a.',
  '{hours} h, no capacity': '{hours} h, aucune capacité',
  '{weeks} wk': '{weeks} sem.',
  Unspecified: 'Non précisé',
  'Hours left': 'Heures restantes',
  'Weekly capacity (h)': 'Capacité hebdomadaire (h)',
  '{hours} left on {n} work order without a trade.':
    '{hours} restantes sur {n} bon de travaux sans domaine technique.',
  '{hours} left on {n} work orders without a trade.':
    '{hours} restantes sur {n} bons de travaux sans domaine technique.',
  '{orders} without an estimate is not counted.': "{orders} sans estimation n'est pas compté.",
  '{orders} without an estimate are not counted.': '{orders} sans estimation ne sont pas comptés.',
  '{n} unfinished work order': '{n} bon de travaux non terminé',
  '{n} unfinished work orders': '{n} bons de travaux non terminés',
  'No unfinished work and no capacity for these trades.':
    'Aucun travail en cours et aucune capacité pour ces domaines.',
  'Bar chart, weeks of work per trade. {map}.':
    'Graphique en barres, semaines de travail par domaine technique. {map}.',
  "Hours left on unfinished work, divided by the trade's weekly capacity. Shaded: {BACKLOG_BAND} to {BACKLOG_BAND2} weeks, a common rule of thumb.":
    'Heures restantes sur les travaux non terminés, divisées par la capacité hebdomadaire du domaine. Zone grisée\u00a0: de {BACKLOG_BAND} à {BACKLOG_BAND2} semaines, un repère courant.',
  'Backlog in weeks of work, by trade':
    'Carnet de travaux en semaines de travail, par domaine technique',
  '{hours} h left on {n} work order': '{hours} h restantes sur {n} bon de travaux',
  '{hours} h left on {n} work orders': '{hours} h restantes sur {n} bons de travaux',
  'Capacity: {capacity} h a week': 'Capacité\u00a0: {capacity} h par semaine',
  'Total hours': 'Total des heures',
  'Stacked column chart, share of planned, reactive, staff request and improvement work done per week':
    "Histogramme empilé, part du travail planifié, réactif, des demandes d'intervention et d'amélioration terminé par semaine",
  'Stacked column chart, share of planned, reactive, staff request and improvement work done per month':
    "Histogramme empilé, part du travail planifié, réactif, des demandes d'intervention et d'amélioration terminé par mois",
  '; planned work: {share} over the period':
    '\u00a0; travail planifié\u00a0: {share} sur la période',
  Count: 'Compter',
  Hours: 'Heures',
  'No work order was done in this period.':
    "Aucun bon de travaux n'a été terminé sur cette période.",
  'Planned work: {share} of the hours worked on the work orders done in the period.':
    'Travail planifié\u00a0: {share} des heures passées sur les bons de travaux terminés sur la période.',
  'Planned work: {share} of the work orders done in the period.':
    'Travail planifié\u00a0: {share} des bons de travaux terminés sur la période.',
  '{n} done work order has no actual hours (counted as 0 h).':
    "{n} bon de travaux terminé n'a pas d'heures réelles (compté pour 0 h).",
  '{n} done work orders have no actual hours (counted as 0 h).':
    "{n} bons de travaux terminés n'ont pas d'heures réelles (comptés pour 0 h).",
  'Work closed per week, by kind': 'Travail clôturé par semaine, par nature',
  'Work closed per month, by kind': 'Travail clôturé par mois, par nature',
  'opened in {bucket}': 'ouverts en {bucket}',
  'closed in {bucket}': 'clôturés en {bucket}',
  'cancelled in {bucket}': 'annulés en {bucket}',
  '{age} old': 'depuis {age}',
  'without an estimate': 'sans estimation',
  'without a trade': 'sans domaine technique',
  // widgets-people.js
  '{value} min': '{value} min',
  '{days} d': '{days} j',
  'Time to start': 'Délai de prise en charge',
  'From the report to the first “In progress”':
    'Du signalement au premier passage «\u00a0En cours\u00a0»',
  'Time to done': 'Délai de réalisation',
  'From the report to “Technically done”':
    'Du signalement au statut «\u00a0Terminé techniquement\u00a0»',
  'count|Started': 'Démarrés',
  'Median to start': 'Médiane de prise en charge',
  '90% started within': '90\u00a0% démarrés en moins de',
  '90% done within': '90\u00a0% terminés en moins de',
  'No work order was started or done in this period.':
    "Aucun bon de travaux n'a été démarré ni terminé sur cette période.",
  'Half the work orders were started within {start} and done within {close}.':
    'La moitié des bons de travaux ont été démarrés en moins de {start} et terminés en moins de {close}.',
  '{title} per priority. {map}.': '{title} par priorité. {map}.',
  '{priority}: median {median}, 90% within {p90}':
    '{priority}\u00a0: médiane {median}, 90\u00a0% en moins de {p90}',
  'Response times by priority': 'Délais par priorité',
  Requests: 'Demandes',
  'Median to review': "Médiane d'examen",
  'Median to done': 'Médiane de réalisation',
  'count|Rejected': 'Refusées',
  'No staff request was sent in this period.':
    "Aucune demande d'intervention n'a été envoyée sur cette période.",
  '{n} request received, {reviewed} reviewed.': '{n} demande reçue, {reviewed} examinée(s).',
  '{n} requests received, {reviewed} reviewed.': '{n} demandes reçues, {reviewed} examinée(s).',
  'Median time to review': "Délai médian d'examen",
  'Median time to review per week': "Délai médian d'examen par semaine",
  'Median time to review per month': "Délai médian d'examen par mois",
  'Median time to done': 'Délai médian de réalisation',
  'Median time to done per week': 'Délai médian de réalisation par semaine',
  'Median time to done per month': 'Délai médian de réalisation par mois',
  'Share rejected per week': 'Part refusée par semaine',
  'Share rejected per month': 'Part refusée par mois',
  'Requests waiting for review': "Demandes en attente d'examen",
  'rejected requests, with their reason': 'demandes refusées, avec leur motif',
  'Staff requests per week': "Demandes d'intervention par semaine",
  'Staff requests per month': "Demandes d'intervention par mois",
  'Corrective work orders': 'Bons de travaux correctifs',
  'Cumulative share': 'Part cumulée',
  'All assets': 'Tous les équipements',
  'High and critical': 'Criticité haute et critique',
  'No corrective work on these assets in this period.':
    'Aucun correctif sur ces équipements sur cette période.',
  'Bar chart, corrective work orders per asset. {map}.':
    'Graphique en barres, bons de travaux correctifs par équipement. {map}.',
  'This asset accounts for {share} of the {total} corrective work orders on {assets} assets.':
    'Cet équipement représente {share} des {total} bons de travaux correctifs sur {assets} équipements.',
  'These {count} assets account for {share} of the {total} corrective work orders on {assets} assets.':
    'Ces {count} équipements représentent {share} des {total} bons de travaux correctifs sur {assets} équipements.',
  'Assets with the most corrective work': 'Équipements avec le plus de correctif',
  '{count} · {rateText} cum.': '{count} · {rateText} cumulé',
  '{n} corrective work order': '{n} bon de travaux correctif',
  '{n} corrective work orders': '{n} bons de travaux correctifs',
  'Days broken down': 'Jours en panne',
  'Assets affected': 'Équipements touchés',
  'Down today': "En panne aujourd'hui",
  'None of the {watched} high and critical assets was broken down in this period.':
    "Aucun des {watched} équipements à criticité haute ou critique n'a été en panne sur cette période.",
  'Bar chart, days high and critical assets were broken down, per site. {map}.':
    'Graphique en barres, jours de panne des équipements à criticité haute ou critique, par site. {map}.',
  ' {n} high or critical asset is broken down today.':
    " {n} équipement à criticité haute ou critique est en panne aujourd'hui.",
  ' {n} high or critical assets are broken down today.':
    " {n} équipements à criticité haute ou critique sont en panne aujourd'hui.",
  '{days} days broken down in all, among {watched} high and critical assets.':
    '{days} jours de panne au total, parmi {watched} équipements à criticité haute ou critique.',
  'Days on which an asset was broken down at some time; a breakdown still going on counts until today.':
    "Jours pendant lesquels un équipement a été en panne à un moment\u00a0; une panne toujours en cours compte jusqu'à aujourd'hui.",
  'Days broken down per site': 'Jours de panne par site',
  '{days} d · {n} asset': '{days} j · {n} équipement',
  '{days} d · {n} assets': '{days} j · {n} équipements',
  '{days} days broken down': '{days} jours de panne',
  '{n} asset affected, {down} down today': "{n} équipement touché, {down} en panne aujourd'hui",
  '{n} assets affected, {down} down today': "{n} équipements touchés, {down} en panne aujourd'hui",
  'Booked this week (h)': 'Réservées cette semaine (h)',
  'Capacity this week (h)': 'Capacité cette semaine (h)',
  'Nobody to show for these sites.': 'Personne à afficher pour ces sites.',
  'Stacked bar chart, unfinished work orders per person by priority. {map}.':
    'Graphique en barres empilées, bons de travaux non terminés par personne et par priorité. {map}.',
  'Hours left: estimates minus the hours already worked. Booked: blocks of the week scheduler in {week}.':
    'Heures restantes\u00a0: estimations moins les heures déjà passées. Réservées\u00a0: créneaux du planning hebdomadaire en {week}.',
  'Unfinished work per person': 'Travail non terminé par personne',
  '{total} · {hours_left} h left{value}': '{total} · {hours_left} h restantes{value}',
  'Estimated (h)': 'Estimé (h)',
  'Actual (h)': 'Réel (h)',
  'Actual ÷ estimate': 'Réel ÷ estimé',
  'No work order done in this period has both an estimate and actual hours.':
    "Aucun bon de travaux terminé sur cette période n'a à la fois une estimation et des heures réelles.",
  'Bar chart, actual hours divided by estimated hours per trade. {map}.':
    'Graphique en barres, heures réelles divisées par les heures estimées par domaine technique. {map}.',
  'Work took {ratio} its estimate: estimates are too low.':
    'Le travail a pris {ratio} de son estimation\u00a0: les estimations sont trop basses.',
  'Work took {ratio} its estimate: estimates are too high.':
    'Le travail a pris {ratio} de son estimation\u00a0: les estimations sont trop hautes.',
  'Work took {ratio} its estimate: estimates are about right.':
    'Le travail a pris {ratio} de son estimation\u00a0: les estimations sont plutôt justes.',
  'Dashed line: 1.0×, the estimate. {count} done work orders with both hours.':
    "Ligne pointillée\u00a0: 1,0×, l'estimation. {count} bons de travaux terminés avec les deux valeurs.",
  'Estimates against actual hours, by trade':
    'Estimations et heures réelles, par domaine technique',
  '{actual} h worked for {estimated} h estimated': '{actual} h passées pour {estimated} h estimées',
  started: 'démarrés',
  'response|done': 'terminés',
  rejected: 'refusées',
  'waiting for review': "en attente d'examen",
  done: 'réalisées',
  'high and critical assets': 'équipements à criticité haute ou critique',
  'asset {rest}': 'équipement {rest}',
  unassigned: 'non assignés',
  'person {split}': 'personne {split}',
  'Hours to review': 'Heures avant examen',
  'Hours to done': 'Heures avant réalisation',
  'Reason rejected': 'Motif du refus',
  'Previous work order': 'Bon de travaux précédent',
  'Days since it was done': 'Jours depuis sa réalisation',
  // widgets.js
  'Flow and backlog': 'Flux et carnet de travaux',
  Compliance: 'Conformité',
  Responsiveness: 'Réactivité',
  People: 'Personnes',
  Lists: 'Listes',
  'Work orders in progress': 'Bons de travaux en cours',
  'Opened vs done': 'Ouverts et terminés',
  'Backlog by age and priority': 'Carnet de travaux par ancienneté et priorité',
  'Backlog in weeks of work': 'Carnet de travaux en semaines de travail',
  'Planned vs reactive work': 'Travail planifié et réactif',
  'Preventive maintenance compliance': 'Respect du préventif',
  'Regulatory visits late': 'Visites réglementaires en retard',
  'Week schedule kept': 'Respect du planning hebdomadaire',
  Contractors: 'Prestataires',
  'Time to start and to close': 'Délais de prise en charge et de clôture',
  // widgets-people.js: SLA compliance (D86)
  '{share} ({met} of {counted})': '{share} ({met} sur {counted})',
  'Response met': 'Prise en charge respectée',
  'Resolution met': 'Résolution respectée',
  'Corrective work and staff requests reported since {date}. Unfinished work already late counts as missed.':
    "Interventions correctives et demandes d'intervention signalées depuis le {date}. Le travail non terminé déjà en retard compte comme dépassé.",
  'No work order with a service level stopped its clock or is late in this period.':
    "Aucun bon de travaux soumis à un niveau de service n'a terminé un délai ni n'est en retard sur cette période.",
  'Response met: {response}. Resolution met: {resolution}.':
    'Prise en charge respectée\u00a0: {response}. Résolution respectée\u00a0: {resolution}.',
  'Service levels met, by priority': 'Niveaux de service respectés, par priorité',
  response: 'prise en charge',
  resolution: 'résolution',
  'Service levels met': 'Niveaux de service respectés',
  'Assets with the most breakdowns': 'Équipements les plus souvent en panne',
  'Repeat failures': 'Pannes répétées',
  'Critical assets out of service': 'Équipements critiques hors service',
  'Workload per person': 'Charge par personne',
  'Estimates vs actual hours': 'Estimations et heures réelles',
  'Work orders by category': 'Bons de travaux par domaine technique',
  '{length} sites': '{length} sites',
  '{length} trades': '{length} domaines',
  'Last {period} days': '{period} derniers jours',
  'Site and trade filter not used': 'Filtres site et domaine non utilisés',
  'Site filter not used': 'Filtre site non utilisé',
  'Trade filter not used': 'Filtre domaine non utilisé',
  today: "aujourd'hui",
  'next 7 days': '7 prochains jours',
  ' (last {value} days)': ' ({value} derniers jours)',
  Share: 'Part',
  Updated: 'Mis à jour',
  'Estimated hours': 'Heures estimées',
  'Actual hours': 'Heures réelles',
  'Last serviced': 'Dernière révision',
  '{value}: open the list': '{value}\u00a0: ouvrir la liste',
  '{share} of the corrective work': '{share} du travail correctif',
  '{label}, last {period} days': '{label}, {period} derniers jours',
  'No figures for this widget.': 'Aucun chiffre pour cet indicateur.',
  // work-order-schedule.js
  'appointment {appointmentText}': 'rendez-vous {appointmentText}',
  you: 'vous',
  'heading|Scheduled': 'Planification',
};

/**
 * Messages of the API (written in English by the server, docs/api-design.md) shown to users:
 * error messages and field messages, translated by serverText(). Messages holding a value
 * (a code, a name, a number) are in FR_PATTERNS. test/i18n.test.js checks that each one is
 * still in the server code.
 */
export const FR_SERVER = {
  'Invalid token': 'Jeton non valide',
  'Missing bearer token': "Jeton d'authentification manquant",
  'This account is deactivated': 'Ce compte est désactivé',
  'Token expired': 'Session expirée',
  'Your password changed: log in again': 'Votre mot de passe a changé\u00a0: reconnectez-vous',
  'Your role does not allow this action': 'Votre rôle ne permet pas cette action',
  'Internal server error': 'Erreur interne du serveur',
  'Request body too large': 'Requête trop volumineuse',
  'Unknown field': 'Champ inconnu',
  'Asset not found': 'Équipement introuvable',
  'Invalid query': 'Requête non valide',
  'Only with drill': 'Seulement avec un détail',
  'Too many assistant requests. Try again in a few minutes.':
    "Trop de demandes à l'assistant. Réessayez dans quelques minutes.",
  'Only administrators can see changes to user accounts':
    'Seuls les administrateurs peuvent voir les modifications des comptes utilisateur',
  'Record not found': 'Fiche introuvable',
  'Too many login attempts, try again later':
    'Trop de tentatives de connexion, réessayez plus tard',
  'Too many suggestions sent, try again later': 'Trop de suggestions envoyées, réessayez plus tard',
  'Give a starting week or a year, not both':
    'Indiquez une semaine de début ou une année, pas les deux',
  'Visit not found': 'Visite introuvable',
  'Work order not found': 'Bon de travaux introuvable',
  'This asset changed since you opened it. Reload it and try again.':
    "Cet équipement a changé depuis que vous l'avez ouvert. Rechargez-le et réessayez.",
  'This asset has a conflict waiting for arbitration.':
    "Cet équipement a un conflit en attente d'arbitrage.",
  'Expected a date as YYYY-MM-DD': 'Date attendue au format AAAA-MM-JJ',
  'Expected a week as YYYY-Www': 'Semaine attendue au format AAAA-Sss',
  'Not a valid date': 'Date non valide',
  'Not a valid week': 'Semaine non valide',
  'Use steps of half an hour': "Utilisez des pas d'une demi-heure",
  'This place cannot be chosen for a request.': 'Ce lieu ne peut pas être choisi pour une demande.',
  'This place is not in use any more.': "Ce lieu n'est plus en usage.",
  'This place is not in use: choose a place in use.':
    'Ce lieu est hors usage\u00a0: choisissez un lieu en usage.',
  'This place is not on the site chosen.': "Ce lieu n'est pas sur le site choisi.",
  'The maintenance team is updating this request: try again later.':
    "L'équipe de maintenance met à jour cette demande\u00a0: réessayez plus tard.",
  'This request changed since you opened it: reload it and review it again.':
    "Cette demande a changé depuis que vous l'avez ouverte\u00a0: rechargez-la et examinez-la de nouveau.",
  'This request has already been reviewed.': 'Cette demande a déjà été examinée.',
  'This request is already finished.': 'Cette demande est déjà terminée.',
  'This request is waiting for a conflict to be resolved.':
    "Cette demande attend la résolution d'un conflit.",
  'This work order is not a staff request.':
    "Ce bon de travaux n'est pas une demande d'intervention.",
  'Work on this request has started: add a comment to ask the maintenance team to stop.':
    "Les travaux ont commencé pour cette demande\u00a0: ajoutez un commentaire pour demander à l'équipe de maintenance d'arrêter.",
  'Choose a start time on the hour or the half hour, from 00:00 to 23:30.':
    "Choisissez une heure de début à l'heure pile ou à la demie, de 00:00 à 23:30.",
  'Give this work order an estimate before scheduling it.':
    'Donnez une estimation à ce bon de travaux avant de le planifier.',
  'This appointment would end after midnight.': 'Ce rendez-vous se terminerait après minuit.',
  'This staff request is waiting for its review: approve it before scheduling it.':
    "Cette demande d'intervention attend son examen\u00a0: approuvez-la avant de la planifier.",
  'This work order is finished: it cannot get more time.':
    'Ce bon de travaux est terminé\u00a0: il ne peut plus recevoir de temps.',
  'This work order is finished: its blocks are kept as history.':
    'Ce bon de travaux est terminé\u00a0: ses créneaux sont conservés comme historique.',
  'This is the last active administrator: keep at least one.':
    "C'est le dernier administrateur actif\u00a0: gardez-en au moins un.",
  'You cannot deactivate your own account.': 'Vous ne pouvez pas désactiver votre propre compte.',
  'The creation time is in the future.': "L'heure de création est dans le futur.",
  'Closed and cancelled work orders are read-only.':
    'Les bons de travaux clôturés et annulés sont en lecture seule.',
  'Its requester cancelled this request: it cannot be brought back.':
    'Le demandeur a annulé cette demande\u00a0: elle ne peut pas être rétablie.',
  'This request was rejected: it cannot be brought back.':
    'Cette demande a été refusée\u00a0: elle ne peut pas être rétablie.',
  'On a closed or cancelled work order, only the status and the fields it needs change.':
    "Sur un bon de travaux clôturé ou annulé, seuls le statut et les champs qu'il demande changent.",
  'This work has started: resume it instead of reopening it.':
    'Ce travail a commencé\u00a0: reprenez-le au lieu de le rouvrir.',
  'Only supervisors and admins close work orders.':
    'Seuls les superviseurs et les administrateurs clôturent les bons de travaux.',
  'Assign this work order to an active person to reopen it.':
    'Assignez ce bon de travaux à une personne active pour le rouvrir.',
  'A hold reason is given only when putting the work on hold.':
    'Un motif de mise en attente se donne seulement en mettant le travail en attente.',
  'The report is waived only on technically done work.':
    "La dispense de compte rendu ne s'applique qu'à un travail terminé techniquement.",
  'The completion date is set when the work is technically done.':
    'La date de fin technique se fixe quand le travail est terminé techniquement.',
  'The closing date is set when the work order is closed.':
    'La date de clôture se fixe quand le bon de travaux est clôturé.',
  'The completion date cannot be in the future.':
    'La date de fin technique ne peut pas être dans le futur.',
  'The closing date cannot be earlier than the completion date.':
    'La date de clôture ne peut pas être antérieure à la date de fin technique.',
  'Only supervisors and admins waive the work report':
    'Seuls les superviseurs et les administrateurs dispensent du compte rendu',
  'Already used': 'Déjà utilisé',
  'Choose the place of the asset': "Choisissez le lieu de l'équipement",
  'Invalid body': 'Données non valides',
  'Assistant timed out': "L'assistant n'a pas répondu à temps",
  'The site is not the site of the asset': "Le site n'est pas celui de l'équipement",
  'This asset does not exist': "Cet équipement n'existe pas",
  "This doesn't look like a maintenance job. Describe the work done or the fault found.":
    'Cela ne ressemble pas à une intervention de maintenance. Décrivez le travail réalisé ou le défaut constaté.',
  'Invalid username or password': 'Identifiant ou mot de passe incorrect',
  'Not correct': 'Incorrect',
  'The current password is not correct': 'Le mot de passe actuel est incorrect',
  'Give each of your dashboards once': 'Indiquez chacun de vos tableaux de bord une seule fois',
  'No field to update': 'Aucun champ à modifier',
  'This dashboard changed since you opened it. Reload it and try again.':
    "Ce tableau de bord a changé depuis que vous l'avez ouvert. Rechargez-le et réessayez.",
  'Your last dashboard cannot be deleted':
    'Votre dernier tableau de bord ne peut pas être supprimé',
  'This widget has no records to export': "Cet indicateur n'a aucune fiche à exporter",
  'Unknown segment': 'Segment inconnu',
  'Unknown widget': 'Indicateur inconnu',
  'Feedback not found': 'Suggestion introuvable',
  'Must be a path of this site': 'Doit être un chemin de ce site',
  'Already used here': 'Déjà utilisé ici',
  'Choose another type': 'Choisissez un autre type',
  'Choose a site of the list': 'Choisissez un site de la liste',
  'Level type not found': 'Type de niveau introuvable',
  'Must be Site': 'Doit être Site',
  'Only a site is of the type Site.': 'Seul un site est du type Site.',
  'Only the name of the site type can change.': 'Seul le nom du type site peut changer.',
  'Put the place above it back in use first.': "Remettez d'abord en usage le lieu qui le contient.",
  'The place above is not in use': 'Le lieu qui le contient est hors usage',
  "The site must be the place's site.": 'Le site doit être celui du lieu.',
  'This level type does not exist.': "Ce type de niveau n'existe pas.",
  'This level type is not in use any more.': "Ce type de niveau n'est plus en usage.",
  'This parent place does not exist.': "Ce lieu parent n'existe pas.",
  'This site is already used by records: its name cannot change any more.':
    'Ce site est déjà utilisé par des fiches\u00a0: son nom ne peut plus changer.',
  'This site is not in the list of places.': "Ce site n'est pas dans la liste des lieux.",
  'Unknown place': 'Lieu inconnu',
  'Unknown site': 'Site inconnu',
  'Used by records': 'Utilisé par des fiches',
  'Only a skipped visit can be restored.': 'Seule une visite sautée peut être rétablie.',
  'Say why the visit is skipped': 'Indiquez pourquoi la visite est sautée',
  'This visit changed since you opened it. Reload and try again.':
    "Cette visite a changé depuis que vous l'avez ouverte. Rechargez et réessayez.",
  'This visit has its work order: cancel the work order to skip the visit.':
    'Cette visite a son bon de travaux\u00a0: annulez le bon de travaux pour sauter la visite.',
  'This visit is already skipped.': 'Cette visite est déjà sautée.',
  'This visit was skipped by cancelling its work order: it cannot come back.':
    "Cette visite a été sautée par l'annulation de son bon de travaux\u00a0: elle ne peut pas revenir.",
  'Already blocked': 'Déjà bloquée',
  'Blocked week not found': 'Semaine bloquée introuvable',
  'Say why the week is blocked': 'Indiquez pourquoi la semaine est bloquée',
  'The planner shows from two years back to one year ahead of the current week':
    'Le planning va de deux ans en arrière à un an en avant de la semaine en cours',
  'The settings changed since you opened them. Reload and try again.':
    'Les paramètres ont changé depuis que vous les avez ouverts. Rechargez et réessayez.',
  'This week is already blocked for this site.': 'Cette semaine est déjà bloquée pour ce site.',
  "The place must be the asset's place.": "Le lieu doit être celui de l'équipement.",
  "The site must be the asset's site.": "Le site doit être celui de l'équipement.",
  'This plan changed since you opened it. Reload it and try again.':
    "Ce plan a changé depuis que vous l'avez ouvert. Rechargez-le et réessayez.",
  'Unknown asset': 'Équipement inconnu',
  'Required: pick a room or say where the problem is':
    'Obligatoire\u00a0: choisissez un local ou indiquez où se trouve le problème',
  'This client_id is already used': 'Ce client_id est déjà utilisé',
  'Block not found': 'Créneau introuvable',
  'Expected a time as HH:MM': 'Heure attendue au format HH:MM',
  'Only active technicians and supervisors can be given time.':
    'Seuls les techniciens et superviseurs actifs peuvent recevoir du temps.',
  'Only work blocks can be appointments.':
    'Seuls les créneaux de travail peuvent être des rendez-vous.',
  'Only work blocks have a work order': 'Seuls les créneaux de travail ont un bon de travaux',
  'Other time': 'Autre temps',
  'Say why the hours change': 'Indiquez pourquoi les heures changent',
  'This block changed since you opened it. Reload and try again.':
    "Ce créneau a changé depuis que vous l'avez ouvert. Rechargez et réessayez.",
  'This day changed since you opened it. Reload and try again.':
    "Cette journée a changé depuis que vous l'avez ouverte. Rechargez et réessayez.",
  'You can only lock your own blocks.': 'Vous ne pouvez verrouiller que vos propres créneaux.',
  'You can only order your own day.': 'Vous ne pouvez ordonner que votre propre journée.',
  'This widget is switched off by an administrator':
    'Cet indicateur est désactivé par un administrateur',
  'An asset or a place is required': 'Un équipement ou un lieu est obligatoire',
  'Review this staff request first: approve it to assign it, or reject it.':
    "Examinez d'abord cette demande d'intervention\u00a0: approuvez-la pour l'assigner, ou refusez-la.",
  'Technicians can only assign new work orders to themselves':
    "Les techniciens ne peuvent assigner les nouveaux bons de travaux qu'à eux-mêmes",
  'This user cannot be assigned to a work order.':
    'Cet utilisateur ne peut pas être assigné à un bon de travaux.',
  'This user cannot supervise a work order.':
    'Cet utilisateur ne peut pas superviser un bon de travaux.',
  'Not part of this conflict': 'Ne fait pas partie de ce conflit',
  'Only fields of the conflict can be merged': 'Seuls les champs du conflit peuvent être fusionnés',
  'Required for MERGE': 'Obligatoire pour une fusion',
  'Technicians can only change work orders assigned to them':
    'Les techniciens ne peuvent modifier que les bons de travaux qui leur sont assignés',
  'The body must be a JSON object': 'Le corps de la requête doit être un objet JSON',
  'These fields cannot be changed': 'Ces champs ne peuvent pas être modifiés',
  'This conflict is already resolved': 'Ce conflit est déjà résolu',
  'Your role does not allow changing these fields':
    'Votre rôle ne permet pas de modifier ces champs',
  'Invalid params': 'Paramètres non valides',
  Forbidden: 'Accès refusé',
  'Not Found': 'Introuvable',
  'Bad Request': 'Requête non valide',
  // Service levels (D86)
  'The service levels changed since you opened them. Reload and try again.':
    'Les niveaux de service ont changé depuis leur ouverture. Rechargez et réessayez.',
  'This day is already a holiday.': 'Ce jour est déjà un jour férié.',
  'Already a holiday': 'Déjà un jour férié',
  'Holiday not found': 'Jour férié introuvable',
  'The resolution target cannot be shorter than the response target':
    "L'objectif de résolution ne peut pas être plus court que celui de prise en charge",
  'Each priority once': 'Chaque priorité une seule fois',
  'Choose at least one day': 'Choisissez au moins un jour',
  'Each day once': 'Chaque jour une seule fois',
  'The opening comes before the closing': "L'ouverture doit précéder la fermeture",
};

/**
 * French labels of the enum codes (labels.js → VALUE_LABELS), keyed by enum and code: the
 * agreement follows the noun (un bon de travaux "Clôturé", une demande "Refusée").
 */
export const FR_VALUES = {
  role: {
    STAFF: 'Collaborateur',
    TECHNICIAN: 'Technicien',
    SUPERVISOR: 'Superviseur',
    ADMIN: 'Administrateur',
  },
  category: {
    HVAC: 'CVC',
    ELECTRICAL: 'Électricité',
    FIRE_SAFETY: 'Sécurité incendie',
    PLUMBING: 'Plomberie',
    NETWORK_CABLING: 'Câblage réseau',
    SECURITY: 'Sûreté',
    UNSPECIFIED: 'Non précisé',
  },
  criticality: { LOW: 'Faible', MEDIUM: 'Moyenne', HIGH: 'Haute', CRITICAL: 'Critique' },
  asset_status: {
    IN_SERVICE: 'En service',
    BROKEN_DOWN: 'En panne',
    UNDER_MAINTENANCE: 'En maintenance',
    OUT_OF_SERVICE: 'Hors service',
  },
  work_order_type: {
    CORRECTIVE: 'Correctif',
    PREVENTIVE: 'Préventif',
    IMPROVEMENT: 'Amélioration',
    REGULATORY: 'Réglementaire',
  },
  work_order_status: {
    OPEN: 'Ouvert',
    IN_PROGRESS: 'En cours',
    ON_HOLD: 'En attente',
    COMPLETED: 'Terminé techniquement',
    CLOSED: 'Clôturé',
    CANCELLED: 'Annulé',
  },
  work_order_priority: { LOW: 'Basse', NORMAL: 'Normale', HIGH: 'Haute', URGENT: 'Urgente' },
  hold_reason: {
    WAITING_PARTS: 'En attente de pièces',
    WAITING_CONTRACTOR: "En attente d'un prestataire",
    WAITING_ACCESS: "En attente d'accès",
    WAITING_APPROVAL: 'En attente de validation',
    OTHER: 'Autre',
  },
  review_status: {
    PENDING: 'À examiner',
    APPROVED: 'Approuvée',
    REJECTED: 'Refusée',
    WITHDRAWN: 'Retirée',
  },
  schedule_mode: { FIXED: 'Calendrier fixe', FLOATING: 'Depuis la dernière visite' },
  performed_by: { INTERNAL: 'Équipe interne', CONTRACTOR: 'Prestataire' },
  occurrence_status: { PLANNED: 'Planifiée', RELEASED: 'Bon de travaux créé', SKIPPED: 'Sautée' },
  planning_group: { site: 'Site', area: 'Zone', category: 'Domaine technique' },
  allocation_kind: {
    WORK: 'Travail',
    TRAVEL: 'Déplacement',
    PREPARATION: 'Préparation',
    OTHER: 'Autre temps',
  },
  capacity_reason: {
    LEAVE: 'Congés',
    PART_TIME: 'Temps partiel',
    TRAINING: 'Formation',
    WEEKEND: 'Travail le week-end',
    OTHER: 'Autre',
  },
  sla_response_stop: { START: 'Premier démarrage', ASSIGNMENT: 'Première affectation' },
  sla_hours_mode: { CALENDAR: 'Heures calendaires', BUSINESS: 'Heures ouvrées' },
};

const status = (code) => FR_VALUES.work_order_status[code] ?? code;

/**
 * Messages of the API holding a value: [pattern of the English message, French text with $1…
 * or a function of the matches]. The first pattern that matches is used.
 * @type {[RegExp, string | ((match: string, ...groups: string[]) => string)][]}
 */
export const FR_PATTERNS = [
  [
    /^This asset has (\d+) work orders?: its history must be kept\. Set its status to Out of service instead\.$/,
    'Cet équipement a $1 bon(s) de travaux\u00a0: son historique doit être conservé. Passez plutôt son statut à Hors service.',
  ],
  [
    /^The text is too long: (\d+) characters, (\d+) at most\.$/,
    'Le texte est trop long\u00a0: $1 caractères, $2 au maximum.',
  ],
  [
    /^The text is too short: describe the job in at least (\d+) words\.$/,
    "Le texte est trop court\u00a0: décrivez l'intervention en $1 mots au moins.",
  ],
  [
    /^This widget is already on the dashboard: (.+)$/,
    'Cet indicateur est déjà sur le tableau de bord\u00a0: $1',
  ],
  [/^Unknown option of (.+): (.+)$/, 'Option inconnue pour $1\u00a0: $2'],
  [/^Unknown widget: (.+)$/, 'Indicateur inconnu\u00a0: $1'],
  [
    /^This appointment is locked at (.+): unlock it before moving, resizing or removing it\.$/,
    'Ce rendez-vous est verrouillé à $1\u00a0: déverrouillez-le avant de le déplacer, de le redimensionner ou de le supprimer.',
  ],
  [
    /^This user has (\d+) unfinished work orders?: reassign (?:it|them) first\.$/,
    "Cet utilisateur a $1 bon(s) de travaux non terminé(s)\u00a0: réassignez-les d'abord.",
  ],
  [
    /^The creation time is more than (\d+) days old\.$/,
    "L'heure de création date de plus de $1 jours.",
  ],
  [
    /^The status cannot change from (\w+) to (\w+)\.$/,
    (_, from, to) => `Le statut ne peut pas passer de ${status(from)} à ${status(to)}.`,
  ],
  [/^The code (.+) is already used here\.$/, 'Le code $1 est déjà utilisé ici.'],
  [/^The code (.+) is already used$/, 'Le code $1 est déjà utilisé'],
  [/^At most (\d+) characters$/, '$1 caractères au maximum'],
  [/^At least (\d+) characters$/, 'Au moins $1 caractères'],
  [/^Switched off by an administrator: (.+)$/, 'Désactivé par un administrateur\u00a0: $1'],
  [
    /^You already have a dashboard named "(.+)"$/,
    'Vous avez déjà un tableau de bord nommé «\u00a0$1\u00a0»',
  ],
  [/^You can have at most (\d+) dashboards$/, 'Vous pouvez avoir au plus $1 tableaux de bord'],
  [/^The place is on (.+)$/, 'Le lieu est sur le site $1'],
  [/^There is already a level type named (.+)\.$/, 'Il existe déjà un type de niveau nommé $1.'],
  [/^There is already a place named (.+) here\.$/, 'Il existe déjà un lieu nommé $1 ici.'],
  [/^The token (.+) is already used\.$/, 'La balise $1 est déjà utilisée.'],
  [
    /^This place changed since you opened it\. Reload it and try again\.$/,
    "Ce lieu a changé depuis que vous l'avez ouvert. Rechargez-le et réessayez.",
  ],
  [
    /^This level type changed since you opened it\. Reload it and try again\.$/,
    "Ce type de niveau a changé depuis que vous l'avez ouvert. Rechargez-le et réessayez.",
  ],
  [/^The asset is in (.+)$/, "L'équipement est dans $1"],
  [/^The asset is on (.+)$/, "L'équipement est sur le site $1"],
  [
    /^This time overlaps another appointment of the day, at (.+)\.$/,
    'Cet horaire chevauche un autre rendez-vous de la journée, à $1.',
  ],
  [/^The username (.+) is already used$/, "L'identifiant $1 est déjà utilisé"],
  [/^One of (.+) days$/, "L'une de ces durées en jours\u00a0: $1"],
  [/^Unknown sort key: (.+)$/, 'Clé de tri inconnue\u00a0: $1'],
  // Default messages of the validation library (zod) on the API.
  [/^Too small: expected string to have >=1 characters?$/, 'Obligatoire'],
  [/^Too small: expected string to have >=(\d+) characters$/, 'Au moins $1 caractères'],
  [/^Too big: expected string to have <=(\d+) characters$/, '$1 caractères au maximum'],
  [/^Too small: expected number to be >=?(.+)$/, 'Doit être supérieur ou égal à $1'],
  [/^Too big: expected number to be <=?(.+)$/, 'Doit être inférieur ou égal à $1'],
  [/^Too small: expected array to have >=(\d+) items?$/, 'Au moins $1 élément(s)'],
  [/^Too big: expected array to have <=(\d+) items?$/, '$1 élément(s) au maximum'],
  [/^Invalid option: expected one of .+$/, 'Choix non valide'],
  [/^Invalid string: must match pattern .+$/, 'Format non valide'],
  [/^Invalid input(: .+)?$/, 'Valeur non valide'],
  [/^Unrecognized keys?: .+$/, 'Champ inconnu'],
];
