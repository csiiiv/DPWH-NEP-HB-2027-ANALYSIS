'use strict';
const data = JSON.parse(document.getElementById('treeData').textContent);
const summary = data.summary, $ = id => document.getElementById(id);
const nodes = new Map(data.nodes.map(n => [n.id, { ...n, search: (n.label + ' ' + n.id).normalize('NFKD').toLowerCase() }]));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const php = BudgetDisplay.amount;
let opened = new Set(['root']), selected = 'root', query = '', searchPaths = null, limit = 300, index = [];

$('cards').innerHTML = [
  ['Printed new appropriations', php(summary.total_php)],
  ['v5 allocations', summary.allocations.toLocaleString() + ' · ' + php(summary.operations_extracted_php)],
  ['Net operations gap', php(summary.operations_gap_php)],
  ['Balanced PAP controls', summary.balanced_paps + ' of ' + summary.checked_paps]
].map(([label, value]) => `<div class="card">${esc(label)}<strong>${esc(value)}</strong></div>`).join('');

// Program view: re-parent local programs and FAP program groups under one root.
data.nodes.filter(n => n.kind === 'program').forEach(p => {
  const id = 'programview:' + p.label;
  nodes.set(id, { ...p, id, parent_id: 'programs', children: p.children, kind: 'program_view',
    search: p.label.toLowerCase(), validation: p.printed_amount_php === null ? 'derived' : p.validation });
  p._viewAlias = id;
});
nodes.set('programs', { id: 'programs', label: 'DPWH FY2027 — program view', kind: 'agency_view', search: 'dpwh fy2027 program view',
  amount_php: summary.total_php, printed_amount_php: summary.total_php, children_sum_php: summary.total_php, difference_php: 0,
  validation: 'pass', children: data.nodes.filter(n => n.kind === 'program').map(p => p._viewAlias), source: {} });
function viewRoot() { return $('view').value === 'program' ? 'programs' : 'root'; }
function hasMismatchBelow(n) { return n.validation === 'mismatch' || (n.gap_descendants || 0) > 0; }
function children(n) {
    if (searchPaths) return n.children.filter(id => nodes.has(id));
    if ($('filter').value === 'mismatch') return n.children.filter(id => nodes.has(id) && hasMismatchBelow(nodes.get(id)));
    return n.children.filter(id => nodes.has(id));
}
function rebuildIndex() { index = []; function visit(id, path) { const next = path.concat(id); index.push({ id, path: next }); children(nodes.get(id)).forEach(c => visit(c, next)); } visit(viewRoot(), []); }

