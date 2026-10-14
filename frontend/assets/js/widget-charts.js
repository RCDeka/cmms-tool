// SPDX-FileCopyrightText: 2026 Alexandre Carpentier (RCDeka)
// SPDX-License-Identifier: AGPL-3.0-or-later

// Charts of the flow and backlog widgets (Phase 22), after the data-viz method: one value
// axis per chart, categorical colors in their fixed slots (--color-chart-series-N, the
// identity of a series never follows its rank), a single series in one gray, 4 px rounded
// data ends, 2 px surface gaps in stacks, recessive grid, a legend (in HTML, next to the
// chart) for two series or more, and a tooltip on every mark. Every chart has a table view
// in its widget. A click on a mark calls `onPick`, which opens the records behind it.
import { loadChartJs, numberFormat, percentFormat } from './dashboard.js';

/** Design tokens and shared options. */
function theme() {
  const css = getComputedStyle(document.documentElement);
  const token = (name) => css.getPropertyValue(name).trim();
  const font = token('--font-sans');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const axis = (extra = {}) => ({
    ticks: { color: token('--color-text-muted'), font: { family: font }, ...extra.ticks },
    grid: { color: token('--color-grid'), lineWidth: 1, ...extra.grid },
    border: { display: false },
    ...extra.rest,
  });
  return { token, font, reduceMotion, axis };
}

/** Options common to every chart: responsive frame, tooltip fonts, click and hover. */
function baseOptions({ font, reduceMotion }, onPick) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduceMotion ? false : { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: { titleFont: { family: font }, bodyFont: { family: font, weight: '600' } },
    },
    onClick: onPick
      ? (_event, elements) => {
          if (elements[0]) onPick(elements[0].datasetIndex, elements[0].index);
        }
      : undefined,
    onHover: onPick
      ? (event, elements) => {
          event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
        }
      : undefined,
  };
}

/**
 * Columns per bucket, side by side (opened and closed per week).
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], titles: string[], series: { label: string, values: number[],
 *   slot: number }[], onPick?: (series: number, index: number) => void }} spec
 */
export async function drawPairedColumns(canvas, { labels, titles, series, onPick }) {
  const Chart = await loadChartJs();
  const t = theme();
  const options = baseOptions(t, onPick);
  options.interaction = { mode: 'index', intersect: false };
  options.plugins.tooltip.callbacks = {
    title: (items) => titles[items[0].dataIndex],
    label: (item) => `${item.dataset.label}: ${numberFormat.format(item.parsed.y)}`,
  };
  options.scales = {
    x: t.axis({ grid: { display: false } }),
    y: t.axis({ ticks: { precision: 0 }, rest: { beginAtZero: true } }),
  };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.values,
        backgroundColor: t.token(`--color-chart-series-${s.slot}`),
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'start',
        maxBarThickness: 24,
        categoryPercentage: 0.7,
        barPercentage: 0.9,
      })),
    },
    options,
  });
}

/**
 * One series over time as a 2 px line with markers (unfinished work at the end of each week).
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], titles: string[], label: string, values: number[] }} spec
 */
export async function drawLine(canvas, { labels, titles, label, values }) {
  const Chart = await loadChartJs();
  const t = theme();
  const options = baseOptions(t);
  options.interaction = { mode: 'index', intersect: false };
  options.plugins.tooltip.callbacks = {
    title: (items) => titles[items[0].dataIndex],
    label: (item) => `${label}: ${numberFormat.format(item.parsed.y)}`,
  };
  options.scales = {
    // Points sit in the middle of each week, under the columns of the chart above.
    x: t.axis({ grid: { display: false }, rest: { offset: true } }),
    y: t.axis({ ticks: { precision: 0 }, rest: { beginAtZero: true } }),
  };
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: t.token('--color-chart-bar'),
          backgroundColor: t.token('--color-chart-bar'),
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderColor: t.token('--color-surface'),
          pointBorderWidth: 2,
          tension: 0,
        },
      ],
    },
    options,
  });
}

/**
 * Horizontal bars of weeks of work per trade, the "rule of thumb" band shaded behind them,
 * and the value written at the bar tip.
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], values: (number | null)[], tips: string[], band: [number, number],
 *   tooltips: string[][], onPick?: (series: number, index: number) => void }} spec
 */
