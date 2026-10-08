'use strict';
const data = JSON.parse(document.getElementById('treeData').textContent);
const summary = data.summary, $ = id => document.getElementById(id);
const nodes = new Map(data.nodes.map(n => [n.id, { ...n, search: (n.label + ' ' + (n.source_row ?? '') + ' ' + (n.source_id ?? '')).normalize('NFKD').toLowerCase() }]));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const php = BudgetDisplay.amount;
let opened = new Set(['n1']), selected = 'n1', query = '', searchPaths = null, limit = 300, index = [];

$('cards').innerHTML = [
  ['Printed new appropriations', php(summary.total_php)],
  ['Balanced printed controls', summary.balanced_controls.toLocaleString() + ' · ' + summary.mismatched_paps.length + ' unresolved PAPs'],
  ['Allocations', summary.allocations.toLocaleString() + ' · ' + php(data.nodes.filter(n => n.kind === 'project').reduce((a, n) => a + n.amount_php, 0))],
  ['Attached subtotals', summary.attached_office_subtotals + ' offices · ' + summary.attached_region_subtotals + ' regions']
].map(([label, value]) => `<div class="card">${esc(label)}<strong>${esc(value)}</strong></div>`).join('');

function children(n) {
    // During an active search/filter, visibility is governed by searchPaths;
    // otherwise the mismatch filter prunes to mismatch-relevant subtrees.
    if (searchPaths) return n.children.filter(id => nodes.has(id));
    if ($('filter').value === 'mismatch') return n.children.filter(id => {
        const c = nodes.get(id);
        return nodes.has(id) && (c.validation === 'mismatch' || hasMismatchBelow(c));
    });
    return n.children.filter(id => nodes.has(id));
}
function hasMismatchBelow(n) {
    if (n.validation === 'mismatch') return true;
    return n.children.some(c => nodes.has(c) && hasMismatchBelow(nodes.get(c)));
}
function rebuildIndex() { index = []; function visit(id, path) { const next = path.concat(id); index.push({ id, path: next }); children(nodes.get(id)).forEach(c => visit(c, next)); } visit('n1', []); }

