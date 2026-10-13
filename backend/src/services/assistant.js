// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// AI assistant: finding the work order a job belongs to (docs/spec-ai-assistant.md →
// section 7, D66, D67). The candidates are chosen here with SQL; the model may only rank them.
import { FIND_WORK_ORDER_SYSTEM, findWorkOrderInput } from '../assistant/prompts.js';
import { HttpError } from '../lib/http-error.js';
import { checkFindAnswer } from '../rules/assistant-output.js';
import { toFtsAnyQuery } from '../rules/search.js';

export const MAX_CANDIDATES = 30;
/** Results shown without the model (no provider, provider down, unusable answer). */
export const MAX_SEARCH_RESULTS = 10;

const OPEN_STATUSES = "w.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD')";

/**
 * @param {import('better-sqlite3').Database} db
 * @param {object} deps
 * @param {ReturnType<import('./work-orders.js').createWorkOrderService>} deps.workOrders
 * @param {import('../assistant/provider.js').AssistantProvider | null} deps.provider
 * @param {number} deps.timeoutMs
 * @param {(entry: object) => void} deps.log one structured line per request (BR-AI11)
 */
export function createAssistantService(db, { workOrders, provider, timeoutMs, log }) {
  const assetSite = db.prepare('SELECT site FROM assets WHERE id = ?').pluck();

  // Candidate set (BR-AI8). With an asset: its open work orders. Without: open work orders
  // whose own text or asset matches the text. Ordered by relevance: bm25 of the work order
  // (title words weigh most) plus bm25 of its asset, the user's own work raised by a fifth.
  // bm25 is negative, lower is better; work orders without a match come last.
  const withText = db.prepare(`
    WITH text_hits AS (
      SELECT rowid AS id, bm25(work_orders_fts, 1, 4, 1, 0.5, 1, 1) AS rank
      FROM work_orders_fts WHERE work_orders_fts MATCH @fts
    ),
    asset_hits AS (
      SELECT rowid AS id, bm25(assets_fts) AS rank FROM assets_fts WHERE assets_fts MATCH @fts
    )
    SELECT w.id
    FROM work_orders w
    LEFT JOIN text_hits t ON t.id = w.id
    LEFT JOIN asset_hits ah ON ah.id = w.asset_id
    WHERE ${OPEN_STATUSES}
      AND (@asset IS NULL OR w.asset_id = @asset)
      AND (@site IS NULL OR w.site = @site)
      AND (@asset IS NOT NULL OR t.id IS NOT NULL OR ah.id IS NOT NULL)
    ORDER BY (coalesce(t.rank, 0) + coalesce(ah.rank, 0))
        * (CASE WHEN w.assignee_id IS @me THEN 1.2 ELSE 1 END),
      w.updated_at DESC, w.id DESC
    LIMIT ${MAX_CANDIDATES}`);
  const assetOnly = db.prepare(`
    SELECT w.id FROM work_orders w
    WHERE ${OPEN_STATUSES} AND w.asset_id = @asset
    ORDER BY w.assignee_id IS NOT @me, w.updated_at DESC, w.id DESC
    LIMIT ${MAX_CANDIDATES}`);

  /** Resolves within the timeout or rejects; the signal tells the provider to give up. */
  async function callProvider(input) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('Assistant timed out'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([
        provider.complete({ system: FIND_WORK_ORDER_SYSTEM, input, signal: controller.signal }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  const searchResults = (candidates, notice) => ({
    mode: 'SEARCH',
    notice,
    candidates: candidates
      .slice(0, MAX_SEARCH_RESULTS)
      .map((wo) => ({ work_order: wo, score: null, reason: null })),
  });

  return {
    /** True when a model is configured (`assistant` in the reference data). */
    enabled: provider !== null,

    log,

    /**
     * The candidate set, as complete records (no AI). 422 for an unknown asset, or a site that
     * is not the asset's (BR-W2).
     * @param {{ text: string, assetId?: number, site?: string }} input
     * @param {{ id: number }} user
     */
    candidates({ text, assetId, site }, user) {
      if (assetId !== undefined) {
        const ofAsset = assetSite.get(assetId);
        if (ofAsset === undefined) {
          throw new HttpError(422, 'This asset does not exist', { rule: 'BR-AI3' });
        }
        if (site !== undefined && site !== ofAsset) {
          throw new HttpError(422, 'The site is not the site of the asset', { rule: 'BR-W2' });
        }
      }
      const fts = toFtsAnyQuery(text);
      const params = { asset: assetId ?? null, site: site ?? null, me: user.id };
      let ids = [];
      if (fts !== null) ids = withText.pluck().all({ ...params, fts });
      else if (assetId !== undefined) ids = assetOnly.pluck().all(params);
      return ids.map((id) => workOrders.getById(id));
    },

    /**
     * Ranks the candidates with the model (layers 2 to 4). Falls back to the search results
     * when there is no model, it fails or its answer is unusable (D67); 422 when the model
     * judges the text not about maintenance (BR-AI5).
     * @param {string} text normalised raw text
     * @param {object[]} candidates from `candidates()`
     * @param {{ id: number }} user
     */
    async rank(text, candidates, user) {
      const started = Date.now();
      const done = (outcome) =>
        log({
          event: 'assistant',
          endpoint: 'find-work-order',
          user_id: user.id,
          input_length: [...text].length,
          candidates: candidates.length,
          outcome,
          duration_ms: Date.now() - started,
        });

      if (!candidates.length) {
        done('NO_CANDIDATES');
        return provider
          ? { mode: 'ASSISTANT', notice: null, candidates: [] }
          : searchResults([], 'NOT_CONFIGURED');
      }
      if (!provider) {
        done('NOT_CONFIGURED');
        return searchResults(candidates, 'NOT_CONFIGURED');
      }

      let answer;
      try {
        answer = await callProvider(findWorkOrderInput(text, candidates, user.id));
      } catch {
        done('UNAVAILABLE');
        return searchResults(candidates, 'UNAVAILABLE');
      }
      const byId = new Map(candidates.map((wo) => [wo.id, wo]));
      const checked = checkFindAnswer(answer, new Set(byId.keys()));
      done(checked.outcome);
      if (checked.outcome === 'NOT_MAINTENANCE') {
        throw new HttpError(
          422,
          "This doesn't look like a maintenance job. Describe the work done or the fault found.",
          { rule: 'BR-AI5' },
        );
      }
      if (checked.outcome === 'UNUSABLE') return searchResults(candidates, 'UNUSABLE');
      return {
        mode: 'ASSISTANT',
        notice: null,
        candidates: checked.matches.map((m) => ({
          work_order: byId.get(m.id),
          score: m.score,
          reason: m.reason,
        })),
      };
    },
  };
}
