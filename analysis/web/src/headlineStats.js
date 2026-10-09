import {regionCandidates} from './regionCandidates.js';
export const programBuckets=['Asset Preservation Program','Network Development Program','Bridge Program','Flood Management Program','Convergence and Special Support Program','Local Program','National Building Program','Foreign-assisted projects'];
export function officeKind(value){
 const office=String(value??'').trim().replace(/\s+/g,' ');
 if(!office)return 'No recorded office';
 if(/^central office$/i.test(office))return 'Central Office';
 if(/district engineering office|\bDEO\b/i.test(office))return 'District engineering offices (DEOs)';
 if(/regional office/i.test(office))return 'Regional offices';
 return 'Other recorded offices';
}
// Dimension fields carried on ranking entries for by-dimension aggregates.
const DIMENSIONS=[['region','region'],['office','office_kind'],['program','program']];
export function headlineStats(input){
 const rows=regionCandidates(input),sources={};
 for(const side of ['third','second','nep','api']){
  const offices=Object.fromEntries(['Central Office','District engineering offices (DEOs)','Regional offices','Other recorded offices','No recorded office'].map(key=>[key,{records:0,amount_php:0}]));
  const programs=Object.fromEntries(programBuckets.map(key=>[key,{records:0,amount_php:0}]));
  let records=0,amount_php=0,comparison_rows=0;
  for(const row of rows){
   const source=row[side];if(!source)continue;comparison_rows++;
   for(const member of source.records??[source]){
    const record={...source,...member};records++;amount_php+=record.amount_php;
    const office=offices[officeKind(record.office)];office.records++;office.amount_php+=record.amount_php;
    const program=(record.zone??row.zone)==='fap'?'Foreign-assisted projects':record.program??row.program??'Other / unclassified';
    const bucket=programs[program]??(programs[program]={records:0,amount_php:0});bucket.records++;bucket.amount_php+=record.amount_php;
   }
  }
  if(Object.values(offices).reduce((sum,b)=>sum+b.amount_php,0)!==amount_php || Object.values(programs).reduce((sum,b)=>sum+b.records,0)!==records)throw new Error('Headline buckets do not reconcile');
  sources[side]={records,amount_php,comparison_rows,offices,programs};
 }
 const rankings={};
 for(const side of ['third','second']){
  const classified={no_suggestion:[],unresolved:[],third_only:[]};
  for(const row of rows){
   if(!row[side])continue;
   if(!row.nep && !row.api){
    const kind=row.suggestions?.length || ['fuzzy_candidate','ambiguous','chainage_candidate'].includes(row.trace)?'unresolved':'no_suggestion';
    classified[kind].push(row);
   }
   if(row.reading_status==='third_only')classified.third_only.push(row);
  }
  rankings[side]=Object.fromEntries(Object.entries(classified).map(([key,list])=>{
   const flat=list.map(r=>({id:r.id,title:r.title,program:r.program,zone:r.zone,region:r[side].region??r.region,
     office:r[side].office??'',office_kind:officeKind(r[side].office),amount_php:r[side].amount_php,
     allocation_records:r[side].records?.length??1,trace:r.trace,reading_status:r.reading_status,
     reading_delta_php:r.reading_delta_php,source_id:r[side].native_node_id??r[side].records?.[0]?.native_node_id??r[side].records?.[0]?.id??r[side].id}))
    .sort((a,b)=>b.amount_php-a.amount_php || a.id.localeCompare(b.id));
   return [key,{comparison_rows:list.length,amount_php:list.reduce((sum,r)=>sum+r[side].amount_php,0),
    top:flat.slice(0,20),by_dim:byDimension(flat)}];
  }));
 }
 return {matching_mode:'ignore',sources,rankings,revisionSets:revisionSets(rows)};
}
// Top groups per dimension over the FULL candidate group, not just the top 20.
function byDimension(flat){
 const result={overall:{rows:flat.length,amount_php:flat.reduce((sum,r)=>sum+r.amount_php,0)}};
 for(const [dim,field] of DIMENSIONS){
  const groups=new Map();
  for(const row of flat){
   const label=dim==='office'?(row.office||'No recorded office'):row[field]||`No recorded ${dim}`;
   const entry=groups.get(label)||{label,rows:0,amount_php:0};
   entry.rows++;entry.amount_php+=row.amount_php;groups.set(label,entry);
  }
  result[dim]=[...groups.values()].sort((a,b)=>b.amount_php-a.amount_php||a.label.localeCompare(b.label)).slice(0,10);
 }
 return result;
}
// Reading revisions: only rows that actually changed between readings (or are
// new to a reading). The overview stores slimmed rows plus summaries only —
// never full comparison rows. Cross-document House-vs-NEP differences keep
// provisional-identity framing; their row lists are computed from the lazy
// detail payload on the client.
export function revisionSets(rows){
 const reading=rows.filter(r=>r.reading_status==='third_only' || r.reading_delta_php)
   .map(r=>({id:r.id,title:r.title,program:r.program,zone:r.zone,region:r.region,
     second_php:r.second?.amount_php??null,third_php:r.third?.amount_php??null,
     reading_delta_php:r.reading_delta_php,reading_status:r.reading_status}));
 const delta=reading.reduce((sum,r)=>sum+(r.reading_delta_php??0),0);
 const cross=rows.filter(r=>['candidate_increase','candidate_decrease','transparency_gap_then_candidate_increase','transparency_gap_then_candidate_decrease'].includes(r.trace));
 const summary=sign=>{const values=cross.map(r=>houseMinusNep(r)).filter(v=>v!=null&&(sign>0?v>0:v<0));
  return {rows:values.length,amount_php:values.reduce((sum,v)=>sum+Math.abs(v),0)};};
 return {reading,delta_php:delta,cross_summary:{increased:summary(1),reduced:summary(-1)}};
}
function houseMinusNep(row){
 const house=row.third??row.second;
 if(row.nep==null||house==null)return null;
 return house.amount_php-row.nep.amount_php;
}
