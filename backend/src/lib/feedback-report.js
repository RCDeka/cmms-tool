/**
 * Markdown list of improvement ideas, grouped by screen, for planning the next updates (D40).
 * Pure function.
 * @param {object[]} items feedback items (service shape)
 * @returns {string}
 */
export function feedbackMarkdown(items) {
  if (!items.length) return '# Improvement ideas\n\nNo open idea.\n';
  const byPage = new Map();
  for (const item of items) {
    // One group per screen: `/assets/4?page=2` → `/assets/:id`.
    const page = item.page_path.split('?')[0].replace(/\/(\d+|tmp-[\w-]+)(?=\/|$)/g, '/:id');
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(item);
  }
  const lines = [`# Improvement ideas (${items.length} open)`, ''];
  for (const [page, list] of [...byPage].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${page}`, '');
    for (const item of list) {
      const who = `${item.user.first_name} ${item.user.last_name}, ${item.user_role.toLowerCase()}`;
      const width = item.viewport_width ? `, ${item.viewport_width}px wide` : '';
      lines.push(
        `- **#${item.id}** [${item.status}] ${item.created_at.slice(0, 10)} — ${who}${width}`,
        `  - Page: ${item.page_title} (\`${item.page_path}\`)`,
        ...item.message.split('\n').map((line) => `  > ${line}`),
        '',
      );
    }
  }
  return lines.join('\n');
}
