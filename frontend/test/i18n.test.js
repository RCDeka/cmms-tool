// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Language of the interface (D85, D91): the choice, the translation functions, and French and
// German dictionaries that match the code exactly.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { translateErrorBody } from '../assets/js/api.js';
import { ENUMS } from '../assets/js/enums.js';
import { DE, DE_PATTERNS, DE_SERVER, DE_VALUES } from '../assets/js/i18n-de.js';
import { FR, FR_PATTERNS, FR_SERVER, FR_VALUES } from '../assets/js/i18n-fr.js';
import {
  language,
  pickLanguage,
  plural,
  serverText,
  t,
  tn,
  translateStatic,
  tx,
  useLanguageForTests,
} from '../assets/js/i18n.js';
import { VALUE_LABELS, valueLabel } from '../assets/js/labels.js';
import { languageSwitch } from '../assets/js/layout.js';
import { interfaceKeys } from './i18n-keys.js';

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const DICTIONARIES = {
  fr: { texts: FR, server: FR_SERVER, values: FR_VALUES, patterns: FR_PATTERNS },
  de: { texts: DE, server: DE_SERVER, values: DE_VALUES, patterns: DE_PATTERNS },
};

afterEach(async () => {
  await useLanguageForTests('en');
  localStorage.clear();
});

describe('pickLanguage', () => {
  it('keeps the language saved on the device', () => {
    expect(pickLanguage('fr', ['en-GB'])).toBe('fr');
    expect(pickLanguage('en', ['fr-FR'])).toBe('en');
    expect(pickLanguage('de', ['fr-FR'])).toBe('de');
  });

  it("follows the browser's first language offered when nothing is saved", () => {
    expect(pickLanguage(null, ['es-ES', 'fr-CA', 'en'])).toBe('fr');
    expect(pickLanguage(null, ['de-AT', 'fr-CA'])).toBe('de');
    expect(pickLanguage(null, ['FR'])).toBe('fr');
    expect(pickLanguage('xx', ['en-US'])).toBe('en');
  });

  it('falls back to English', () => {
    expect(pickLanguage(null, [])).toBe('en');
    expect(pickLanguage(null, ['es', 'it'])).toBe('en');
  });

  it('starts in English in the tests (jsdom)', () => {
    expect(language()).toBe('en');
  });
});

describe('t, tn, tx', () => {
  it('gives the English text, placeholders filled, without a dictionary', () => {
    expect(t('Work orders')).toBe('Work orders');
    expect(t('Week {n}, {year}', { n: 43, year: 2026 })).toBe('Week 43, 2026');
    expect(t('{a} and {b}', { a: 1 })).toBe('1 and {b}');
  });

  it('drops the context of a key in English', () => {
    expect(t('count|Closed')).toBe('Closed');
    expect(t('one|{n} selected', { n: 1 })).toBe('1 selected');
  });

  it('translates, with the context choosing the word', async () => {
    await useLanguageForTests('fr');
    expect(t('Work orders')).toBe('Bons de travaux');
    expect(t('Closed')).toBe('Clôture');
    expect(t('count|Done')).toBe('Terminés');
    expect(t('Text without an entry')).toBe('Text without an entry');
  });

  it('uses the singular for 0 and 1 in French, for 1 only in English', async () => {
    expect(plural(0, 'one', 'other')).toBe('other');
    expect(tn(1, '{n} asset', '{n} assets')).toBe('1 asset');
    await useLanguageForTests('fr');
    expect(plural(0, 'one', 'other')).toBe('one');
    expect(tn(0, '{n} asset', '{n} assets')).toBe('0 équipement');
    expect(tn(2, '{n} asset', '{n} assets')).toBe('2 équipements');
    // Counts are formatted for the language (a narrow no-break space in French).
    expect(tn(1234, '{n} asset', '{n} assets')).toBe('1 234 équipements');
  });

  it('puts elements in a translated sentence', async () => {
    await useLanguageForTests('fr');
    const link = document.createElement('a');
    link.textContent = 'Changer mon mot de passe';
    const pieces = tx('To change your own password, use {link}.', { link });
    expect(pieces).toEqual(['Pour changer votre propre mot de passe, utilisez ', link, '.']);
  });
});

