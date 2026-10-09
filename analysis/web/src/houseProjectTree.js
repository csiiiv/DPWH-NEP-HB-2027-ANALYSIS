// Display I-C as its own additive hierarchy; never append it to I-B money.
export function houseProjectTree(data, reading = 'third') {
  const third = reading === 'third', documentKey = third ? 'house-third' : 'house-projects';
  const nodes = [], seen = new Set();
  function flatten(n, parent = null) {
    if (seen.has(n.id)) throw new Error('Duplicate native I-C node');
    seen.add(n.id);
    const childCounts = n.children.map(c => flatten(c, n.id));
    const direct = n.children.length ? n.children.reduce((sum, c) => sum + c.printed_amount_php, 0) : null;
    if (n.difference_php || n.recursive_leaf_sum_php !== n.printed_amount_php || direct != null && direct !== n.printed_amount_php)
      throw new Error('Native I-C hierarchy does not balance');
    const leaves = n.children.length ? childCounts.reduce((a,b)=>a+b,0) : 1;
    nodes.push({id:n.id, parent, label:n.label, kind:n.kind, amount:n.printed_amount_php,
      printed:n.kind === 'root' ? null : n.printed_amount_php, recursive:n.recursive_leaf_sum_php, direct, leaf_count:leaves,
      children:n.children.map(c=>c.id), additive:true, status:n.kind === 'root'?'derived':n.children.length?'balanced':'leaf',
      source:{...n.source, pdf_page:n.kind === 'root' ? null : n.source.pdf_page, document_key:documentKey}, evidence:'native_text',
      review_actionable:false, review_kind:null, source_checks_below:0, source_checks_in_branch:0});
    return leaves;
  }
  const leafCount = flatten(data.root);
  const suffix = third ? '_3rd_reading' : '';
  return {key:'hb', native_ic:true, scale:1, root:data.root.id, nodes,
    title:`House ${third?'3rd':'2nd'} reading — I-C project hierarchy`,
    page_label:`House ${third?'3rd':'2nd'} · I-C`,
    scope:'DPWH native I-C · MOOE + Capital Outlays · Personnel Services excluded',
    grain:'Program → PAP → region → office → project/allocation → FAP funding',
    evidence_status:'Native source hierarchy; control and project views represent overlapping money',
    coverage_status:'Every native I-C branch balances to its printed control',
    audit:{total:data.root.printed_amount_php, leaf_count:leafCount,
      internal_checks:nodes.filter(n=>n.children.length).length, failures:[]},
    review_summary:{needs_source_check:0}, expense_breakdown:null,
    gaps:['Named projects, office/region allocations and FAP funding remain distinct. I-C excludes PS; use I-B for the full agency total.',
      'Recovered titles and project identity still require source review.'],
    downloads:[{label:'Native I-C project tree',href:`../data/hb_dpwh_native_ic_projects${suffix}.json`}]
  };
}
