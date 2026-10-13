// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Full-text search (docs/api-design.md → Search and filters).

const MAX_TOKENS = 8;

/**
 * Turns typed text into a safe FTS5 query: each word becomes a quoted prefix term, all
 * required ("chil lyon" → "chil"* "lyon"*). Quoting means no FTS syntax from the user
 * (NEAR, OR, column filters, quotes) is ever interpreted. Pure.
 * @param {string} text
 * @returns {string | null} null when the text has no letter or digit (nothing can match)
 */
export function toFtsQuery(text) {
  const tokens =
    text
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!tokens.length) return null;
  return tokens
    .slice(0, MAX_TOKENS)
    .map((t) => `"${t}"*`)
    .join(' ');
}

const MAX_ANY_TOKENS = 12;
// Words too common to tell work orders apart (English and French, as technicians type both).
const STOP_WORDS = new Set(
  (
    'the and for with from was were has have had not but are this that then than been into ' +
    'onto all any its our out off now one two les des une pour par avec sur dans est sont pas ' +
    'qui que aux ses son mais plus fait ont été'
  ).split(' '),
);

/**
 * Turns a free description ("swapped the contactor on pump 2") into an FTS5 query where any
 * word may match, for ranking with bm25: distinct words of 3 characters or more, common words
 * left out, each quoted as a prefix term and joined with OR. Pure.
 * @param {string} text
 * @returns {string | null} null when no word is left
 */
export function toFtsAnyQuery(text) {
  const tokens =
    text
      .normalize('NFKC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const words = [...new Set(tokens)].filter((t) => [...t].length >= 3 && !STOP_WORDS.has(t));
  if (!words.length) return null;
  return words
    .slice(0, MAX_ANY_TOKENS)
    .map((t) => `"${t}"*`)
    .join(' OR ');
}
