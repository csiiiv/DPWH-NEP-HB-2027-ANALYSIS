// Presentation-only DA working-draft change context. Never use these labels
// as new audit flags, official DA decisions, or verified project identities.
import {canonicalFmrTitle} from './fmrRedFlags.js';

export const DA_CHANGE_CAVEAT = 'DA remarks are self-reported in a working draft, not independently verified. Within-sheet pairings are inferred from row order, not certified project moves.';
export const DA_CHANGE_TYPES = Object.freeze({
  paired_move: {label:'Nearby replacement · same amount', description:'A dropped DA FROM original is paired to a nearby NEW/L row in the same region with the same allocation. An inferred within-sheet link, not proof of a transfer.'},
  clean_replacement: {label:'Nearby replacement · changed amount', description:'A dropped DA FROM original is paired to a nearby NEW/L row in the same region with a different amount. The pairing is tentative; this is not a certified reallocation.'},
  claimed_move: {label:'Reprioritization mentioned', description:'An unpaired NEW/L row has a DA remark mentioning reprioritization. The reason is DA self-reporting and does not establish source-project identity.'},
  correction: {label:'DA-described correction', description:'A DA remark describes a title or coordinate correction; when available, an exact NEP title-and-amount candidate is shown. It is not certified as a correction.'},
  unexplained_addition: {label:'New row · no local explanation', description:'An unpaired NEW/L row has no local remark and no exact NEP title-and-amount candidate. This is a documentation gap, not a finding of improper insertion.'},
  unexplained_drop: {label:'Dropped row · no local explanation', description:'A dropped DA original has no nearby replacement and no local remark. This does not establish wrongdoing or why it was dropped.'},
  house_only: {label:'House-only, no DA link', description:'The House row has no DA match in the existing workbench comparison. It must not be called a DA deletion.'},
  retained: {label:'Retained DA original', description:'An original DA entry is retained with no classified change. Including these rows avoids treating routine retention as an unexplained event.'},
  other: {label:'Other / review needed', description:'The retained DA evidence is insufficient to assign one of the more specific labels without making an inference.'},
});
const words = value => String(value || '').toLowerCase();
const hasReprioritization = remark => /reprioriti[sz]/i.test(remark || '');
const hasCorrection = remark => /correct|coordinate|title|typograph|rectif|erroneous/i.test(remark || '');
const isNew = row => row?.kind === 'new' || row?.kind === 'list_revision';
const hasAmount = row => Number.isFinite(row?.effective_amount_php) && row.effective_amount_php > 0;