export async function drawWeekBars(canvas, { labels, values, tips, band, tooltips, onPick }) {
  const Chart = await loadChartJs();
  const t = theme();
  const plotted = values.map((v) => v ?? 0);
  const bandPlugin = {
    id: 'ruleOfThumb',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      const from = Math.max(chartArea.left, scales.x.getPixelForValue(band[0]));
      const to = Math.min(chartArea.right, scales.x.getPixelForValue(band[1]));
      if (to <= from) return;
      ctx.save();
      ctx.fillStyle = t.token('--color-neutral-bg');
      ctx.fillRect(from, chartArea.top, to - from, chartArea.bottom - chartArea.top);
      ctx.restore();
    },
  };
  const tipPlugin = {
    id: 'valueTips',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = t.token('--color-text');
      ctx.font = `600 13px ${t.font}`;
      ctx.textBaseline = 'middle';
      chart.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(tips[i], bar.x + 6, bar.y));
      ctx.restore();
    },
  };
  const options = baseOptions(t, onPick);
  options.indexAxis = 'y';
  options.layout = { padding: { right: 96 } };
  options.interaction = { mode: 'nearest', axis: 'y', intersect: false };
  options.plugins.tooltip.displayColors = false;
  options.plugins.tooltip.callbacks = { label: (item) => tooltips[item.dataIndex] };
  options.scales = {
    x: t.axis({
      rest: { beginAtZero: true, suggestedMax: band[1] + 1 },
      ticks: { callback: (v) => `${v} wk` },
    }),
    y: t.axis({
      grid: { display: false },
      ticks: { color: t.token('--color-text'), font: { family: t.font, size: 13 } },
    }),
  };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Weeks of work',
          data: plotted,
          backgroundColor: t.token('--color-chart-bar'),
          hoverBackgroundColor: t.token('--color-chart-bar-hover'),
          borderRadius: { topRight: 4, bottomRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 24,
        },
      ],
    },
    options,
    plugins: [bandPlugin, tipPlugin],
  });
}

/**
 * 100 % stacked columns: the share of each series in each bucket (planned vs reactive work).
 * Series keep their slot; 2 px surface gaps between segments; the tooltip gives the value
 * and the share.
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], titles: string[], series: { label: string, values: number[],
 *   slot: number }[], format: (value: number) => string,
 *   onPick?: (series: number, index: number) => void }} spec
 */
export async function drawShareColumns(canvas, { labels, titles, series, format, onPick }) {
  const Chart = await loadChartJs();
  const t = theme();
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const share = (value, i) => (totals[i] ? value / totals[i] : 0);
  const options = baseOptions(t, onPick);
  options.interaction = { mode: 'nearest', intersect: true };
  options.plugins.tooltip.callbacks = {
    title: (items) => titles[items[0].dataIndex],
    label: (item) => {
      const value = series[item.datasetIndex].values[item.dataIndex];
      return `${item.dataset.label}: ${format(value)} (${percentFormat.format(share(value, item.dataIndex))})`;
    },
  };
  options.scales = {
    x: t.axis({ grid: { display: false }, rest: { stacked: true } }),
    y: t.axis({
      rest: { stacked: true, min: 0, max: 1 },
      ticks: { callback: (v) => percentFormat.format(v), stepSize: 0.25 },
    }),
  };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.values.map((v, i) => share(v, i)),
        backgroundColor: t.token(`--color-chart-series-${s.slot}`),
        borderColor: t.token('--color-surface'),
        borderWidth: { top: 2 },
        borderSkipped: 'start',
        maxBarThickness: 32,
      })),
    },
    options,
  });
}

/**
 * Horizontal bars of a share (0 to 100 %) per row, the value written at the bar tip: visits
 * on time per trade. One series, one gray.
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], values: (number | null)[], tips: string[], tooltips: string[][],
 *   onPick?: (series: number, index: number) => void }} spec
 */
export async function drawRateBars(canvas, { labels, values, tips, tooltips, onPick }) {
  const Chart = await loadChartJs();
  const t = theme();
  const tipPlugin = {
    id: 'rateTips',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.fillStyle = t.token('--color-text');
      ctx.font = `600 13px ${t.font}`;
      ctx.textBaseline = 'middle';
      chart.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(tips[i], bar.x + 6, bar.y));
      ctx.restore();
    },
  };
  const options = baseOptions(t, onPick);
  options.indexAxis = 'y';
  options.layout = { padding: { right: 88 } };
  options.interaction = { mode: 'nearest', axis: 'y', intersect: false };
  options.plugins.tooltip.displayColors = false;
  options.plugins.tooltip.callbacks = { label: (item) => tooltips[item.dataIndex] };
  options.scales = {
    x: t.axis({
      rest: { min: 0, max: 1 },
      ticks: { callback: (v) => percentFormat.format(v), stepSize: 0.25 },
    }),
    y: t.axis({
      grid: { display: false },
      ticks: { color: t.token('--color-text'), font: { family: t.font, size: 13 } },
    }),
  };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'On time',
          data: values.map((v) => v ?? 0),
          backgroundColor: t.token('--color-chart-bar'),
          hoverBackgroundColor: t.token('--color-chart-bar-hover'),
          borderRadius: { topRight: 4, bottomRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 24,
        },
      ],
    },
    options,
    plugins: [tipPlugin],
  });
}

