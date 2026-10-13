// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// AI assistant, guardrail layers 2 and 4: the relevance verdict is read first, then the answer
// is checked locally before the user sees anything (docs/spec-ai-assistant.md → section 4,
// BR-AI5, BR-AI7, BR-AI8).
import { z } from 'zod';

export const MAX_MATCHES = 5;
export const MIN_MATCH_SCORE = 0.3;
export const VERDICTS = ['MAINTENANCE', 'NOT_MAINTENANCE'];

/** Answer of the model for find-work-order: strict, so an unknown field makes it unusable. */
const findAnswerSchema = z.strictObject({
  verdict: z.enum(VERDICTS),
  matches: z
    .array(
      z.strictObject({
        id: z.number().int().positive(),
        score: z.number().min(0).max(1),
        reason: z.string().trim().min(1).max(200),
      }),
    )
    .max(MAX_MATCHES),
});

/**
 * Checks the model's answer to find-work-order. Pure.
 * - Not an object, or no valid `verdict` → UNUSABLE (BR-AI7).
 * - `NOT_MAINTENANCE` → rejected, and the rest of the answer is not even validated (BR-AI5).
 * - Otherwise the whole answer must match the schema (BR-AI7); then ids outside the candidate
 *   set and repeated ids are dropped (BR-AI8), scores under 0.3 too, and the rest is sorted
 *   by score, highest first.
 * @param {unknown} answer parsed JSON from the provider
 * @param {Set<number>} candidateIds
 * @returns {{ outcome: 'OK', matches: { id: number, score: number, reason: string }[] }
 *   | { outcome: 'NOT_MAINTENANCE' } | { outcome: 'UNUSABLE' }}
 */
export function checkFindAnswer(answer, candidateIds) {
  const verdict = answer !== null && typeof answer === 'object' ? answer.verdict : undefined;
  if (!VERDICTS.includes(verdict)) return { outcome: 'UNUSABLE' };
  if (verdict === 'NOT_MAINTENANCE') return { outcome: 'NOT_MAINTENANCE' };

  const parsed = findAnswerSchema.safeParse(answer);
  if (!parsed.success) return { outcome: 'UNUSABLE' };

  const seen = new Set();
  const matches = [];
  for (const match of parsed.data.matches) {
    if (!candidateIds.has(match.id) || seen.has(match.id)) continue;
    seen.add(match.id);
    if (match.score >= MIN_MATCH_SCORE) matches.push(match);
  }
  matches.sort((a, b) => b.score - a.score);
  return { outcome: 'OK', matches };
}
