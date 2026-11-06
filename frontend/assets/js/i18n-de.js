// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// German texts of the interface (D91), keyed by the English text given to t(), tx(), tn() and
// plural() (i18n.js), in the same order as i18n-fr.js. The keys are those of the French
// dictionary, contexts included ('count|Closed'). Polite form (Sie), the vocabulary of German
// facility management (docs/decisions.md → D91): Anlage, Arbeitsauftrag, Meldung, Gewerk,
// Arbeitsbericht, Kritikalität, Supervisor, Kennzahl.
// test/i18n.test.js checks that every key of the code is here, and nothing else.

export const DE = {
  // index.html
  'Skip to content': 'Zum Inhalt springen',
  'My open requests': 'Meine offenen Meldungen',
  'All my requests': 'Alle meine Meldungen',
  'New request': 'Neue Meldung',
  Dashboard: 'Dashboard',
  Dashboards: 'Dashboards',
  Assets: 'Anlagen',
  'Work orders': 'Arbeitsaufträge',
  'Year planner': 'Jahresplanung',
  'Week scheduler': 'Wochenplanung',
  'My week': 'Meine Woche',
  Conflicts: 'Konflikte',
  'Audit log': 'Änderungsprotokoll',
  Places: 'Orte',
  Users: 'Benutzer',
  Suggestions: 'Vorschläge',
  'Planning settings': 'Planungseinstellungen',
  'Dashboard widgets': 'Kennzahlen der Dashboards',
  'Change my password': 'Mein Passwort ändern',
  'Log out': 'Abmelden',
  'Find a work order': 'Arbeitsauftrag finden',
  'Suggest an improvement': 'Verbesserung vorschlagen',
  'Source code': 'Quellcode',
  'Main navigation': 'Hauptnavigation',
  'Open menu': 'Menü öffnen',
  Details: 'Details',
  // layout.js
  'Language of the interface': 'Sprache der Oberfläche',
  'Close menu': 'Menü schließen',
  'Signed in as {first_name} {last_name}': 'Angemeldet als {first_name} {last_name}',
  '{n} change waiting to sync': '{n} Änderung wartet auf Synchronisierung',
  '{n} changes waiting to sync': '{n} Änderungen warten auf Synchronisierung',
  // network.js
  Online: 'Online',
  'Offline mode — local data': 'Offline-Modus — lokale Daten',
  'Not available offline: AI features need a connection.':
    'Offline nicht verfügbar: KI-Funktionen brauchen eine Verbindung.',
  'Not available offline: this action needs a connection.':
    'Offline nicht verfügbar: Diese Aktion braucht eine Verbindung.',
  // api.js
  'The server cannot be reached.': 'Der Server ist nicht erreichbar.',
  'Request failed ({status})': 'Anfrage fehlgeschlagen ({status})',
  // dom.js
  'Dismiss the message': 'Meldung schließen',
  // entities.js
  Site: 'Standort',
  Category: 'Gewerk',
  'Last modified by': 'Zuletzt geändert von',
  'Last modified': 'Zuletzt geändert',
  Asset: 'Anlage',
  'No asset matches this search.': 'Keine Anlage entspricht dieser Suche.',
  'No assets on this page.': 'Keine Anlagen auf dieser Seite.',
  'Loading assets…': 'Anlagen werden geladen…',
  'Loading the asset…': 'Anlage wird geladen…',
  'This asset does not exist.': 'Diese Anlage existiert nicht.',
  'This asset is not available offline.': 'Diese Anlage ist offline nicht verfügbar.',
  'Asset saved.': 'Anlage gespeichert.',
  'Page {page} of the assets has not been loaded before, so it is not available offline.':
    'Seite {page} der Anlagen wurde noch nicht geladen und ist daher offline nicht verfügbar.',
  'Asset code': 'Anlagencode',
  'asset|Name': 'Bezeichnung',
  Place: 'Ort',
  Subcategory: 'Untergruppe',
  Criticality: 'Kritikalität',
  Status: 'Status',
  Brand: 'Hersteller',
  Model: 'Modell',
  'Serial number': 'Seriennummer',
  'Commissioning date': 'Inbetriebnahme',
  'Last service date': 'Letzte Wartung',
  Supplier: 'Lieferant',
  'Maintenance contract': 'Wartungsvertrag',
  'Responsible technician': 'Verantwortlicher Techniker',
  'Exact location': 'Genauer Standort',
  Comment: 'Kommentar',
  'Work order': 'Arbeitsauftrag',
  'No work order matches this search.': 'Kein Arbeitsauftrag entspricht dieser Suche.',
  'No work orders on this page.': 'Keine Arbeitsaufträge auf dieser Seite.',
  'Loading work orders…': 'Arbeitsaufträge werden geladen…',
  'Loading the work order…': 'Arbeitsauftrag wird geladen…',
  'This work order does not exist.': 'Dieser Arbeitsauftrag existiert nicht.',
  'This work order is not available offline.': 'Dieser Arbeitsauftrag ist offline nicht verfügbar.',
  'Work order saved.': 'Arbeitsauftrag gespeichert.',
  'Page {page} of the work orders has not been loaded before, so it is not available offline.':
    'Seite {page} der Arbeitsaufträge wurde noch nicht geladen und ist daher offline nicht verfügbar.',
  Number: 'Nummer',
  Title: 'Titel',
  Type: 'Art',
  Priority: 'Priorität',
  Description: 'Beschreibung',
  Assignee: 'Zugewiesen an',
  Supervisor: 'Supervisor',
  Created: 'Erstellt',
  Due: 'Fällig',
  Started: 'Begonnen',
  Closed: 'Abgeschlossen',
  'Estimated time': 'Geschätzte Dauer',
  'Actual time': 'Tatsächliche Dauer',
  'Work report': 'Arbeitsbericht',
  'Created by': 'Erstellt von',
  'Request review': 'Prüfung der Meldung',
  'Reviewed by': 'Geprüft von',
  Reviewed: 'Geprüft am',
  'Reason for rejection': 'Ablehnungsgrund',
  'Maintenance plan': 'Wartungsplan',
  'Planned week': 'Geplante Woche',
  'Hold reason': 'Grund der Zurückstellung',
  'Hold note': 'Notiz zur Zurückstellung',
  'Technically done': 'Technisch erledigt',
  // format.js
  'Week {n}, {year}': 'KW {n}, {year}',
  Yes: 'Ja',
  No: 'Nein',
  '· assigned': '· zugewiesen',
  // detail.js
  'Back to list': 'Zurück zur Liste',
  'Close details': 'Details schließen',
  Conflict: 'Konflikt',
  ' — two versions of this record are waiting for a supervisor to arbitrate.':
    ' — zwei Versionen dieses Datensatzes warten auf die Entscheidung eines Supervisors.',
  'Open the conflict console': 'Konfliktkonsole öffnen',
  Retry: 'Erneut versuchen',
  'Update available — show the latest version':
    'Aktualisierung verfügbar — neueste Version anzeigen',
  // table.js
  '{label}, page {page} of {pages}': '{label}, Seite {page} von {pages}',
  '{n} matching record': '{n} passender Datensatz',
  '{n} matching records': '{n} passende Datensätze',
  '{n} record': '{n} Datensatz',
  '{n} records': '{n} Datensätze',
  'Use the up and down arrow keys to move between rows, and Enter to open one.':
    'Mit den Pfeiltasten nach oben und unten wechseln Sie die Zeile, mit der Eingabetaste öffnen Sie sie.',
  'card|Due': 'Fällig am',
  'Pending creation': 'Anlegen ausstehend',
  'Pending sync': 'Synchronisierung ausstehend',
  'Pagination, top': 'Seitennavigation, oben',
  Pagination: 'Seitennavigation',
  First: 'Erste',
  Previous: 'Vorherige',
  'Page {page} / {pages}': 'Seite {page} / {pages}',
  Next: 'Nächste',
  Last: 'Letzte',
  // form.js
  '— None —': '— Keine Angabe —',
  '— Choose —': '— Auswählen —',
  '— Choose a site —': '— Standort auswählen —',
  '— Unassigned —': '— Nicht zugewiesen —',
  'YYYY-Www, e.g. 2026-W43': 'JJJJ-Www, z. B. 2026-W43',
  'Asset code, e.g. AST-0042': 'Anlagencode, z. B. AST-0042',
  'No asset': 'Keine Anlage',
  'Looking up…': 'Suche…',
  'Unknown asset code': 'Unbekannter Anlagencode',
  'Browse assets…': 'Anlagen durchsuchen…',
  'Asset #{v}': 'Anlage Nr. {v}',
  '{label}: {value}': '{label}: {value}',
  Save: 'Speichern',
  'Discard changes': 'Änderungen verwerfen',
  'Fields marked * are required. Choose an asset, or a place if the work is not about one asset.':
    'Mit * markierte Felder sind Pflichtfelder. Wählen Sie eine Anlage oder einen Ort, wenn die Arbeit keine bestimmte Anlage betrifft.',
  'Fields marked * are required. Leave the asset code empty to number the asset automatically (AST-0501, …).':
    'Mit * markierte Felder sind Pflichtfelder. Lassen Sie den Anlagencode leer, um die Anlage automatisch zu nummerieren (AST-0501, …).',
  // rules.js
  'Choose who will do the work': 'Wählen Sie, wer die Arbeit ausführt',
  'Say why the request is rejected': 'Geben Sie an, warum die Meldung abgelehnt wird',
  Required: 'Pflichtfeld',
  'Write the work report first: the work cannot be marked technically done without it.':
    'Schreiben Sie zuerst den Arbeitsbericht: Ohne ihn kann die Arbeit nicht als technisch erledigt markiert werden.',
  'Say why the work order is on hold.':
    'Geben Sie an, warum der Arbeitsauftrag zurückgestellt ist.',
  'The completion date cannot be earlier than the start date.':
    'Das Datum der technischen Erledigung darf nicht vor dem Beginn liegen.',
  'The due date cannot be earlier than the creation date.':
    'Das Fälligkeitsdatum darf nicht vor dem Erstellungsdatum liegen.',
  'The closing date cannot be earlier than the start date.':
    'Das Abschlussdatum darf nicht vor dem Beginn liegen.',
  'Capitals, digits and hyphens only, 2 to 50 characters':
    'Nur Großbuchstaben, Ziffern und Bindestriche, 2 bis 50 Zeichen',
  'Choose an asset or a place': 'Wählen Sie eine Anlage oder einen Ort',
  // editor.js
  User: 'Benutzer',
  'Unsaved draft from {updated_at}. ': 'Nicht gespeicherter Entwurf vom {updated_at}. ',
  Restore: 'Wiederherstellen',
  'Report waived: marked technically done without a work report.':
    'Bericht erlassen: ohne Arbeitsbericht als technisch erledigt markiert.',
  'action|Put on hold': 'Zurückstellen',
  'Mark technically done': 'Als technisch erledigt markieren',
  'Mark done without a report': 'Ohne Bericht als erledigt markieren',
  'action|Close': 'Abschließen',
  Reopen: 'Wieder öffnen',
  'Change status': 'Status ändern',
  'Mark done without a report?': 'Ohne Bericht als erledigt markieren?',
  '{number} will be marked technically done without a work report. The waiver is kept on the work order and in its history.':
    '{number} wird ohne Arbeitsbericht als technisch erledigt markiert. Der Verzicht bleibt im Arbeitsauftrag und in seinem Verlauf vermerkt.',
  'Change the status outside the usual steps?': 'Status außerhalb der üblichen Schritte ändern?',
  'The change from {from} to {to} is logged in the history as an administrator override.':
    'Der Wechsel von {from} zu {to} wird im Verlauf als Entscheidung eines Administrators protokolliert.',
  Discard: 'Verwerfen',
  'This staff request is waiting for a supervisor’s review: it will then be assigned.':
    'Diese Meldung wartet auf die Prüfung durch einen Supervisor: Danach wird sie zugewiesen.',
  'Your changes are saved on this device and waiting to be sent to the server.':
    'Ihre Änderungen sind auf diesem Gerät gespeichert und warten auf die Übertragung an den Server.',
  'Your last change was not saved. ': 'Ihre letzte Änderung wurde nicht gespeichert. ',
  ' Your edits are shown below.': ' Ihre Änderungen werden unten angezeigt.',
  '+ New work order for this asset': '+ Neuer Arbeitsauftrag für diese Anlage',
  'Delete asset': 'Anlage löschen',
  'Check the highlighted fields.': 'Prüfen Sie die markierten Felder.',
  'Saving…': 'Wird gespeichert…',
  'Saved on this device. It will be sent when you are back online.':
    'Auf diesem Gerät gespeichert. Wird gesendet, sobald Sie wieder online sind.',
  'Delete this asset?': 'Diese Anlage löschen?',
  '{code} — {name} will be deleted for good. Only assets without any work order can be deleted; otherwise set the status to Out of service.':
    '{code} — {name} wird endgültig gelöscht. Nur Anlagen ohne Arbeitsaufträge können gelöscht werden; setzen Sie sonst den Status auf Außer Betrieb.',
  Delete: 'Löschen',
  Cancel: 'Abbrechen',
  'The asset was not deleted': 'Die Anlage wurde nicht gelöscht',
  '{code} was deleted.': '{code} wurde gelöscht.',
  'Reject this request?': 'Diese Meldung ablehnen?',
  '{number} will be cancelled. The requester will see your reason.':
    '{number} wird storniert. Die meldende Person sieht Ihre Begründung.',
  Reject: 'Ablehnen',
  'The server cannot be reached: try again once connected.':
    'Der Server ist nicht erreichbar: Versuchen Sie es mit Verbindung erneut.',
  '{number} approved and assigned to {first_name} {last_name}.':
    '{number} genehmigt und {first_name} {last_name} zugewiesen.',
  '{number} rejected.': '{number} abgelehnt.',
  'Create asset': 'Anlage anlegen',
  'Creating an asset needs a connection. Your entries are kept as a draft.':
    'Das Anlegen einer Anlage braucht eine Verbindung. Ihre Eingaben bleiben als Entwurf erhalten.',
  'New asset': 'Neue Anlage',
  'The server cannot be reached. Your entries are kept as a draft.':
    'Der Server ist nicht erreichbar. Ihre Eingaben bleiben als Entwurf erhalten.',
  'Asset {code} created.': 'Anlage {code} angelegt.',
  'Create work order': 'Arbeitsauftrag anlegen',
  'New work order': 'Neuer Arbeitsauftrag',
  'Creating the work order…': 'Arbeitsauftrag wird angelegt…',
  'Work order saved on this device. It will be created when you are back online.':
    'Arbeitsauftrag auf diesem Gerät gespeichert. Er wird angelegt, sobald Sie wieder online sind.',
  'This work order has been created or discarded. ':
    'Dieser Arbeitsauftrag wurde angelegt oder verworfen. ',
  'Back to the list': 'Zurück zur Liste',
  Update: 'Aktualisieren',
  'Retry creation': 'Anlegen erneut versuchen',
  'Saved. The work order will be created with these values.':
    'Gespeichert. Der Arbeitsauftrag wird mit diesen Werten angelegt.',
  'Discard this work order?': 'Diesen Arbeitsauftrag verwerfen?',
  'It has not been created on the server. Its details will be lost.':
    'Er wurde auf dem Server nicht angelegt. Seine Angaben gehen verloren.',
  'The work order was discarded.': 'Der Arbeitsauftrag wurde verworfen.',
  'Discard this work order': 'Diesen Arbeitsauftrag verwerfen',
  'Waiting to be created on the server. It gets its number then.':
    'Wartet auf das Anlegen auf dem Server. Dann erhält er seine Nummer.',
  'The server refused this work order. ': 'Der Server hat diesen Arbeitsauftrag abgelehnt. ',
  ' Fix it below and retry, or discard it.':
    ' Korrigieren Sie ihn unten und versuchen Sie es erneut, oder verwerfen Sie ihn.',
  'New work order (pending creation)': 'Neuer Arbeitsauftrag (Anlegen ausstehend)',
  'Unsaved changes': 'Nicht gespeicherte Änderungen',
  'You changed this record but did not save it.':
    'Sie haben diesen Datensatz geändert, aber nicht gespeichert.',
  // app.js
  'Log in': 'Anmelden',
  'Access denied': 'Zugriff verweigert',
  'Only supervisors and administrators can open this page.':
    'Nur Supervisoren und Administratoren können diese Seite öffnen.',
  'Only administrators can open this page.': 'Nur Administratoren können diese Seite öffnen.',
  'The year planner needs a larger screen: open it on a tablet or a computer.':
    'Die Jahresplanung braucht einen größeren Bildschirm: Öffnen Sie sie auf einem Tablet oder Computer.',
  'Only supervisors and administrators can rebalance the plans.':
    'Nur Supervisoren und Administratoren können die Pläne ausgleichen.',
  'Only supervisors and administrators can create plans.':
    'Nur Supervisoren und Administratoren können Pläne anlegen.',
  'Staff requests': 'Meldungen',
  'This page is for staff members. Their requests are listed under Work orders.':
    'Diese Seite ist für Mitarbeiter. Ihre Meldungen stehen unter Arbeitsaufträge.',
  'Page not found': 'Seite nicht gefunden',
  'This page does not exist.': 'Diese Seite existiert nicht.',
  'Go to my open requests': 'Zu meinen offenen Meldungen',
  'Go to the dashboard': 'Zum Dashboard',
  'Your requests need a connection to the server.':
    'Ihre Meldungen brauchen eine Verbindung zum Server.',
  'Loading your requests…': 'Ihre Meldungen werden geladen…',
  'Request {number} sent to the maintenance team.':
    'Meldung {number} an das Instandhaltungsteam gesendet.',
  'You are offline: your request is kept on this page, send it once connected.':
    'Sie sind offline: Ihre Meldung bleibt auf dieser Seite, senden Sie sie mit Verbindung.',
  'Loading the request…': 'Meldung wird geladen…',
  'Request not found': 'Meldung nicht gefunden',
  'This request does not exist, or another person sent it.':
    'Diese Meldung existiert nicht, oder eine andere Person hat sie gesendet.',
  'Cancel this request?': 'Diese Meldung zurückziehen?',
  'The maintenance team will not work on it, and this cannot be undone. To tell them why, add a comment. If the problem comes back, send a new request.':
    'Das Instandhaltungsteam bearbeitet sie dann nicht, und das lässt sich nicht rückgängig machen. Um den Grund mitzuteilen, fügen Sie einen Kommentar hinzu. Tritt das Problem wieder auf, senden Sie eine neue Meldung.',
  'Cancel the request': 'Meldung zurückziehen',
  'Keep it': 'Behalten',
  'Loading the dashboard…': 'Dashboard wird geladen…',
  'The dashboard has not been loaded on this device yet, so it is not available offline.':
    'Das Dashboard wurde auf diesem Gerät noch nicht geladen und ist daher offline nicht verfügbar.',
  'Loading the audit log…': 'Änderungsprotokoll wird geladen…',
  'The audit log needs a connection to the server.':
    'Das Änderungsprotokoll braucht eine Verbindung zum Server.',
  'Loading users…': 'Benutzer werden geladen…',
  'User not found': 'Benutzer nicht gefunden',
  'This user does not exist.': 'Dieser Benutzer existiert nicht.',
  'User administration needs a connection to the server.':
    'Die Benutzerverwaltung braucht eine Verbindung zum Server.',
  'User {username} created.': 'Benutzer {username} angelegt.',
  'Changes saved.': 'Änderungen gespeichert.',
  'Nothing to save.': 'Nichts zu speichern.',
  'Set a new password?': 'Neues Passwort festlegen?',
  '{first_name} {last_name} will have to log in again with the new password.':
    '{first_name} {last_name} muss sich mit dem neuen Passwort neu anmelden.',
  'Set password': 'Passwort festlegen',
  'New password set. Give it to the user privately.':
    'Neues Passwort festgelegt. Teilen Sie es dem Benutzer persönlich mit.',
  'Loading places…': 'Orte werden geladen…',
  'The places need a connection to the server.': 'Die Orte brauchen eine Verbindung zum Server.',
  'Place not found': 'Ort nicht gefunden',
  'This place does not exist.': 'Dieser Ort existiert nicht.',
  'Only administrators change level types.': 'Nur Administratoren ändern Ebenentypen.',
  'Level type saved.': 'Ebenentyp gespeichert.',
  'Level type {name} added.': 'Ebenentyp {name} hinzugefügt.',
  'Only administrators create sites.': 'Nur Administratoren legen Standorte an.',
  '{name} created.': '{name} angelegt.',
  'Your password has been changed.': 'Ihr Passwort wurde geändert.',
  'Password changed. Your other sessions have ended.':
    'Passwort geändert. Ihre anderen Sitzungen wurden beendet.',
  'You are offline: try again once connected.':
    'Sie sind offline: Versuchen Sie es mit Verbindung erneut.',
  'Thank you: your suggestion has been saved.': 'Danke: Ihr Vorschlag wurde gespeichert.',
  'Loading suggestions…': 'Vorschläge werden geladen…',
  'The suggestions need a connection to the server.':
    'Die Vorschläge brauchen eine Verbindung zum Server.',
  'Status saved.': 'Status gespeichert.',
  'You are offline: the status was not changed.':
    'Sie sind offline: Der Status wurde nicht geändert.',
  'The conflict console needs a connection to the server.':
    'Die Konfliktkonsole braucht eine Verbindung zum Server.',
  'Loading conflicts…': 'Konflikte werden geladen…',
  'Loading the conflict…': 'Konflikt wird geladen…',
  'Conflict not found': 'Konflikt nicht gefunden',
  'Back to the conflicts': 'Zurück zu den Konflikten',
  'Resolve this conflict?': 'Diesen Konflikt lösen?',
  '{resolutionSummary} This cannot be undone.':
    '{resolutionSummary} Das lässt sich nicht rückgängig machen.',
  Resolve: 'Lösen',
  'Conflict on {label} resolved.': 'Konflikt bei {label} gelöst.',
  'This conflict was already resolved by someone else.':
    'Dieser Konflikt wurde bereits von jemand anderem gelöst.',
  '+ New work order': '+ Neuer Arbeitsauftrag',
  '+ New asset': '+ Neue Anlage',
  'Only supervisors and administrators can create assets.':
    'Nur Supervisoren und Administratoren können Anlagen anlegen.',
  'The record now shows the latest version.': 'Der Datensatz zeigt jetzt die neueste Version.',
  'An update is available for the open record.':
    'Für den geöffneten Datensatz ist eine Aktualisierung verfügbar.',
  'Back to {origin}': 'Zurück: {origin}',
  'Search and filters need a connection to the server. Without filters, the pages saved on this device are available.':
    'Suche und Filter brauchen eine Verbindung zum Server. Ohne Filter sind die auf diesem Gerät gespeicherten Seiten verfügbar.',
  'Sorting needs a connection to the server. In the default order, the pages saved on this device are available.':
    'Das Sortieren braucht eine Verbindung zum Server. In der Standardreihenfolge sind die auf diesem Gerät gespeicherten Seiten verfügbar.',
  'Clear filters': 'Filter zurücksetzen',
  'Default order': 'Standardreihenfolge',
  'Work order {number} created.': 'Arbeitsauftrag {number} angelegt.',
  'Not saved: this record is waiting for a supervisor to resolve a conflict. Your edits are kept as a draft.':
    'Nicht gespeichert: Dieser Datensatz wartet darauf, dass ein Supervisor einen Konflikt löst. Ihre Änderungen bleiben als Entwurf erhalten.',
  'Conflict: someone changed this record before you. A supervisor will choose which version to keep.':
    'Konflikt: Jemand hat diesen Datensatz vor Ihnen geändert. Ein Supervisor wählt die Version, die bleibt.',
  'Not saved: {message}': 'Nicht gespeichert: {message}',
  'Changes not sent': 'Änderungen nicht gesendet',
  '{n} change has not been sent to the server yet. If you log out now, it will be lost.':
    '{n} Änderung wurde noch nicht an den Server gesendet. Wenn Sie sich jetzt abmelden, geht sie verloren.',
  '{n} changes have not been sent to the server yet. If you log out now, they will be lost.':
    '{n} Änderungen wurden noch nicht an den Server gesendet. Wenn Sie sich jetzt abmelden, gehen sie verloren.',
  'Stay logged in': 'Angemeldet bleiben',
  'Log out anyway': 'Trotzdem abmelden',
  'You are logged out.': 'Sie sind abgemeldet.',
  'Your session has expired. Log in again.': 'Ihre Sitzung ist abgelaufen. Melden Sie sich neu an.',
  'Back online.': 'Wieder online.',
  'You are offline. Local data is shown.': 'Sie sind offline. Lokale Daten werden angezeigt.',
  // login.js
  'Wrong username or password.': 'Benutzername oder Passwort falsch.',
  'Too many attempts. Wait a few minutes and try again.':
    'Zu viele Versuche. Warten Sie einige Minuten und versuchen Sie es erneut.',
  'The server cannot be reached. Check your connection and try again.':
    'Der Server ist nicht erreichbar. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
  'Login failed. Try again later.': 'Anmeldung fehlgeschlagen. Versuchen Sie es später erneut.',
  'Enter your username and password.': 'Geben Sie Benutzername und Passwort ein.',
  'Logging in…': 'Anmeldung…',
  Username: 'Benutzername',
  Password: 'Passwort',
  'Maintenance management': 'Instandhaltungsmanagement',
  // account.js
  'At least {PASSWORD_MIN_LENGTH} characters': 'Mindestens {PASSWORD_MIN_LENGTH} Zeichen',
  'Choose a password different from the current one':
    'Wählen Sie ein anderes Passwort als das aktuelle',
  'The two passwords differ': 'Die beiden Passwörter stimmen nicht überein',
  'Current password': 'Aktuelles Passwort',
  'New password': 'Neues Passwort',
  'At least {PASSWORD_MIN_LENGTH} characters.': 'Mindestens {PASSWORD_MIN_LENGTH} Zeichen.',
  'Repeat the new password': 'Neues Passwort wiederholen',
  'Your other sessions (other browsers or devices) will end; this one stays open.':
    'Ihre anderen Sitzungen (andere Browser oder Geräte) werden beendet; diese bleibt geöffnet.',
  'Change password': 'Passwort ändern',
  // admin-users.js
  'Letters, digits, dot, dash or underscore, 3 to 50 characters':
    'Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich, 3 bis 50 Zeichen',
  Active: 'Aktiv',
  Inactive: 'Inaktiv',
  'Name or username': 'Name oder Benutzername',
  Any: 'Alle',
  'Search users': 'Benutzer suchen',
  Search: 'Suchen',
  Role: 'Rolle',
  Account: 'Konto',
  '{n} user': '{n} Benutzer',
  '{n} users': '{n} Benutzer',
  '+ New user': '+ Neuer Benutzer',
  'Users, page {page} of {pages}': 'Benutzer, Seite {page} von {pages}',
  Name: 'Name',
  'No user matches this search.': 'Kein Benutzer entspricht dieser Suche.',
  'Used to log in; cannot be changed later.':
    'Dient zur Anmeldung; kann später nicht geändert werden.',
  'First name': 'Vorname',
  'Last name': 'Nachname',
  Specialty: 'Fachgebiet',
  'Auto-save': 'Automatisch speichern',
  'Changes are saved when leaving a record (power user).':
    'Änderungen werden beim Verlassen eines Datensatzes gespeichert (erfahrene Benutzer).',
  'Account active': 'Konto aktiv',
  'Inactive users cannot log in; their sessions end at once.':
    'Inaktive Benutzer können sich nicht anmelden; ihre Sitzungen enden sofort.',
  'At least {PASSWORD_MIN_LENGTH} characters. Give it to the user privately.':
    'Mindestens {PASSWORD_MIN_LENGTH} Zeichen. Teilen Sie es dem Benutzer persönlich mit.',
  '← Back to list': '← Zurück zur Liste',
  'Reset password': 'Passwort zurücksetzen',
  "The user's open sessions end at once.": 'Die offenen Sitzungen des Benutzers enden sofort.',
  'Set new password': 'Neues Passwort festlegen',
  ' · Last changed {updated_at}': ' · Zuletzt geändert am {updated_at}',
  'To change your own password, use {link}.':
    'Um Ihr eigenes Passwort zu ändern, verwenden Sie {link}.',
  'Fields marked * are required.': 'Mit * markierte Felder sind Pflichtfelder.',
  'Create user': 'Benutzer anlegen',
  'New user': 'Neuer Benutzer',
  // asset-picker.js
  Code: 'Code',
  Location: 'Standortangabe',
  Trade: 'Gewerk',
  All: 'Alle',
  'Code, name, place, location, brand…': 'Code, Bezeichnung, Ort, Standortangabe, Hersteller…',
  'Choose {code} — {name}': '{code} — {name} auswählen',
  Choose: 'Auswählen',
  '{n} asset': '{n} Anlage',
  '{n} assets': '{n} Anlagen',
  'Assets, page {page} of {pages}': 'Anlagen, Seite {page} von {pages}',
  'The asset list needs a connection to the server.':
    'Die Anlagenliste braucht eine Verbindung zum Server.',
  'Choose an asset': 'Anlage auswählen',
  'Close without choosing': 'Ohne Auswahl schließen',
  // comments.js
  'Write your comment first.': 'Schreiben Sie zuerst Ihren Kommentar.',
  'At most {COMMENT_MAX_LENGTH} characters.': 'Höchstens {COMMENT_MAX_LENGTH} Zeichen.',
  You: 'Sie',
  '{name} (requester)': '{name} (meldende Person)',
  '{name} (maintenance team)': '{name} (Instandhaltungsteam)',
  'No comment yet.': 'Noch kein Kommentar.',
  'Send comment': 'Kommentar senden',
  'You are offline: your text is kept, send it once connected.':
    'Sie sind offline: Ihr Text bleibt erhalten, senden Sie ihn mit Verbindung.',
  'The requester is waiting for a reply.': 'Die meldende Person wartet auf eine Antwort.',
  'Loading the comments…': 'Kommentare werden geladen…',
  'The comments need a connection to the server.':
    'Die Kommentare brauchen eine Verbindung zum Server.',
  Comments: 'Kommentare',
  'Add a comment': 'Kommentar hinzufügen',
  'The requester sees your comments: use them to give news or ask for details.':
    'Die meldende Person sieht Ihre Kommentare: Nutzen Sie sie, um zu informieren oder nach Details zu fragen.',
  // conflicts.js
  'No value': 'Kein Wert',
  'User #{value}': 'Benutzer Nr. {value}',
  'Asset #{value}': 'Anlage Nr. {value}',
  'Plan #{value}': 'Plan Nr. {value}',
  'Place #{value}': 'Ort Nr. {value}',
  'Open conflicts': 'Offene Konflikte',
  'Two people changed the same record at the same time. Compare both versions and choose what to keep.':
    'Zwei Personen haben denselben Datensatz gleichzeitig geändert. Vergleichen Sie beide Versionen und wählen Sie, was bleibt.',
  '{n} open conflict': '{n} offener Konflikt',
  '{n} open conflicts': '{n} offene Konflikte',
  Record: 'Datensatz',
  'Version A (server)': 'Version A (Server)',
  'Version B (rejected edit)': 'Version B (abgewiesene Änderung)',
  Detected: 'Erkannt am',
  'No open conflict. Nothing to arbitrate.': 'Kein offener Konflikt. Nichts zu entscheiden.',
  'Same value': 'Gleicher Wert',
  '{label}: version to keep': '{label}: zu behaltende Version',
  'Keep A': 'A behalten',
  'Keep B': 'B behalten',
  Differs: 'Abweichend',
  'Conflict on asset {record}': 'Konflikt bei Anlage {record}',
  'Conflict on work order {record}': 'Konflikt bei Arbeitsauftrag {record}',
  '← All conflicts': '← Alle Konflikte',
  'Not resolved. ': 'Nicht gelöst. ',
  'Resolved ({resolution}) by {person} on {resolved_at}.':
    'Gelöst ({resolution}) von {person} am {resolved_at}.',
  merge: 'Zusammenführung',
  'Version A — server': 'Version A — Server',
  'Saved by {person} on {server_updated_at}': 'Gespeichert von {person} am {server_updated_at}',
  unknown: 'unbekannt',
  'Version B — rejected edit': 'Version B — abgewiesene Änderung',
  'Made by {client_user} on {client_edited_at}, based on an older version':
    'Erstellt von {client_user} am {client_edited_at}, auf Grundlage einer älteren Version',
  'Fields changed in version B ({n} differs from version A)':
    'In Version B geänderte Felder ({n} weicht von Version A ab)',
  'Fields changed in version B ({n} differ from version A)':
    'In Version B geänderte Felder ({n} weichen von Version A ab)',
  Field: 'Feld',
  'Version A': 'Version A',
  'Version B': 'Version B',
  'Merge: keep': 'Zusammenführen: behalten',
  'Accept version A': 'Version A übernehmen',
  'Accept version B': 'Version B übernehmen',
  'Merge the chosen values': 'Gewählte Werte zusammenführen',
  'Keep version A for {label}. The edit made by {client_user} will be dropped.':
    'Version A für {label} behalten. Die Änderung von {client_user} wird verworfen.',
  'Apply version B to {label}: the edit made by {client_user} replaces the server values.':
    'Version B auf {label} anwenden: Die Änderung von {client_user} ersetzt die Werte des Servers.',
  'Save the values you chose for {label}.': 'Die gewählten Werte für {label} speichern.',
  // dashboard.js
  'Open work orders': 'Offene Arbeitsaufträge',
  'In progress': 'In Bearbeitung',
  'Done this month': 'Diesen Monat erledigt',
  'To close': 'Abzuschließen',
  'Overdue work orders': 'Überfällige Arbeitsaufträge',
  'Assets broken down': 'Ausgefallene Anlagen',
  'Staff requests to review': 'Zu prüfende Meldungen',
  'Requests waiting for a reply': 'Meldungen, die auf Antwort warten',
  'Requests waiting for my reply': 'Meldungen, die auf meine Antwort warten',
  'Conflicts to arbitrate': 'Zu entscheidende Konflikte',
  'Bar chart': 'Balkendiagramm',
  Today: 'Heute',
  'Next 7 days': 'Nächste 7 Tage',
  'The chart library could not be loaded.': 'Die Diagrammbibliothek konnte nicht geladen werden.',
  'Key figures': 'Kennzahlen',
  'Needs attention': 'Handlungsbedarf',
  'Show as a table': 'Als Tabelle anzeigen',
  'Work orders by category, last {period} days':
    'Arbeitsaufträge nach Gewerk, letzte {period} Tage',
  'Work orders by category — last {period} days':
    'Arbeitsaufträge nach Gewerk — letzte {period} Tage',
  '{n} work order created': '{n} Arbeitsauftrag angelegt',
  '{n} work orders created': '{n} Arbeitsaufträge angelegt',
  'Pie chart': 'Kreisdiagramm',
  'Work orders by status': 'Arbeitsaufträge nach Status',
  'No work order was created in this period.':
    'In diesem Zeitraum wurde kein Arbeitsauftrag angelegt.',
  'Work orders by status — last {period} days':
    'Arbeitsaufträge nach Status — letzte {period} Tage',
  '{n} work order created, by current status': '{n} Arbeitsauftrag angelegt, nach aktuellem Status',
  '{n} work orders created, by current status':
    '{n} Arbeitsaufträge angelegt, nach aktuellem Status',
  'Updated {updated_at} by {person}': 'Aktualisiert am {updated_at} von {person}',
  'Updated {updated_at}': 'Aktualisiert am {updated_at}',
  'No activity yet.': 'Noch keine Aktivität.',
  'Recent activity': 'Letzte Aktivität',
  Period: 'Zeitraum',
  'Due by {weekEnd}, late or without a due date.':
    'Fällig bis {weekEnd}, überfällig oder ohne Fälligkeitsdatum.',
  'Due today, late or without a due date.': 'Heute fällig, überfällig oder ohne Fälligkeitsdatum.',
  'My work': 'Meine Arbeit',
  'Today in My week →': 'Heute in Meine Woche →',
  'Due {due_on}': 'Fällig am {due_on}',
  'No due date': 'Ohne Fälligkeitsdatum',
  Overdue: 'Überfällig',
  'No work order assigned to you is due in the next 7 days.':
    'Kein Ihnen zugewiesener Arbeitsauftrag ist in den nächsten 7 Tagen fällig.',
  'No work order assigned to you is due today.':
    'Kein Ihnen zugewiesener Arbeitsauftrag ist heute fällig.',
  'Offline: figures saved on this device on {fetchedAt}.':
    'Offline: Zahlen, die am {fetchedAt} auf diesem Gerät gespeichert wurden.',
  '{n} work order': '{n} Arbeitsauftrag',
  '{n} work orders': '{n} Arbeitsaufträge',
  '{n} work order ({share})': '{n} Arbeitsauftrag ({share})',
  '{n} work orders ({share})': '{n} Arbeitsaufträge ({share})',
  // dashboards-page.js
  '+ New dashboard': '+ Neues Dashboard',
  Widgets: 'Kennzahlen',
  'Tick the widgets to show on “{name}”.':
    'Wählen Sie die Kennzahlen, die auf „{name}“ erscheinen sollen.',
  'Switched off for supervisors': 'Für Supervisoren ausgeschaltet',
  Off: 'Aus',
  'Loading the widgets…': 'Kennzahlen werden geladen…',
  'The dashboard widgets need a connection to the server.':
    'Die Kennzahlen der Dashboards brauchen eine Verbindung zum Server.',
  '{label} switched on for supervisors.': '{label} für Supervisoren eingeschaltet.',
  '{label} switched off for supervisors.': '{label} für Supervisoren ausgeschaltet.',
  'You are offline: {label} was not changed.': 'Sie sind offline: {label} wurde nicht geändert.',
  'Your dashboards have not been loaded on this device yet, so they are not available offline.':
    'Ihre Dashboards wurden auf diesem Gerät noch nicht geladen und sind daher offline nicht verfügbar.',
  'Loading your dashboards…': 'Ihre Dashboards werden geladen…',
  'Dashboard not found': 'Dashboard nicht gefunden',
  'This dashboard does not exist, or it is not one of yours.':
    'Dieses Dashboard existiert nicht, oder es gehört nicht Ihnen.',
  'Widgets of {name}': 'Kennzahlen von {name}',
  'Press Space to pick the widget up, the arrow keys to move it, and Space to drop it.':
    'Drücken Sie die Leertaste, um die Kennzahl aufzunehmen, die Pfeiltasten, um sie zu verschieben, und erneut die Leertaste, um sie abzulegen.',
  'No widget yet: tick widgets in the sidebar.':
    'Noch keine Kennzahl: Wählen Sie Kennzahlen in der Seitenleiste.',
  '{days} days': '{days} Tage',
  'All sites': 'Alle Standorte',
  'All trades': 'Alle Gewerke',
  'Filters of this dashboard': 'Filter dieses Dashboards',
  Sites: 'Standorte',
  Trades: 'Gewerke',
  'New dashboard…': 'Neues Dashboard…',
  'Rename…': 'Umbenennen…',
  'Duplicate…': 'Duplizieren…',
  'Move up in the sidebar': 'In der Seitenleiste nach oben',
  'Move down in the sidebar': 'In der Seitenleiste nach unten',
  'Delete…': 'Löschen…',
  'Loading…': 'Wird geladen…',
  'Not saved on this device yet.': 'Noch nicht auf diesem Gerät gespeichert.',
  'Move {label}': '{label} verschieben',
  'Actions: {label}': 'Aktionen: {label}',
  'Figures (CSV)': 'Zahlen (CSV)',
  'Assets (CSV)': 'Anlagen (CSV)',
  'Visits (CSV)': 'Wartungstermine (CSV)',
  'Work orders (CSV)': 'Arbeitsaufträge (CSV)',
  'Image (JPG)': 'Bild (JPG)',
  'Move earlier': 'Nach vorne',
  'Move later': 'Nach hinten',
  'Remove from dashboard': 'Vom Dashboard entfernen',
  'This dashboard was changed elsewhere: it is shown again as saved.':
    'Dieses Dashboard wurde an anderer Stelle geändert: Es wird wieder wie gespeichert angezeigt.',
  'The change could not be saved: the server cannot be reached.':
    'Die Änderung konnte nicht gespeichert werden: Der Server ist nicht erreichbar.',
  '{label} added at the end of the dashboard.': '{label} am Ende des Dashboards hinzugefügt.',
  '{label} removed from the dashboard.': '{label} vom Dashboard entfernt.',
  '{label}, position {value} of {length}.': '{label}, Position {value} von {length}.',
  'Start from': 'Vorlage',
  'Give the dashboard a name.': 'Geben Sie dem Dashboard einen Namen.',
  'You already have a dashboard with this name.':
    'Sie haben bereits ein Dashboard mit diesem Namen.',
  'An empty dashboard': 'Ein leeres Dashboard',
  'The overview (every key figure and chart)': 'Die Übersicht (alle Kennzahlen und Diagramme)',
  'The backlog (flow, age, weeks of work, planned vs reactive)':
    'Der Auftragsbestand (Fluss, Alter, Arbeitswochen, geplant oder reaktiv)',
  'Compliance (preventive, regulatory, schedule, contractors)':
    'Die Konformität (präventiv, gesetzlich vorgeschrieben, Termine, Dienstleister)',
  'Assets and people (breakdowns, response times, estimates)':
    'Anlagen und Personen (Ausfälle, Reaktionszeiten, Schätzungen)',
  'A copy of “{name}”': 'Eine Kopie von „{name}“',
  'New dashboard': 'Neues Dashboard',
  Create: 'Anlegen',
  'Dashboard {name} created.': 'Dashboard {name} angelegt.',
  'Rename the dashboard': 'Dashboard umbenennen',
  Rename: 'Umbenennen',
  'Dashboard renamed {name}.': 'Dashboard in {name} umbenannt.',
  'Duplicate the dashboard': 'Dashboard duplizieren',
  Duplicate: 'Duplizieren',
  '{name} (copy)': '{name} (Kopie)',
  '{name} moved up in the sidebar.': '{name} in der Seitenleiste nach oben verschoben.',
  '{name} moved down in the sidebar.': '{name} in der Seitenleiste nach unten verschoben.',
  'Delete this dashboard?': 'Dieses Dashboard löschen?',
  '“{name}” and its layout will be deleted. The work orders and figures are not affected.':
    '„{name}“ und seine Anordnung werden gelöscht. Arbeitsaufträge und Zahlen bleiben unberührt.',
  'Delete dashboard': 'Dashboard löschen',
  'Dashboard {name} deleted.': 'Dashboard {name} gelöscht.',
  'Preparing the file…': 'Datei wird vorbereitet…',
  assets: 'anlagen',
  visits: 'wartungstermine',
  'work orders': 'arbeitsauftraege',
  'The file holds the first {length} of {total} records.':
    'Die Datei enthält die ersten {length} von {total} Datensätzen.',
  '{n} record exported.': '{n} Datensatz exportiert.',
  '{n} records exported.': '{n} Datensätze exportiert.',
  'on time': 'pünktlich',
  kept: 'eingehalten',
  'Tacto · {name} · figures of {fetchedAt}': 'Tacto · {name} · Zahlen vom {fetchedAt}',
  '⚠ Needs attention': '⚠ Handlungsbedarf',
  // export.js
  'The image could not be created.': 'Das Bild konnte nicht erstellt werden.',
  // feedback.js
  'suggestion|New': 'Neu',
  'suggestion|Planned': 'Geplant',
  'suggestion|Done': 'Umgesetzt',
  'suggestion|Declined': 'Abgelehnt',
  'Describe what could be improved on this page.':
    'Beschreiben Sie, was auf dieser Seite verbessert werden könnte.',
  'At most {MESSAGE_MAX_LENGTH} characters.': 'Höchstens {MESSAGE_MAX_LENGTH} Zeichen.',
  'Example: it would be interesting to include a pie chart of work orders by category.':
    'Beispiel: Ein Kreisdiagramm der Arbeitsaufträge nach Gewerk wäre hilfreich.',
  '{length} / {MESSAGE_MAX_LENGTH} characters': '{length} / {MESSAGE_MAX_LENGTH} Zeichen',
  Send: 'Senden',
  'What should be updated or improved on this page? Your idea is saved with the page you are on, for the next updates of the tool.':
    'Was sollte auf dieser Seite aktualisiert oder verbessert werden? Ihre Idee wird mit der aktuellen Seite gespeichert, für die nächsten Versionen des Werkzeugs.',
  'Page: ': 'Seite: ',
  'Your suggestion': 'Ihr Vorschlag',
  'All suggestions': 'Alle Vorschläge',
  'Status of suggestion {id}': 'Status des Vorschlags {id}',
  '{viewport_width} px wide': '{viewport_width} px breit',
  Show: 'Anzeigen',
  '{n} suggestion': '{n} Vorschlag',
  '{n} suggestions': '{n} Vorschläge',
  'Suggestions, page {page} of {pages}': 'Vorschläge, Seite {page} von {pages}',
  Sent: 'Gesendet am',
  By: 'Von',
  Page: 'Seite',
  Suggestion: 'Vorschlag',
  'No suggestion yet.': 'Noch kein Vorschlag.',
  // filters.js
  'Assigned to me': 'Mir zugewiesen',
  'Requests to review': 'Zu prüfende Meldungen',
  'Waiting for a reply': 'Wartet auf Antwort',
  'one|{n} selected': '{n} ausgewählt',
  '{n} selected': '{n} ausgewählt',
  'Not finished': 'Nicht erledigt',
  'Code, name, brand, serial number…': 'Code, Bezeichnung, Hersteller, Seriennummer…',
  'Number, title, description, report…': 'Nummer, Titel, Beschreibung, Bericht…',
  'From the dashboard': 'Aus dem Dashboard',
  'From the dashboard: ': 'Aus dem Dashboard: ',
  'Remove the dashboard filter': 'Dashboard-Filter entfernen',
  Filters: 'Filter',
  'Search and filter assets': 'Anlagen suchen und filtern',
  'Search and filter work orders': 'Arbeitsaufträge suchen und filtern',
  'Filters ({count})': 'Filter ({count})',
  // find-work-order.js
  'Search results: the assistant is not set up yet.':
    'Suchergebnisse: Der Assistent ist noch nicht eingerichtet.',
  'Search results: the assistant is not available right now.':
    'Suchergebnisse: Der Assistent ist gerade nicht verfügbar.',
  'Search results: the assistant’s answer could not be used.':
    'Suchergebnisse: Die Antwort des Assistenten war nicht verwertbar.',
  'Describe the job in at least 3 words.': 'Beschreiben Sie die Arbeit in mindestens 3 Wörtern.',
  'At most {FIND_TEXT_MAX_LENGTH} characters.': 'Höchstens {FIND_TEXT_MAX_LENGTH} Zeichen.',
  Strong: 'Stark',
  Possible: 'Möglich',
  'Search results.': 'Suchergebnisse.',
  'Open {number}': '{number} öffnen',
  Open: 'Öffnen',
  'Example: replaced the burnt contactor coil of pump 2, motor tested, 1 h 30.':
    'Beispiel: durchgebrannte Schützspule von Pumpe 2 ersetzt, Motor geprüft, 1 h 30.',
  '{length} / {FIND_TEXT_MAX_LENGTH} characters': '{length} / {FIND_TEXT_MAX_LENGTH} Zeichen',
  Find: 'Finden',
  'Asset: {code} {name}': 'Anlage: {code} {name}',
  'Site: {site}': 'Standort: {site}',
  'Remove the asset: search everywhere': 'Anlage entfernen: überall suchen',
  'Remove the site: search everywhere': 'Standort entfernen: überall suchen',
  Remove: 'Entfernen',
  'Matching work orders': 'Passende Arbeitsaufträge',
  'No open work order matches this job.': 'Kein offener Arbeitsauftrag passt zu dieser Arbeit.',
  'None of these? ': 'Keiner davon? ',
  'Finding…': 'Suche…',
  'The server cannot be reached: your text is kept, try again once connected.':
    'Der Server ist nicht erreichbar: Ihr Text bleibt erhalten, versuchen Sie es mit Verbindung erneut.',
  'Describe the job you did or the fault you found: Tacto looks for the open work order it belongs to.':
    'Beschreiben Sie die ausgeführte Arbeit oder den gefundenen Fehler: Tacto sucht den offenen Arbeitsauftrag, zu dem sie gehört.',
  'What did you do?': 'Was haben Sie gemacht?',
  Close: 'Schließen',
  // history.js
  'Status changed by an administrator (override)':
    'Status von einem Administrator geändert (außerhalb der Schritte)',
  Changed: 'Geändert',
  Deleted: 'Gelöscht',
  'Edit not applied (conflict)': 'Änderung nicht übernommen (Konflikt)',
  'Conflict resolved': 'Konflikt gelöst',
  'kept version A': 'Version A behalten',
  'applied version B': 'Version B übernommen',
  merged: 'zusammengeführt',
  Kind: 'Art',
  Person: 'Person',
  Day: 'Tag',
  Length: 'Dauer',
  Appointment: 'Festtermin',
  Note: 'Notiz',
  'Not locked': 'Nicht fixiert',
  'Maintenance plans': 'Wartungspläne',
  'Plan visits': 'Termine der Pläne',
  'Scheduled blocks': 'Geplante Zeitblöcke',
  'User accounts': 'Benutzerkonten',
  'Password reset by an administrator': 'Passwort von einem Administrator zurückgesetzt',
  'Password changed by the user': 'Passwort vom Benutzer geändert',
  Building: 'Gebäude',
  Floor: 'Etage',
  Room: 'Raum',
  '{label}: ': '{label}: ',
  'No change recorded yet.': 'Noch keine Änderung erfasst.',
  'Loading the history…': 'Verlauf wird geladen…',
  'The history needs a connection to the server.':
    'Der Verlauf braucht eine Verbindung zum Server.',
  History: 'Verlauf',
  'All records': 'Alle Datensätze',
  '{n} change': '{n} Änderung',
  '{n} changes': '{n} Änderungen',
  'Audit log, page {page} of {pages}': 'Änderungsprotokoll, Seite {page} von {pages}',
  When: 'Wann',
  Who: 'Wer',
  What: 'Was',
  Changes: 'Änderungen',
  // my-week.js
  'Start time of {number}': 'Beginn von {number}',
  'Start time of this block': 'Beginn dieses Zeitblocks',
  'Change…': 'Ändern…',
  'Move up': 'Nach oben',
  'Move down': 'Nach unten',
  'Unlock the time': 'Uhrzeit freigeben',
  'Lock at this time': 'Auf diese Uhrzeit fixieren',
  '🔒 {appointmentText} · locked by {locked_by}': '🔒 {appointmentText} · fixiert von {locked_by}',
  'Nothing scheduled.': 'Nichts geplant.',
  '← Previous': '← Vorherige',
  'Previous week': 'Vorherige Woche',
  'Next →': 'Nächste →',
  'Next week': 'Nächste Woche',
  'This week': 'Diese Woche',
  'Back to this week': 'Zurück zu dieser Woche',
  '{week_total} scheduled of {week_capacity}. Appointments come first; order the rest of each day as you like.':
    '{week_total} von {week_capacity} geplant. Festtermine kommen zuerst; ordnen Sie den Rest jedes Tages nach Belieben.',
  'Offline: your week as saved on this device on {generated_at}. Changes need a connection.':
    'Offline: Ihre Woche, wie am {generated_at} auf diesem Gerät gespeichert. Änderungen brauchen eine Verbindung.',
  // places.js
  'Search, e.g. “12.02” or “Tower A L3”': 'Suchen, z. B. „12.02“ oder „Turm A E3“',
  '— {value} itself —': '— {value} selbst —',
  '{name} (not in use)': '{name} (nicht in Nutzung)',
  'Not in the list': 'Nicht in der Liste',
  'No place found.': 'Kein Ort gefunden.',
  'Find a place': 'Ort finden',
  'The character › is not allowed': 'Das Zeichen › ist nicht erlaubt',
  'Capitals and digits only, 1 to 10 characters':
    'Nur Großbuchstaben und Ziffern, 1 bis 10 Zeichen',
  'In use': 'In Nutzung',
  'Not in use': 'Nicht in Nutzung',
  'Name or path, e.g. “Tower A L12”': 'Name oder Pfad, z. B. „Turm A E12“',
  Fold: 'Einklappen',
  Unfold: 'Ausklappen',
  'Search places': 'Orte suchen',
  'Show places not in use': 'Orte außer Nutzung anzeigen',
  '{n} place matches': '{n} Ort passt',
  '{n} places match': '{n} Orte passen',
  '{n} place': '{n} Ort',
  '{n} places': '{n} Orte',
  'Level types': 'Ebenentypen',
  '+ New site': '+ Neuer Standort',
  'No place matches this search.': 'Kein Ort entspricht dieser Suche.',
  'No place yet.': 'Noch kein Ort.',
  'Records copy the site’s name: it can change only while nothing uses the site.':
    'Datensätze übernehmen den Namen des Standorts: Er lässt sich nur ändern, solange nichts den Standort verwendet.',
  'The name people use, e.g. “Tower A”, “L12” or “Meeting room 12.02”.':
    'Der gebräuchliche Name, z. B. „Turm A“, „E12“ oder „Besprechungsraum 12.02“.',
  'Level type': 'Ebenentyp',
  'Optional, for asset codes: capitals and digits, e.g. “2” for Tower 2, “01” for the first basement.':
    'Optional, für Anlagencodes: Großbuchstaben und Ziffern, z. B. „2“ für Turm 2, „01“ für das erste Untergeschoss.',
  'A site is the top of a branch: an office tower, a branch, a data center. Fields marked * are required.':
    'Ein Standort ist die oberste Ebene eines Zweigs: ein Bürohochhaus, eine Filiale, ein Rechenzentrum. Mit * markierte Felder sind Pflichtfelder.',
  'In {fullPath}. Fields marked * are required.':
    'In {fullPath}. Mit * markierte Felder sind Pflichtfelder.',
  'Create site': 'Standort anlegen',
  'Create place': 'Ort anlegen',
  'New site': 'Neuer Standort',
  'New place': 'Neuer Ort',
  Inside: 'Innerhalb von',
  'Move the place within its site: the records below follow, with their new path.':
    'Verschieben Sie den Ort innerhalb seines Standorts: Die Datensätze darunter folgen mit ihrem neuen Pfad.',
  'A place not in use is no longer offered, nor the places below it; records keep it.':
    'Ein Ort außer Nutzung wird nicht mehr angeboten, ebenso wenig die Orte darunter; Datensätze behalten ihn.',
  '+ Add a place inside': '+ Ort darin hinzufügen',
  'Only administrators change sites.': 'Nur Administratoren ändern Standorte.',
  'A capital letter, then capitals, digits or _':
    'Ein Großbuchstabe, dann Großbuchstaben, Ziffern oder _',
  'New level type': 'Neuer Ebenentyp',
  Token: 'Platzhalter',
  'The site type keeps its token.': 'Der Typ Standort behält seinen Platzhalter.',
  'Its name in asset code patterns, e.g. BUILDING for {BUILDING}.':
    'Sein Name in Mustern für Anlagencodes, z. B. BUILDING für {BUILDING}.',
  'Offered to staff': 'Für Mitarbeiter auswählbar',
  'Staff can pick places of this type when they send a request.':
    'Mitarbeiter können Orte dieses Typs wählen, wenn sie eine Meldung senden.',
  'Add level type': 'Ebenentyp hinzufügen',
  'The kinds of places: any type can sit under any place, so each site follows its own layout.':
    'Die Arten von Orten: Jeder Typ kann unter jedem Ort liegen, so folgt jeder Standort seiner eigenen Gliederung.',
  // plan-panel.js
  weekly: 'wöchentlich',
  'every other week': 'alle zwei Wochen',
  monthly: 'monatlich',
  quarterly: 'vierteljährlich',
  'twice a year': 'halbjährlich',
  yearly: 'jährlich',
  'Every {n} week': 'Jede Woche',
  'Every {n} weeks': 'Alle {n} Wochen',
  'Required without an asset': 'Pflichtfeld ohne Anlage',
  'Hours in steps of half an hour': 'Stunden in Schritten von einer halben Stunde',
  'Between 1 and 104 weeks': 'Zwischen 1 und 104 Wochen',
  'Choose a week': 'Wählen Sie eine Woche',
  'The end week cannot be before the first visit.':
    'Die letzte Woche darf nicht vor dem ersten Termin liegen.',
  'Give both ends of the season, or neither.': 'Geben Sie beide Grenzen der Saison an oder keine.',
  'Name the contractor who performs the visits.':
    'Nennen Sie den Dienstleister, der die Termine ausführt.',
  'No week is available any more.': 'Keine Woche ist mehr verfügbar.',
  'Only {from}': 'Nur {from}',
  '{from} to {to}': '{from} bis {to}',
  'regulatory: earlier only, up to week {due_week}': 'gesetzlich: nur früher, bis KW {due_week}',
  '± {n} week around week {due}': '± {n} Woche um KW {due}',
  '± {n} weeks around week {due}': '± {n} Wochen um KW {due}',
  'Allowed: {range} ({why}).': 'Erlaubt: {range} ({why}).',
  'Restore this visit': 'Diesen Termin wiederherstellen',
  'Move this visit to week': 'Diesen Termin verschieben in Woche',
  'Move visit': 'Termin verschieben',
  'Choose a week.': 'Wählen Sie eine Woche.',
  'The visit is already in this week.': 'Der Termin liegt bereits in dieser Woche.',
  'Skip this visit': 'Diesen Termin auslassen',
  'Skip visit': 'Termin auslassen',
  'Say why the visit is skipped.': 'Geben Sie an, warum der Termin ausgelassen wird.',
  'e.g. "Building closed for works". The visit leaves the load; it can be restored.':
    'z. B. „Gebäude wegen Bauarbeiten geschlossen“. Der Termin zählt nicht mehr zur Auslastung; er kann wiederhergestellt werden.',
  'Visit of {week}': 'Termin: {week}',
  'Due week': 'Fällige Woche',
  '{week} (moved)': '{week} (verschoben)',
  'Created {n} week before the visit': '{n} Woche vor dem Termin angelegt',
  'Created {n} weeks before the visit': '{n} Wochen vor dem Termin angelegt',
  'Reason for skipping': 'Grund für das Auslassen',
  Warning: 'Warnung',
  '⚠ Outside the season (weeks {season_from_week} to {season_to_week}). ':
    '⚠ Außerhalb der Saison (KW {season_from_week} bis {season_to_week}). ',
  '⚠ In a blocked week.': '⚠ In einer gesperrten Woche.',
  'Move the series': 'Serie verschieben',
  'First visit of the series': 'Erster Termin der Serie',
  'Move series': 'Serie verschieben',
  'The series already starts this week.': 'Die Serie beginnt bereits in dieser Woche.',
  'The planned visits follow; visits moved by hand keep their offset; visits with a work order stay.':
    'Die geplanten Termine folgen; von Hand verschobene Termine behalten ihren Abstand; Termine mit Arbeitsauftrag bleiben.',
  'This plan is inactive: it creates no more visits.':
    'Dieser Plan ist inaktiv: Er erzeugt keine Termine mehr.',
  'Edit plan': 'Plan bearbeiten',
  'Hours per visit': 'Stunden pro Termin',
  Frequency: 'Intervall',
  'First visit': 'Erster Termin',
  'Last week': 'Letzte Woche',
  'Open-ended': 'Unbefristet',
  Calendar: 'Kalender',
  Tolerance: 'Toleranz',
  '± {n} week': '± {n} Woche',
  '± {n} weeks': '± {n} Wochen',
  Season: 'Saison',
  'Weeks {season_from_week} to {season_to_week}': 'KW {season_from_week} bis {season_to_week}',
  'Done by': 'Ausgeführt von',
  'Contractor: {supplier}': 'Dienstleister: {supplier}',
  'Internal team': 'Eigenes Team',
  Instructions: 'Anweisungen',
  ' by {updated_by}': ' von {updated_by}',
  'Next visits': 'Nächste Termine',
  'No visit planned.': 'Kein Termin geplant.',
  Contractor: 'Dienstleister',
  'Type a code or browse the assets. The place and trade then follow the asset.':
    'Geben Sie einen Code ein oder durchsuchen Sie die Anlagen. Ort und Gewerk folgen dann der Anlage.',
  'What is done': 'Ausgeführte Arbeit',
  'e.g. "Quarterly service, Tower A chiller"':
    'z. B. „Vierteljährliche Wartung, Kältemaschine Turm A“',
  'Regulatory visits have a legal deadline.':
    'Gesetzlich vorgeschriebene Termine haben eine Frist.',
  'Without an asset: the site, or a place in it.': 'Ohne Anlage: der Standort oder ein Ort darin.',
  "The asset's trade": 'Das Gewerk der Anlage',
  'In half hours. Above 3 h 30 the visit will be split into several blocks.':
    'In halben Stunden. Über 3 h 30 wird der Termin auf mehrere Zeitblöcke aufgeteilt.',
  'Every (weeks)': 'Alle (Wochen)',
  '1, 2, 4, 8, 13 (quarterly), 26 or 52 (yearly).':
    '1, 2, 4, 8, 13 (vierteljährlich), 26 oder 52 (jährlich).',
  'Changing it moves every planned visit.': 'Eine Änderung verschiebt alle geplanten Termine.',
  'The next visits follow every period.': 'Die nächsten Termine folgen in jedem Intervall.',
  'End of the contract. Empty: no end.': 'Vertragsende. Leer: unbefristet.',
  '"From the last visit": the next visits restart from the week a visit is closed.':
    '„Ab dem letzten Termin“: Die nächsten Termine zählen ab der Woche, in der ein Termin abgeschlossen wird.',
  'Tolerance (weeks)': 'Toleranz (Wochen)',
  'How far one visit may move. Empty: a quarter of the period, at most 8.':
    'Wie weit sich ein Termin verschieben darf. Leer: ein Viertel des Intervalls, höchstens 8.',
  'Season from week': 'Saison ab KW',
  'Season to week': 'Saison bis KW',
  'e.g. 14 to 22 for checks before summer. May run over the new year (45 to 10).':
    'z. B. 14 bis 22 für Prüfungen vor dem Sommer. Darf über den Jahreswechsel gehen (45 bis 10).',
  'An inactive plan keeps its history and creates no more visits.':
    'Ein inaktiver Plan behält seinen Verlauf und erzeugt keine Termine mehr.',
  'Create plan': 'Plan anlegen',
  'Edit {code}': '{code} bearbeiten',
  'New maintenance plan': 'Neuer Wartungsplan',
  'Every site': 'Alle Standorte',
  'Block a week': 'Woche sperren',
  Week: 'Woche',
  Reason: 'Grund',
  'e.g. "Data center change freeze", "Summer holidays".':
    'z. B. „Änderungsstopp im Rechenzentrum“, „Sommerferien“.',
  'Block week': 'Woche sperren',
  'Blocked weeks': 'Gesperrte Wochen',
  'Visits should avoid these weeks. The planner warns about visits planned in them (⛔ in the week header, ⚠ on the visit), it does not refuse them.':
    'Termine sollten diese Wochen meiden. Die Planung warnt vor Terminen darin (⛔ im Wochenkopf, ⚠ am Termin), lehnt sie aber nicht ab.',
  'Remove {week}, {value}': '{week}, {value} entfernen',
  'every site': 'alle Standorte',
  'No week is blocked from this week on.': 'Ab dieser Woche ist keine Woche gesperrt.',
  'Week {week}': 'Woche {week}',
  'Peak week load': 'Auslastung der Spitzenwoche',
  'Weeks over capacity': 'Überlastete Wochen',
  'Tight weeks (85–100%)': 'Knappe Wochen (85–100 %)',
  'Busiest week of one trade': 'Höchste Wochenauslastung eines Gewerks',
  ' · § regulatory': ' · § gesetzlich',
  'Due {week}. Load now: {week2} {loadOf}, {week3} {loadOf2}.':
    'Fällig {week}. Aktuelle Auslastung: {week2} {loadOf}, {week3} {loadOf2}.',
  'Suggested moves': 'Vorgeschlagene Verschiebungen',
  "{n} visit could move to smooth the weeks shown. Each stays within its plan's tolerance and season, outside blocked weeks, and a regulatory visit only moves earlier. Nothing is saved until you accept.":
    '{n} Termin könnte verschoben werden, um die angezeigten Wochen auszugleichen. Jeder bleibt in Toleranz und Saison seines Plans, außerhalb gesperrter Wochen, und ein gesetzlich vorgeschriebener Termin wird nur vorgezogen. Nichts wird gespeichert, bevor Sie zustimmen.',
  "{n} visits could move to smooth the weeks shown. Each stays within its plan's tolerance and season, outside blocked weeks, and a regulatory visit only moves earlier. Nothing is saved until you accept.":
    '{n} Termine könnten verschoben werden, um die angezeigten Wochen auszugleichen. Jeder bleibt in Toleranz und Saison seines Plans, außerhalb gesperrter Wochen, und ein gesetzlich vorgeschriebener Termin wird nur vorgezogen. Nichts wird gespeichert, bevor Sie zustimmen.',
  'Figures before and after the moves ticked': 'Zahlen vor und nach den gewählten Verschiebungen',
  Figure: 'Kennzahl',
  Now: 'Aktuell',
  'With the moves ticked': 'Mit den gewählten Verschiebungen',
  ' (lower)': ' (niedriger)',
  'Tick all': 'Alle auswählen',
  'Untick all': 'Alle abwählen',
  'Accept {n} move': '{n} Verschiebung übernehmen',
  'Accept {n} moves': '{n} Verschiebungen übernehmen',
  'The weeks shown are already as smooth as the plans allow: no visit can move to lower the load within its rules.':
    'Die angezeigten Wochen sind bereits so ausgeglichen, wie die Pläne es erlauben: Kein Termin kann innerhalb seiner Regeln verschoben werden, um die Auslastung zu senken.',
  // planner-editing.js
  'Move cancelled.': 'Verschiebung abgebrochen.',
  'Nothing moved.': 'Nichts verschoben.',
  'This visit cannot be moved: only planned visits from this week on can.':
    'Dieser Termin kann nicht verschoben werden: Nur geplante Termine ab dieser Woche können es.',
  Series: 'Serie',
  Visit: 'Termin',
  '{week}: where it is now.': '{week}: aktuelle Position.',
  ', load {value}%': ', Auslastung {value} %',
  '{what} to {week}{share}. Enter to confirm, Escape to cancel.':
    '{what} nach {week}{share}. Eingabetaste zum Bestätigen, Esc zum Abbrechen.',
  // planner-page.js
  '{code}: visit {week} → {week2}': '{code}: Termin {week} → {week2}',
  '{code}: series from {week} → {week2}': '{code}: Serie ab {week} → {week2}',
  '{code}: visit of {week} skipped': '{code}: Termin ({week}) ausgelassen',
  'Balancing: {n} visit moved': 'Ausgleich: {n} Termin verschoben',
  'Balancing: {n} visits moved': 'Ausgleich: {n} Termine verschoben',
  '{code}: visit of {week} restored': '{code}: Termin ({week}) wiederhergestellt',
  'This plan changed since: reload it.':
    'Dieser Plan wurde inzwischen geändert: Laden Sie ihn neu.',
  'This visit changed since: reload the planner.':
    'Dieser Termin wurde inzwischen geändert: Laden Sie die Planung neu.',
  'You are offline: nothing was changed.': 'Sie sind offline: Nichts wurde geändert.',
  'Not changed: {message}': 'Nicht geändert: {message}',
  'Undone: ': 'Rückgängig: ',
  'Redone: ': 'Wiederholt: ',
  'Loading the year planner…': 'Jahresplanung wird geladen…',
  'Plan not found': 'Plan nicht gefunden',
  'This maintenance plan does not exist.': 'Dieser Wartungsplan existiert nicht.',
  'The year planner needs a connection to the server.':
    'Die Jahresplanung braucht eine Verbindung zum Server.',
  '{week} blocked.': '{week} gesperrt.',
  'You are offline: nothing was saved.': 'Sie sind offline: Nichts wurde gespeichert.',
  '{week} is no longer blocked.': '{week} ist nicht mehr gesperrt.',
  'You are offline: nothing was removed.': 'Sie sind offline: Nichts wurde entfernt.',
  'you are offline': 'Sie sind offline',
  'No visit was moved.': 'Kein Termin wurde verschoben.',
  '{n} not moved ({code}: {message})': '{n} nicht verschoben ({code}: {message})',
  'No asset has this code': 'Keine Anlage hat diesen Code',
  'Plan saved.': 'Plan gespeichert.',
  'Plan {code} created.': 'Plan {code} angelegt.',
  'You are offline: the plan was not saved.': 'Sie sind offline: Der Plan wurde nicht gespeichert.',
  'Loading the settings…': 'Einstellungen werden geladen…',
  'The planning settings need a connection to the server.':
    'Die Planungseinstellungen brauchen eine Verbindung zum Server.',
  'Nothing to save: no value was changed.': 'Nichts zu speichern: Kein Wert wurde geändert.',
  'Planning settings saved.': 'Planungseinstellungen gespeichert.',
  // sla.js and its page in app.js (D86)
  'Service levels': 'Service-Level',
  'Loading the service levels…': 'Service-Level werden geladen…',
  'The service levels need a connection to the server.':
    'Die Service-Level brauchen eine Verbindung zum Server.',
  'Service levels saved.': 'Service-Level gespeichert.',
  'You are offline: the service levels were not saved.':
    'Sie sind offline: Die Service-Level wurden nicht gespeichert.',
  'Holiday added.': 'Feiertag hinzugefügt.',
  'You are offline: the holiday was not added.':
    'Sie sind offline: Der Feiertag wurde nicht hinzugefügt.',
  'Holiday removed.': 'Feiertag entfernt.',
  'You are offline: the holiday was not removed.':
    'Sie sind offline: Der Feiertag wurde nicht entfernt.',
  'Service level': 'Service-Level',
  'At risk': 'Gefährdet',
  Met: 'Eingehalten',
  Missed: 'Verfehlt',
  Paused: 'Pausiert',
  Running: 'Läuft',
  'SLA missed': 'SLA verfehlt',
  'SLA at risk': 'SLA gefährdet',
  'No target for this priority.': 'Kein Ziel für diese Priorität.',
  '{at}, due {due}': '{at}, fällig {due}',
  'Due {due}': 'Fällig {due}',
  Response: 'Reaktion',
  Resolution: 'Behebung',
  'The clocks stop while the work waits for access or an approval.':
    'Die Uhren stehen still, solange die Arbeit auf Zugang oder eine Freigabe wartet.',
  'Response stops at': 'Reaktion endet bei',
  'SLA hours': 'SLA-Stunden',
  'Business days': 'Geschäftstage',
  Opening: 'Beginn',
  Closing: 'Ende',
  Holiday: 'Feiertag',
  'Response target, {priority}': 'Reaktionsziel, {priority}',
  'Resolution target, {priority}': 'Behebungsziel, {priority}',
  'No target': 'Kein Ziel',
  'Targets in hours (empty: no target)': 'Ziele in Stunden (leer: kein Ziel)',
  'The first start of the work, or its first assignment to someone.':
    'Der erste Beginn der Arbeit oder ihre erste Zuweisung an jemanden.',
  'Business hours count the business days and opening hours below, without the holidays.':
    'Geschäftszeiten zählen die Geschäftstage und Zeiten unten, ohne die Feiertage.',
  'Corrective work and staff requests reported since {date} are measured.':
    'Gemessen werden Instandsetzungen und Meldungen seit dem {date}.',
  'Save service levels': 'Service-Level speichern',
  'Add holiday': 'Feiertag hinzufügen',
  Holidays: 'Feiertage',
  'Days without business hours, on every site. Used in business hours only.':
    'Tage ohne Geschäftszeiten, an allen Standorten. Gilt nur bei Geschäftszeiten.',
  'Remove the holiday {name} of {day}': 'Feiertag {name} am {day} entfernen',
  'No holiday.': 'Kein Feiertag.',
  'Response and resolution targets of corrective work, per priority. A change recomputes the deadlines of the unfinished work orders and is recorded in the audit log.':
    'Reaktions- und Behebungsziele für Instandsetzungen, je Priorität. Eine Änderung berechnet die Fristen der nicht erledigten Arbeitsaufträge neu und wird im Änderungsprotokoll erfasst.',
  'Response and resolution targets of corrective work, per priority. Only administrators can change them.':
    'Reaktions- und Behebungsziele für Instandsetzungen, je Priorität. Nur Administratoren können sie ändern.',
  'You are offline: the settings were not saved.':
    'Sie sind offline: Die Einstellungen wurden nicht gespeichert.',
  // planning-rules.js
  'week {weekNumber}': 'KW {weekNumber}',
  'This visit already has its work order: change the work order instead of the visit.':
    'Dieser Termin hat bereits seinen Arbeitsauftrag: Ändern Sie den Arbeitsauftrag statt des Termins.',
  'This visit is skipped: restore it first.':
    'Dieser Termin ist ausgelassen: Stellen Sie ihn zuerst wieder her.',
  'A visit cannot be moved into the past.':
    'Ein Termin kann nicht in die Vergangenheit verschoben werden.',
  'A regulatory visit can only move earlier: {weekWords} is its deadline.':
    'Ein gesetzlich vorgeschriebener Termin kann nur vorgezogen werden: {weekWords} ist seine Frist.',
  "{week} is outside this visit's tolerance of ± {n} week around {due}.":
    '{week} liegt außerhalb der Toleranz dieses Termins (± {n} Woche um {due}).',
  "{week} is outside this visit's tolerance of ± {n} weeks around {due}.":
    '{week} liegt außerhalb der Toleranz dieses Termins (± {n} Wochen um {due}).',
  'The series cannot be moved into the past.':
    'Die Serie kann nicht in die Vergangenheit verschoben werden.',
  // planning-settings.js
  'Capacity of the next {WEEKS} weeks: {before} h → {after} h':
    'Kapazität der nächsten {WEEKS} Wochen: {before} h → {after} h',
  'Capacity of the next {WEEKS} weeks: {yearCapacity} h':
    'Kapazität der nächsten {WEEKS} Wochen: {yearCapacity} h',
  'Corrective reserve (%)': 'Reserve für Instandsetzung (%)',
  'Share of each week kept free for breakdowns and staff requests (0 to 80).':
    'Anteil jeder Woche, der für Störungen und Meldungen frei bleibt (0 bis 80).',
  'Daily capacity (hours)': 'Tageskapazität (Stunden)',
  'Hours each technician and supervisor works on a working day.':
    'Stunden, die jeder Techniker und Supervisor an einem Arbeitstag arbeitet.',
  'Release horizon (weeks)': 'Vorlauf für Aufträge (Wochen)',
  'Work orders of plan visits are created this many weeks ahead.':
    'Arbeitsaufträge für Termine der Pläne werden so viele Wochen im Voraus angelegt.',
  'Longest block (hours)': 'Längster Zeitblock (Stunden)',
  'Longer visits are flagged in the year planner: they will be split.':
    'Längere Termine werden in der Jahresplanung markiert: Sie werden aufgeteilt.',
  '{n} technician or supervisor counts as capacity.':
    '{n} Techniker oder Supervisor zählt zur Kapazität.',
  '{n} technicians and supervisors count as capacity.':
    '{n} Techniker und Supervisoren zählen zur Kapazität.',
  ' Last changed by {updated_by} on {updated_at}.':
    ' Zuletzt geändert von {updated_by} am {updated_at}.',
  'Save settings': 'Einstellungen speichern',
  'These settings apply at once to every figure of the year planner. Each change is recorded in the audit log.':
    'Diese Einstellungen gelten sofort für alle Zahlen der Jahresplanung. Jede Änderung wird im Änderungsprotokoll erfasst.',
  // planning.js
  'The site itself': 'Der Standort selbst',
  'work order {number}': 'Arbeitsauftrag {number}',
  regulatory: 'gesetzlich',
  'contractor {value}': 'Dienstleister {value}',
  'moved from {due_week}': 'verschoben, geplant war: {due_week}',
  'outside the season': 'außerhalb der Saison',
  'in a blocked week': 'in einer gesperrten Woche',
  'first planned visit: moving it moves the whole series':
    'erster geplanter Termin: Wer ihn verschiebt, verschiebt die ganze Serie',
  'Longer than {max_block_hours}: will be split': 'Länger als {max_block_hours}: wird aufgeteilt',
  'No specialist for: {uncovered}': 'Keine Fachkraft für: {uncovered}',
  'Weekly workload': 'Wochenauslastung',
  'average · peak {peak_load} · {n} week over capacity, {weeks_tight} tight':
    'Durchschnitt · Spitze {peak_load} · {n} Woche überlastet, {weeks_tight} knapp',
  'average · peak {peak_load} · {n} weeks over capacity, {weeks_tight} tight':
    'Durchschnitt · Spitze {peak_load} · {n} Wochen überlastet, {weeks_tight} knapp',
  'Trade balance': 'Verteilung auf Gewerke',
  'No specialist': 'Keine Fachkraft',
  'Nothing planned': 'Nichts geplant',
  'over {weekCount} weeks': 'über {weekCount} Wochen',
  'Peak week': 'Spitzenwoche',
  '{load} of capacity, {excess} too many': '{load} der Kapazität, {excess} zu viel',
  '{load} of capacity': '{load} der Kapazität',
  'No capacity counted': 'Keine Kapazität gezählt',
  'Site spread': 'Verteilung auf Standorte',
  'sites with internal visits a week on average, {peak} at most':
    'Standorte mit eigenen Terminen pro Woche im Schnitt, höchstens {peak}',
  'Contractor visits': 'Termine von Dienstleistern',
  'at most {peak} in a week ({peak_week}), not in the load':
    'höchstens {peak} in einer Woche ({peak_week}), nicht in der Auslastung',
  'none in these weeks': 'keine in diesen Wochen',
  'Daily capacity': 'Tageskapazität',
  'Corrective reserve': 'Reserve für Instandsetzung',
  'Longest block': 'Längster Zeitblock',
  'Next 52 weeks': 'Nächste 52 Wochen',
  'Year {y}': 'Jahr {y}',
  '52 weeks from…': '52 Wochen ab…',
  'First week': 'Erste Woche',
  'Code, title, place…': 'Code, Titel, Ort…',
  'Planner filters': 'Filter der Planung',
  'Weeks shown': 'Angezeigte Wochen',
  'Group by': 'Gruppieren nach',
  '+ New plan': '+ Neuer Plan',
  'Key figures of the weeks shown': 'Kennzahlen der angezeigten Wochen',
  'Needs balancing': 'Auszugleichen',
  'Capacity: {weekly} a week ({daily} a day per technician and supervisor), keeping a {reserve}% reserve for breakdowns and staff requests, set by the administrators.':
    'Kapazität: {weekly} pro Woche ({daily} pro Tag je Techniker und Supervisor), mit einer Reserve von {reserve} % für Störungen und Meldungen, festgelegt von den Administratoren.',
  'Change the settings': 'Einstellungen ändern',
  ' (preview)': ' (Vorschau)',
  Load: 'Auslastung',
  'planned vs {capacity} a week': 'geplant gegenüber {capacity} pro Woche',
  '{planned_hours} planned of {capacity}': '{planned_hours} von {capacity} geplant',
  '{n} contractor visit, not counted': '{n} Termin eines Dienstleisters, nicht gezählt',
  '{n} contractor visits, not counted': '{n} Termine von Dienstleistern, nicht gezählt',
  Plan: 'Plan',
  '{week}, Monday {monday}. Blocked: {blocked}': '{week}, Montag {monday}. Gesperrt: {blocked}',
  '{week}, Monday {monday}': '{week}, Montag {monday}',
  'Week ': 'KW ',
  ' (this week)': ' (diese Woche)',
  ' blocked: {blocked}': ' gesperrt: {blocked}',
  'one|{estimated_hours} · every {n} wk': '{estimated_hours} · jede Woche',
  '{estimated_hours} · every {n} wk': '{estimated_hours} · alle {n} Wo.',
  contractor: 'Dienstleister',
  '{n} plan': '{n} Plan',
  '{n} plans': '{n} Pläne',
  'Visits (hours): ': 'Termine (Stunden): ',
  ' planned': ' geplant',
  ' work order created': ' Arbeitsauftrag angelegt',
  ' skipped': ' ausgelassen',
  ' regulatory': ' gesetzlich',
  ' contractor': ' Dienstleister',
  ' outside its season or blocked': ' außerhalb der Saison oder gesperrt',
  ' moved': ' verschoben',
  ' first visit: moves the series': ' erster Termin: verschiebt die Serie',
  ' blocked week': ' gesperrte Woche',
  'Load by trade: ': 'Auslastung nach Gewerk: ',
  capacity: 'Kapazität',
  'Show the weekly figures as a table': 'Wochenzahlen als Tabelle anzeigen',
  'Planned hours and capacity per week': 'Geplante Stunden und Kapazität pro Woche',
  Planned: 'Geplant',
  Capacity: 'Kapazität',
  'By trade': 'Nach Gewerk',
  ' (tight)': ' (knapp)',
  ' (over)': ' (überlastet)',
  'Maintenance plans, {range}: {n} plan': 'Wartungspläne, {range}: {n} Plan',
  'Maintenance plans, {range}: {n} plans': 'Wartungspläne, {range}: {n} Pläne',
  'No plan matches these filters.': 'Kein Plan entspricht diesen Filtern.',
  'No maintenance plan yet.': 'Noch kein Wartungsplan.',
  'Nothing to {label}': 'Nicht möglich: {label}',
  Undo: 'Rückgängig machen',
  'Ctrl+Z': 'Strg+Z',
  Redo: 'Wiederholen',
  'Ctrl+Y': 'Strg+Y',
  'Suggest a smoother plan': 'Ausgeglicheneren Plan vorschlagen',
  'Drag a planned visit to another week, or select it and press Shift + arrow keys, then Enter (Escape cancels). The first planned visit of a row moves the whole series; Alt + Shift + arrows move the series from any visit.':
    'Ziehen Sie einen geplanten Termin in eine andere Woche, oder wählen Sie ihn aus und drücken Sie Umschalt + Pfeiltasten, dann die Eingabetaste (Esc bricht ab). Der erste geplante Termin einer Zeile verschiebt die ganze Serie; Alt + Umschalt + Pfeiltasten verschieben die Serie von jedem Termin aus.',
  // queue.js
  'This record is waiting for a supervisor to resolve a conflict.':
    'Dieser Datensatz wartet darauf, dass ein Supervisor einen Konflikt löst.',
  // requests.js
  'request|Closed': 'Abgeschlossen',
  Received: 'Eingegangen',
  'Approved and assigned': 'Genehmigt und zugewiesen',
  Done: 'Erledigt',
  'Low: it can wait': 'Niedrig: Es kann warten',
  Normal: 'Normal',
  'High: it disturbs work': 'Hoch: Es stört die Arbeit',
  'Urgent: safety risk, or work is impossible':
    'Dringend: Sicherheitsrisiko, oder Arbeiten ist unmöglich',
  "I don't know": 'Weiß nicht',
  'Waiting for review': 'Wartet auf Prüfung',
  'A supervisor will review your request, then assign a technician to it.':
    'Ein Supervisor prüft Ihre Meldung und weist sie dann einem Techniker zu.',
  'Cancelled by you': 'Von Ihnen zurückgezogen',
  'Nothing: you cancelled this request. If the problem comes back, send a new request.':
    'Nichts: Sie haben diese Meldung zurückgezogen. Tritt das Problem wieder auf, senden Sie eine neue Meldung.',
  Rejected: 'Abgelehnt',
  'A supervisor rejected this request: “{note}”. If you disagree or the problem is still there, add a comment or send a new request.':
    'Ein Supervisor hat diese Meldung abgelehnt: „{note}“. Wenn Sie nicht einverstanden sind oder das Problem weiter besteht, fügen Sie einen Kommentar hinzu oder senden Sie eine neue Meldung.',
  'A supervisor rejected this request. If you disagree or the problem is still there, add a comment or send a new request.':
    'Ein Supervisor hat diese Meldung abgelehnt. Wenn Sie nicht einverstanden sind oder das Problem weiter besteht, fügen Sie einen Kommentar hinzu oder senden Sie eine neue Meldung.',
  Cancelled: 'Storniert',
  'The maintenance team cancelled this request: the comments may say why. If the problem is still there, send a new request.':
    'Das Instandhaltungsteam hat diese Meldung storniert: Die Kommentare nennen vielleicht den Grund. Besteht das Problem weiter, senden Sie eine neue Meldung.',
  'The work is finished ({completed_on}). If the problem is still there, add a comment.':
    'Die Arbeit ist erledigt ({completed_on}). Besteht das Problem weiter, fügen Sie einen Kommentar hinzu.',
  'The work is finished. If the problem is still there, add a comment.':
    'Die Arbeit ist erledigt. Besteht das Problem weiter, fügen Sie einen Kommentar hinzu.',
  'On hold': 'Zurückgestellt',
  'The work is paused, for example while waiting for a part, a supplier or access to the room. The comments give the details.':
    'Die Arbeit ruht, zum Beispiel weil ein Ersatzteil, ein Lieferant oder der Zugang zum Raum fehlt. Die Kommentare nennen die Einzelheiten.',
  '{who} is working on it, planned to be done by {due}.':
    '{who} arbeitet daran, geplant bis {due}.',
  'A technician': 'Ein Techniker',
  '{who} is working on it.': '{who} arbeitet daran.',
  Approved: 'Genehmigt',
  '{who} will take care of it by {due}.': '{who} kümmert sich bis {due} darum.',
  '{who} will take care of it.': '{who} kümmert sich darum.',
  'The maintenance team will review your request and assign a technician.':
    'Das Instandhaltungsteam prüft Ihre Meldung und weist sie einem Techniker zu.',
  'Required: pick a room, or say where the problem is.':
    'Pflichtfeld: Wählen Sie einen Raum, oder geben Sie an, wo das Problem ist.',
  'Required: say where the problem is.': 'Pflichtfeld: Geben Sie an, wo das Problem ist.',
  'Next step: ': 'Nächster Schritt: ',
  'sent {created_on}': 'gesendet am {created_on}',
  '{n} comment': '{n} Kommentar',
  '{n} comments': '{n} Kommentare',
  'Requests the maintenance team is still working on. Finished ones are under All my requests.':
    'Meldungen, an denen das Instandhaltungsteam noch arbeitet. Erledigte stehen unter Alle meine Meldungen.',
  'Every request you sent, newest first.':
    'Alle Meldungen, die Sie gesendet haben, neueste zuerst.',
  '+ New request': '+ Neue Meldung',
  '{n} request': '{n} Meldung',
  '{n} requests': '{n} Meldungen',
  'You have no open request. Something to fix? Send a new request.':
    'Sie haben keine offene Meldung. Ist etwas zu reparieren? Senden Sie eine neue Meldung.',
  'You have not sent any request yet.': 'Sie haben noch keine Meldung gesendet.',
  'Where exactly?': 'Wo genau?',
  'Optional: anything that helps find the place, e.g. “desk 12-21” or “by the window”.':
    'Optional: alles, was hilft, die Stelle zu finden, z. B. „Arbeitsplatz 12-21“ oder „am Fenster“.',
  'Required when the room is not in the list: building, floor and room or desk.':
    'Pflichtfeld, wenn der Raum nicht in der Liste steht: Gebäude, Etage und Raum oder Arbeitsplatz.',
  'Building, floor and room or desk, e.g. “Tower A, floor 12, desk 12-21”.':
    'Gebäude, Etage und Raum oder Arbeitsplatz, z. B. „Turm A, Etage 12, Arbeitsplatz 12-21“.',
  'Not in the list? Choose “Not in the list” and say where it is below.':
    'Nicht in der Liste? Wählen Sie „Nicht in der Liste“ und geben Sie unten an, wo es ist.',
  'Send request': 'Meldung senden',
  'Describe the problem and where it is: the maintenance team takes it from there. Fields marked * are required.':
    'Beschreiben Sie das Problem und wo es ist: Das Instandhaltungsteam übernimmt dann. Mit * markierte Felder sind Pflichtfelder.',
  'What is the problem?': 'Was ist das Problem?',
  'A short summary, e.g. “Light flickering in meeting room 8.03”.':
    'Eine kurze Zusammenfassung, z. B. „Licht flackert im Besprechungsraum 8.03“.',
  'Kind of problem': 'Art des Problems',
  'Not sure? Keep “{DONT_KNOW}”: the maintenance team will decide.':
    'Nicht sicher? Lassen Sie „{DONT_KNOW}“: Das Instandhaltungsteam entscheidet.',
  'How urgent is it?': 'Wie dringend ist es?',
  'Not sure? Keep “{DONT_KNOW}”.': 'Nicht sicher? Lassen Sie „{DONT_KNOW}“.',
  'What happens, since when, and anything that can help the technician.':
    'Was passiert, seit wann, und alles, was dem Techniker helfen kann.',
  Progress: 'Fortschritt',
  ' (done)': ' (erledigt)',
  ' (current step)': ' (aktueller Schritt)',
  ' (to come)': ' (folgt)',
  'Approved by a supervisor': 'Von einem Supervisor genehmigt',
  'Rejected by a supervisor': 'Von einem Supervisor abgelehnt',
  'Work started': 'Arbeit begonnen',
  'Put on hold': 'Zurückgestellt',
  'Work finished': 'Arbeit erledigt',
  'Cancel this request': 'Diese Meldung zurückziehen',
  'Not needed any more? You can cancel it until a technician starts the work.':
    'Nicht mehr nötig? Sie können sie zurückziehen, solange kein Techniker mit der Arbeit begonnen hat.',
  '← All my requests': '← Alle meine Meldungen',
  '← My open requests': '← Meine offenen Meldungen',
  '{number} · sent {created_at}': '{number} · gesendet am {created_at}',
  'Status: ': 'Status: ',
  'What was done': 'Was gemacht wurde',
  'Your request': 'Ihre Meldung',
  Where: 'Wo',
  'Not specified yet': 'Noch nicht angegeben',
  Urgency: 'Dringlichkeit',
  Technician: 'Techniker',
  'Not assigned yet': 'Noch nicht zugewiesen',
  'Planned by': 'Geplant bis',
  'More information, a question or a follow-up: the maintenance team reads your comments.':
    'Weitere Informationen, eine Frage oder eine Rückmeldung: Das Instandhaltungsteam liest Ihre Kommentare.',
  // review.js
  'Shown to the requester': 'Für die meldende Person sichtbar',
  'Approve and assign': 'Genehmigen und zuweisen',
  'Reject request': 'Meldung ablehnen',
  'A staff member': 'Ein Mitarbeiter',
  'Staff request to review': 'Zu prüfende Meldung',
  '{author} sent this request on {created_at}. Approve it and choose who will do the work, or reject it: the requester sees your decision.':
    '{author} hat diese Meldung am {created_at} gesendet. Genehmigen Sie sie und wählen Sie, wer die Arbeit ausführt, oder lehnen Sie sie ab: Die meldende Person sieht Ihre Entscheidung.',
  'Assign to': 'Zuweisen an',
  'Due date': 'Fälligkeitsdatum',
  // schedule-editing.js
  'This appointment is locked at {locked_start}: unlock it before moving it.':
    'Dieser Festtermin ist auf {locked_start} fixiert: Geben Sie ihn frei, bevor Sie ihn verschieben.',
  'Half an hour is the shortest block: remove it from its panel instead.':
    'Eine halbe Stunde ist der kürzeste Zeitblock: Entfernen Sie ihn stattdessen über sein Fenster.',
  'A block lasts {max} h at most.': 'Ein Zeitblock dauert höchstens {max} h.',
  // schedule-page.js
  'The change could not be undone.': 'Die Änderung konnte nicht rückgängig gemacht werden.',
  'The change could not be redone.': 'Die Änderung konnte nicht wiederholt werden.',
  Undone: 'Rückgängig gemacht',
  Redone: 'Wiederholt',
  'Loading the week…': 'Woche wird geladen…',
  'The week scheduler needs a connection to the server. Technicians find their own week, saved on the device, under My week.':
    'Die Wochenplanung braucht eine Verbindung zum Server. Techniker finden ihre eigene, auf dem Gerät gespeicherte Woche unter Meine Woche.',
  'Saturday opened for {week}.': 'Samstag geöffnet: {week}.',
  'Saturday closed for {week}.': 'Samstag geschlossen: {week}.',
  'Sunday opened for {week}.': 'Sonntag geöffnet: {week}.',
  'Sunday closed for {week}.': 'Sonntag geschlossen: {week}.',
  '{number}: {hours} for {who} on {when}.': '{number}: {hours} für {who} am {when}.',
  'Block moved to {who}, {when}.': 'Zeitblock verschoben zu {who}, {when}.',
  'Block now {hours}.': 'Zeitblock jetzt {hours}.',
  'Back to the week': 'Zurück zur Woche',
  'This work order is not in this week’s tray':
    'Dieser Arbeitsauftrag steht nicht in der Planungsliste dieser Woche',
  'Add at least one block.': 'Fügen Sie mindestens einen Zeitblock hinzu.',
  '{number}: estimate set to {estimate}.': '{number}: Schätzung auf {estimate} gesetzt.',
  '{number}: {hours} scheduled in {n} block.': '{number}: {hours} in {n} Zeitblock geplant.',
  '{number}: {hours} scheduled in {n} blocks.': '{number}: {hours} in {n} Zeitblöcken geplant.',
  'This block is not in this week': 'Dieser Zeitblock liegt nicht in dieser Woche',
  'Block saved.': 'Zeitblock gespeichert.',
  'Remove this block?': 'Diesen Zeitblock entfernen?',
  'Its hours go back to the tray.': 'Seine Stunden gehen zurück in die Planungsliste.',
  'block|Remove': 'Entfernen',
  'Block removed: its hours are back in the tray.':
    'Zeitblock entfernt: Seine Stunden sind wieder in der Planungsliste.',
  'Appointment locked at {start}.': 'Festtermin auf {start} fixiert.',
  'Appointment unlocked.': 'Festtermin freigegeben.',
  'This day is not in this week': 'Dieser Tag liegt nicht in dieser Woche',
  'Only supervisors and administrators change the week':
    'Nur Supervisoren und Administratoren ändern die Woche',
  '{kind}: {hours} for {person} on {longDay}.': '{kind}: {hours} für {person} am {longDay}.',
  '{person}: usual hours on {longDay}.': '{person}: übliche Stunden am {longDay}.',
  '{person}: {hours} on {longDay}.': '{person}: {hours} am {longDay}.',
  'My week is for technicians and supervisors: administrators are not counted as capacity.':
    'Meine Woche ist für Techniker und Supervisoren: Administratoren zählen nicht zur Kapazität.',
  'Loading your week…': 'Ihre Woche wird geladen…',
  'This week has not been saved on this device yet: open My week once with a connection.':
    'Diese Woche wurde auf diesem Gerät noch nicht gespeichert: Öffnen Sie Meine Woche einmal mit Verbindung.',
  'Moved up.': 'Nach oben verschoben.',
  'Moved down.': 'Nach unten verschoben.',
  'Locked at {start}.': 'Auf {start} fixiert.',
  'Time unlocked.': 'Uhrzeit freigegeben.',
  // schedule-panel.js
  ' (not open)': ' (nicht geöffnet)',
  'Remove block {n}': 'Zeitblock {n} entfernen',
  '{hours} in {n} block': '{hours} in {n} Zeitblock',
  '{hours} in {n} blocks': '{hours} in {n} Zeitblöcken',
  ' · {left} still left after these': ' · danach noch {left} offen',
  Blocks: 'Zeitblöcke',
  'Estimated time (hours)': 'Geschätzte Dauer (Stunden)',
  'This work order has no estimate yet: give one to know what is left (half-hour steps).':
    'Dieser Arbeitsauftrag hat noch keine Schätzung: Geben Sie eine an, um zu wissen, was offen ist (in halben Stunden).',
  'Propose blocks for this estimate': 'Zeitblöcke für diese Schätzung vorschlagen',
  'Blocks last {max} at most; a longer job is split over the following days.':
    'Zeitblöcke dauern höchstens {max}; eine längere Arbeit wird auf die folgenden Tage verteilt.',
  '+ Add a block': '+ Zeitblock hinzufügen',
  Schedule: 'Einplanen',
  'Schedule {number}': '{number} einplanen',
  'Unassigned: the first person given a block':
    'Nicht zugewiesen: die erste Person, die einen Zeitblock erhält',
  Estimate: 'Schätzung',
  'None yet': 'Noch keine',
  'Already scheduled': 'Bereits geplant',
  'Nothing yet': 'Noch nichts',
  Left: 'Offen',
  'Carried over': 'Übertragen',
  'from {carried_from}': 'aus {carried_from}',
  'Move or resize': 'Verschieben oder Dauer ändern',
  'A shorter block sends the difference back to the tray.':
    'Ein kürzerer Zeitblock gibt die Differenz an die Planungsliste zurück.',
  'e.g. "Keys at reception".': 'z. B. „Schlüssel am Empfang“.',
  'Save changes': 'Änderungen speichern',
  '🔒 {appointmentText}, locked by {locked_by}. Unlock it to move, resize or remove the block.':
    '🔒 {appointmentText}, fixiert von {locked_by}. Geben Sie ihn frei, um den Zeitblock zu verschieben, seine Dauer zu ändern oder ihn zu entfernen.',
  'Start time': 'Beginn',
  'Lock this block at a time, e.g. an appointment with the site. It then keeps its day, person and length.':
    'Fixieren Sie diesen Zeitblock auf eine Uhrzeit, z. B. für einen Termin mit dem Standort. Er behält dann Tag, Person und Dauer.',
  Unlock: 'Freigeben',
  ' (helper)': ' (Unterstützung)',
  'Remove this block': 'Diesen Zeitblock entfernen',
  'Kind of time': 'Art der Zeit',
  'e.g. "Lyon → Saclay", "Collect the parts".':
    'z. B. „Frankfurt → Eschborn“, „Ersatzteile abholen“.',
  'Add time': 'Zeit hinzufügen',
  'Hours this day': 'Stunden an diesem Tag',
  'Without a change: {hours} (weekend).': 'Ohne Änderung: {hours} (Wochenende).',
  'Without a change: {hours}.': 'Ohne Änderung: {hours}.',
  'Save hours': 'Stunden speichern',
  'Back to the usual hours': 'Zurück zu den üblichen Stunden',
  '{reason}: {capacity} this day.': '{reason}: {capacity} an diesem Tag.',
  'Usual hours: {standard}.': 'Übliche Stunden: {standard}.',
  // schedule-rules.js
  '{minutes} min': '{minutes} Min.',
  'No estimate yet': 'Noch keine Schätzung',
  '{hours_left} left': '{hours_left} offen',
  'Fully scheduled': 'Vollständig geplant',
  'Over capacity: {total} / {capacity}': 'Überlastet: {total} / {capacity}',
  'Work on a day off': 'Arbeit an einem freien Tag',
  'Weekend day not open': 'Wochenendtag nicht geöffnet',
  '{length} sites: add travel time': '{length} Standorte: Fahrzeit hinzufügen',
  '{length} sites on this day': '{length} Standorte an diesem Tag',
  // schedule.js
  helper: 'Unterstützung',
  'appointment {appointmentText}, locked by {locked_by}':
    'Festtermin {appointmentText}, fixiert von {locked_by}',
  'Booked hours': 'Gebuchte Stunden',
  'booked vs available, whole team': 'gebucht gegenüber verfügbar, ganzes Team',
  'Left to schedule': 'Noch einzuplanen',
  'planned this week or carried over; {not_planned} h of work without a week':
    'für diese Woche geplant oder übertragen; {not_planned} h Arbeit ohne Woche',
  'Travel time': 'Fahrzeit',
  'of the booked hours': 'der gebuchten Stunden',
  'Sites per day': 'Standorte pro Tag',
  'average per person and working day, {worst} at most':
    'Durchschnitt je Person und Arbeitstag, höchstens {worst}',
  'unfinished work orders from earlier weeks':
    'nicht erledigte Arbeitsaufträge aus früheren Wochen',
  'Planned this week': 'Diese Woche geplant',
  'Not planned': 'Nicht geplant',
  'No trade': 'Ohne Gewerk',
  'due {due_on}': 'fällig am {due_on}',
  Unassigned: 'Nicht zugewiesen',
  'Carried over from {carried_from}': 'Übertragen aus {carried_from}',
  'Nothing here.': 'Hier ist nichts.',
  '{head}: hours of {name} on {longDayLabel}': '{head}: Stunden von {name} am {longDayLabel}',
  'Set leave, part time or weekend hours': 'Urlaub, Teilzeit oder Wochenendstunden eintragen',
  'Add travel time': 'Fahrzeit hinzufügen',
  'Add time for {name} on {longDayLabel}': 'Zeit für {name} am {longDayLabel} hinzufügen',
  '+ Time': '+ Zeit',
  General: 'Allgemein',
  ' · inactive': ' · inaktiv',
  '{week}: hours of each person per day': '{week}: Stunden jeder Person pro Tag',
  ' (today)': ' (heute)',
  'not open': 'nicht geöffnet',
  '{booked_hours} h booked of {available_hours} h':
    '{booked_hours} h von {available_hours} h gebucht',
  '{value} h left to schedule': '{value} h noch einzuplanen',
  '{carried_over} carried over': '{carried_over} übertragen',
  'Key figures of {week}': 'Kennzahlen — {week}',
  'Week shown': 'Angezeigte Woche',
  Saturday: 'Samstag',
  Sunday: 'Sonntag',
  'Open Saturday': 'Samstag öffnen',
  'Open Sunday': 'Sonntag öffnen',
  '{openDays} open this week.': '{openDays} diese Woche geöffnet.',
  'Monday to Friday this week.': 'Montag bis Freitag diese Woche.',
  'Drag a work order from the tray onto a person’s day, or a block to another day or person. With the keyboard, open a card or a block (Enter) to schedule or move it; + and − change a block’s length by half an hour; Ctrl + Z undoes, Ctrl + Y redoes.':
    'Ziehen Sie einen Arbeitsauftrag aus der Planungsliste auf den Tag einer Person, oder einen Zeitblock auf einen anderen Tag oder eine andere Person. Mit der Tastatur öffnen Sie eine Karte oder einen Zeitblock (Eingabetaste), um ihn einzuplanen oder zu verschieben; + und − ändern die Dauer eines Zeitblocks um eine halbe Stunde; Strg + Z macht rückgängig, Strg + Y wiederholt.',
  'Tap a work order in “To schedule” to schedule it, or a block to move, resize or remove it.':
    'Tippen Sie auf einen Arbeitsauftrag unter „Einzuplanen“, um ihn einzuplanen, oder auf einen Zeitblock, um ihn zu verschieben, seine Dauer zu ändern oder ihn zu entfernen.',
  'Hide the work orders to schedule': 'Einzuplanende Arbeitsaufträge ausblenden',
  'Show the work orders to schedule ({count})': 'Einzuplanende Arbeitsaufträge anzeigen ({count})',
  'Day shown': 'Angezeigter Tag',
  'To schedule': 'Einzuplanen',
  'No active technician or supervisor.': 'Kein aktiver Techniker oder Supervisor.',
  // widget-charts.js
  '{v} wk': '{v} Wo.',
  'Weeks of work': 'Arbeitswochen',
  'On time': 'Pünktlich',
  'no work scheduled': 'keine Arbeit geplant',
  Value: 'Wert',
  'None in this period': 'Keine in diesem Zeitraum',
  'Median: {medians}': 'Median: {medians}',
  '90% within: {p90s}': '90 % innerhalb von: {p90s}',
  'Up to the 90th percentile': 'Bis zum 90. Perzentil',
  Median: 'Median',
  // widget-order.js
  '{key}, position {value} of {length}': '{key}, Position {value} von {length}',
  '{key}: move cancelled.': '{key}: Verschieben abgebrochen.',
  '{position}. Dropped.': '{position}. Abgelegt.',
  '{position}. Picked up: move it with the arrow keys, drop it with Space, or press Escape to cancel.':
    '{position}. Aufgenommen: Verschieben Sie sie mit den Pfeiltasten, legen Sie sie mit der Leertaste ab, oder drücken Sie Esc zum Abbrechen.',
  // widget-settings.js
  'Switched on by {by} on {at}.': 'Eingeschaltet von {by} am {at}.',
  'Switched off by {by} on {at}.': 'Ausgeschaltet von {by} am {at}.',
  'Switched on on {at}.': 'Eingeschaltet am {at}.',
  'Switched off on {at}.': 'Ausgeschaltet am {at}.',
  'Ticked widgets are offered to supervisors. Untick a widget still in development or not working: supervisors no longer see it in the sidebar or on their dashboards, and get it back, where it was, once it is ticked again. You keep seeing every widget, marked “Off” in the sidebar when it is switched off.':
    'Ausgewählte Kennzahlen werden Supervisoren angeboten. Wählen Sie eine Kennzahl ab, die noch in Entwicklung ist oder nicht funktioniert: Supervisoren sehen sie dann weder in der Seitenleiste noch auf ihren Dashboards und erhalten sie an ihrer Stelle zurück, sobald sie wieder ausgewählt ist. Sie sehen weiterhin alle Kennzahlen, in der Seitenleiste mit „Aus“ markiert, wenn sie ausgeschaltet sind.',
  '{off} of {length} widgets switched off.': '{off} von {length} Kennzahlen ausgeschaltet.',
  'Every widget is switched on.': 'Alle Kennzahlen sind eingeschaltet.',
  // widgets-compliance.js
  Late: 'Verspätet',
  Skipped: 'Ausgelassen',
  'On time %': 'Pünktlich (%)',
  'No preventive visit had its deadline in this period.':
    'In diesem Zeitraum hatte kein Wartungstermin seine Frist.',
  'Bar chart, visits on time per trade. {map}.':
    'Balkendiagramm, pünktliche Termine je Gewerk. {map}.',
  ' on time': ' pünktlich',
  '{on_time} of {n} visit done by their deadline; {late}':
    '{on_time} von {n} Termin fristgerecht ausgeführt; {late}',
  '{on_time} of {n} visits done by their deadline; {late}':
    '{on_time} von {n} Terminen fristgerecht ausgeführt; {late}',
  '{late} late': '{late} verspätet',
  '; {skipped} skipped (not counted).': '; {skipped} ausgelassen (nicht gezählt).',
  Regulatory: 'Gesetzlich',
  ' Regulatory visits: {on_time} on time, {late} late, {skipped} skipped.':
    ' Gesetzlich vorgeschriebene Termine: {on_time} pünktlich, {late} verspätet, {skipped} ausgelassen.',
  ' Regulatory visits: {on_time} on time, {late} late.':
    ' Gesetzlich vorgeschriebene Termine: {on_time} pünktlich, {late} verspätet.',
  'A visit counts once its deadline week is over: the planned week plus the plan’s tolerance; for a regulatory visit, its due week.':
    'Ein Termin zählt, sobald seine Fristwoche vorbei ist: die geplante Woche plus die Toleranz des Plans; bei einem gesetzlich vorgeschriebenen Termin seine fällige Woche.',
  'Preventive visits by trade and outcome': 'Wartungstermine nach Gewerk und Ergebnis',
  'all skipped': 'alle ausgelassen',
  '{on_time} on time, {late} late': '{on_time} pünktlich, {late} verspätet',
  '{skipped} skipped': '{skipped} ausgelassen',
  Month: 'Monat',
  Scheduled: 'Geplant',
  'Finished in the week': 'In der Woche erledigt',
  'Kept %': 'Eingehalten (%)',
  'Hours booked': 'Gebuchte Stunden',
  'Booked late %': 'Nachträglich gebucht (%)',
  'No finished week of this period had work orders scheduled in the week scheduler.':
    'Keine abgeschlossene Woche dieses Zeitraums hatte Arbeitsaufträge in der Wochenplanung.',
  'Column chart, share of scheduled work orders finished in their week, per week. {map}.':
    'Säulendiagramm, Anteil der geplanten Arbeitsaufträge, die in ihrer Woche erledigt wurden, pro Woche. {map}.',
  'Column chart, share of scheduled work orders finished in their week, per month. {map}.':
    'Säulendiagramm, Anteil der geplanten Arbeitsaufträge, die in ihrer Woche erledigt wurden, pro Monat. {map}.',
  ' kept': ' eingehalten',
  '{kept} of {n} scheduled work order finished in their week; {missed}.':
    '{kept} von {n} geplanten Arbeitsauftrag in seiner Woche erledigt; {missed}.',
  '{kept} of {n} scheduled work orders finished in their week; {missed}.':
    '{kept} von {n} geplanten Arbeitsaufträgen in ihrer Woche erledigt; {missed}.',
  '{missed} not': '{missed} nicht',
  'Hours booked after the week started': 'Nach Wochenbeginn gebuchte Stunden',
  'Finished weeks only. Hours booked late are blocks added once the week had begun: work that broke into the plan.':
    'Nur abgeschlossene Wochen. Nachträglich gebuchte Stunden sind Zeitblöcke, die nach Wochenbeginn hinzukamen: Arbeit, die den Plan durchbrochen hat.',
  'Schedule kept per week': 'Planeinhaltung pro Woche',
  'Schedule kept per month': 'Planeinhaltung pro Monat',
  'Booked after the week started': 'Nach Wochenbeginn gebucht',
  '{kept} of {scheduled} work orders': '{kept} von {scheduled} Arbeitsaufträgen',
  '{break_in_hours} of {hours} h booked late':
    '{break_in_hours} von {hours} h nachträglich gebucht',
  'Unnamed contractor': 'Dienstleister ohne Namen',
  Visits: 'Termine',
  'No contractor visit had its deadline in this period.':
    'In diesem Zeitraum hatte kein Termin eines Dienstleisters seine Frist.',
  'Contractor visits by outcome': 'Termine von Dienstleistern nach Ergebnis',
  'No contractor visit counted (all skipped).':
    'Kein Termin eines Dienstleisters gezählt (alle ausgelassen).',
  'Contractor visits on time: {rate}.': 'Pünktliche Termine von Dienstleistern: {rate}.',
  'The worst first. Select a column title to sort by it.':
    'Die schlechtesten zuerst. Wählen Sie einen Spaltentitel, um danach zu sortieren.',
  scheduled: 'geplant',
  'finished in their week': 'in ihrer Woche erledigt',
  'not finished in their week': 'nicht in ihrer Woche erledigt',
  Deadline: 'Frist',
  Outcome: 'Ergebnis',
  'Reason skipped': 'Grund für das Auslassen',
  // widgets-flow.js
  'W{key}': 'KW{key}',
  'Week {key}: {days}': 'KW {key}: {days}',
  week: 'Woche',
  '0–7 days': '0–7 Tage',
  '8–30 days': '8–30 Tage',
  '31–90 days': '31–90 Tage',
  '91+ days': '91 Tage und mehr',
  Reactive: 'Reaktiv',
  Improvement: 'Verbesserung',
  Opened: 'Eröffnet',
  'count|Done': 'Erledigt',
  'count|Cancelled': 'Storniert',
  'Unfinished at the end': 'Am Ende nicht erledigt',
  'Column chart, opened and done per week. {map}.':
    'Säulendiagramm, eröffnet und erledigt pro Woche. {map}.',
  'Column chart, opened and done per month. {map}.':
    'Säulendiagramm, eröffnet und erledigt pro Monat. {map}.',
  '{title}: {opened} opened, {closed} done': '{title}: {opened} eröffnet, {closed} erledigt',
  'Line chart, unfinished work orders at the end of each week. {map}.':
    'Liniendiagramm, nicht erledigte Arbeitsaufträge am Ende jeder Woche. {map}.',
  'Line chart, unfinished work orders at the end of each month. {map}.':
    'Liniendiagramm, nicht erledigte Arbeitsaufträge am Ende jedes Monats. {map}.',
  'Unfinished at the end of each week': 'Am Ende jeder Woche nicht erledigt',
  'Unfinished at the end of each month': 'Am Ende jedes Monats nicht erledigt',
  '{opened} opened, {closed} done, {cancelled} cancelled. ':
    '{opened} eröffnet, {closed} erledigt, {cancelled} storniert. ',
  'The backlog grew by {value}.': 'Der Auftragsbestand ist um {value} gewachsen.',
  'The backlog shrank by {value}.': 'Der Auftragsbestand ist um {value} gesunken.',
  'The backlog is stable.': 'Der Auftragsbestand ist stabil.',
  ' (now {unfinished})': ' (jetzt {unfinished})',
  'Opened and done per week': 'Eröffnet und erledigt pro Woche',
  'Opened and done per month': 'Eröffnet und erledigt pro Monat',
  Unfinished: 'Nicht erledigt',
  Total: 'Gesamt',
  ' {n} urgent or high-priority work order is more than 30 days old.':
    ' {n} dringender oder hoch priorisierter Arbeitsauftrag ist älter als 30 Tage.',
  ' {n} urgent or high-priority work orders are more than 30 days old.':
    ' {n} dringende oder hoch priorisierte Arbeitsaufträge sind älter als 30 Tage.',
  'Unfinished work orders by priority and age':
    'Nicht erledigte Arbeitsaufträge nach Priorität und Alter',
  '{total} unfinished work orders, by days since they were created. Darker cells hold more.':
    '{total} nicht erledigte Arbeitsaufträge, nach Tagen seit ihrer Erstellung. Dunklere Zellen enthalten mehr.',
  '{hours} h, no capacity': '{hours} h, keine Kapazität',
  '{weeks} wk': '{weeks} Wo.',
  Unspecified: 'Nicht angegeben',
  'Hours left': 'Offene Stunden',
  'Weekly capacity (h)': 'Wochenkapazität (h)',
  '{hours} left on {n} work order without a trade.':
    '{hours} offen bei {n} Arbeitsauftrag ohne Gewerk.',
  '{hours} left on {n} work orders without a trade.':
    '{hours} offen bei {n} Arbeitsaufträgen ohne Gewerk.',
  '{orders} without an estimate is not counted.': '{orders} ohne Schätzung wird nicht gezählt.',
  '{orders} without an estimate are not counted.': '{orders} ohne Schätzung werden nicht gezählt.',
  '{n} unfinished work order': '{n} nicht erledigter Arbeitsauftrag',
  '{n} unfinished work orders': '{n} nicht erledigte Arbeitsaufträge',
  'No unfinished work and no capacity for these trades.':
    'Keine offene Arbeit und keine Kapazität für diese Gewerke.',
  'Bar chart, weeks of work per trade. {map}.': 'Balkendiagramm, Arbeitswochen je Gewerk. {map}.',
  "Hours left on unfinished work, divided by the trade's weekly capacity. Shaded: {BACKLOG_BAND} to {BACKLOG_BAND2} weeks, a common rule of thumb.":
    'Offene Stunden nicht erledigter Arbeit, geteilt durch die Wochenkapazität des Gewerks. Schattiert: {BACKLOG_BAND} bis {BACKLOG_BAND2} Wochen, eine übliche Faustregel.',
  'Backlog in weeks of work, by trade': 'Auftragsbestand in Arbeitswochen, nach Gewerk',
  '{hours} h left on {n} work order': '{hours} h offen bei {n} Arbeitsauftrag',
  '{hours} h left on {n} work orders': '{hours} h offen bei {n} Arbeitsaufträgen',
  'Capacity: {capacity} h a week': 'Kapazität: {capacity} h pro Woche',
  'Total hours': 'Stunden gesamt',
  'Stacked column chart, share of planned, reactive, staff request and improvement work done per week':
    'Gestapeltes Säulendiagramm, Anteil geplanter, reaktiver, gemeldeter und verbessernder Arbeit, erledigt pro Woche',
  'Stacked column chart, share of planned, reactive, staff request and improvement work done per month':
    'Gestapeltes Säulendiagramm, Anteil geplanter, reaktiver, gemeldeter und verbessernder Arbeit, erledigt pro Monat',
  '; planned work: {share} over the period': '; geplante Arbeit: {share} im Zeitraum',
  Count: 'Anzahl',
  Hours: 'Stunden',
  'No work order was done in this period.':
    'In diesem Zeitraum wurde kein Arbeitsauftrag erledigt.',
  'Planned work: {share} of the hours worked on the work orders done in the period.':
    'Geplante Arbeit: {share} der Stunden für die im Zeitraum erledigten Arbeitsaufträge.',
  'Planned work: {share} of the work orders done in the period.':
    'Geplante Arbeit: {share} der im Zeitraum erledigten Arbeitsaufträge.',
  '{n} done work order has no actual hours (counted as 0 h).':
    '{n} erledigter Arbeitsauftrag hat keine tatsächlichen Stunden (mit 0 h gezählt).',
  '{n} done work orders have no actual hours (counted as 0 h).':
    '{n} erledigte Arbeitsaufträge haben keine tatsächlichen Stunden (mit 0 h gezählt).',
  'Work closed per week, by kind': 'Abgeschlossene Arbeit pro Woche, nach Art',
  'Work closed per month, by kind': 'Abgeschlossene Arbeit pro Monat, nach Art',
  'opened in {bucket}': 'eröffnet in {bucket}',
  'closed in {bucket}': 'abgeschlossen in {bucket}',
  'cancelled in {bucket}': 'storniert in {bucket}',
  '{age} old': 'seit {age}',
  'without an estimate': 'ohne Schätzung',
  'without a trade': 'ohne Gewerk',
  // widgets-people.js
  '{value} min': '{value} Min.',
  '{days} d': '{days} T',
  'Time to start': 'Zeit bis Beginn',
  'From the report to the first “In progress”': 'Von der Meldung bis zum ersten „In Bearbeitung“',
  'Time to done': 'Zeit bis Erledigung',
  'From the report to “Technically done”': 'Von der Meldung bis „Technisch erledigt“',
  'count|Started': 'Begonnen',
  'Median to start': 'Median bis Beginn',
  '90% started within': '90 % begonnen innerhalb von',
  '90% done within': '90 % erledigt innerhalb von',
  'No work order was started or done in this period.':
    'In diesem Zeitraum wurde kein Arbeitsauftrag begonnen oder erledigt.',
  'Half the work orders were started within {start} and done within {close}.':
    'Die Hälfte der Arbeitsaufträge wurde innerhalb von {start} begonnen und innerhalb von {close} erledigt.',
  '{title} per priority. {map}.': '{title} je Priorität. {map}.',
  '{priority}: median {median}, 90% within {p90}':
    '{priority}: Median {median}, 90 % innerhalb von {p90}',
  'Response times by priority': 'Reaktionszeiten nach Priorität',
  Requests: 'Meldungen',
  'Median to review': 'Median bis Prüfung',
  'Median to done': 'Median bis Erledigung',
  'count|Rejected': 'Abgelehnt',
  'No staff request was sent in this period.': 'In diesem Zeitraum wurde keine Meldung gesendet.',
  '{n} request received, {reviewed} reviewed.': '{n} Meldung eingegangen, {reviewed} geprüft.',
  '{n} requests received, {reviewed} reviewed.': '{n} Meldungen eingegangen, {reviewed} geprüft.',
  'Median time to review': 'Mediane Zeit bis Prüfung',
  'Median time to review per week': 'Mediane Zeit bis Prüfung pro Woche',
  'Median time to review per month': 'Mediane Zeit bis Prüfung pro Monat',
  'Median time to done': 'Mediane Zeit bis Erledigung',
  'Median time to done per week': 'Mediane Zeit bis Erledigung pro Woche',
  'Median time to done per month': 'Mediane Zeit bis Erledigung pro Monat',
  'Share rejected per week': 'Ablehnungsanteil pro Woche',
  'Share rejected per month': 'Ablehnungsanteil pro Monat',
  'Requests waiting for review': 'Meldungen, die auf Prüfung warten',
  'rejected requests, with their reason': 'abgelehnte Meldungen, mit Begründung',
  'Staff requests per week': 'Meldungen pro Woche',
  'Staff requests per month': 'Meldungen pro Monat',
  'Corrective work orders': 'Instandsetzungsaufträge',
  'Cumulative share': 'Kumulierter Anteil',
  'All assets': 'Alle Anlagen',
  'High and critical': 'Hoch und kritisch',
  'No corrective work on these assets in this period.':
    'Keine Instandsetzung an diesen Anlagen in diesem Zeitraum.',
  'Bar chart, corrective work orders per asset. {map}.':
    'Balkendiagramm, Instandsetzungsaufträge je Anlage. {map}.',
  'This asset accounts for {share} of the {total} corrective work orders on {assets} assets.':
    'Diese Anlage macht {share} der {total} Instandsetzungsaufträge an {assets} Anlagen aus.',
  'These {count} assets account for {share} of the {total} corrective work orders on {assets} assets.':
    'Diese {count} Anlagen machen {share} der {total} Instandsetzungsaufträge an {assets} Anlagen aus.',
  'Assets with the most corrective work': 'Anlagen mit den meisten Instandsetzungen',
  '{count} · {rateText} cum.': '{count} · {rateText} kum.',
  '{n} corrective work order': '{n} Instandsetzungsauftrag',
  '{n} corrective work orders': '{n} Instandsetzungsaufträge',
  'Days broken down': 'Ausfalltage',
  'Assets affected': 'Betroffene Anlagen',
  'Down today': 'Heute ausgefallen',
  'None of the {watched} high and critical assets was broken down in this period.':
    'Keine der {watched} Anlagen mit hoher oder kritischer Kritikalität ist in diesem Zeitraum ausgefallen.',
  'Bar chart, days high and critical assets were broken down, per site. {map}.':
    'Balkendiagramm, Ausfalltage der Anlagen mit hoher oder kritischer Kritikalität, je Standort. {map}.',
  ' {n} high or critical asset is broken down today.':
    ' {n} Anlage mit hoher oder kritischer Kritikalität ist heute ausgefallen.',
  ' {n} high or critical assets are broken down today.':
    ' {n} Anlagen mit hoher oder kritischer Kritikalität sind heute ausgefallen.',
  '{days} days broken down in all, among {watched} high and critical assets.':
    '{days} Ausfalltage insgesamt, bei {watched} Anlagen mit hoher oder kritischer Kritikalität.',
  'Days on which an asset was broken down at some time; a breakdown still going on counts until today.':
    'Tage, an denen eine Anlage zeitweise ausgefallen war; ein noch andauernder Ausfall zählt bis heute.',
  'Days broken down per site': 'Ausfalltage je Standort',
  '{days} d · {n} asset': '{days} T · {n} Anlage',
  '{days} d · {n} assets': '{days} T · {n} Anlagen',
  '{days} days broken down': '{days} Ausfalltage',
  '{n} asset affected, {down} down today': '{n} Anlage betroffen, {down} heute ausgefallen',
  '{n} assets affected, {down} down today': '{n} Anlagen betroffen, {down} heute ausgefallen',
  'Booked this week (h)': 'Diese Woche gebucht (h)',
  'Capacity this week (h)': 'Kapazität diese Woche (h)',
  'Nobody to show for these sites.': 'Für diese Standorte ist niemand anzuzeigen.',
  'Stacked bar chart, unfinished work orders per person by priority. {map}.':
    'Gestapeltes Balkendiagramm, nicht erledigte Arbeitsaufträge je Person nach Priorität. {map}.',
  'Hours left: estimates minus the hours already worked. Booked: blocks of the week scheduler in {week}.':
    'Offene Stunden: Schätzungen abzüglich der bereits geleisteten Stunden. Gebucht: Zeitblöcke der Wochenplanung in {week}.',
  'Unfinished work per person': 'Offene Arbeit je Person',
  '{total} · {hours_left} h left{value}': '{total} · {hours_left} h offen{value}',
  'Estimated (h)': 'Geschätzt (h)',
  'Actual (h)': 'Tatsächlich (h)',
  'Actual ÷ estimate': 'Tatsächlich ÷ geschätzt',
  'No work order done in this period has both an estimate and actual hours.':
    'Kein in diesem Zeitraum erledigter Arbeitsauftrag hat sowohl eine Schätzung als auch tatsächliche Stunden.',
  'Bar chart, actual hours divided by estimated hours per trade. {map}.':
    'Balkendiagramm, tatsächliche durch geschätzte Stunden je Gewerk. {map}.',
  'Work took {ratio} its estimate: estimates are too low.':
    'Die Arbeit dauerte {ratio} der Schätzung: Die Schätzungen sind zu niedrig.',
  'Work took {ratio} its estimate: estimates are too high.':
    'Die Arbeit dauerte {ratio} der Schätzung: Die Schätzungen sind zu hoch.',
  'Work took {ratio} its estimate: estimates are about right.':
    'Die Arbeit dauerte {ratio} der Schätzung: Die Schätzungen passen ungefähr.',
  'Dashed line: 1.0×, the estimate. {count} done work orders with both hours.':
    'Gestrichelte Linie: 1,0×, die Schätzung. {count} erledigte Arbeitsaufträge mit beiden Werten.',
  'Estimates against actual hours, by trade': 'Schätzungen und tatsächliche Stunden, nach Gewerk',
  '{actual} h worked for {estimated} h estimated':
    '{actual} h geleistet bei {estimated} h geschätzt',
  started: 'begonnen',
  'response|done': 'erledigt',
  rejected: 'abgelehnt',
  'waiting for review': 'wartet auf Prüfung',
  done: 'erledigt',
  'high and critical assets': 'Anlagen mit hoher oder kritischer Kritikalität',
  'asset {rest}': 'Anlage {rest}',
  unassigned: 'nicht zugewiesen',
  'person {split}': 'Person {split}',
  'Hours to review': 'Stunden bis Prüfung',
  'Hours to done': 'Stunden bis Erledigung',
  'Reason rejected': 'Ablehnungsgrund',
  'Previous work order': 'Vorheriger Arbeitsauftrag',
  'Days since it was done': 'Tage seit Erledigung',
  // widgets.js
  'Flow and backlog': 'Fluss und Auftragsbestand',
  Compliance: 'Konformität',
  Responsiveness: 'Reaktionsfähigkeit',
  People: 'Personen',
  Lists: 'Listen',
  'Work orders in progress': 'Arbeitsaufträge in Bearbeitung',
  'Opened vs done': 'Eröffnet und erledigt',
  'Backlog by age and priority': 'Auftragsbestand nach Alter und Priorität',
  'Backlog in weeks of work': 'Auftragsbestand in Arbeitswochen',
  'Planned vs reactive work': 'Geplante und reaktive Arbeit',
  'Preventive maintenance compliance': 'Einhaltung der Wartung',
  'Regulatory visits late': 'Verspätete gesetzliche Prüfungen',
  'Week schedule kept': 'Einhaltung der Wochenplanung',
  Contractors: 'Dienstleister',
  'Time to start and to close': 'Zeit bis Beginn und Abschluss',
  // widgets-people.js: SLA compliance (D86)
  '{share} ({met} of {counted})': '{share} ({met} von {counted})',
  'Response met': 'Reaktion eingehalten',
  'Resolution met': 'Behebung eingehalten',
  'Corrective work and staff requests reported since {date}. Unfinished work already late counts as missed.':
    'Instandsetzungen und Meldungen seit dem {date}. Nicht erledigte, bereits verspätete Arbeit zählt als verfehlt.',
  'No work order with a service level stopped its clock or is late in this period.':
    'Kein Arbeitsauftrag mit Service-Level hat in diesem Zeitraum seine Uhr angehalten oder ist verspätet.',
  'Response met: {response}. Resolution met: {resolution}.':
    'Reaktion eingehalten: {response}. Behebung eingehalten: {resolution}.',
  'Service levels met, by priority': 'Eingehaltene Service-Level, nach Priorität',
  response: 'Reaktion',
  resolution: 'Behebung',
  'Service levels met': 'Eingehaltene Service-Level',
  'Assets with the most breakdowns': 'Anlagen mit den meisten Ausfällen',
  'Repeat failures': 'Wiederholte Ausfälle',
  'Critical assets out of service': 'Kritische Anlagen außer Betrieb',
  'Workload per person': 'Auslastung je Person',
  'Estimates vs actual hours': 'Schätzungen und tatsächliche Stunden',
  'Work orders by category': 'Arbeitsaufträge nach Gewerk',
  '{length} sites': '{length} Standorte',
  '{length} trades': '{length} Gewerke',
  'Last {period} days': 'Letzte {period} Tage',
  'Site and trade filter not used': 'Standort- und Gewerkfilter nicht verwendet',
  'Site filter not used': 'Standortfilter nicht verwendet',
  'Trade filter not used': 'Gewerkfilter nicht verwendet',
  today: 'heute',
  'next 7 days': 'nächste 7 Tage',
  ' (last {value} days)': ' (letzte {value} Tage)',
  Share: 'Anteil',
  Updated: 'Aktualisiert',
  'Estimated hours': 'Geschätzte Stunden',
  'Actual hours': 'Tatsächliche Stunden',
  'Last serviced': 'Letzte Wartung',
  '{value}: open the list': '{value}: Liste öffnen',
  '{share} of the corrective work': '{share} der Instandsetzungen',
  '{label}, last {period} days': '{label}, letzte {period} Tage',
  'No figures for this widget.': 'Keine Zahlen für diese Kennzahl.',
  // work-order-schedule.js
  'appointment {appointmentText}': 'Festtermin {appointmentText}',
  you: 'Sie',
  'heading|Scheduled': 'Planung',
};