/**
 * Columns of a share per bucket (work orders finished in their scheduled week) with a second
 * share as a line (hours booked once the week had started). Both are percentages of their
 * bucket, so they share one 0–100 % axis.
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], titles: string[], columns: { label: string, values: (number | null)[] },
 *   line: { label: string, values: (number | null)[], slot: number },
 *   details: string[][], onPick?: (series: number, index: number) => void }} spec
 */
export async function drawShareWithLine(
  canvas,
  { labels, titles, columns, line, details, onPick },
) {
  const Chart = await loadChartJs();
  const t = theme();
  const options = baseOptions(t, onPick);
  options.interaction = { mode: 'index', intersect: false };
  options.plugins.tooltip.callbacks = {
    title: (items) => titles[items[0].dataIndex],
    label: (item) => {
      const value = [columns, line][item.datasetIndex].values[item.dataIndex];
      return `${item.dataset.label}: ${value === null ? 'no work scheduled' : percentFormat.format(value)}`;
    },
    afterBody: (items) => details[items[0].dataIndex],
  };
  options.scales = {
    x: t.axis({ grid: { display: false } }),
    y: t.axis({
      rest: { min: 0, max: 1 },
      ticks: { callback: (v) => percentFormat.format(v), stepSize: 0.25 },
    }),
  };
  return new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: columns.label,
          data: columns.values,
          backgroundColor: t.token('--color-chart-bar'),
          hoverBackgroundColor: t.token('--color-chart-bar-hover'),
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 32,
          order: 2,
        },
        {
          type: 'line',
          label: line.label,
          data: line.values,
          borderColor: t.token(`--color-chart-series-${line.slot}`),
          backgroundColor: t.token(`--color-chart-series-${line.slot}`),
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBorderColor: t.token('--color-surface'),
          pointBorderWidth: 2,
          spanGaps: false,
          order: 1,
        },
      ],
    },
    options,
  });
}

/**
 * Horizontal bars of one measure per row (assets, sites, trades), the value written at the
 * tip, an optional vertical reference line (1.0 for estimates).
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], values: number[], tips: string[], tooltips: string[][],
 *   tick?: (value: number) => string, reference?: number, onPick?: (s: number, i: number) => void }} spec
 */
export async function drawValueBars(
  canvas,
  { labels, values, tips, tooltips, tick, reference, onPick },
) {
  const Chart = await loadChartJs();
  const t = theme();
  const plugins = [
    {
      id: 'valueTips',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.fillStyle = t.token('--color-text');
        ctx.font = `600 13px ${t.font}`;
        ctx.textBaseline = 'middle';
        chart.getDatasetMeta(0).data.forEach((bar, i) => ctx.fillText(tips[i], bar.x + 6, bar.y));
        ctx.restore();
      },
    },
  ];
  if (reference !== undefined) {
    plugins.push({
      id: 'reference',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const x = Math.round(scales.x.getPixelForValue(reference)) + 0.5;
        ctx.save();
        ctx.strokeStyle = t.token('--color-text');
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.restore();
      },
    });
  }
  const options = baseOptions(t, onPick);
  options.indexAxis = 'y';
  options.layout = { padding: { right: 110 } };
  options.interaction = { mode: 'nearest', axis: 'y', intersect: false };
  options.plugins.tooltip.displayColors = false;
  options.plugins.tooltip.callbacks = { label: (item) => tooltips[item.dataIndex] };
  options.scales = {
    x: t.axis({
      rest: { beginAtZero: true, suggestedMax: reference ? reference * 1.5 : undefined },
      ticks: tick ? { callback: tick } : { precision: 0 },
    }),
    y: t.axis({
      grid: { display: false },
      ticks: { color: t.token('--color-text'), font: { family: t.font, size: 13 } },
    }),
  };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Value',
          data: values,
          backgroundColor: t.token('--color-chart-bar'),
          hoverBackgroundColor: t.token('--color-chart-bar-hover'),
          borderRadius: { topRight: 4, bottomRight: 4 },
          borderSkipped: 'start',
          maxBarThickness: 24,
        },
      ],
    },
    options,
    plugins,
  });
}

