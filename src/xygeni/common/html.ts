/**
 * Escapes a scanner-provided string before it is interpolated into the details webview, so a
 * `<` in an endpoint path or a finding title shows as text instead of opening a tag.
 */
export function escapeHtml(value: string | undefined): string {
  if (!value) { return ''; }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