export function linkDaNearbyReplacements(projects) {
  // Mirrors build_fmr_workbench.py: next three *project rows*, same region,
  // first eligible unused NEW/L proposal. Does not infer monetary intent.
  const used = new Set(), links = new Map();
  for (let i = 0; i < projects.length; i++) {
    const original = projects[i];
    if (original.kind !== 'original' || original.disposition !== 'dropped') continue;
    for (const proposal of projects.slice(i+1,i+4)) {
      if (proposal.region_key !== original.region_key) break;
      if (used.has(proposal.id) || !isNew(proposal) || !hasAmount(proposal)) continue;
      links.set(original.id, proposal.id);
      used.add(proposal.id);
      break;
    }
  }
  return links;
}
function exactNepMatch(row, nepIndex) {
  if (!nepIndex || !row) return null;
  const title = canonicalFmrTitle(row.effective_title || row.to_title || row.from_title);
  const amount = row.effective_amount_php;
  if (!title || !Number.isFinite(amount)) return null;
  // Report a candidate only when unique within the exact region/title/amount key.
  const key = JSON.stringify([row.region_key,title,amount]);
  const hits = nepIndex.get(key) || [];
  return hits.length === 1 ? hits[0] : null;
}
function nepLookup(workbench) {
  const byKey = new Map();
  for (const row of workbench?.stages?.nep?.projects || []) {
    const key = JSON.stringify([row.region_key,canonicalFmrTitle(row.title),row.amount_php]);
    if (!byKey.has(key)) byKey.set(key,[]);
    byKey.get(key).push(row);
  }
  return byKey;
}
function classification(original, proposal, remark, nepMatch) {
  if (original?.disposition === 'dropped') {
    if (proposal) return original.from_amount_php === proposal.effective_amount_php ? 'paired_move' : 'clean_replacement';
    return remark ? 'other' : 'unexplained_drop';
  }
  if (!original && isNew(proposal)) {
    if (!hasAmount(proposal)) return 'other';
    if (hasReprioritization(remark)) return 'claimed_move';
    if (hasCorrection(remark) && nepMatch) return 'correction';
    return !remark && !nepMatch ? 'unexplained_addition' : 'other';
  }
  if (original && original.disposition === 'modified') {
    return hasCorrection(remark) ? 'correction' : 'other';
  }
  if (original && ['retain','kept'].includes(original.disposition)) {
    const sameTitle = !original.from_title || !original.effective_title ||
      canonicalFmrTitle(original.from_title) === canonicalFmrTitle(original.effective_title);
    const sameAmount = original.from_amount_php == null || original.effective_amount_php == null ||
      original.from_amount_php === original.effective_amount_php;
    return sameTitle && sameAmount ? 'retained' : 'other';
  }
  return 'other';
}
function makeEvent(original, proposed, nepMatch) {
  const source = proposed || original;
  const remark = proposed?.remarks || original?.remarks || '';
  const changeType = classification(original, proposed, remark, nepMatch);
  const fromTitle = original?.from_title || null;
  const toTitle = proposed?.effective_title || original?.effective_title || null;
  const oldAmount = original?.from_amount_php ?? null;
  const newAmount = proposed?.effective_amount_php ?? original?.effective_amount_php ?? null;
  const ids = [...new Set([original?.id,proposed?.id].filter(Boolean))];
  const paired = Boolean(original && proposed && original.id !== proposed.id);
  const narrative = paired
    ? `DA original ${original.control_no} (Excel r.${original.excel_row}) → nearby ${proposed.control_no} (r.${proposed.excel_row}). ${oldAmount === newAmount ? 'Same' : 'Different'} allocation; pairing inferred from source row order.`
    : !original && proposed ? `DA ${proposed.control_no} is a NEW/L row without a linked dropped original.`
    : original?.disposition === 'dropped' ? `DA original ${original.control_no} is marked dropped.`
    : `DA original ${original?.control_no || 'unknown'}: ${original?.disposition || 'no recorded disposition'}.`;
  return {
    id: original?.id || proposed?.id, sourceIds:ids, changeType, changeTypeLabel:DA_CHANGE_TYPES[changeType].label,
    region_key:source?.region_key, title:toTitle || fromTitle || 'Untitled DA source row',
    control_no:source?.control_no, excel_rows:ids.map(id=>[original,proposed].find(x=>x?.id===id)?.excel_row).filter(Number.isFinite),
    from:original || null, proposed:proposed || null, fromTitle,toTitle,fromAmountPhp:oldAmount,toAmountPhp:newAmount,
    daRemark:remark, daRemarkSnippet:remark.slice(0,180), sourceDropMatch:paired ? original.id : null,
    nepCandidate:nepMatch ? {id:nepMatch.id,title:nepMatch.title,amount_php:nepMatch.amount_php,source:nepMatch.source} : null,
    narrative, pairingBasis:paired ? 'Same region; next three project rows; first eligible unused NEW/L entry' : null,
    auditFlagsSummary:'Audit tags are shown separately in the House→DA delta; no new audit flag is generated here.',
  };
}
export function buildDaDraftChangeLog(daDraft, workbench = {}) {
  const projects = daDraft?.projects;
  if (!Array.isArray(projects)) return {rows:[], counts:{}, totalEvents:0, sourceRows:0, originalCount:0};
  const byId = new Map(projects.map(p=>[p.id,p]));
  if (byId.size !== projects.length) throw new Error('DA draft source IDs must be unique');
  const links = linkDaNearbyReplacements(projects);
  const used = new Set(), rows = [], nep = nepLookup(workbench);
  for (const original of projects.filter(p=>p.kind === 'original')) {
    const proposed = byId.get(links.get(original.id)) || null;
    used.add(original.id);
    if (proposed) used.add(proposed.id);
    rows.push(makeEvent(original, proposed, exactNepMatch(proposed,nep)));
  }
  for (const proposed of projects.filter(p=>!used.has(p.id))) {
    used.add(proposed.id);
    rows.push(makeEvent(null,proposed,exactNepMatch(proposed,nep)));
  }
  if (used.size !== projects.length || rows.some(r=>!DA_CHANGE_TYPES[r.changeType]))
    throw new Error('DA source change-log does not partition all rows');
  const counts = Object.fromEntries(Object.keys(DA_CHANGE_TYPES).map(key=>[key,0]));
  for (const row of rows) counts[row.changeType]++;
  return {rows,counts,totalEvents:rows.length,sourceRows:projects.length,
    originalCount:projects.filter(p=>p.kind==='original').length,
    linkedReplacementCount:links.size, caveat:DA_CHANGE_CAVEAT};
}
export function annotateDaDeltaRows(deltaRows, workbench, draftLog = null) {
  const comparisonById = new Map((workbench?.comparison || []).map(row=>[row.id,row]));
  const daById = new Map((workbench?.stages?.da?.projects || []).map(p=>[p.id,p]));
  const eventBySourceId = new Map();
  for (const evt of draftLog?.rows || []) for (const id of evt.sourceIds) eventBySourceId.set(id,evt);
  return deltaRows.map(row => {
    const pair = comparisonById.get(row.id);
    const da = pair?.da;
    const from = da?.from;
    const proposed = da?.proposed;
    const project = daById.get(row.da_id);
    const event = [from?.id,proposed?.id,row.da_id].map(id=>eventBySourceId.get(id)).find(Boolean);
    if (event) return {...row,...event, id:row.id, rawStatus:row.status,
      auditFlagsSummary:[...new Set([...row.house_flags,...row.da_flags])].join(', ') || 'None',
      storyEventId:event.id, changeType:event.changeType, changeTypeLabel:event.changeTypeLabel};
    const remark = proposed?.remarks || from?.remarks || project?.remarks || '';
    const oldAmount = from?.amount_php ?? null;
    const newAmount = proposed?.amount_php ?? project?.amount_php ?? null;
    let changeType;
    if (!da) changeType = row.house_id ? 'house_only' : 'other';
    else if (from?.disposition === 'dropped') changeType = proposed
      ? oldAmount === newAmount ? 'paired_move' : 'clean_replacement'
      : remark ? 'other' : 'unexplained_drop';
    else if (proposed?.id && proposed.id !== from?.id) changeType = 'other';
    else if (from?.disposition === 'modified') changeType = hasCorrection(remark) ? 'correction' : 'other';
    else changeType = 'retained';
    if (!DA_CHANGE_TYPES[changeType]) throw new Error('Unclassified DA delta row');
    return {...row,rawStatus:row.status,changeType,changeTypeLabel:DA_CHANGE_TYPES[changeType].label,
      daRemark:remark, daRemarkSnippet:remark.slice(0,180), sourceDropMatch:from?.disposition === 'dropped' ? from?.id : null,
      from:from || null, proposed:proposed || project || null,fromAmountPhp:oldAmount,toAmountPhp:newAmount,
      pairingBasis:proposed?.id !== from?.id && from?.id ? 'DA within-sheet replacement link (provisional)' : null,
      narrative:!da ? 'No DA match is recorded for this House source row.' : 'DA working-draft context available from the source-linked row.',
      control_no:proposed?.control_no || from?.control_no || row.control_no,
      excel_rows:da?.excel_rows || row.excel_rows,
      auditFlagsSummary:[...new Set([...row.house_flags,...row.da_flags])].join(', ') || 'None'};
  });
}
export function summarizeDaDeltaChanges(rows) {
  const counts = Object.fromEntries(Object.keys(DA_CHANGE_TYPES).map(k=>[k,0]));
  for (const row of rows) {
    if (!DA_CHANGE_TYPES[row.changeType]) throw new Error('Unclassified DA change type: '+row.changeType);
    counts[row.changeType]++;
  }
  return counts;
}

