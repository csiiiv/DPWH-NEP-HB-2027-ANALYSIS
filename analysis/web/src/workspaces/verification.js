/* Independent hierarchy exploration; no cross-source matching or budget deltas. */
export function mountVerification(document, { onSourceSelection, initialNode, reviewMode, matchMedia, downloadUrl }, D) {
  const nodes = new Map(D.nodes.map(n => [n.id, n]));
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = amount => '₱' + (amount / D.scale).toLocaleString('en-PH', {minimumFractionDigits: D.scale === 100 ? 2 : 0, maximumFractionDigits: 2});
  const compact = amount => {
    const value = amount / D.scale;
    return '₱' + (value / (Math.abs(value) >= 1e9 ? 1e9 : 1e6)).toFixed(3) + (Math.abs(value) >= 1e9 ? 'B' : 'M');
  };
  const statusLabel = n => ({balanced:'Balanced',derived:'Derived',leaf:'Source leaf',reference:'Reference',mismatch:'Mismatch'}[n.status]);
  const expanded = new Set([D.root]);
  let selected = D.root, limit = 150, reviewBranch = null;
  const review = n => ['native_text_review','nearby_alignment_candidate','native_row_ambiguity','not_checked'].includes(n.evidence);
  const reviewLabels = {row_identity:'Check row identity',amount_disagreement:'Amount text differs',alignment:'Check row alignment',summary_check:'Check summary control',derived_context:'No printed control'};
  function evidenceLabel(n) {
    if (n.review_kind) return reviewLabels[n.review_kind];
    if (n.evidence === 'within_bbox_agreement') return 'Column text agrees';
    if (n.evidence === 'native_text') return 'Native text';
    return D.key === 'dpwh_nep_api' ? n.kind === 'project' ? 'API record checked' : 'Derived API group' : 'Source context';
  }
  $('scope').textContent = D.scope;
  $('grain').textContent = D.grain;
  $('evidenceStatus').textContent = 'Source evidence: ' + D.evidence_status;
  $('coverageStatus').textContent = 'Coverage: ' + D.coverage_status;
  const projectDetail = D.project_detail_summary;
  if (projectDetail) {
    $('projectDetail').hidden = false;
    $('projectDetailSummary').textContent = `${projectDetail.named_project_leaves.toLocaleString()} named-project leaves + ${projectDetail.fap_projects.toLocaleString()} FAP totals · ${money(projectDetail.additive_leaf_total_php)} MOOE + CO (excludes PS) · ${projectDetail.recursive_checks.toLocaleString()} internal checks · ${projectDetail.shared_controls_with_ib.toLocaleString()} independent I-B checks.`;
  }

  $('reviewSummary').textContent = D.review_summary.needs_source_check
    ? `${D.review_summary.needs_source_check.toLocaleString()} nodes need a source check`
    : 'No row-level source flags in this viewer; scope review remains separate';
  $('startReview').hidden = !D.review_summary.needs_source_check;
  $('cards').innerHTML = [
    ['Source-wide retained total', compact(D.audit.total)],
    [D.key === 'dpwh_nep_api' ? 'NEP API projects' : 'Terminal allocation leaves', D.audit.leaf_count.toLocaleString()],
    ['Direct + recursive checks', D.audit.internal_checks.toLocaleString()],
    ['Failed arithmetic checks', D.audit.failures.length.toLocaleString()]
  ].map(([label,value]) => `<div class="card"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('');
  const expenseClasses = D.expense_breakdown || [];
  let expenseRoot = D.root;
  $('expenseBreakdown').innerHTML = expenseClasses.length
    ? `<div class="tablewrap"><table><thead><tr><th>Expense class</th><th class="num">Amount (PHP)</th></tr></thead><tbody>${expenseClasses.map(c=>`<tr><th scope="row">${esc(c.key.toUpperCase())} · ${esc(c.label)}</th><td class="num">${esc(money(c.amount_php))}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total = PS + MOOE + CO</th><td class="num">${esc(money(D.audit.total))}</td></tr></tfoot></table></div><p class="muted">The total includes these three classes once. ${D.key === 'nep' ? 'Choose an expense class to inspect its own hierarchy and source checks.' : 'Each selected House branch shows its PS, MOOE, CO, and total columns in the evidence panel.'}</p>`
    : '<p class="muted">PS / MOOE / CO breakdown is unavailable in the retained API project listing. Its project amounts remain separate from the printed expenditure-class controls.</p>';
  if (!expenseClasses.length) $('expenseDisclosure').innerHTML = 'Expenditure breakdown <span class="muted">Unavailable in this listing</span>';
  $('expenseScopeControl').hidden = D.key !== 'nep';
  if (D.key === 'nep') {
    $('expenseScopeControl').hidden = false;
    $('expenseScope').innerHTML = '<option value="all">Total · all classes</option>' + expenseClasses.map(c=>`<option value="${esc(c.node_id)}">${esc(c.key.toUpperCase())} · ${esc(c.label)}</option>`).join('');
  }
  $('gaps').innerHTML = D.gaps.map(g => `<li>${esc(g)}</li>`).join('');
  $('downloads').innerHTML = D.downloads.filter(d => !d.href.endsWith('source_review_evidence.json')).map(d => `<a href="${esc(downloadUrl(d.href))}">${esc(d.label)}</a>`).join(' · ');

  function matchesReview(n, query, filter) {
    return pathOf(n).some(p=>p.id === expenseRoot) && (!query || (n.label+' '+n.id).toLowerCase().includes(query)) &&
      (filter === 'all' || filter === 'review' && review(n) || filter === 'mismatch' && n.status === 'mismatch' || filter === 'derived' && n.status === 'derived' ||
       filter === 'branch_review' && n.source_checks_below > 0 || filter === n.review_kind);
  }
  function queueNodes() {
    const query = $('search').value.trim().toLowerCase(), filter = $('filter').value;
    const priority = {amount_disagreement:0, alignment:1, row_identity:2, summary_check:3, derived_context:4};
    return D.nodes.filter(n => (n.review_actionable || filter === 'derived_context' && n.review_kind === 'derived_context' || filter === 'review' && review(n)) &&
      matchesReview(n,query,filter) && (!reviewBranch || pathOf(n).some(p => p.id === reviewBranch)))
      .sort((a,b) => priority[a.review_kind]-priority[b.review_kind] || (a.source?.pdf_page||0)-(b.source?.pdf_page||0) || a.id.localeCompare(b.id, 'en', {numeric:true}));
  }
  function pdfReference(n, label = `PDF page ${n.source?.pdf_page}`) {
    const page = n.source?.pdf_page;
    if (!Number.isInteger(page) || page < 1) return '';
    if (!['hb', 'nep'].includes(D.key)) return esc(label);
    return `<button type="button" class="source-page-button" data-preview="${esc(n.id)}" aria-label="${esc('Preview '+label)}">${esc(label)}</button>`;
  }
  function sourcePageReference(n) {
    const reference = pdfReference(n);
    return reference ? `<span class="source-reference">${reference}</span>` : '';
  }
  function rowColumnSummary(n) {
    const c = n.source_row_columns_php;
    if (!c || c.total == null) return '';
    return `<span class="row-column-summary">Printed row: ${['ps','mooe','co','total'].map(k=>`<span title="${esc(c[k] == null ? 'Blank / not captured; not a verified zero' : money(c[k]))}">${esc(k.toUpperCase())} ${c[k] == null ? '—' : esc(compact(c[k]))}</span>`).join(' · ')}</span>`;
  }
  function row(n, depth) {
    const children = n.children.length;
    const context = $('mode').value === 'queue' ? `<span class="queue-context">${pathOf(n).slice(-3,-1).map(p=>`<button type="button" class="path-link" data-navigate="${esc(p.id)}">${esc(p.label)}</button>`).join(' <span aria-hidden="true">→</span> ')}</span>` : '';
    return `<div class="row ${n.id === selected ? 'selected' : ''}" role="treeitem" tabindex="0" data-node="${esc(n.id)}" aria-level="${depth+1}" ${children ? `aria-expanded="${expanded.has(n.id)}"` : ''} aria-selected="${n.id === selected}"><div class="name" style="--indent:${depth*14}px"><button type="button" class="toggle" data-expand="${esc(n.id)}" ${children ? '' : 'disabled'} aria-label="${expanded.has(n.id) ? 'Collapse' : 'Expand'} ${esc(n.label)}">${children ? expanded.has(n.id) ? '▾' : '▸' : '·'}</button><div class="node-label"><button type="button" class="select" data-select="${esc(n.id)}">${esc(n.label)}</button>${context}${n.amount_basis ? `<span class="amount-basis">${esc(n.amount_basis.toUpperCase())} ${n.amount_basis === 'total' ? 'total' : 'allocation in this branch'}</span>` : ''}${rowColumnSummary(n)}${sourcePageReference(n)}</div></div><span class="num" title="${esc(money(n.amount))}">${esc($('exactAmounts').checked ? money(n.amount) : compact(n.amount))}</span><span class="badge ${esc(n.status)}">${esc(statusLabel(n))}</span><span class="evidence-cell"><span class="badge ${n.review_actionable ? 'review' : 'derived'}">${esc(evidenceLabel(n))}</span>${n.source_checks_below ? `<button type="button" data-review-branch="${esc(n.id)}">${n.source_checks_below.toLocaleString()} checks below</button>` : ''}</span></div>`;
  }
  function render() {
    const pending = nodes.get(expenseRoot).source_checks_in_branch;
    $('reviewSummary').textContent = pending
      ? `${pending.toLocaleString()} nodes need a source check${expenseRoot === D.root ? '' : ' · ' + nodes.get(expenseRoot).label}`
      : 'No row-level source flags in this scope; scope review remains separate';
    $('startReview').hidden = !pending;
    const query = $('search').value.trim().toLowerCase(), filter = $('filter').value;
    let html = '', count = 0;
    if (query || filter !== 'all' || $('mode').value === 'queue') {
      const found = $('mode').value === 'queue' ? queueNodes() : D.nodes.filter(n => matchesReview(n, query, filter));
      count = found.length;
      html = found.slice(0, limit).map(n => row(n, 0)).join('');
      $('more').hidden = count <= limit;
      $('searchStatus').textContent = `${count.toLocaleString()} matching nodes · showing ${Math.min(count,limit).toLocaleString()}. Select a result to inspect its full parent path.`;
      if ($('mode').value === 'queue') $('searchStatus').textContent += ` Review queue${reviewBranch ? ' · branch: '+nodes.get(reviewBranch).label : ''}. Flags are pending checks, not confirmed budget errors.`;
    } else {
      function visit(id, depth) {
        const n = nodes.get(id); count++;
        html += row(n, depth);
        if (expanded.has(id)) n.children.forEach(c => visit(c, depth+1));
      }
      visit(expenseRoot, 0); $('more').hidden = true;
      $('searchStatus').textContent = `${count.toLocaleString()} visible hierarchy rows · ${expenseRoot === D.root ? 'full source hierarchy' : nodes.get(expenseRoot).label}. Expand a branch to inspect its child rollups.`;
    }
    $('tree').innerHTML = html || '<div class="foot"><h2>No matching items</h2><p>Try a shorter label or source ID, or reset the view to search the full hierarchy.</p><button type="button" data-reset="true">Reset view</button></div>';
    const scoped = D.nodes.filter(n=>pathOf(n).some(p=>p.id === expenseRoot) && (!reviewBranch || pathOf(n).some(p=>p.id === reviewBranch)));
    const counts = {};
    scoped.forEach(n=>{if(n.review_actionable)counts[n.review_kind]=(counts[n.review_kind]||0)+1;});
    $('reviewChips').innerHTML = Object.entries(counts).map(([kind,count])=>`<button type="button" data-review-kind="${esc(kind)}" aria-pressed="${$('mode').value === 'queue' && $('filter').value === kind}">${esc(reviewLabels[kind])} · ${count.toLocaleString()}</button>`).join('');
  }
  function pathOf(n) {
    const path = [];
    while (n) {path.unshift(n); n = nodes.get(n.parent);}
    return path;
  }
  function reviewPanel(n) {
    if (!n.review_kind) return '';
    const reasons = {
      row_identity:'The extraction area contains multiple amount lines. A matching number somewhere in that area does not establish which printed row belongs to this item.',
      amount_disagreement:'The retained extraction amount was not found in the PDF text inside its row area. The text layer may be noisy or the extraction area may be wrong.',
      alignment:'The retained amount appears nearby, outside the extraction row area. Check whether the amount belongs to this row or an adjacent row.',
      summary_check:'This summary control was not included in the row-level text audit. Its arithmetic balances; inspect the summary page to check the printed control.',
      derived_context:'This grouping has no printed control of its own. Its amount is the sum of its children; this is context, not an amount error.'
    };
    const instructions = {
      row_identity:'Match the item label to its exact amount line and expense column in the PDF preview. Tighten the row area if necessary; do not accept a neighbouring row merely because its number matches.',
      amount_disagreement:'Read the source row in the PDF preview. Check its label and amount column, then check the surrounding rows. Keep the extraction or propose a correction only after reading the PDF page.',
      alignment:'Find the retained amount in the surrounding rows. Confirm the matching label and column before deciding whether the row area needs correcting.',
      summary_check:'Read the relevant total on the summary page. Confirm its expense column and scope; do not treat a derived grouping as a printed control.',
      derived_context:'Inspect the child rollup below. No standalone printed amount is expected for this grouping.'
    };
    const r = n.review_evidence;
    const candidateRows = (candidates, where) => candidates.map(c => `<tr><td>${esc(where)}</td><td>${esc(c.text)}</td><td class="num">${esc(money(c.amount_php))}</td><td class="num">${esc(money(c.amount_php-n.amount))}</td></tr>`).join('');
    let candidates = '';
    if (r) {
      const nearby = r.nearby_candidates.filter(c => !r.within_bbox_candidates.some(x => x.y === c.y && x.amount_php === c.amount_php && x.text === c.text));
      const rows = candidateRows(r.within_bbox_candidates,'Inside row area')+candidateRows(nearby,'Nearby row');
      candidates = `<h4>Retained extraction: ${esc(money(n.amount))}</h4><div class="tablewrap"><table><thead><tr><th>Location</th><th>Raw PDF text</th><th>Parsed candidate</th><th>Candidate − retained</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No comparable amount token found.</td></tr>'}</tbody></table></div><p class="candidate-note">Candidates come from the PDF text layer and are unverified. These differences are evidence for review; they are not budget changes or a confirmed missing amount.</p>`;
    }
    const list = queueNodes(), index = list.findIndex(x=>x.id === n.id);
    const nav = $('mode').value === 'queue' && index >= 0 ? `<div class="review-nav"><button type="button" data-select="${esc(list[index-1]?.id||'')}" ${index===0?'disabled':''}>Previous flag</button><span>${index+1} of ${list.length.toLocaleString()}</span><button type="button" data-select="${esc(list[index+1]?.id||'')}" ${index===list.length-1?'disabled':''}>Next flag</button></div>` : '';
    return `<section class="review-panel"><h3>${esc(reviewLabels[n.review_kind])}</h3><p>${esc(reasons[n.review_kind])}</p>${nav}${candidates}<p class="instruction"><strong>Next check:</strong> ${esc(instructions[n.review_kind])}</p></section>`;
  }
  function sourceRowColumns(n) {
    const c = n.source_row_columns_php;
    if (!c) return '';
    const complete = c.total != null;
    return `<section class="source-row-columns"><h3>${complete ? 'Printed table row · expenditure columns' : 'Printed class-specific amount'}</h3><div class="tablewrap"><table><thead><tr>${['PS','MOOE','CO','Total'].map(k=>`<th>${k}</th>`).join('')}</tr></thead><tbody><tr>${['ps','mooe','co','total'].map(k=>`<td class="num">${c[k] == null ? '—' : esc(money(c[k]))}</td>`).join('')}</tr></tbody></table></div><p class="candidate-note">${complete ? 'This branch adds only the PS allocation. The full printed row total is shown as context and is not added to the PS hierarchy.' : 'This PAP table prints an amount for '+esc(n.amount_basis.toUpperCase())+' only. A combined PS/MOOE/CO total for this item is not established by this row.'} A dash means blank or not captured; it is not a verified zero. These are retained extractions, pending source/row verification.</p></section>`;
  }
  function details(id) {
    const changed = selected !== id;
    selected = id; const n = nodes.get(id);
    const path = pathOf(n);
    let evidence = n.evidence ? n.evidence.replaceAll('_',' ') : 'Derived source grouping';
    const source = n.source || {};
    onSourceSelection?.(n);
    if (D.key === 'dpwh_nep_api') evidence = n.kind === 'project' ? 'Retained NEP API project record; amount converted from thousands of PHP' : 'Derived grouping of retained NEP API projects';
    let sourceLink = '';
    if (source.pdf_page) sourceLink = pdfReference(n, `${D.key === 'hb' ? 'House GAB' : 'DBM NEP'} PDF page ${source.pdf_page}`);
    else if (source.project_code) sourceLink = `${esc(source.project_code)} · combined snapshot row ${source.source_row} · API ID ${source.project_id}`;
    const childNodes = n.children.map(c => nodes.get(c)).filter(c => c.additive);
    let running = 0;
    const progressive = childNodes.map(c => {
      running += c.recursive;
      return `<tr><td><button type="button" data-select="${esc(c.id)}">${esc(c.label)}</button></td><td class="num">${esc(money(c.recursive))}</td><td class="num">${esc(money(running))}</td><td class="num">${esc(money(n.amount-running))}</td></tr>`;
    });
    $('details').innerHTML = `<h2>${esc(n.label)}</h2><nav class="node-path" aria-label="Entity path">${path.map(p => `<button type="button" class="path-link" data-navigate="${esc(p.id)}" ${p.id === n.id ? 'aria-current="location"' : ''}>${esc(p.label)}</button>`).join(' <span aria-hidden="true">→</span> ')}</nav>${sourceRowColumns(n)}${reviewPanel(n)}<span class="badge ${esc(n.status)}">Arithmetic: ${esc(statusLabel(n))}</span>${n.source_checks_below ? `<p><button type="button" data-review-branch="${esc(n.id)}">Review ${n.source_checks_below.toLocaleString()} source checks below this branch</button></p>` : ''}<dl><dt>${n.amount_basis ? 'Amount used in this branch ('+esc(n.amount_basis.toUpperCase())+')' : n.printed == null ? 'Derived retained amount' : 'Retained printed-control extraction'}</dt><dd>${esc(money(n.amount))}</dd><dt>Immediate additive child sum</dt><dd>${n.direct == null ? 'Terminal source allocation' : esc(money(n.direct))}</dd><dt>Recursive terminal-leaf sum</dt><dd>${esc(money(n.recursive))}</dd><dt>Leaf sum minus retained amount</dt><dd>${n.additive ? esc(money(n.recursive-n.amount)) : 'Excluded from addition'}</dd><dt>Leaf allocations / projects below</dt><dd>${n.leaf_count.toLocaleString()}</dd><dt>Source evidence</dt><dd>${esc(evidence)}</dd><dt>Source reference</dt><dd>${sourceLink || esc(n.id)}</dd></dl>` +
      (n.columns_php ? `<h3>Printed expenditure columns (PHP)</h3><dl>${Object.entries(n.columns_php).map(([k,v]) => `<dt>${esc(k.toUpperCase())}</dt><dd>${esc(money(v))}</dd>`).join('')}</dl>` : '') +
      (progressive.length ? `<h3>Progressive child rollup</h3><p>Children are in hierarchy order. The cumulative sum uses recursive leaves. Final remaining amount: <strong>${esc(money(n.amount-running))}</strong>.</p><details><summary>Inspect ${progressive.length.toLocaleString()} additive children</summary><div class="tablewrap"><table><thead><tr><th>Child</th><th>Leaf sum</th><th>Cumulative</th><th>Remaining</th></tr></thead><tbody>${progressive.join('')}</tbody></table></div></details>` : '');
    if (changed) $('details').scrollTop = 0;
  }

  function showPanel(panel, scroll=false) {
    $('workspace').className = 'workspace '+(panel === 'evidence' ? 'evidence-active' : 'tree-active');
    $('treeView').ariaPressed = String(panel !== 'evidence');
    $('evidenceView').ariaPressed = String(panel === 'evidence');
    if (scroll && matchMedia?.('(max-width:1200px)')?.matches) $('workspace').scrollIntoView({block:'start'});
  }
  function resetView() {
    expenseRoot = D.root;$('expenseScope').value = 'all';
    reviewBranch = null;limit = 150;
    $('mode').value = 'tree';$('filter').value = 'all';$('search').value = '';
    $('clearReviewBranch').hidden = true;
    expanded.clear();expanded.add(D.root);details(D.root);render();showPanel('tree');
  }
  function navigateTo(id) {
    const n = nodes.get(id);if (!n) return;
    const path = pathOf(n);
    if (!path.some(p=>p.id === expenseRoot)) {
      expenseRoot = D.root;$('expenseScope').value = 'all';
    }
    reviewBranch = null;limit = 150;
    $('mode').value = 'tree';$('filter').value = 'all';$('search').value = '';
    $('clearReviewBranch').hidden = true;
    path.forEach(p=>{if(p.children.length)expanded.add(p.id);});
    details(id);render();showPanel('tree',true);
    const row = $('tree').querySelector('.row[aria-selected="true"]');
    row?.scrollIntoView({block:'nearest',inline:'nearest'});
    row?.focus({preventScroll:true});
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('button');if (!button) return;
    if (button.dataset.preview) {
      const n = nodes.get(button.dataset.preview);
      if (n) { details(n.id);render();onSourceSelection?.(n, { reveal: true }); }
      return;
    }
    if (button.dataset.reset) {resetView();return;}
    if (button.dataset.reviewKind) {
      const branch=reviewBranch;startQueue(branch);$('filter').value=button.dataset.reviewKind;refreshFiltered();return;
    }
    if (button.dataset.navigate) {navigateTo(button.dataset.navigate);return;}
    if (button.dataset.expand) {const id = button.dataset.expand;expanded.has(id) ? expanded.delete(id) : expanded.add(id);render();}
    if (button.dataset.select) {details(button.dataset.select);render();showPanel('evidence',true);}
    if (button.dataset.reviewBranch) startQueue(button.dataset.reviewBranch);
  });

  function startQueue(branch=null) {
    reviewBranch=branch;$('mode').value='queue';$('filter').value='all';$('search').value='';limit=150;
    $('clearReviewBranch').hidden=!branch;
    const list=queueNodes();if(list.length)details(list[0].id);render();showPanel('tree');
  }

  $('tree').addEventListener('keydown', event => {
    if (event.target.closest('button.path-link')) return;
    const item = event.target.closest('[data-node]');if (!item) return;
    const n = nodes.get(item.dataset.node);
    if (event.key === 'ArrowRight' && n.children.length) expanded.add(n.id);
    else if (event.key === 'ArrowLeft') expanded.delete(n.id);
    else if (event.key === 'Enter') {details(n.id);showPanel('evidence');}
    else return;
    event.preventDefault();render();
    $('tree').querySelector(`[data-node="${n.id}"]`)?.focus();
  });
  function refreshFiltered() {
    showPanel('tree');
    limit = 150;
    if ($('mode').value === 'queue') {
      const list = queueNodes();
      if (!list.length) {
        $('details').innerHTML = '<h2>No flags match this filter</h2><p>Change the filter or search to continue reviewing source evidence.</p>';
        render();return;
      }
      if (!list.some(n => n.id === selected)) selected = list[0].id;
    }
    render();details(selected);
  }
  $('treeView').addEventListener('click', () => showPanel('tree',true));
  $('evidenceView').addEventListener('click', () => showPanel('evidence',true));
  $('resetView').addEventListener('click', resetView);
  $('exactAmounts').addEventListener('change', render);
  $('search').addEventListener('input', refreshFiltered);
  $('filter').addEventListener('change', refreshFiltered);
  $('mode').addEventListener('change', () => {if($('mode').value==='queue')startQueue();else{reviewBranch=null;$('clearReviewBranch').hidden=true;render();details(selected);showPanel('tree');}});
  $('startReview').addEventListener('click', () => startQueue());
  $('clearReviewBranch').addEventListener('click', () => startQueue());
  $('more').addEventListener('click', () => {limit += 150;render();});
  $('expenseScope').addEventListener('change', () => {
    expenseRoot = $('expenseScope').value === 'all' ? D.root : $('expenseScope').value;
    reviewBranch = null;limit = 150;
    $('clearReviewBranch').hidden = true;$('mode').value = 'tree';$('filter').value = 'all';$('search').value = '';
    expanded.clear();expanded.add(expenseRoot);details(expenseRoot);render();showPanel('tree');
  });
  $('collapse').addEventListener('click', () => {expanded.clear();expanded.add(expenseRoot);render();showPanel('tree');});
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable=true]')) {
      event.preventDefault();$('search').focus();
    }
  });
  document.querySelectorAll?.('.source-tabs a').forEach(a=>{
    if (a.getAttribute('href') === ({hb:'hb_native_verification.html',nep:'nep_source_verification.html',dpwh_nep_api:'dpwh_nep_api_verification.html'})[D.key]) a.setAttribute('aria-current','page');
  });
  details(D.root);render();
  if (reviewMode) startQueue();
  if (initialNode && nodes.has(initialNode)) navigateTo(initialNode);
}
