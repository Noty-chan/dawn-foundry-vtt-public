// Only the two inline markers used by the source books are interpreted.
// Escape all input first; never pass book or user text through as HTML.
export function formatRuleText(value) {
  const escaped=String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  return escaped.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/`([^`\n]+)`/g,'<code>$1</code>');
}
