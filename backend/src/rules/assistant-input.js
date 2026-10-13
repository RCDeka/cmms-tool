// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// AI assistant, guardrail layer 1: local input checks, before any call to the model
// (docs/spec-ai-assistant.md → section 4, BR-AI1 and BR-AI2).

export const RAW_TEXT_MIN_LENGTH = 10;
export const RAW_TEXT_MAX_LENGTH = 2000;
export const RAW_TEXT_MIN_WORDS = 3;

// Control characters except tab (09) and line feed (0A); carriage returns are turned into
// line feeds first.
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Zero-width, bidirectional formatting and other invisible format characters: they can hide
// text from the reader while the model still sees it.
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

/**
 * BR-AI1: NFC, control and invisible characters removed, runs of spaces and of more than two
 * line breaks collapsed, trimmed. Pure.
 * @param {string} text
 */
export function normalizeRawText(text) {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const formatCount = (n) => n.toLocaleString('en-US');

/**
 * BR-AI2: the normalised text holds 10 to 2 000 characters and at least 3 words. Pure.
 * @param {string} raw
 * @returns {{ ok: true, text: string } | { ok: false, message: string }}
 */
export function checkRawText(raw) {
  const text = normalizeRawText(raw);
  const length = [...text].length;
  if (length > RAW_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      message: `The text is too long: ${formatCount(length)} characters, ${formatCount(RAW_TEXT_MAX_LENGTH)} at most.`,
    };
  }
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (length < RAW_TEXT_MIN_LENGTH || words.length < RAW_TEXT_MIN_WORDS) {
    return {
      ok: false,
      message: `The text is too short: describe the job in at least ${RAW_TEXT_MIN_WORDS} words.`,
    };
  }
  return { ok: true, text };
}
