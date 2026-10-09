import {regionCandidates} from './regionCandidates.js';

const DIFFERENCE_TRACES=new Set([
 'candidate_increase','candidate_decrease',
 'transparency_gap_then_candidate_increase','transparency_gap_then_candidate_decrease',
]);

// Same classification as headlineStats rankings for the selected House reading.
export function matchesInsertionRanking(row,reading,ranking){
 if(!row[reading])return false;
 if(ranking==='third_only')return row.reading_status==='third_only';
 if(row.nep||row.api)return false;
 const unresolved=Boolean(row.suggestions?.length)||['fuzzy_candidate','ambiguous','chainage_candidate'].includes(row.trace);
 return ranking==='unresolved'?unresolved:!unresolved;
}

export function matchesDifferenceScope(row){
 return DIFFERENCE_TRACES.has(row.trace);
}

// Dimension value used by Analysis aggregates for a comparison row.
export function dimensionValue(row,dim,reading='third'){
 const house=row[reading]||row.third||row.second;
 if(dim==='region')return house?.region??row.region??'No recorded region';
 if(dim==='office')return (house?.office||row.office||'')||'No recorded office';
 if(dim==='program')return house?.program??row.program??'No recorded program';
 if(dim==='pap')return house?.pap??row.pap??'No recorded PAP';
 return null;
}

export function filterGroupProjects(projects,{scope,reading='third',ranking,dim,label,regionMatching='ignore'}){
 const rows=regionMatching==='ignore'?regionCandidates(projects):projects;
 return rows.filter(row=>{
  if(scope==='insertions'&&!matchesInsertionRanking(row,reading,ranking))return false;
  if(scope==='differences'&&!matchesDifferenceScope(row))return false;
  if(dim&&label!=null&&dimensionValue(row,dim,reading)!==label)return false;
  return true;
 });
}

// Closest Compare-stages deep link for the same group. PAP has no compare
// filter, so it becomes a search token; insertion rankings map onto the
// nearest House-reading / house-only filters.
export function compareHrefForGroup({scope,reading,ranking,dim,label}){
 const params={view:'projects',region_match:'ignore'};
 if(scope==='insertions'){
  if(ranking==='third_only')params.change='third_only';
  else params.change='house_records_only';
 }else if(scope==='differences'){
  // No single compare filter for amount-mismatched candidates; leave open.
 }
 if(dim==='region')params.region=label;
 else if(dim==='office'&&label&&label!=='No recorded office')params.office=label;
 else if(dim==='program'&&label&&label!=='Foreign-assisted projects')params.program=label;
 else if(dim==='program'&&label==='Foreign-assisted projects')params.program='fap';
 else if(dim==='pap')params.q=label;
 if(reading==='second')params.reading='second';
 return params;
}
