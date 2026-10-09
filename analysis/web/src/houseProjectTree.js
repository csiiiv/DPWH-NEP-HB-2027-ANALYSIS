// Display I-C as its own additive hierarchy; never append it to I-B money.
export function houseProjectTree(data, reading = 'third', volume = 'I-C') {
  const third = reading === 'third', ic = volume === 'I-C';
  const documentKey = ic ? (third ? 'house-third' : 'house-projects') : (third ? 'house-third-controls' : 'house-tree');
  const nodes = [], seen = new Set();
  function flatten(n, parent = null) {
    if (seen.has(n.id)) throw new Error(`Duplicate native ${volume} node`);
    seen.add(n.id);
    const childCounts = n.children.map(c => flatten(c, n.id));
    const direct = n.children.length ? n.children.reduce((sum, c) => sum + c.printed_amount_php, 0) : null;
    if (n.difference_php || n.recursive_leaf_sum_php !== n.printed_amount_php || direct != null && direct !== n.printed_amount_php)
      throw new Error(`Native ${volume} hierarchy does not balance`);
    const leaves = n.children.length ? childCounts.reduce((a,b)=>a+b,0) : 1;
    nodes.push({id:n.id, parent, label:n.label, kind:n.kind, amount:n.printed_amount_php,
      printed:n.kind === 'root' ? null : n.printed_amount_php, recursive:n.recursive_leaf_sum_php, direct, leaf_count:leaves,
      children:n.children.map(c=>c.id), additive:true, status:n.kind === 'root'?'derived':n.children.length?'balanced':'leaf',
      columns_php:n.columns_php, source:{...n.source, pdf_page:n.kind === 'root' ? null : n.source.pdf_page, document_key:documentKey}, evidence:'native_text',
      review_actionable:false, review_kind:null, source_checks_below:0, source_checks_in_branch:0});
    return leaves;
  }
  const leafCount = flatten(data.root);
  const suffix = third ? '_3rd_reading' : '';
  return {key:'hb', native_ic:ic, native_ib:!ic, scale:1, root:data.root.id, nodes,
    title:`House ${third?'3rd':'2nd'} reading — ${volume} ${ic?'project hierarchy':'control hierarchy'}`,
    page_label:`House ${third?'3rd':'2nd'} · ${volume}`,
    scope:ic ? 'DPWH native I-C · MOOE + Capital Outlays · Personnel Services excluded' : 'DPWH native I-B · PS + MOOE + Capital Outlays',
    grain:ic ? 'Program → PAP → region → office → project/allocation → FAP funding' : 'Program → PAP → region → office/allocation',
    evidence_status:'Native source hierarchy; control and project views represent overlapping money',
    coverage_status:`Every native ${volume} branch balances to its printed control`,
    audit:{total:data.root.printed_amount_php, leaf_count:leafCount,
      internal_checks:nodes.filter(n=>n.children.length).length, failures:[]},
    review_summary:{needs_source_check:0}, expense_breakdown:ic ? null : Object.entries(data.root.columns_php).filter(([key])=>key!=='total').map(([key,amount_php])=>({key,amount_php,label:{ps:'Personnel Services',mooe:'Maintenance and Other Operating Expenses',co:'Capital Outlays'}[key]})),
    gaps:ic ? ['Named projects, office/region allocations and FAP funding remain distinct. I-C excludes PS; use I-B for the full agency total.',
      'Recovered titles and project identity still require source review.'] : ['I-B controls and I-C project detail represent overlapping money; inspect them separately.'],
    downloads:[{label:`Native ${volume} tree`,href:`../data/hb_dpwh_native_${ic?'ic_projects':'rollup'}${suffix}.json`}]
  };
}
