import {recordedOffice} from '../../viewers/project_offices.mjs';
import {regionCandidates} from './regionCandidates.js';
import {suggestedCounterparts} from './suggestedCounterparts.js';

const DIFFERENCE_TRACES=new Set([
 'candidate_increase','candidate_decrease',
 'transparency_gap_then_candidate_increase','transparency_gap_then_candidate_decrease',
]);

// Same classification as headlineStats rankings for the selected House reading.
export function matchesInsertionRanking(row,reading,ranking){
 if(!row[reading])return false;
 if(ranking==='third_only')return row.reading_status==='third_only';
 if(row.nep||row.api)return false;
 const unresolved=Boolean(row.suggestions?.length)||['fuzzy_candidate','ambiguous'].includes(row.trace);
 return ranking==='unresolved'?unresolved:!unresolved;
}

export function matchesDifferenceScope(row){
 return DIFFERENCE_TRACES.has(row.trace);
}

// Same classification as headlineStats deletions: NEP-only rows split by
// whether unmatched House rows suggest them as counterparts; second_only rows
// are records dropped between readings.
export function matchesDeletionRanking(row,ranking,counterparts){
 if(ranking==='second_only')return row.reading_status==='second_only';
 if(!row.nep||row.second||row.third)return false;
 return ranking==='suggested'?counterparts.has(row.id):!counterparts.has(row.id);
}

function officeDim(record,fallback=''){
 return recordedOffice(record)||recordedOffice({office:fallback})||'No recorded office';
}

// Dimension value used by Analysis aggregates for a comparison row. Deletion
// rows carry NEP (or HGAB2) assignments rather than a House reading. Office
// labels prefer office_canonical (else client-side canonicalOffice).
export function dimensionValue(row,dim,reading='third'){
 if(reading==='nep'||reading==='second_only'){
  const source=row.nep??row.second;
  if(dim==='region')return source?.region??row.region??'No recorded region';
  if(dim==='office')return officeDim(source);
  if(dim==='program')return source?.program??row.program??'No recorded program';
  if(dim==='pap')return source?.pap??row.pap??'No recorded PAP';
  return null;
 }
 const house=row[reading]||row.third||row.second;
 if(dim==='region')return house?.region??row.region??'No recorded region';
 if(dim==='office')return officeDim(house,row.office);
 if(dim==='program')return house?.program??row.program??'No recorded program';
 if(dim==='pap')return house?.pap??row.pap??'No recorded PAP';
 return null;
}

export function filterGroupProjects(projects,{scope,reading='third',ranking,dim,label,regionMatching='ignore'}){
 const rows=regionMatching==='ignore'?regionCandidates(projects):projects;
 const counterparts=suggestedCounterparts(rows);
 return rows.filter(row=>{
  if(scope==='insertions'&&!matchesInsertionRanking(row,reading,ranking))return false;
  if(scope==='differences'&&!matchesDifferenceScope(row))return false;
  if(scope==='deletions'&&!matchesDeletionRanking(row,ranking,counterparts))return false;
  if(dim&&label!=null&&dimensionValue(row,dim,scope==='deletions'?(ranking==='second_only'?'second_only':'nep'):reading)!==label)return false;
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
  else params.flag='house_only';
 }else if(scope==='deletions'){
  if(ranking==='second_only')params.change='second_only';
  else if(ranking==='suggested')params.flag='nep_only_suggested';
  else params.flag='nep_only';
 }else if(scope==='differences'){
  // Cross-document amount deltas span increase and decrease; leave filters open.
 }
 if(dim==='region')params.region=label;
 else if(dim==='office'&&label&&label!=='No recorded office')params.office=label;
 else if(dim==='program'&&label&&label!=='Foreign-assisted projects')params.program=label;
 else if(dim==='program'&&label==='Foreign-assisted projects')params.program='fap';
 else if(dim==='pap')params.q=label;
 if(reading==='second')params.reading='second';
 return params;
}
