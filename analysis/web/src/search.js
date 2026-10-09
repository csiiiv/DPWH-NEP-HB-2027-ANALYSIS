// Match words across punctuation and order, preserving numbers and source IDs.
export function searchTokens(value) {
  return String(value ?? '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/\bbarangays\b/g, 'barangay').match(/[a-z0-9]+/g) ?? [];
}
export function matchesSearch(value, query) {
  const text = searchTokens(value).join(' ');
  return searchTokens(query).every(token => text.includes(token));
}
