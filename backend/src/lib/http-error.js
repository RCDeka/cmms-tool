// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Error carrying an HTTP status, formatted by the error handler (docs/api-design.md). */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {object} [details] per-field errors or the violated rule, e.g. { rule: 'BR-W4' }
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}