/**
 * Messages of the API (written in English by the server, docs/api-design.md) shown to users,
 * the same keys as FR_SERVER (i18n-fr.js). Messages holding a value are in DE_PATTERNS.
 */
export const DE_SERVER = {
  'Invalid token': 'Ungültiges Token',
  'Missing bearer token': 'Anmeldetoken fehlt',
  'This account is deactivated': 'Dieses Konto ist deaktiviert',
  'Token expired': 'Sitzung abgelaufen',
  'Your password changed: log in again': 'Ihr Passwort wurde geändert: Melden Sie sich neu an',
  'Your role does not allow this action': 'Ihre Rolle erlaubt diese Aktion nicht',
  'Internal server error': 'Interner Serverfehler',
  'Request body too large': 'Anfrage zu groß',
  'Unknown field': 'Unbekanntes Feld',
  'Asset not found': 'Anlage nicht gefunden',
  'Invalid query': 'Ungültige Abfrage',
  'Only with drill': 'Nur mit Detailansicht',
  'Too many assistant requests. Try again in a few minutes.':
    'Zu viele Anfragen an den Assistenten. Versuchen Sie es in einigen Minuten erneut.',
  'Only administrators can see changes to user accounts':
    'Nur Administratoren sehen Änderungen an Benutzerkonten',
  'Record not found': 'Datensatz nicht gefunden',
  'Too many login attempts, try again later':
    'Zu viele Anmeldeversuche, versuchen Sie es später erneut',
  'Too many suggestions sent, try again later':
    'Zu viele Vorschläge gesendet, versuchen Sie es später erneut',
  'Give a starting week or a year, not both':
    'Geben Sie eine Startwoche oder ein Jahr an, nicht beides',
  'Visit not found': 'Termin nicht gefunden',
  'Work order not found': 'Arbeitsauftrag nicht gefunden',
  'This asset changed since you opened it. Reload it and try again.':
    'Diese Anlage wurde geändert, seit Sie sie geöffnet haben. Laden Sie sie neu und versuchen Sie es erneut.',
  'This asset has a conflict waiting for arbitration.':
    'Diese Anlage hat einen Konflikt, der auf Entscheidung wartet.',
  'Expected a date as YYYY-MM-DD': 'Datum im Format JJJJ-MM-TT erwartet',
  'Expected a week as YYYY-Www': 'Woche im Format JJJJ-Www erwartet',
  'Not a valid date': 'Kein gültiges Datum',
  'Not a valid week': 'Keine gültige Woche',
  'Use steps of half an hour': 'Verwenden Sie Schritte von einer halben Stunde',
  'This place cannot be chosen for a request.':
    'Dieser Ort kann für eine Meldung nicht gewählt werden.',
  'This place is not in use any more.': 'Dieser Ort ist nicht mehr in Nutzung.',
  'This place is not in use: choose a place in use.':
    'Dieser Ort ist nicht in Nutzung: Wählen Sie einen Ort in Nutzung.',
  'This place is not on the site chosen.': 'Dieser Ort liegt nicht am gewählten Standort.',
  'The maintenance team is updating this request: try again later.':
    'Das Instandhaltungsteam aktualisiert diese Meldung: Versuchen Sie es später erneut.',
  'This request changed since you opened it: reload it and review it again.':
    'Diese Meldung wurde geändert, seit Sie sie geöffnet haben: Laden Sie sie neu und prüfen Sie sie erneut.',
  'This request has already been reviewed.': 'Diese Meldung wurde bereits geprüft.',
  'This request is already finished.': 'Diese Meldung ist bereits erledigt.',
  'This request is waiting for a conflict to be resolved.':
    'Diese Meldung wartet auf die Lösung eines Konflikts.',
  'This work order is not a staff request.': 'Dieser Arbeitsauftrag ist keine Meldung.',
  'Work on this request has started: add a comment to ask the maintenance team to stop.':
    'Die Arbeit an dieser Meldung hat begonnen: Fügen Sie einen Kommentar hinzu, um das Instandhaltungsteam zu bitten, sie einzustellen.',
  'Choose a start time on the hour or the half hour, from 00:00 to 23:30.':
    'Wählen Sie einen Beginn zur vollen oder halben Stunde, von 00:00 bis 23:30.',
  'Give this work order an estimate before scheduling it.':
    'Geben Sie für diesen Arbeitsauftrag eine Schätzung an, bevor Sie ihn einplanen.',
  'This appointment would end after midnight.': 'Dieser Festtermin würde nach Mitternacht enden.',
  'This staff request is waiting for its review: approve it before scheduling it.':
    'Diese Meldung wartet auf ihre Prüfung: Genehmigen Sie sie, bevor Sie sie einplanen.',
  'This work order is finished: it cannot get more time.':
    'Dieser Arbeitsauftrag ist erledigt: Er kann keine weitere Zeit erhalten.',
  'This work order is finished: its blocks are kept as history.':
    'Dieser Arbeitsauftrag ist erledigt: Seine Zeitblöcke bleiben als Verlauf erhalten.',
  'This is the last active administrator: keep at least one.':
    'Dies ist der letzte aktive Administrator: Behalten Sie mindestens einen.',
  'You cannot deactivate your own account.': 'Sie können Ihr eigenes Konto nicht deaktivieren.',
  'The creation time is in the future.': 'Der Erstellungszeitpunkt liegt in der Zukunft.',
  'Closed and cancelled work orders are read-only.':
    'Abgeschlossene und stornierte Arbeitsaufträge sind schreibgeschützt.',
  'Its requester cancelled this request: it cannot be brought back.':
    'Die meldende Person hat diese Meldung zurückgezogen: Sie kann nicht wiederhergestellt werden.',
  'This request was rejected: it cannot be brought back.':
    'Diese Meldung wurde abgelehnt: Sie kann nicht wiederhergestellt werden.',
  'On a closed or cancelled work order, only the status and the fields it needs change.':
    'Bei einem abgeschlossenen oder stornierten Arbeitsauftrag ändern sich nur der Status und die Felder, die er erfordert.',
  'This work has started: resume it instead of reopening it.':
    'Diese Arbeit hat begonnen: Setzen Sie sie fort, statt sie wieder zu öffnen.',
  'Only supervisors and admins close work orders.':
    'Nur Supervisoren und Administratoren schließen Arbeitsaufträge ab.',
  'Assign this work order to an active person to reopen it.':
    'Weisen Sie diesen Arbeitsauftrag einer aktiven Person zu, um ihn wieder zu öffnen.',
  'A hold reason is given only when putting the work on hold.':
    'Ein Grund der Zurückstellung wird nur beim Zurückstellen der Arbeit angegeben.',
  'The report is waived only on technically done work.':
    'Auf den Bericht kann nur bei technisch erledigter Arbeit verzichtet werden.',
  'The completion date is set when the work is technically done.':
    'Das Datum der technischen Erledigung wird gesetzt, wenn die Arbeit technisch erledigt ist.',
  'The closing date is set when the work order is closed.':
    'Das Abschlussdatum wird gesetzt, wenn der Arbeitsauftrag abgeschlossen wird.',
  'The completion date cannot be in the future.':
    'Das Datum der technischen Erledigung darf nicht in der Zukunft liegen.',
  'The closing date cannot be earlier than the completion date.':
    'Das Abschlussdatum darf nicht vor dem Datum der technischen Erledigung liegen.',
  'Only supervisors and admins waive the work report':
    'Nur Supervisoren und Administratoren verzichten auf den Arbeitsbericht',
  'Already used': 'Bereits verwendet',
  'Choose the place of the asset': 'Wählen Sie den Ort der Anlage',
  'Invalid body': 'Ungültige Daten',
  'Assistant timed out': 'Der Assistent hat nicht rechtzeitig geantwortet',
  'The site is not the site of the asset': 'Der Standort ist nicht der Standort der Anlage',
  'This asset does not exist': 'Diese Anlage existiert nicht',
  "This doesn't look like a maintenance job. Describe the work done or the fault found.":
    'Das sieht nicht nach einer Instandhaltungsarbeit aus. Beschreiben Sie die ausgeführte Arbeit oder den gefundenen Fehler.',
  'Invalid username or password': 'Benutzername oder Passwort falsch',
  'Not correct': 'Nicht korrekt',
  'The current password is not correct': 'Das aktuelle Passwort ist nicht korrekt',
  'Give each of your dashboards once': 'Geben Sie jedes Ihrer Dashboards nur einmal an',
  'No field to update': 'Kein Feld zu ändern',
  'This dashboard changed since you opened it. Reload it and try again.':
    'Dieses Dashboard wurde geändert, seit Sie es geöffnet haben. Laden Sie es neu und versuchen Sie es erneut.',
  'Your last dashboard cannot be deleted': 'Ihr letztes Dashboard kann nicht gelöscht werden',
  'This widget has no records to export': 'Diese Kennzahl hat keine Datensätze zum Exportieren',
  'Unknown segment': 'Unbekanntes Segment',
  'Unknown widget': 'Unbekannte Kennzahl',
  'Feedback not found': 'Vorschlag nicht gefunden',
  'Must be a path of this site': 'Muss ein Pfad dieses Standorts sein',
  'Already used here': 'Hier bereits verwendet',
  'Choose another type': 'Wählen Sie einen anderen Typ',
  'Choose a site of the list': 'Wählen Sie einen Standort aus der Liste',
  'Level type not found': 'Ebenentyp nicht gefunden',
  'Must be Site': 'Muss Standort sein',
  'Only a site is of the type Site.': 'Nur ein Standort hat den Typ Standort.',
  'Only the name of the site type can change.': 'Nur der Name des Typs Standort kann sich ändern.',
  'Put the place above it back in use first.':
    'Nehmen Sie zuerst den übergeordneten Ort wieder in Nutzung.',
  'The place above is not in use': 'Der übergeordnete Ort ist nicht in Nutzung',
  "The site must be the place's site.": 'Der Standort muss der Standort des Orts sein.',
  'This level type does not exist.': 'Dieser Ebenentyp existiert nicht.',
  'This level type is not in use any more.': 'Dieser Ebenentyp ist nicht mehr in Nutzung.',
  'This parent place does not exist.': 'Dieser übergeordnete Ort existiert nicht.',
  'This site is already used by records: its name cannot change any more.':
    'Dieser Standort wird bereits von Datensätzen verwendet: Sein Name kann sich nicht mehr ändern.',
  'This site is not in the list of places.': 'Dieser Standort steht nicht in der Liste der Orte.',
  'Unknown place': 'Unbekannter Ort',
  'Unknown site': 'Unbekannter Standort',
  'Used by records': 'Von Datensätzen verwendet',
  'Only a skipped visit can be restored.':
    'Nur ein ausgelassener Termin kann wiederhergestellt werden.',
  'Say why the visit is skipped': 'Geben Sie an, warum der Termin ausgelassen wird',
  'This visit changed since you opened it. Reload and try again.':
    'Dieser Termin wurde geändert, seit Sie ihn geöffnet haben. Laden Sie neu und versuchen Sie es erneut.',
  'This visit has its work order: cancel the work order to skip the visit.':
    'Dieser Termin hat seinen Arbeitsauftrag: Stornieren Sie den Arbeitsauftrag, um den Termin auszulassen.',
  'This visit is already skipped.': 'Dieser Termin ist bereits ausgelassen.',
  'This visit was skipped by cancelling its work order: it cannot come back.':
    'Dieser Termin wurde durch Stornieren seines Arbeitsauftrags ausgelassen: Er kann nicht zurückkommen.',
  'Already blocked': 'Bereits gesperrt',
  'Blocked week not found': 'Gesperrte Woche nicht gefunden',
  'Say why the week is blocked': 'Geben Sie an, warum die Woche gesperrt ist',
  'The planner shows from two years back to one year ahead of the current week':
    'Die Planung reicht von zwei Jahren zurück bis ein Jahr vor die aktuelle Woche',
  'The settings changed since you opened them. Reload and try again.':
    'Die Einstellungen wurden geändert, seit Sie sie geöffnet haben. Laden Sie neu und versuchen Sie es erneut.',
  'This week is already blocked for this site.':
    'Diese Woche ist für diesen Standort bereits gesperrt.',
  "The place must be the asset's place.": 'Der Ort muss der Ort der Anlage sein.',
  "The site must be the asset's site.": 'Der Standort muss der Standort der Anlage sein.',
  'This plan changed since you opened it. Reload it and try again.':
    'Dieser Plan wurde geändert, seit Sie ihn geöffnet haben. Laden Sie ihn neu und versuchen Sie es erneut.',
  'Unknown asset': 'Unbekannte Anlage',
  'Required: pick a room or say where the problem is':
    'Pflichtfeld: Wählen Sie einen Raum oder geben Sie an, wo das Problem ist',
  'This client_id is already used': 'Diese client_id wird bereits verwendet',
  'Block not found': 'Zeitblock nicht gefunden',
  'Expected a time as HH:MM': 'Uhrzeit im Format HH:MM erwartet',
  'Only active technicians and supervisors can be given time.':
    'Nur aktive Techniker und Supervisoren können Zeit erhalten.',
  'Only work blocks can be appointments.': 'Nur Arbeitsblöcke können Festtermine sein.',
  'Only work blocks have a work order': 'Nur Arbeitsblöcke haben einen Arbeitsauftrag',
  'Other time': 'Sonstige Zeit',
  'Say why the hours change': 'Geben Sie an, warum sich die Stunden ändern',
  'This block changed since you opened it. Reload and try again.':
    'Dieser Zeitblock wurde geändert, seit Sie ihn geöffnet haben. Laden Sie neu und versuchen Sie es erneut.',
  'This day changed since you opened it. Reload and try again.':
    'Dieser Tag wurde geändert, seit Sie ihn geöffnet haben. Laden Sie neu und versuchen Sie es erneut.',
  'You can only lock your own blocks.': 'Sie können nur Ihre eigenen Zeitblöcke fixieren.',
  'You can only order your own day.': 'Sie können nur Ihren eigenen Tag ordnen.',
  'This widget is switched off by an administrator':
    'Diese Kennzahl wurde von einem Administrator ausgeschaltet',
  'An asset or a place is required': 'Eine Anlage oder ein Ort ist erforderlich',
  'Review this staff request first: approve it to assign it, or reject it.':
    'Prüfen Sie zuerst diese Meldung: Genehmigen Sie sie, um sie zuzuweisen, oder lehnen Sie sie ab.',
  'Technicians can only assign new work orders to themselves':
    'Techniker können neue Arbeitsaufträge nur sich selbst zuweisen',
  'This user cannot be assigned to a work order.':
    'Dieser Benutzer kann keinem Arbeitsauftrag zugewiesen werden.',
  'This user cannot supervise a work order.':
    'Dieser Benutzer kann keinen Arbeitsauftrag betreuen.',
  'Not part of this conflict': 'Nicht Teil dieses Konflikts',
  'Only fields of the conflict can be merged':
    'Nur Felder des Konflikts können zusammengeführt werden',
  'Required for MERGE': 'Erforderlich für eine Zusammenführung',
  'Technicians can only change work orders assigned to them':
    'Techniker können nur ihnen zugewiesene Arbeitsaufträge ändern',
  'The body must be a JSON object': 'Der Inhalt der Anfrage muss ein JSON-Objekt sein',
  'These fields cannot be changed': 'Diese Felder können nicht geändert werden',
  'This conflict is already resolved': 'Dieser Konflikt ist bereits gelöst',
  'Your role does not allow changing these fields':
    'Ihre Rolle erlaubt nicht, diese Felder zu ändern',
  'Invalid params': 'Ungültige Parameter',
  Forbidden: 'Zugriff verweigert',
  'Not Found': 'Nicht gefunden',
  'Bad Request': 'Ungültige Anfrage',
  // Service levels (D86)
  'The service levels changed since you opened them. Reload and try again.':
    'Die Service-Level wurden geändert, seit Sie sie geöffnet haben. Laden Sie neu und versuchen Sie es erneut.',
  'This day is already a holiday.': 'Dieser Tag ist bereits ein Feiertag.',
  'Already a holiday': 'Bereits ein Feiertag',
  'Holiday not found': 'Feiertag nicht gefunden',
  'The resolution target cannot be shorter than the response target':
    'Das Behebungsziel darf nicht kürzer sein als das Reaktionsziel',
  'Each priority once': 'Jede Priorität nur einmal',
  'Choose at least one day': 'Wählen Sie mindestens einen Tag',
  'Each day once': 'Jeder Tag nur einmal',
  'The opening comes before the closing': 'Der Beginn muss vor dem Ende liegen',
};