function statusBadge(n) {
  if (n.kind === 'project') return ['Allocation', n.evidence === 'inherited_v4b' ? 'review' : ''];
  if (n.kind === 'funding') return ['Funding partition', ''];
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
    if (f === 'mismatch') return n.validation === 'mismatch' || n.gap_descendants > 0;
    if (f === 'gap') return n.coverage_difference_php !== null && n.coverage_difference_php !== 0;
    return n.kind === 'project' && n.evidence === f;
  });
  matches.slice(0, limit).forEach(({ id, path }) => { path.forEach(p => searchPaths.add(p)); });
  $('searchStatus').textContent = `${matches.length.toLocaleString()} matching nodes · showing ${Math.min(limit, matches.length).toLocaleString()} plus ancestors`;
  $('more').hidden = matches.length <= limit;
}
function render() {
  const out = [];
  function walk(id, depth) {
    if (searchPaths && !searchPaths.has(id)) return;
    const n = nodes.get(id), cs = children(n), expand = searchPaths ? true : opened.has(id);
    const [statusText, statusClass] = statusBadge(n);
    const pages = n.source.pdf_pages?.length ? 'pp.' + n.source.pdf_pages[0] + (n.source.pdf_pages.length > 1 ? '+' : '') : n.source.pdf_page ? 'p.' + n.source.pdf_page : '';
    out.push(`<div role="treeitem" aria-level="${depth + 1}" ${cs.length ? `aria-expanded="${expand}"` : ''} aria-selected="${id === selected}" tabindex="${id === selected ? 0 : -1}" data-node="${esc(id)}" class="row ${id === selected ? 'selected' : ''}" style="padding-left:${12 + depth * 18}px">${cs.length ? `<button class="toggle" tabindex="-1" data-toggle="${esc(id)}" aria-label="${expand ? 'Collapse' : 'Expand'} ${esc(n.label)}">${expand ? '▾' : '▸'}</button>` : '<span class="toggle" aria-hidden="true">·</span>'}<button class="title" tabindex="-1" data-select="${esc(id)}">${esc(n.label)}</button><span class="badge ${statusClass}">${esc(statusText)}</span>${n.evidence === 'inherited_v4b' && n.kind === 'project' ? '<span class="badge review">v4b</span>' : ''}<span class="amount">${php(n.amount_php)}</span><span class="page">${esc(pages)}</span></div>`);
    if (expand) cs.forEach(c => walk(c, depth + 1));
  }
  walk(viewRoot(), 0);
  $('tree').innerHTML = out.join('') || '<div class="empty">No matching nodes.</div>';
  if (!searchPaths) $('searchStatus').textContent = 'Arrow keys navigate and expand. Enter selects a row.';
  const rows = [...$('tree').querySelectorAll('[data-node]')];
  if (!rows.some(r => r.tabIndex === 0) && rows[0]) rows[0].tabIndex = 0;
}
function details(id) {
  const n = nodes.get(id); selected = id;
  const fields = [
    ['Node', id], ['Type', n.kind], ['Amount', php(n.amount_php)],
    ['Printed control', n.printed_amount_php == null ? 'No printed control (derived)' : php(n.printed_amount_php)],
    ['Additive child total', n.children_sum_php == null ? 'Terminal allocation' : php(n.children_sum_php)],
    ['Difference', n.difference_php == null ? 'Not applicable' : (n.difference_php > 0 ? '+' : '') + n.difference_php.toLocaleString()],
    ['Extraction coverage', n.coverage_difference_php == null ? 'Not applicable' : (n.coverage_difference_php > 0 ? '+' : '') + n.coverage_difference_php.toLocaleString() + ' vs control'],
    ['Arithmetic validation', n.validation]
  ];
  if (n.gap_descendants != null && n.gap_descendants > 0) fields.push(['Mismatched controls below', n.gap_descendants]);
  if (n.kind === 'project') {
    fields.push(['Evidence', n.evidence === 'native_section' ? 'Native-section replacement (printed-control balanced)' : 'Inherited v4b (amounts/PAP attribution provisional)']);
    if (n.extraction_status) fields.push(['v5 extraction status', n.extraction_status]);
    fields.push(['Retained PAP', n.retained_pap], ['Retained program', n.retained_program]);
  }
  if (n.evidence_counts && Object.keys(n.evidence_counts).length) fields.push(['Allocation evidence below', `native-section ${n.evidence_counts.native_section || 0} · inherited v4b ${n.evidence_counts.inherited_v4b || 0}`]);
  if (n.canonical_nep_pap_id) fields.push(['Canonical NEP PAP', n.canonical_nep_pap_id]);
  if (n.nep_printed_php != null) fields.push(['NEP printed control', php(n.nep_printed_php)]);
  if (n.delta_vs_nep_php != null) fields.push(['Delta vs NEP (PAP)', (n.delta_vs_nep_php > 0 ? '+' : '') + n.delta_vs_nep_php.toLocaleString()]);
  if (n.nep_local_control_php != null) fields.push(['NEP local control', php(n.nep_local_control_php)]);
  if (n.delta_vs_nep_local_php != null) fields.push(['Delta vs NEP (program)', (n.delta_vs_nep_local_php > 0 ? '+' : '') + n.delta_vs_nep_local_php.toLocaleString()]);
  if (n.coverage_note) fields.push(['Note', n.coverage_note]);
  const pdf = n.source.pdf ? `<p><a href="${esc(n.source.pdf)}#page=${esc(n.source.pdf_page ?? n.source.pdf_pages?.[0])}" target="_blank" rel="noopener">Open source PDF${n.source.pdf_page ? ', page ' + n.source.pdf_page : n.source.pdf_pages?.length ? ', page ' + n.source.pdf_pages[0] : ''}</a></p>` : '';
  $('details').innerHTML = `<h2>${esc(n.label)}</h2><dl>${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${pdf}<div class="note">Printed controls come from the retained House PDFs; allocation evidence reflects v5 provenance. Balanced arithmetic does not certify titles, regions, or attribution. Unmatched rows are never confirmed insertions or removals.</div>`;
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
$('view').addEventListener('change', () => { opened = new Set([viewRoot()]); rebuildIndex(); findHits(); details(viewRoot()); });
$('filter').addEventListener('change', () => { limit = 300; rebuildIndex(); findHits(); render(); });
let timer; $('search').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { query = e.target.value.normalize('NFKD').toLowerCase().trim(); limit = 300; findHits(); render(); }, 180); });
$('more').addEventListener('click', () => { limit += 300; findHits(); render(); });
$('collapse').addEventListener('click', () => { query = ''; $('search').value = ''; $('filter').value = ''; searchPaths = null; $('more').hidden = true; opened = new Set([viewRoot()]); rebuildIndex(); render(); });
$('download').addEventListener('click', () => { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'hb_2027_tree.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
rebuildIndex(); details('root');
