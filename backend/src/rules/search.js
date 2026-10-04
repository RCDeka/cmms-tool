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
