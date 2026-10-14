import {allocationStats, candidateAggregates, compactMoney, filterComparisons} from './fmrModel.js';

export function fmrFundingGroups(rows, regions) {
  return regions.map(region => {
    const population = rows.filter(row => row.region_key === region.id);
    return {id: region.id, label: region.label, rows: population.length, ...candidateAggregates(population)};
  }).filter(row => row.rows).sort((a, b) => Math.abs(b.net_delta_php) - Math.abs(a.net_delta_php));
}
export function fmrHighlights(data, rows) {
  const agg = candidateAggregates(rows), largest = [...data.regions].sort((a, b) => b.delta_php - a.delta_php)[0];
  const metric = (label, value, format) => ({label, value, format});
  const base = [
    {id: 'control-increase', kind: 'Printed controls', title: 'FMR allocation increases', value: agg.net_delta_php, money: true, signed: true,
      body: `Printed NEP ${compactMoney(data.stages.nep.root.printed_amount_php)} → House ${compactMoney(data.stages.house.root.printed_amount_php)}. Regional gains and reductions reconcile the difference.`,
      prompt: 'Which regional gains and reductions reconcile the increase?', actionLabel: 'Inspect regional funding movements', href: 'compare', regions: data.regions, bridgeRows: rows,
      takeaway: 'Compare the printed regional controls with the paired and unmatched allocations that reconcile each region.',
      limit: 'The bridge explains the allocation arithmetic. Unmatched source rows do not certify new or cancelled works.',
      metrics: [metric('NEP program', data.stages.nep.root.printed_amount_php, 'money'), metric('House program', data.stages.house.root.printed_amount_php, 'money'), metric('Net increase', agg.net_delta_php, 'signed')]},
    {id: 'regional-increase', kind: 'Printed controls', title: 'Largest regional increase', value: largest.delta_php, money: true, signed: true,
      body: `${largest.label}: ${compactMoney(largest.nep_php)} → ${compactMoney(largest.house_php)}.`,
      prompt: 'Which paired and unmatched allocations account for this regional movement?', actionLabel: 'Inspect the regional gain', href: 'compare', params: {view: 'projects', region: largest.id}, regions: [largest],
      rows: filterComparisons(rows, {region: largest.id}),
      takeaway: 'Keep the printed regional controls alongside this region’s complete comparison population, including NEP-only observations.',
      limit: 'Recorded regional assignment and provisional candidate matches do not certify project identity or congressional district allocation.',
      metrics: [metric('NEP regional control', largest.nep_php, 'money'), metric('House regional control', largest.house_php, 'money'), metric('Regional increase', largest.delta_php, 'signed')]},
    {id: 'amount-changes', kind: 'Candidate matching', title: 'Candidate amount changes', value: data.comparison_summary.changed_pairs,
      body: `${agg.increased.count} candidate pairs increase and ${agg.decreased.count} decrease. Their net movement is ${compactMoney(agg.paired_delta_php)}.`,
      prompt: 'Do the original titles, coordinates and source pages support each pairing and amount change?', actionLabel: 'Compare paired amount changes', href: 'compare', params: {view: 'projects', status: 'changed'}, rows: filterComparisons(rows, {status: 'changed'}),
      takeaway: 'Inspect each candidate’s two original source rows, matching basis and amount difference. Gross gains and reductions stay separate.',
      limit: 'A candidate pair is an evidence pointer. Equal titles or coordinates alone do not certify the same project scope.',
      metrics: [metric('Paired increases', agg.increased.amount, 'money'), metric('Paired reductions', agg.decreased.amount, 'money'), metric('Net paired movement', agg.paired_delta_php, 'signed')]},
    {id: 'house-only', kind: 'Candidate matching', title: 'Unmatched House rows', value: agg.counts.house_only,
      body: `${agg.counts.house_only} House allocations worth ${compactMoney(agg.house_only_php)} have no attached unique NEP candidate counterpart.`,
      prompt: 'Which unmatched allocations need further counterpart review, starting with the largest?', actionLabel: 'Review unmatched House allocations', href: 'compare', params: {view: 'projects', status: 'house_only'}, rows: filterComparisons(rows, {status: 'house_only'}),
      takeaway: 'Locate the unmatched funding by region, then inspect the largest source allocations and their printed pages.',
      limit: 'No unique match does not establish a new project. Alternative titles, changed endpoints or consolidated scopes require source review.',
      metrics: [metric('Unmatched House rows', agg.counts.house_only), metric('House allocations', agg.house_only_php, 'money'), metric('Largest unmatched allocation', Math.max(0, ...rows.filter(r => r.status === 'house_only').map(r => r.house_php)), 'money')]},
  ];
  const coordinateCards = ['nep', 'house'].map(stage => {
    const source = data.stages[stage], open = source.projects.filter(p => p.status === 'needs_review');
    const history = source.projects.filter(p => p.original_review_flags?.length);
    return {id: `${stage}-coordinates`, stage, kind: 'Coordinate evidence', title: `${stage === 'nep' ? 'NEP' : 'House'} coordinate ${open.length ? 'review' : 'interpretation history'}`,
      value: open.length || history.length, body: `${open.length} projects have open coordinate findings; ${history.length} retain original extraction flags. Review the raw and interpreted cells without changing project allocations.`,
      prompt: open.length ? 'Which printed endpoint readings remain unresolved, and why?' : 'How were the retained coordinate findings resolved, and what rendered evidence supports the readings?',
      actionLabel: open.length ? 'Inspect open coordinate findings' : 'Review coordinate interpretation history', href: stage,
      params: open.length ? {view: 'review'} : {view: 'projects', status: 'interpreted'}, projects: open.length ? open : history,
      history, open, takeaway: 'Read the original cell, interpretation rules, remaining flags, normalized endpoints and retained rendered evidence for the selected project.',
      limit: 'Original extraction flags and remaining findings are different populations. Accepted interpretations and proposed repairs are separate; endpoint distances are not construction lengths.',
      metrics: [metric('Remaining review projects', open.length), metric('Originally flagged projects', history.length), metric('Originally flagged, now normalized', history.filter(p => p.status !== 'needs_review').length)]};
  });
  const segmentCards = ['nep', 'house'].map(stage => {
    const projects = data.stages[stage].projects.filter(p => p.segment_count > 1);
    return {id: `${stage}-segments`, stage, kind: 'Source geometry', title: `${stage === 'nep' ? 'NEP' : 'House'} multiple segments`, value: projects.length,
      body: `${projects.length} allocations worth ${compactMoney(allocationStats(projects).total)} cover ${projects.reduce((s, p) => s + p.segment_count, 0)} normalized segments. Each project’s allocation is counted once.`,
      prompt: 'Which printed sections belong to each project, and how do their endpoints differ?', actionLabel: 'Inspect projects and their segments', href: stage, params: {view: 'projects', status: 'multi'}, projects,
      takeaway: 'Select a project to inspect its raw coordinate cell and each segment’s endpoints, interpretation basis and review flags.',
      limit: 'Multiple segments are not evidence of duplicate funding or project splitting. Segment endpoint distance is a geometry check, not constructed road length or cost per kilometre.',
      metrics: [metric('Project allocations', projects.length), metric('Normalized segments', projects.reduce((s, p) => s + p.segment_count, 0)), metric('Allocation counted once', allocationStats(projects).total, 'money')]};
  });
  return [...base, ...coordinateCards, ...segmentCards];
}
