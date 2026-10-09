import {officeAssignments} from '../../viewers/project_offices.mjs';
export const analyticsSources=[['third','HGAB3 · 3rd reading'],['second','HGAB2 · 2nd reading'],['nep','DBM NEP'],['api','DPWH Transparency NEP']];
export function projectAnalytics(rows) {
  const totals=Object.fromEntries(analyticsSources.map(([side])=>[side,{rows:0,records:0,amount:0}]));
  const changes={},matches={},flags={region_difference:0,office_difference:0,no_office:0,repeated_key:0,uncertain_match:0,nep_evidence_review:0};
  let readingDelta=0,flaggedRows=0;
  for(const row of rows){
    for(const [side] of analyticsSources)if(row[side]){
      const s=totals[side];s.rows++;s.records+=row[side].records?.length ?? 1;s.amount+=row[side].amount_php;
    }
    changes[row.reading_status]=(changes[row.reading_status] || 0)+1;
    matches[row.trace]=(matches[row.trace] || 0)+1;
    readingDelta+=row.reading_delta_php ?? 0;
    const flagTotal=Object.values(flags).reduce((sum,count)=>sum+count,0);
    const assignments=officeAssignments(row);
    if(new Set(assignments.map(a=>a.region).filter(Boolean)).size>1)flags.region_difference++;
    if(new Set(assignments.map(a=>a.office).filter(Boolean)).size>1)flags.office_difference++;
    if(assignments.every(a=>!a.office))flags.no_office++;
    if(row.reading_status==='repeated_key')flags.repeated_key++;
    if(['ambiguous','fuzzy_candidate','chainage_candidate','region_difference_candidate'].includes(row.trace))flags.uncertain_match++;
    if(['native_row_ambiguity','nearby_alignment_candidate','native_text_review','not_checked'].includes(row.nep?.evidence))flags.nep_evidence_review++;
    if(Object.values(flags).reduce((sum,count)=>sum+count,0)>flagTotal)flaggedRows++;
  }
  return {count:rows.length,totals,changes,matches,flags,readingDelta,flaggedRows};
}
// Group House (HGAB3) against DBM NEP by each source's own recorded label, so
// paired bars stay comparable while label disagreements stay visible. Each bar
// keeps its own scale-correct width; shares use that source's filtered total.
export function compareDistribution(rows,field) {
  const groups=new Map(),totals={hb:0,nep:0},coverage={hb:0,nep:0,neither:0};
  for(const row of rows){
    const sources={hb:row.third,nep:row.nep},seen=new Set();
    let any=false;
    for(const side of ['hb','nep']){
      const source=sources[side];if(!source)continue;
      any=true;coverage[side]++;
      const label=source[field] || (field==='office'?'No recorded office':'No recorded region');
      const group=groups.get(label) || {label,rows:0,hb:0,nep:0};
      group[side]+=source.amount_php;totals[side]+=source.amount_php;
      if(!seen.has(label)){group.rows++;seen.add(label);}
      groups.set(label,group);
    }
    if(!any)coverage.neither++;
  }
  const entries=[...groups.values()].sort((a,b)=>Math.max(b.hb,b.nep)-Math.max(a.hb,a.nep) || a.label.localeCompare(b.label));
  return {entries,totals,coverage};
}