describe('translated labels of the enum codes', () => {
  it.each(Object.keys(DICTIONARIES))('cover every code of every enum (%s)', (code) => {
    const { values } = DICTIONARIES[code];
    for (const [name, codes] of Object.entries(ENUMS)) {
      for (const value of codes) expect(values[name]?.[value], `${name}.${value}`).toBeTruthy();
    }
    for (const [name, labels] of Object.entries(VALUE_LABELS)) {
      expect(Object.keys(values[name]).sort(), name).toEqual(Object.keys(labels).sort());
    }
  });

  it('agree with their noun: "Low" is Faible for a criticality, Basse for a priority', async () => {
    await useLanguageForTests('fr');
    expect(valueLabel('criticality', 'LOW')).toBe('Faible');
    expect(valueLabel('work_order_priority', 'LOW')).toBe('Basse');
    expect(valueLabel('work_order_status', 'CLOSED')).toBe('Clôturé');
    expect(valueLabel('category', 'HVAC')).toBe('CVC');
    expect(valueLabel('category', 'UNKNOWN_CODE')).toBe('UNKNOWN_CODE');
  });

  it('are German in German', async () => {
    await useLanguageForTests('de');
    expect(valueLabel('work_order_status', 'CLOSED')).toBe('Abgeschlossen');
    expect(valueLabel('category', 'HVAC')).toBe('HLK');
    expect(valueLabel('role', 'SUPERVISOR')).toBe('Teamleiter');
  });
});

describe('messages of the server', () => {
  it('stay in English in English', () => {
    expect(serverText('Asset not found')).toBe('Asset not found');
  });

  it('are translated, with the values of a pattern kept', async () => {
    await useLanguageForTests('fr');
    expect(serverText('Asset not found')).toBe('Équipement introuvable');
    expect(serverText('Required')).toBe('Obligatoire');
    expect(serverText('The code AST-0042 is already used')).toBe(
      'Le code AST-0042 est déjà utilisé',
    );
    expect(serverText('The status cannot change from CLOSED to OPEN.')).toBe(
      'Le statut ne peut pas passer de Clôturé à Ouvert.',
    );
    expect(serverText('Too big: expected string to have <=200 characters')).toBe(
      '200 caractères au maximum',
    );
    expect(serverText('Something new from the server')).toBe('Something new from the server');
  });

  it('are translated into German, with the values of a pattern kept', async () => {
    await useLanguageForTests('de');
    expect(serverText('Asset not found')).toBe('Anlage nicht gefunden');
    expect(serverText('The status cannot change from CLOSED to OPEN.')).toBe(
      'Der Status kann nicht von Abgeschlossen zu Offen wechseln.',
    );
    expect(serverText('Too big: expected string to have <=200 characters')).toBe(
      'Höchstens 200 Zeichen',
    );
  });

  it('are translated in an error body, field messages included', async () => {
    await useLanguageForTests('fr');
    const body = {
      statusCode: 400,
      message: 'Invalid body',
      details: { fields: { title: 'Required', code: 'The code X is already used' } },
    };
    translateErrorBody(body);
    expect(body.message).toBe('Données non valides');
    expect(body.details.fields).toEqual({
      title: 'Obligatoire',
      code: 'Le code X est déjà utilisé',
    });
  });

  it('are all still sent by the server', () => {
    const root = path.resolve(import.meta.dirname, '../../backend/src');
    const sources = [];
    const read = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        if (fs.statSync(file).isDirectory()) read(file);
        else if (name.endsWith('.js')) sources.push(fs.readFileSync(file, 'utf8'));
      }
    };
    read(root);
    const all = sources.join('\n');
    const gone = Object.keys(FR_SERVER).filter((key) => !all.includes(key));
    expect(Object.keys(DE_SERVER).sort()).toEqual(Object.keys(FR_SERVER).sort());
    // Built from a template (`Invalid ${part}`), or the HTTP status texts (error-handler.js).
    const built = ['Invalid params', 'Forbidden', 'Not Found', 'Bad Request'];
    expect(gone.filter((key) => !built.includes(key))).toEqual([]);
  });

  it('have patterns that each match one message', () => {
    for (const [pattern, replacement] of [...FR_PATTERNS, ...DE_PATTERNS]) {
      expect(pattern).toBeInstanceOf(RegExp);
      expect(['string', 'function']).toContain(typeof replacement);
    }
    // The same patterns in every language, in the same order (the first match wins).
    expect(DE_PATTERNS.map(([p]) => String(p))).toEqual(FR_PATTERNS.map(([p]) => String(p)));
  });
});

