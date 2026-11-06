// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Language of the interface (D85, D91): English, French or German, chosen with the flags of the
// top bar and kept on the device. Only the interface is translated, never the content people type.
// The English text is the key: t('Work orders') gives 'Bons de travaux' in French and falls back
// to the English text when the dictionary has no entry. The language is read once when the page
// loads, so module-level labels are translated too; changing it reloads the page. Only the
// dictionary of that language is loaded (top-level await: the modules importing this one wait).

const STORAGE_KEY = 'tacto.language';

/** Languages offered, in the order of the flags. */
export const LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-GB' },
  { code: 'fr', name: 'Français', locale: 'fr-FR' },
  { code: 'de', name: 'Deutsch', locale: 'de-DE' },
];

/**
 * One dictionary per language other than English: the interface texts with the messages of the
 * server (`texts`), the enum labels (`values`) and the server messages holding a value
 * (`patterns`).
 */
const LOADERS = {
  fr: async () => {
    const m = await import('./i18n-fr.js');
    return { texts: { ...m.FR_SERVER, ...m.FR }, values: m.FR_VALUES, patterns: m.FR_PATTERNS };
  },
  de: async () => {
    const m = await import('./i18n-de.js');
    return { texts: { ...m.DE_SERVER, ...m.DE }, values: m.DE_VALUES, patterns: m.DE_PATTERNS };
  },
};

/** The dictionary of a language, or null for English (or when it cannot be loaded). */
async function loadDictionary(code) {
  if (code === 'en') return null;
  try {
    return await LOADERS[code]();
  } catch {
    return null; // not reachable (offline before the service worker cached it): English
  }
}

/**
 * Language to start with: the one saved on the device, else the browser's first language we
 * offer, else English. Pure.
 * @param {string | null} saved
 * @param {readonly string[]} browserLanguages navigator.languages
 * @returns {'en' | 'fr' | 'de'}
 */
export function pickLanguage(saved, browserLanguages = []) {
  const known = (code) => LANGUAGES.some((l) => l.code === code);
  if (known(saved)) return saved;
  for (const tag of browserLanguages) {
    const code = String(tag).slice(0, 2).toLowerCase();
    if (known(code)) return code;
  }
  return 'en';
}

function readSaved() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let current = pickLanguage(
  readSaved(),
  typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]),
);
let active = await loadDictionary(current);
if (!active) current = 'en';
let dictionary = active?.texts ?? null;
let pluralRules = new Intl.PluralRules(localeOf(current));
let countFormat = new Intl.NumberFormat(localeOf(current));

function localeOf(code) {
  return LANGUAGES.find((l) => l.code === code).locale;
}

/** Code of the interface language ('en', 'fr' or 'de'). */
export function language() {
  return current;
}

/** Locale of the interface language for Intl formats ('en-GB', 'fr-FR', 'de-DE'). */
export function locale() {
  return localeOf(current);
}

/**
 * Saves the language on the device and reloads the page in it (unsaved edits survive a reload
 * as drafts, D10).
 * @param {string} code
 */
export function setLanguage(code) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage refused: the reload keeps the browser's language */
  }
  location.reload();
}

/**
 * Switches the dictionary without reloading. For tests only: labels built when a module loads
 * keep the language they were built in.
 * @param {'en' | 'fr' | 'de'} code
 */
export async function useLanguageForTests(code) {
  current = code;
  active = await loadDictionary(code);
  dictionary = active?.texts ?? null;
  pluralRules = new Intl.PluralRules(localeOf(code));
  countFormat = new Intl.NumberFormat(localeOf(code));
}

/**
 * Text of a key in the current language. A key may start with a context, 'count|Closed', when
 * one English text needs two French ones ("Clôture" for a date, "Clôturés" for a count); the
 * English text is what follows the context.
 */
function lookup(key) {
  return dictionary?.[key] ?? key.replace(/^[a-z]+\|/, '');
}

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : whole,
  );
}

/**
 * Text of the interface in the current language, with `{name}` placeholders filled.
 * @param {string} text English text
 * @param {Record<string, unknown>} [vars]
 * @returns {string}
 */
export function t(text, vars) {
  return fill(lookup(text), vars);
}

/**
 * The English form to use for a count in the current language: French uses the singular for
 * 0 and 1, English and German for 1 only. Translate the result with t() or tx().
 * @param {number} count
 * @param {string} one English singular
 * @param {string} other English plural
 */
export function plural(count, one, other) {
  return pluralRules.select(count) === 'one' ? one : other;
}

/**
 * Text with a count: tn(3, '{n} asset', '{n} assets') → '3 assets' / '3 équipements'.
 * `{n}` is the count, formatted for the language, unless `vars.n` gives it.
 * @param {number} count
 * @param {string} one
 * @param {string} other
 * @param {Record<string, unknown>} [vars]
 */
export function tn(count, one, other, vars = {}) {
  return t(plural(count, one, other), { n: countFormat.format(count), ...vars });
}

/**
 * Like t(), for a sentence holding elements (a link, a badge): returns the pieces to pass as
 * children of h(). Placeholders whose value is a Node are put in as that node.
 * @param {string} text
 * @param {Record<string, unknown>} vars
 * @returns {(string | Node)[]}
 */
export function tx(text, vars) {
  const pieces = [];
  const translated = lookup(text);
  let last = 0;
  for (const match of translated.matchAll(/\{(\w+)\}/g)) {
    const value = vars[match[1]];
    if (!(typeof Node !== 'undefined' && value instanceof Node)) continue;
    pieces.push(fill(translated.slice(last, match.index), vars), value);
    last = match.index + match[0].length;
  }
  pieces.push(fill(translated.slice(last), vars));
  return pieces.filter((p) => p !== '');
}

/** Labels of the enum codes in the current language ({ enum: { CODE: label } }), or null in English. */
export function valueLabels() {
  return active?.values ?? null;
}

/**
 * Message sent by the server (always English, docs/api-design.md) in the current language:
 * the dictionary first, then the patterns of messages holding a value (a code, a name).
 * Unknown messages stay in English.
 * @param {string} message
 */
export function serverText(message) {
  if (!dictionary || typeof message !== 'string') return message;
  if (dictionary[message]) return dictionary[message];
  for (const [pattern, replacement] of active.patterns) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
}

/**
 * Translates the static text of index.html: the text of `[data-i18n]` elements and the
 * `aria-label` and `title` attributes of `[data-i18n-attr]` elements.
 * @param {ParentNode} root
 */
export function translateStatic(root = document) {
  document.documentElement.lang = current;
  if (!dictionary) return;
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.textContent.replace(/\s+/g, ' ').trim());
  }
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const name of ['aria-label', 'title']) {
      if (el.hasAttribute(name)) el.setAttribute(name, t(el.getAttribute(name)));
    }
  }
}