function badge(n) {
  if (n.kind === 'project') return ['Allocation', n.evidence === 'inherited_v4b' ? 'review' : ''];
  if (n.kind === 'funding') return ['Funding', ''];
  const v = n.validation;
  if (v === 'balanced') return ['Balances', ''];
  if (v === 'mismatch') return ['Mismatch', 'gap'];
  if (v === 'control_only') return ['Control only', 'control'];
  if (v === 'derived') return ['Derived', 'derived'];
  return [v, ''];
}
function findHits() {
  searchPaths = null; $('more').hidden = true;
  if (!query && !$('filter').value) return;
  searchPaths = new Set(); const f = $('filter').value;
  const matches = index.filter(({ id }) => {
    const n = nodes.get(id);
    if (!(!query || n.search.includes(query))) return false;
    if (!f) return true;
    if (f === 'mismatch') return n.validation === 'mismatch' || (n.kind !== 'project' && n.kind !== 'funding' && n.children.some(c => nodes.get(c)?.validation === 'mismatch'));
    if (f === 'printed') return n.printed_amount_php != null && n.kind !== 'project';
    if (f === 'inherited_v4b') return n.kind === 'project' && n.evidence === 'inherited_v4b';
    if (f === 'native_section') return n.kind === 'project' && n.evidence === 'native_section';
    return true;
  });
  matches.slice(0, limit).forEach(({ id, path }) => path.forEach(p => searchPaths.add(p)));
  $('searchStatus').textContent = `${matches.length.toLocaleString()} matching nodes · showing ${Math.min(limit, matches.length).toLocaleString()} plus ancestors`;
  $('more').hidden = matches.length <= limit;
}
function render() {
  const out = [];
  function walk(id, depth) {
    if (searchPaths && !searchPaths.has(id)) return;
    const n = nodes.get(id), cs = children(n), expand = searchPaths ? true : opened.has(id);
    const [text, cls] = badge(n);
    const ref = n.source_row != null ? 'r.' + n.source_row : n.pdf_pages?.length ? 'pp.' + n.pdf_pages[0] + '+' : n.pdf_page ? 'p.' + n.pdf_page : '';
    out.push(`<div role="treeitem" aria-level="${depth + 1}" ${cs.length ? `aria-expanded="${expand}"` : ''} aria-selected="${id === selected}" tabindex="${id === selected ? 0 : -1}" data-node="${esc(id)}" class="row ${id === selected ? 'selected' : ''}" style="padding-left:${12 + depth * 18}px">${cs.length ? `<button class="toggle" tabindex="-1" data-toggle="${esc(id)}" aria-label="${expand ? 'Collapse' : 'Expand'} ${esc(n.label)}">${expand ? '▾' : '▸'}</button>` : '<span class="toggle" aria-hidden="true">·</span>'}<button class="title" tabindex="-1" data-select="${esc(id)}">${esc(n.label)}</button><span class="badge ${cls}">${esc(text)}</span>${n.kind === 'project' && n.evidence === 'inherited_v4b' ? '<span class="badge review">v4b</span>' : ''}<span class="amount">${php(n.amount_php)}</span><span class="page">${esc(ref)}</span></div>`);
    if (expand) cs.forEach(c => walk(c, depth + 1));
  }
  walk('n1', 0);
  $('tree').innerHTML = out.join('') || '<div class="empty">No matching nodes.</div>';
  if (!searchPaths) $('searchStatus').textContent = 'Arrow keys navigate and expand. Enter selects a row. Row/page references point into the retained OCR tables.';
  const rows = [...$('tree').querySelectorAll('[data-node]')];
  if (!rows.some(r => r.tabIndex === 0) && rows[0]) rows[0].tabIndex = 0;
}
function details(id) {
  const n = nodes.get(id); selected = id;
  const fields = [
    ['Node', id], ['Type', n.kind.replace('_', ' ')], ['Amount', php(n.amount_php)],
    ['Printed control', n.printed_amount_php == null ? 'None — derived grouping' : php(n.printed_amount_php)],
    ['Children total', n.children_sum_php == null ? 'Terminal allocation' : php(n.children_sum_php)],
    ['Difference', n.difference_php == null ? 'Not applicable' : (n.difference_php > 0 ? '+' : '') + n.difference_php.toLocaleString()],
    ['Validation', n.validation]
  ];
  if (n.source_row != null) fields.push(['Source row (OCR table)', n.source_row]);
  if (n.pdf_page) fields.push(['PDF page', n.pdf_page]);
  if (n.pdf_pages?.length) fields.push(['PDF pages', n.pdf_pages.join(', ')]);
  if (n.source_id) fields.push(['v5 source ID', n.source_id]);
  if (n.basis) fields.push(['Basis', n.basis]);
  if (n.derived_reason) fields.push(['Derived basis', n.derived_reason]);
  if (n.kind === 'project') {
    fields.push(['Evidence', n.evidence === 'native_section' ? 'Native-section replacement (printed-control balanced)' : 'Inherited v4b (amounts/attribution provisional)']);
    if (n.extraction_status) fields.push(['v5 extraction status', n.extraction_status]);
  }
  if (n.canonical_nep_pap_id) fields.push(['Canonical NEP PAP', n.canonical_nep_pap_id]);
  if (n.nep_printed_php != null) fields.push(['NEP printed control', php(n.nep_printed_php)]);
  if (n.delta_vs_nep_php != null) fields.push(['Delta vs NEP', (n.delta_vs_nep_php > 0 ? '+' : '') + n.delta_vs_nep_php.toLocaleString()]);
  const page = n.pdf_page ?? n.pdf_pages?.[0];
  const link = page ? `<p><a href="../HB_BUDGET/3%20-%20HB%2010858%20VOL%20IC.pdf#page=${page}" target="_blank" rel="noopener">Open VOL I-C PDF, page ${page}</a></p>` : '';
  $('details').innerHTML = `<h2>${esc(n.label)}</h2><dl>${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${link}<div class="note">Printed controls come from the document's own rows; derived groupings are explicit. Balanced arithmetic does not certify titles, attribution, or completeness. The four unresolved PAPs and inherited v4b allocations remain open review work.</div>`;
  render();
}
function focusNode(id) { const row = [...$('tree').querySelectorAll('[data-node]')].find(r => r.dataset.node === id); if (row) { $('tree').querySelectorAll('[data-node]').forEach(r => r.tabIndex = -1); row.tabIndex = 0; row.focus(); } }
$('tree').addEventListener('click', e => { const button = e.target.closest('button'); if (!button) return; const id = button.dataset.toggle || button.dataset.select; if (button.dataset.toggle) { opened.has(id) ? opened.delete(id) : opened.add(id); render(); } else details(id); focusNode(id); });
$('tree').addEventListener('keydown', e => {
  const row = e.target.closest('[data-node]'); if (!row) return;
  const id = row.dataset.node, cs = children(nodes.get(id)), rows = [...$('tree').querySelectorAll('[data-node]')], i = rows.indexOf(row); let target;
  if (e.key === 'ArrowDown') target = rows[i + 1]?.dataset.node;
  else if (e.key === 'ArrowUp') target = rows[i - 1]?.dataset.node;
  else if (e.key === 'Home') target = rows[0]?.dataset.node;
  else if (e.key === 'End') target = rows.at(-1)?.dataset.node;
  else if (e.key === 'ArrowRight') { if (cs.length && !opened.has(id) && !searchPaths) { opened.add(id); render(); } else target = cs[0]; }
  else if (e.key === 'ArrowLeft') { if (opened.has(id) && !searchPaths) { opened.delete(id); render(); } else { const entry = index.find(r => r.id === id); target = entry?.path.at(-2); } }
  else if (['Enter', ' '].includes(e.key)) details(id);
  else return;
  e.preventDefault(); focusNode(target || id);
});
$('filter').addEventListener('change', () => { limit = 300; rebuildIndex(); findHits(); render(); });
let timer; $('search').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { query = e.target.value.normalize('NFKD').toLowerCase().trim(); limit = 300; findHits(); render(); }, 180); });
$('more').addEventListener('click', () => { limit += 300; findHits(); render(); });
$('collapse').addEventListener('click', () => { query = ''; $('search').value = ''; $('filter').value = ''; searchPaths = null; $('more').hidden = true; opened = new Set(['n1']); rebuildIndex(); render(); });
$('download').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'hb_2027_source_tree.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
rebuildIndex(); details('n1');