/** German labels of the enum codes (labels.js → VALUE_LABELS), keyed by enum and code. */
export const DE_VALUES = {
  role: {
    STAFF: 'Mitarbeiter',
    TECHNICIAN: 'Techniker',
    SUPERVISOR: 'Supervisor',
    ADMIN: 'Administrator',
  },
  category: {
    HVAC: 'HLK',
    ELECTRICAL: 'Elektro',
    FIRE_SAFETY: 'Brandschutz',
    PLUMBING: 'Sanitär',
    NETWORK_CABLING: 'Netzwerkverkabelung',
    SECURITY: 'Sicherheitstechnik',
    UNSPECIFIED: 'Nicht angegeben',
  },
  criticality: { LOW: 'Niedrig', MEDIUM: 'Mittel', HIGH: 'Hoch', CRITICAL: 'Kritisch' },
  asset_status: {
    IN_SERVICE: 'In Betrieb',
    BROKEN_DOWN: 'Ausgefallen',
    UNDER_MAINTENANCE: 'In Wartung',
    OUT_OF_SERVICE: 'Außer Betrieb',
  },
  work_order_type: {
    CORRECTIVE: 'Instandsetzung',
    PREVENTIVE: 'Wartung',
    IMPROVEMENT: 'Verbesserung',
    REGULATORY: 'Gesetzliche Prüfung',
  },
  work_order_status: {
    OPEN: 'Offen',
    IN_PROGRESS: 'In Bearbeitung',
    ON_HOLD: 'Zurückgestellt',
    COMPLETED: 'Technisch erledigt',
    CLOSED: 'Abgeschlossen',
    CANCELLED: 'Storniert',
  },
  work_order_priority: { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' },
  hold_reason: {
    WAITING_PARTS: 'Wartet auf Ersatzteile',
    WAITING_CONTRACTOR: 'Wartet auf Dienstleister',
    WAITING_ACCESS: 'Wartet auf Zugang',
    WAITING_APPROVAL: 'Wartet auf Freigabe',
    OTHER: 'Sonstiges',
  },
  review_status: {
    PENDING: 'Zu prüfen',
    APPROVED: 'Genehmigt',
    REJECTED: 'Abgelehnt',
    WITHDRAWN: 'Zurückgezogen',
  },
  schedule_mode: { FIXED: 'Fester Kalender', FLOATING: 'Ab dem letzten Termin' },
  performed_by: { INTERNAL: 'Eigenes Team', CONTRACTOR: 'Dienstleister' },
  occurrence_status: {
    PLANNED: 'Geplant',
    RELEASED: 'Arbeitsauftrag angelegt',
    SKIPPED: 'Ausgelassen',
  },
  planning_group: { site: 'Standort', area: 'Bereich', category: 'Gewerk' },
  allocation_kind: {
    WORK: 'Arbeit',
    TRAVEL: 'Fahrt',
    PREPARATION: 'Vorbereitung',
    OTHER: 'Sonstige Zeit',
  },
  capacity_reason: {
    LEAVE: 'Urlaub',
    PART_TIME: 'Teilzeit',
    TRAINING: 'Schulung',
    WEEKEND: 'Wochenendarbeit',
    OTHER: 'Sonstiges',
  },
  sla_response_stop: { START: 'Erster Beginn', ASSIGNMENT: 'Erste Zuweisung' },
  sla_hours_mode: { CALENDAR: 'Kalenderstunden', BUSINESS: 'Geschäftszeiten' },
};

const status = (code) => DE_VALUES.work_order_status[code] ?? code;

/**
 * Messages of the API holding a value: [pattern of the English message, German text with $1…
 * or a function of the matches]. The patterns are those of FR_PATTERNS, in the same order.
 * @type {[RegExp, string | ((match: string, ...groups: string[]) => string)][]}
 */
export const DE_PATTERNS = [
  [
    /^This asset has (\d+) work orders?: its history must be kept\. Set its status to Out of service instead\.$/,
    'Diese Anlage hat $1 Arbeitsauftrag/-aufträge: Ihr Verlauf muss erhalten bleiben. Setzen Sie stattdessen ihren Status auf Außer Betrieb.',
  ],
  [
    /^The text is too long: (\d+) characters, (\d+) at most\.$/,
    'Der Text ist zu lang: $1 Zeichen, höchstens $2.',
  ],
  [
    /^The text is too short: describe the job in at least (\d+) words\.$/,
    'Der Text ist zu kurz: Beschreiben Sie die Arbeit in mindestens $1 Wörtern.',
  ],
  [
    /^This widget is already on the dashboard: (.+)$/,
    'Diese Kennzahl ist bereits auf dem Dashboard: $1',
  ],
  [/^Unknown option of (.+): (.+)$/, 'Unbekannte Option für $1: $2'],
  [/^Unknown widget: (.+)$/, 'Unbekannte Kennzahl: $1'],
  [
    /^This appointment is locked at (.+): unlock it before moving, resizing or removing it\.$/,
    'Dieser Festtermin ist auf $1 fixiert: Geben Sie ihn frei, bevor Sie ihn verschieben, seine Dauer ändern oder ihn entfernen.',
  ],
  [
    /^This user has (\d+) unfinished work orders?: reassign (?:it|them) first\.$/,
    'Dieser Benutzer hat $1 nicht erledigte(n) Arbeitsauftrag/-aufträge: Weisen Sie sie zuerst neu zu.',
  ],
  [
    /^The creation time is more than (\d+) days old\.$/,
    'Der Erstellungszeitpunkt liegt mehr als $1 Tage zurück.',
  ],
  [
    /^The status cannot change from (\w+) to (\w+)\.$/,
    (_, from, to) => `Der Status kann nicht von ${status(from)} zu ${status(to)} wechseln.`,
  ],
  [/^The code (.+) is already used here\.$/, 'Der Code $1 wird hier bereits verwendet.'],
  [/^The code (.+) is already used$/, 'Der Code $1 wird bereits verwendet'],
  [/^At most (\d+) characters$/, 'Höchstens $1 Zeichen'],
  [/^At least (\d+) characters$/, 'Mindestens $1 Zeichen'],
  [/^Switched off by an administrator: (.+)$/, 'Von einem Administrator ausgeschaltet: $1'],
  [/^You already have a dashboard named "(.+)"$/, 'Sie haben bereits ein Dashboard namens „$1“'],
  [/^You can have at most (\d+) dashboards$/, 'Sie können höchstens $1 Dashboards haben'],
  [/^The place is on (.+)$/, 'Der Ort liegt am Standort $1'],
  [/^There is already a level type named (.+)\.$/, 'Es gibt bereits einen Ebenentyp namens $1.'],
  [/^There is already a place named (.+) here\.$/, 'Hier gibt es bereits einen Ort namens $1.'],
  [/^The token (.+) is already used\.$/, 'Der Platzhalter $1 wird bereits verwendet.'],
  [
    /^This place changed since you opened it\. Reload it and try again\.$/,
    'Dieser Ort wurde geändert, seit Sie ihn geöffnet haben. Laden Sie ihn neu und versuchen Sie es erneut.',
  ],
  [
    /^This level type changed since you opened it\. Reload it and try again\.$/,
    'Dieser Ebenentyp wurde geändert, seit Sie ihn geöffnet haben. Laden Sie ihn neu und versuchen Sie es erneut.',
  ],
  [/^The asset is in (.+)$/, 'Die Anlage ist in $1'],
  [/^The asset is on (.+)$/, 'Die Anlage liegt am Standort $1'],
  [
    /^This time overlaps another appointment of the day, at (.+)\.$/,
    'Diese Uhrzeit überschneidet sich mit einem anderen Festtermin des Tages, um $1.',
  ],
  [/^The username (.+) is already used$/, 'Der Benutzername $1 wird bereits verwendet'],
  [/^One of (.+) days$/, 'Eine dieser Dauern in Tagen: $1'],
  [/^Unknown sort key: (.+)$/, 'Unbekannter Sortierschlüssel: $1'],
  // Default messages of the validation library (zod) on the API.
  [/^Too small: expected string to have >=1 characters?$/, 'Pflichtfeld'],
  [/^Too small: expected string to have >=(\d+) characters$/, 'Mindestens $1 Zeichen'],
  [/^Too big: expected string to have <=(\d+) characters$/, 'Höchstens $1 Zeichen'],
  [/^Too small: expected number to be >=?(.+)$/, 'Muss größer oder gleich $1 sein'],
  [/^Too big: expected number to be <=?(.+)$/, 'Muss kleiner oder gleich $1 sein'],
  [/^Too small: expected array to have >=(\d+) items?$/, 'Mindestens $1 Element(e)'],
  [/^Too big: expected array to have <=(\d+) items?$/, 'Höchstens $1 Element(e)'],
  [/^Invalid option: expected one of .+$/, 'Ungültige Auswahl'],
  [/^Invalid string: must match pattern .+$/, 'Ungültiges Format'],
  [/^Invalid input(: .+)?$/, 'Ungültiger Wert'],
  [/^Unrecognized keys?: .+$/, 'Unbekanntes Feld'],
];
