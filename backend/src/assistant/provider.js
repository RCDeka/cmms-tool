// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// The language model behind the assistant (docs/spec-ai-assistant.md → section 5). Which
// provider is used is open point 1 of the spec: until it is decided, only `none` exists, and
// the assistant answers with the search results (D67). Tests pass their own provider to
// createApp.

/**
 * @typedef {object} AssistantProvider
 * @property {(request: { system: string, input: string, signal: AbortSignal }) =>
 *   Promise<unknown>} complete one call to the model; resolves to the parsed JSON answer,
 *   rejects on any failure (network, timeout, non-JSON answer)
 */

/**
 * The provider chosen by `AI_PROVIDER`, or null when there is none.
 * @param {{ aiProvider: string }} config
 * @returns {AssistantProvider | null}
 */
export function createAssistantProvider(config) {
  switch (config.aiProvider) {
    case 'none':
      return null;
    default:
      throw new Error(`Unknown AI_PROVIDER: ${config.aiProvider}`);
  }
}