function tallyFlags(rows, field) {
  const counts = {};
  for (const row of rows) for (const id of row[field] || []) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({id, count}));
}

function statusTally(rows) {
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  return counts;
}

/** Briefing of flag lifecycle + DA change stories for the current House→DA delta subset. */
export function summarizeHouseDaFindings(rows) {
  const changeCounts = summarizeDaDeltaChanges(rows);
  const corrections = rows.filter(row => row.changeType === 'correction');
  const cleared = rows.filter(row => row.status === 'cleared');
  const persisted = rows.filter(row => row.status === 'persisted');
  return {
    rowCount: rows.length,
    statusCounts: statusTally(rows),
    changeCounts,
    housePhp: rows.reduce((sum, row) => sum + (Number.isFinite(row.house_php) ? row.house_php : 0), 0),
    daPhp: rows.reduce((sum, row) => sum + (Number.isFinite(row.da_php) ? row.da_php : 0), 0),
    clearedFlags: tallyFlags(rows, 'cleared_flags'),
    persistedFlags: tallyFlags(rows, 'persisted_flags'),
    newFlags: tallyFlags(rows, 'new_flags'),
    corrections: {
      count: corrections.length,
      statusCounts: statusTally(corrections),
      withRemark: corrections.filter(row => row.daRemark).length,
      clearedFlags: tallyFlags(corrections, 'cleared_flags'),
      persistedFlags: tallyFlags(corrections, 'persisted_flags'),
      newFlags: tallyFlags(corrections, 'new_flags'),
      housePhp: corrections.reduce((sum, row) => sum + (Number.isFinite(row.house_php) ? row.house_php : 0), 0),
      daPhp: corrections.reduce((sum, row) => sum + (Number.isFinite(row.da_php) ? row.da_php : 0), 0),
    },
    lifecycle: {
      cleared: cleared.length,
      persisted: persisted.length,
      new: rows.filter(row => row.status === 'new').length,
    },
    caveat: DA_CHANGE_CAVEAT,
  };
}