describe.each(Object.keys(DICTIONARIES))('dictionary %s', (code) => {
  const { keys, dynamic } = interfaceKeys();
  const { texts, server } = DICTIONARIES[code];

  it('is reached by constant keys only', () => {
    expect(dynamic).toEqual([]);
  });

  it('has every text of the interface', () => {
    expect([...keys].filter((key) => !(key in texts))).toEqual([]);
  });

  it('has no text the interface no longer uses', () => {
    expect(Object.keys(texts).filter((key) => !keys.has(key))).toEqual([]);
  });

  it('keeps the placeholders and the outer spaces of each text', () => {
    for (const [key, text] of Object.entries({ ...texts, ...server })) {
      expect(text.trim(), key).not.toBe('');
      const wanted = placeholders(key.replace(/^[a-z]+\|/, ''));
      const got = placeholders(text);
      // A singular may drop the count ("Toutes les semaines", "Jede Woche").
      if (got.join() !== wanted.join()) expect(got, key).toEqual(wanted.filter((p) => p !== 'n'));
      // Plain spaces: a French text may start with the no-break space of " ; ".
      expect(text.startsWith(' '), key).toBe(key.startsWith(' '));
      expect(text.endsWith(' '), key).toBe(key.endsWith(' '));
    }
  });
});

describe('static texts and flags', () => {
  it('translates the marked texts and labels of the shell', async () => {
    document.body.innerHTML = `
      <a href="/assets" data-i18n>
        Assets</a>
      <button aria-label="Open menu" data-i18n-attr></button>`;
    await useLanguageForTests('fr');
    translateStatic();
    expect(document.documentElement.lang).toBe('fr');
    expect(document.querySelector('a').textContent).toBe('Équipements');
    expect(document.querySelector('button').getAttribute('aria-label')).toBe('Ouvrir le menu');
  });

  it('shows one flag per language, named in its language, the current one pressed', () => {
    const element = languageSwitch();
    const buttons = [...element.querySelectorAll('button')];
    expect(buttons.map((b) => [b.lang, b.getAttribute('aria-label')])).toEqual([
      ['en', 'English'],
      ['fr', 'Français'],
      ['de', 'Deutsch'],
    ]);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  });

  it('keeps the page when the unsaved-changes question is cancelled', async () => {
    const element = languageSwitch(() => false);
    element.querySelector('[lang="fr"]').click();
    await Promise.resolve();
    expect(localStorage.getItem('tacto.language')).toBeNull();
  });
});

describe('a page loaded in another language', () => {
  it('builds its module-level labels in French', async () => {
    vi.resetModules();
    localStorage.setItem('tacto.language', 'fr');
    const { ENTITIES } = await import('../assets/js/entities.js');
    expect(ENTITIES.work_orders.label).toBe('Bons de travaux');
    expect(ENTITIES.assets.fields.name.label).toBe('Libellé');
    const { formatDate } = await import('../assets/js/format.js');
    expect(formatDate('2026-10-04')).toBe('4 oct. 2026');
    vi.resetModules();
  });

  it('builds them in German, with German dates and counts', async () => {
    vi.resetModules();
    localStorage.setItem('tacto.language', 'de');
    const { ENTITIES } = await import('../assets/js/entities.js');
    expect(ENTITIES.work_orders.label).toBe('Arbeitsaufträge');
    const { formatDate } = await import('../assets/js/format.js');
    expect(formatDate('2026-10-04')).toBe('4. Okt. 2026');
    const i18n = await import('../assets/js/i18n.js');
    expect(i18n.language()).toBe('de');
    // German uses the plural for 0, like English.
    expect(i18n.tn(0, '{n} asset', '{n} assets')).toBe('0 Anlagen');
    expect(i18n.tn(1, '{n} asset', '{n} assets')).toBe('1 Anlage');
    vi.resetModules();
  });
});
