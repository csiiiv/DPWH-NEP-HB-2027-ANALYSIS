import {recordedOffice} from '../../viewers/project_offices.mjs';
import {regionCandidates} from './regionCandidates.js';
import {suggestedCounterparts} from './suggestedCounterparts.js';
export const programBuckets=['Asset Preservation Program','Network Development Program','Bridge Program','Flood Management Program','Convergence and Special Support Program','Local Program','National Building Program','Foreign-assisted projects'];
export function officeKind(value){
 const office=String(value??'').trim().replace(/\s+/g,' ');
 if(!office)return 'No recorded office';
 if(/^central office$/i.test(office))return 'Central Office';
 if(/district engineering office|\bDEO\b/i.test(office))return 'District engineering offices (DEOs)';
 if(/regional office/i.test(office))return 'Regional offices';
 return 'Other recorded offices';
}
function sideOffice(record){
 return recordedOffice(record);
}
// Dimension fields carried on ranking entries for by-dimension aggregates.
const DIMENSIONS=[['region','region'],['office','office_kind'],['program','program'],['pap','pap']];
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
    const office=offices[officeKind(sideOffice(record)||record.office)];office.records++;office.amount_php+=record.amount_php;
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
    const kind=row.suggestions?.length || ['fuzzy_candidate','ambiguous'].includes(row.trace)?'unresolved':'no_suggestion';
    classified[kind].push(row);
   }
   if(row.reading_status==='third_only')classified.third_only.push(row);
  }
  rankings[side]=Object.fromEntries(Object.entries(classified).map(([key,list])=>{
   const flat=list.map(r=>({id:r.id,title:r.title,program:r.program,pap:r.pap,zone:r.zone,region:r[side].region??r.region,
     office:sideOffice(r[side]),office_kind:officeKind(sideOffice(r[side])||r[side].office),amount_php:r[side].amount_php,
     allocation_records:r[side].records?.length??1,trace:r.trace,reading_status:r.reading_status,
     reading_delta_php:r.reading_delta_php,source_id:r[side].native_node_id??r[side].records?.[0]?.native_node_id??r[side].records?.[0]?.id??r[side].id}))
    .sort((a,b)=>b.amount_php-a.amount_php || a.id.localeCompare(b.id));
   return [key,{comparison_rows:list.length,amount_php:list.reduce((sum,r)=>sum+r[side].amount_php,0),
    top:flat.slice(0,100),by_dim:byDimension(flat)}];
  }));
 }
 // Deletion candidates: NEP line items with no attached House record. The
 // suggested group carries House rows referring to the NEP item as a fuzzy
 // counterpart — possible re-titled or re-scoped replacements. second_only
 // covers records dropped between readings (currently none, kept for future
 // readings data).
 const counterparts=suggestedCounterparts(rows);
 const deletionGroups={no_suggestion:[],suggested:[],second_only:[]};
 for(const row of rows){
  if(row.reading_status==='second_only')deletionGroups.second_only.push(row);
  if(row.nep && !row.second && !row.third)
   (counterparts.has(row.id)?deletionGroups.suggested:deletionGroups.no_suggestion).push(row);
 }
 const deletions=Object.fromEntries(Object.entries(deletionGroups).map(([key,list])=>{
  const flat=list.map(r=>{
   const source=r.nep??r.second;
   return {id:r.id,title:r.title,program:r.program,pap:r.pap,zone:r.zone,
    source_kind:r.nep?'nep':'second',
    region:source?.region??r.region,office:sideOffice(source),office_kind:officeKind(sideOffice(source)||source?.office),
    amount_php:source?.amount_php??0,
    allocation_records:source?.records?.length??1,trace:r.trace,reading_status:r.reading_status,
    referring_house_rows:counterparts.get(r.id)??0,
    source_id:r.nep?.native_node_id??r.nep?.id??source?.native_node_id??source?.records?.[0]?.native_node_id??source?.records?.[0]?.id??source?.id};
  }).sort((a,b)=>b.amount_php-a.amount_php || a.id.localeCompare(b.id));
  return [key,{comparison_rows:list.length,amount_php:flat.reduce((sum,r)=>sum+r.amount_php,0),
   top:flat.slice(0,100),by_dim:byDimension(flat)}];
 }));
 return {matching_mode:'ignore',sources,rankings,deletions,revisionSets:revisionSets(rows),
  sourceCompare:sourceCompare(rows,sources)};
}
// Allocation members on a comparison-row side (grouped entries expand).
const sideRecords=source=>source.records?.length??1;
// NEP vs House allocation totals by dimension. Each source contributes to its
// own region/office/program/PAP label; change is House−NEP for that label.
// Every non-program parent group also carries nested drill breakdowns
// (by_pap; plus by_region and by_office for PAP parents) that conserve its
// tallies.
export function sourceCompare(rows,sources){
 const byReading={};
 for(const side of ['third','second']){
  const dims={};
  dims.overall=[{id:'overall',label:'All operations',nep_php:sources.nep.amount_php,house_php:sources[side].amount_php,
   delta_php:sources[side].amount_php-sources.nep.amount_php,nep_records:sources.nep.records,house_records:sources[side].records}];
  for(const dim of ['region','office','program','pap']){
   // Drill axes per parent dimension: PAP parents break down by region AND
   // office (separate toggles); region/office parents break down by PAP;
   // program parents have no drill (PAP is already their next level).
   const childDims=dim==='pap'?['region','office']:dim==='program'?[]:['pap'];
   const groups=new Map();
   // Nested drill breakdowns per parent group: {parent → {axis → {child → tallies}}}.
   const childGroups=new Map();
   const childMap=(label,axis)=>{
    if(!childGroups.has(label))childGroups.set(label,new Map());
    const axes=childGroups.get(label);
    if(!axes.has(axis))axes.set(axis,new Map());
    return axes.get(axis);
   };
   const tally=(record,label,children,sideKey)=>{
    const entry=groups.get(label)||{label,nep_php:0,house_php:0,nep_records:0,house_records:0};
    entry[`${sideKey}_php`]+=record.amount_php;entry[`${sideKey}_records`]+=sideRecords(record);
    groups.set(label,entry);
    for(const [axis,child] of children){
     const map=childMap(label,axis);
     const childEntry=map.get(child)||{label:child,nep_php:0,house_php:0,nep_records:0,house_records:0};
     childEntry[`${sideKey}_php`]+=record.amount_php;childEntry[`${sideKey}_records`]+=sideRecords(record);
     map.set(child,childEntry);
    }
   };
   for(const row of rows){
    if(row.nep)tally(row.nep,sourceDimLabel(row.nep,dim,row),childDims.map(axis=>[axis,sourceDimLabel(row.nep,axis,row)]),'nep');
    if(row[side])tally(row[side],sourceDimLabel(row[side],dim,row),childDims.map(axis=>[axis,sourceDimLabel(row[side],axis,row)]),'house');
   }
   dims[dim]=[...groups.values()].map(entry=>{
    const axes=childGroups.get(entry.label)||new Map();
    const drill=Object.fromEntries(childDims.map(axis=>[axis,sortByDelta([...(axes.get(axis)||new Map()).values()])
     .map(child=>({...child,delta_php:child.house_php-child.nep_php}))]));
    return {id:entry.label,label:entry.label,nep_php:entry.nep_php,house_php:entry.house_php,
     delta_php:entry.house_php-entry.nep_php,nep_records:entry.nep_records,house_records:entry.house_records,
     drill_dims:childDims,
     by_pap:drill.pap||[],by_region:drill.region||[],by_office:drill.office||[]};
   })
    .sort((a,b)=>Math.abs(b.delta_php)-Math.abs(a.delta_php)||b.house_php-a.house_php||a.label.localeCompare(b.label));
  }
  byReading[side]={house_reading:side,nep_php:sources.nep.amount_php,house_php:sources[side].amount_php,
   delta_php:sources[side].amount_php-sources.nep.amount_php,by_dim:dims};
 }
 return byReading;
}
function sourceDimLabel(record,dim,row){
 if(dim==='region')return record.region||row.region||'No recorded region';
 if(dim==='office')return sideOffice(record)||'No recorded office';
 if(dim==='program')return (record.zone??row.zone)==='fap'?'Foreign-assisted projects':record.program||row.program||'Other / unclassified';
 return record.pap||row.pap||'No recorded PAP';
}
function sortByDelta(entries){
 return entries.sort((a,b)=>Math.abs(b.house_php-b.nep_php)-Math.abs(a.house_php-a.nep_php)||b.house_php-a.house_php||a.label.localeCompare(b.label));
}
// Top groups per dimension over the FULL candidate group, not just the top 20.
function byDimension(flat){
 const result={overall:{rows:flat.length,amount_php:flat.reduce((sum,r)=>sum+r.amount_php,0)}};
 for(const [dim,field] of DIMENSIONS){
  const groups=new Map();
  for(const row of flat){
   const label=dim==='office'?(row.office||'No recorded office'):row[field]||`No recorded ${dim==='pap'?'PAP':dim}`;
   const entry=groups.get(label)||{label,rows:0,amount_php:0};
   entry.rows++;entry.amount_php+=row.amount_php;groups.set(label,entry);
  }
  result[dim]=[...groups.values()].sort((a,b)=>b.amount_php-a.amount_php||a.label.localeCompare(b.label)).slice(0,100);
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
 const summary=sign=>{
  let rowsCount=0,amount_php=0,nep_php=0,house_php=0;
  for(const row of cross){
   const gap=houseMinusNep(row);if(gap==null||(sign>0?gap<=0:gap>=0))continue;
   const house=row.third??row.second;
   rowsCount++;amount_php+=Math.abs(gap);nep_php+=row.nep.amount_php;house_php+=house.amount_php;
  }
  return {rows:rowsCount,amount_php,nep_php,house_php};
 };
 return {reading,delta_php:delta,cross_summary:{increased:summary(1),reduced:summary(-1)}};
}
function houseMinusNep(row){
 const house=row.third??row.second;
 if(row.nep==null||house==null)return null;
 return house.amount_php-row.nep.amount_php;
}