/**
 * Median to 90th percentile per row: a thin bar from one to the other and a dot on the
 * median (response times). Rows without values stay empty.
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], medians: (number | null)[], p90s: (number | null)[],
 *   counts: number[], format: (hours: number) => string,
 *   onPick?: (s: number, i: number) => void }} spec
 */
export async function drawRanges(canvas, { labels, medians, p90s, counts, format, onPick }) {
  const Chart = await loadChartJs();
  const t = theme();
  const options = baseOptions(t, onPick);
  options.indexAxis = 'y';
  options.interaction = { mode: 'nearest', axis: 'y', intersect: false };
  options.plugins.tooltip.displayColors = false;
  options.plugins.tooltip.filter = (item) => item.datasetIndex === 1;
  options.plugins.tooltip.callbacks = {
    label: (item) =>
      medians[item.dataIndex] === null
        ? 'None in this period'
        : [
            `Median: ${format(medians[item.dataIndex])}`,
            `90% within: ${format(p90s[item.dataIndex])}`,
            `${numberFormat.format(counts[item.dataIndex])} work orders`,
          ],
  };
  // One unit for the whole axis: whole days from two days up, hours below.
  const longest = Math.max(0, ...p90s.filter((v) => v !== null));
  const inDays = longest >= 48;
  options.scales = {
    x: t.axis({
      rest: { beginAtZero: true },
      ticks: inDays
        ? { stepSize: longest > 24 * 20 ? 24 * 7 : 24, callback: (v) => `${Math.round(v / 24)} d` }
        : { callback: (v) => `${v} h` },
    }),
    y: t.axis({
      grid: { display: false },
      ticks: { color: t.token('--color-text'), font: { family: t.font, size: 13 } },
    }),
  };
  return new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Up to the 90th percentile',
          data: medians.map((m, i) => (m === null ? null : [m, p90s[i]])),
          backgroundColor: t.token('--color-ordinal-1'),
          borderRadius: 3,
          borderSkipped: false,
          barThickness: 8,
          order: 2,
        },
        {
          type: 'scatter',
          label: 'Median',
          data: medians.map((m, i) => (m === null ? null : { x: m, y: labels[i] })),
          backgroundColor: t.token('--color-chart-bar'),
          borderColor: t.token('--color-surface'),
          borderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 7,
          order: 1,
        },
      ],
    },
    options,
  });
}

/**
 * Horizontal bars stacked by priority per person (workload): the ordinal ramp, darker for
 * more urgent; the total and hours written at the tip.
 * @param {HTMLCanvasElement} canvas
 * @param {{ labels: string[], series: { label: string, values: number[], step: number }[],
 *   tips: string[], onPick?: (series: number, index: number) => void }} spec
 */
export async function drawPriorityStack(canvas, { labels, series, tips, onPick }) {
  const Chart = await loadChartJs();
  const t = theme();
  const tipPlugin = {
    id: 'stackTips',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const last = chart.getDatasetMeta(series.length - 1).data;
      ctx.save();
      ctx.fillStyle = t.token('--color-text');
      ctx.font = `600 13px ${t.font}`;
      ctx.textBaseline = 'middle';
      chart.getDatasetMeta(0).data.forEach((bar, i) => {
        const end = Math.max(...series.map((_, s) => chart.getDatasetMeta(s).data[i].x));
        ctx.fillText(tips[i], Math.max(end, bar.base) + 6, last[i].y);
      });
      ctx.restore();
    },
  };
  const options = baseOptions(t, onPick);
  options.indexAxis = 'y';
  options.layout = { padding: { right: 150 } };
  options.interaction = { mode: 'nearest', axis: 'y', intersect: true };
  options.scales = {
    x: t.axis({ rest: { stacked: true, beginAtZero: true }, ticks: { precision: 0 } }),
    y: t.axis({
      rest: { stacked: true },
      grid: { display: false },
      ticks: { color: t.token('--color-text'), font: { family: t.font, size: 13 } },
    }),
  };
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: series.map((s) => ({
        label: s.label,
        data: s.values,
        backgroundColor: t.token(`--color-ordinal-${s.step}`),
        borderColor: t.token('--color-surface'),
        borderWidth: { right: 2 },
        borderSkipped: 'start',
        maxBarThickness: 24,
      })),
    },
    options,
    plugins: [tipPlugin],
  });
}
