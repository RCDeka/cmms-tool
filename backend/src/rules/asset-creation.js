// Asset creation and deletion rules (docs/data-model.md → BR-A1, BR-A3, BR-A4).

/** Codes are tags such as AST-0042 or CTA-PARIS-03: capitals, digits and hyphens. */
export const ASSET_CODE = /^[A-Z0-9][A-Z0-9-]{1,49}$/;

/** User-typed code → stored form (trimmed, capitals). */
export function normalizeAssetCode(code) {
  return code.trim().toUpperCase();
}

/**
 * Next automatic code (BR-A4): AST- followed by the next number, at least 4 digits.
 * @param {number | null} highest highest number among existing AST-<digits> codes
 */
export function nextAssetCode(highest) {
  return `AST-${String((highest ?? 0) + 1).padStart(4, '0')}`;
}

/**
 * Why an asset cannot be deleted, or null when it can (BR-A3). Deletion is for records
 * created by mistake: an asset with maintenance history is set Out of service instead.
 * @param {{ version: number, has_conflict: number }} asset stored row
 * @param {{ version: number, workOrders: number }} context
 * @returns {{ rule: string, message: string } | null}
 */
export function deletionBlocker(asset, { version, workOrders }) {
  if (asset.version !== version) {
    return {
      rule: 'BR-V1',
      message: 'This asset changed since you opened it. Reload it and try again.',
    };
  }
  if (asset.has_conflict === 1) {
    return { rule: 'BR-V4', message: 'This asset has a conflict waiting for arbitration.' };
  }
  if (workOrders > 0) {
    return {
      rule: 'BR-A3',
      message: `This asset has ${workOrders} work order${workOrders === 1 ? '' : 's'}: its history must be kept. Set its status to Out of service instead.`,
    };
  }
  return null;
}
