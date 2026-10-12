// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Widget exports (docs/spec-dashboards.md → Exports): CSV files and JPG images, built in the
// browser from the figures on screen or the records sent by the server. No library: CSV is
// text, and the image is drawn on a canvas.
import { h } from './dom.js';

/**
 * Cells starting like a formula are prefixed with ' so a spreadsheet shows them as text
 * (CSV injection: titles and locations are typed by staff).
 */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell (RFC 4180): quoted when it holds a comma, a quote or a line break. Pure. */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * CSV text: UTF-8 byte order mark (spreadsheets then read accents correctly), a header line,
 * comma separators and CRLF line ends. Pure.
 * @param {string[]} columns
 * @param {unknown[][]} rows
 */
export function toCsv(columns, rows) {
  const lines = [columns, ...rows].map((cells) => cells.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** 'Équipe Saclay' → 'equipe-saclay' (letters without accents, digits, hyphens). Pure. */
export function fileSlug(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * `tacto-<dashboard>-<widget>[-<suffix>]-<YYYY-MM-DD>.<ext>`. Pure.
 * @param {{ dashboard: string, widget: string, suffix?: string, date: string, ext: string }} parts
 */
export function exportFileName({ dashboard, widget, suffix, date, ext }) {
  const words = ['tacto', dashboard, widget, suffix].filter(Boolean).map(fileSlug).filter(Boolean);
  return `${words.join('-')}-${date}.${ext}`;
}

/** Hands a file to the browser's download (an object URL on a temporary link). */
export function downloadFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: name, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves CSV text as a file. */
export function downloadCsv(text, name) {
  downloadFile(new Blob([text], { type: 'text/csv;charset=utf-8' }), name);
}

// --- Image (JPG) ----------------------------------------------------------------------------

/** Width in CSS pixels; drawn at twice the density. Always the light colors (K7). */
const WIDTH = 1200;
const SCALE = 2;
const PAD = 40;
const ROW = 32;
const COLORS = {
  background: '#ffffff',
  text: '#1a1a1a',
  muted: '#595959',
  border: '#d4d4d4',
  header: '#f5f5f5',
  warning: '#8a5300',
};

/** Text cut with an ellipsis to fit `width`. */
function fit(ctx, text, width) {
  const value = String(text ?? '');
  if (ctx.measureText(value).width <= width) return value;
  let end = value.length;
  while (end > 0 && ctx.measureText(`${value.slice(0, end)}…`).width > width) end--;
  return `${value.slice(0, end)}…`;
}

/**
 * Draws a widget as a JPG: title, filters, then its chart, its value or its table, and a
 * footer naming the dashboard and the date.
 * @param {{ title: string, subtitle: string, footer: string, font: string,
 *   chart?: HTMLCanvasElement, value?: string, note?: string,
 *   table?: { columns: { label: string, numeric?: boolean }[], rows: unknown[][] } }} content
 * @returns {Promise<Blob>}
 */
export function widgetImage({ title, subtitle, footer, font, chart, value, note, table }) {
  const inner = WIDTH - 2 * PAD;
  // Charts keep their size on screen (never enlarged, which would blur them).
  const chartWidth = chart?.width ? Math.min(inner, chart.clientWidth || chart.width) : 0;
  const chartHeight = chartWidth ? (chartWidth * chart.height) / chart.width : 0;
  const tableRows = table?.rows.length ? table.rows.length + 1 : 0;
  const height =
    PAD +
    36 +
    (subtitle ? 28 : 0) +
    24 +
    (value !== undefined ? 90 : 0) +
    (note ? 30 : 0) +
    (chartHeight ? chartHeight + 24 : 0) +
    tableRows * ROW +
    (tableRows ? 24 : 0) +
    40 +
    PAD;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * SCALE;
  canvas.height = Math.ceil(height * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = 'top';

  let y = PAD;
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 28px ${font}`;
  ctx.fillText(fit(ctx, title, inner), PAD, y);
  y += 36;
  if (subtitle) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = `16px ${font}`;
    ctx.fillText(fit(ctx, subtitle, inner), PAD, y);
    y += 28;
  }
  y += 24;

  if (value !== undefined) {
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 64px ${font}`;
    ctx.fillText(value, PAD, y);
    y += 90;
  }
  if (note) {
    ctx.fillStyle = COLORS.warning;
    ctx.font = `600 18px ${font}`;
    ctx.fillText(fit(ctx, note, inner), PAD, y);
    y += 30;
  }
  if (chartHeight) {
    ctx.drawImage(chart, PAD, y, chartWidth, chartHeight);
    y += chartHeight + 24;
  }
  if (tableRows) {
    const columnWidth = inner / table.columns.length;
    const cell = (text, i, numeric) => {
      const width = columnWidth - 16;
      const shown = fit(ctx, text, width);
      ctx.textAlign = numeric ? 'right' : 'left';
      const x = PAD + i * columnWidth + (numeric ? columnWidth - 8 : 8);
      ctx.fillText(shown, x, y + 8);
    };
    ctx.fillStyle = COLORS.header;
    ctx.fillRect(PAD, y, inner, ROW);
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 15px ${font}`;
    table.columns.forEach((c, i) => cell(c.label, i, c.numeric));
    y += ROW;
    ctx.font = `15px ${font}`;
    for (const row of table.rows) {
      ctx.strokeStyle = COLORS.border;
      ctx.beginPath();
      ctx.moveTo(PAD, y + 0.5);
      ctx.lineTo(PAD + inner, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      row.forEach((text, i) => cell(text, i, table.columns[i].numeric));
      y += ROW;
    }
    ctx.textAlign = 'left';
    y += 24;
  }

  ctx.fillStyle = COLORS.muted;
  ctx.font = `13px ${font}`;
  ctx.fillText(fit(ctx, footer, inner), PAD, y + 12);

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be created.'))),
      'image/jpeg',
      0.92,
    ),
  );
}
