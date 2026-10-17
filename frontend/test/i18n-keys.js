// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Finds the dictionary keys used by the interface (D85): the English texts given to t(), tx(),
// tn() and plural() in the modules, and the static texts of index.html. Used by
// i18n.test.js to check that the French dictionary has every key and no stale one.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const JS = path.join(ROOT, 'assets/js');

/** Reads a JS string literal starting at `i`; returns [value, end] or null. */
function readString(src, i) {
  const quote = src[i];
  if (!["'", '"', '`'].includes(quote)) return null;
  let value = '';
  let j = i + 1;
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\') {
      const next = src[j + 1];
      value += { n: '\n', t: '\t' }[next] ?? next;
      j += 2;
    } else {
      if (quote === '`' && src[j] === '$' && src[j + 1] === '{') return null; // not a constant
      value += src[j];
      j += 1;
    }
  }
  return [value, j + 1];
}

/** Text of the call arguments after the "(" at `open`, split at top-level commas. */
function readArguments(src, open) {
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open + 1; i < src.length; i++) {
    const c = src[i];
    if (["'", '"', '`'].includes(c)) {
      // Skip the whole literal, template expressions included.
      let j = i + 1;
      let inner = 0;
      while (j < src.length) {
        if (src[j] === '\\') j += 2;
        else if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
          inner += 1;
          j += 2;
        } else if (inner && src[j] === '}') {
          inner -= 1;
          j += 1;
        } else if (!inner && src[j] === c) break;
        else j += 1;
      }
      i = j;
    } else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) {
      if (depth === 0) {
        args.push(src.slice(start, i).trim());
        return args;
      }
      depth -= 1;
    } else if (c === ',' && depth === 0) {
      args.push(src.slice(start, i).trim());
      start = i + 1;
    }
  }
  return args;
}

/**
 * Keys of one argument: a literal, a chain of conditions choosing literals
 * (`a ? 'X' : b ? 'Y' : 'Z'`), or a plural(...) call (its literals are found on their own).
 * Returns null when the argument is something else (a variable, a template with values).
 */
function keysOfArgument(arg) {
  if (/^plural\(/.test(arg)) return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < arg.length; i++) {
    const c = arg[i];
    if (["'", '"', '`'].includes(c)) {
      const read = readString(arg, i);
      if (!read) return null;
      i = read[1] - 1;
    } else if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (depth === 0 && (c === '?' || c === ':') && arg[i + 1] !== '.' && arg[i + 1] !== '?') {
      parts.push({ text: arg.slice(start, i).trim(), before: c });
      start = i + 1;
    }
  }
  parts.push({ text: arg.slice(start).trim(), before: null });
  const keys = [];
  for (const part of parts) {
    if (part.before === '?') continue; // a condition
    const read = readString(part.text, 0);
    if (!read || read[1] !== part.text.length) return null;
    keys.push(read[0]);
  }
  return keys;
}

/** Key arguments of each function: t('text'), tn(n, 'one', 'other'). */
const KEY_ARGS = { t: [0], tx: [0], tn: [1, 2], plural: [1, 2] };

/**
 * Keys found in a module's source, and the calls whose key is not a constant.
 * @param {string} src
 * @returns {{ keys: string[], dynamic: string[] }}
 */
export function keysOfSource(src) {
  const keys = [];
  const dynamic = [];
  const call = /(?<![\w.$])(t|tx|tn|plural)\(/g;
  for (const match of src.matchAll(call)) {
    // Skip the definitions in i18n.js ("export function t(text, vars)").
    if (/function\s+$/.test(src.slice(Math.max(0, match.index - 12), match.index))) continue;
    const args = readArguments(src, match.index + match[0].length - 1);
    const found = KEY_ARGS[match[1]].map((n) => (args[n] ? keysOfArgument(args[n]) : null));
    if (found.some((k) => k === null)) {
      dynamic.push(`${match[1]}(${args.join(', ').slice(0, 80)}`);
      continue;
    }
    keys.push(...found.flat());
  }
  return { keys, dynamic };
}

/** Texts of index.html marked data-i18n, and the labels of data-i18n-attr elements. */
export function keysOfShell(html) {
  const keys = [];
  for (const m of html.matchAll(/<(\w+)([^>]*\sdata-i18n(?:\s[^>]*)?)>([^<]*)</g)) {
    keys.push(m[3].replace(/\s+/g, ' ').trim());
  }
  for (const m of html.matchAll(/<\w+([^>]*\sdata-i18n-attr[^>]*)>/g)) {
    for (const a of m[1].matchAll(/\s(?:aria-label|title)="([^"]*)"/g)) keys.push(a[1]);
  }
  return keys;
}

/** Every key of the interface: { keys: Set, dynamic: [file, call][] }. */
export function interfaceKeys() {
  const keys = new Set();
  const dynamic = [];
  for (const name of fs.readdirSync(JS)) {
    if (!name.endsWith('.js') || name.startsWith('i18n')) continue;
    const found = keysOfSource(fs.readFileSync(path.join(JS, name), 'utf8'));
    found.keys.forEach((k) => keys.add(k));
    found.dynamic.forEach((d) => dynamic.push([name, d]));
  }
  keysOfShell(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).forEach((k) => keys.add(k));
  return { keys, dynamic };
}
