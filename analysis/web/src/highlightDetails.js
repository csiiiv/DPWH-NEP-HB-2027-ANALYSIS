import {regionCandidates} from './regionCandidates.js';
import {officeKind} from './headlineStats.js';
import {recordedOffice} from '../../viewers/project_offices.mjs';
import {formatChainageSpans} from './chainageDisplay.js';

export const HIGHLIGHT_IDS=['funding-shift','multi-purpose','caloocan','flood-priorities','house-only','groupings','regional-gains','office-capacity','shorter-works'];
const fields=['id','title','amount_php','region','office','program','pap','zone','pdf_page','pdf_pages','evidence'];
function source(record,row){
 if(!record)return null;
 const compact=Object.fromEntries(fields.filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));
 for(const key of ['title','program','pap','zone','region'])if(compact[key]!==undefined&&compact[key]===row[key]){
  (compact.inherit??=[]).push(key);delete compact[key];
 }
 if(record.records)compact.records=record.records.map(member=>source(member,row));
 return compact;
}
export function hydrateHighlightDetails(payload){
 const hydrate=(record,row)=>{
  if(!record)return null;
  const {inherit=[],records,...value}=record;
  return {...Object.fromEntries(inherit.map(key=>[key,row[key]])),...value,...(records?{records:records.map(member=>hydrate(member,row))}:{})};
 };
 return {...payload,records:payload.records.map(row=>({...row,nep:hydrate(row.nep,row),third:hydrate(row.third,row)}))};
}
export function sourceAllocations(rows,side){
 return rows.flatMap(row=>row[side]?(row[side].records??[row[side]]).map(member=>({...row[side],...member,zone:member.zone??row[side].zone??row.zone})):[]);
}
export function allocationBreakdown(rows,field,{nonFap=false,deoOnly=false}={}){
 const groups=new Map();
 for(const side of ['nep','third'])for(const record of sourceAllocations(rows,side)){
  const office=recordedOffice(record)||record.office;
  if(nonFap&&record.zone==='fap'||deoOnly&&officeKind(office)!=='District engineering offices (DEOs)')continue;
  const label=field==='office'?office||'No recorded office':field==='program'&&record.zone==='fap'?'Foreign-assisted projects':record[field]||'Not recorded';
  const group=groups.get(label)??{id:label,label,nep_php:0,third_php:0,nep_records:0,third_records:0};
  group[`${side}_php`]+=record.amount_php;group[`${side}_records`]++;
  groups.set(label,group);
 }
 return [...groups.values()].map(group=>({...group,delta_php:group.third_php-group.nep_php})).sort((a,b)=>b.delta_php-a.delta_php);
}
// One compact pool avoids duplicating allocations across the bespoke views.
// All matching records are retained; pagination happens only in the browser.
export function highlightDetails({rows,headlines,paps,stages,readings,roadGroups,chainage}){
 const candidates=regionCandidates(rows),index=new Map(candidates.map((row,i)=>[row.id,i]));
 const records=candidates.map(row=>({id:row.id,title:row.title,program:row.program,pap:row.pap,zone:row.zone,region:row.region,
  house_match:row.house_match,reading_status:row.reading_status,suggestions:row.suggestions?.length??0,
  nep:source(row.nep,row),second:row.second?{id:row.second.id,amount_php:row.second.amount_php,pdf_page:row.second.pdf_page}:null,third:source(row.third,row)}));
 const refs=selected=>selected.map(row=>index.get(row.id));
 const is=(row,predicate)=>['nep','third'].some(side=>row[side]&&predicate(row[side]));
 const fap=candidates.filter(row=>is(row,s=>s.zone==='fap'));
 const buildings=candidates.filter(row=>is(row,s=>s.pap?.startsWith('BIP - Multi-Purpose')));
 const floods=candidates.filter(row=>is(row,s=>s.program==='Flood Management Program'));
 const inserted=candidates.filter(row=>row.third&&!row.nep);
 const added=candidates.filter(row=>row.reading_status==='third_only');
 const units=new Map((chainage?.units??[]).map(unit=>[unit.id,unit]));
 const shorter=[];
 for(const row of candidates){
  if(row.house_match!=='chainage_candidate'||!row.nep||!row.second||!row.third||row.nep.amount_php!==row.third.amount_php)continue;
  const nep=units.get(`nep:${row.nep.id}`),house=units.get(`hb3:${row.third.native_node_id??row.third.id.split(':').at(-1)}`);
  if(!nep?.length_m||!house?.length_m||nep.length_review||house.length_review||house.length_m>=nep.length_m)continue;
  shorter.push({id:row.id,title:row.title,amount_php:house.amount_php,nep_length_m:nep.length_m,house_length_m:house.length_m,
   length_delta_m:house.length_m-nep.length_m,length_delta_pct:100*(house.length_m-nep.length_m)/nep.length_m,
   nep_per_km:nep.amount_php*1000/nep.length_m,house_per_km:house.amount_php*1000/house.length_m,
   nep_spans:formatChainageSpans(nep.chainages),house_spans:formatChainageSpans(house.chainages),
   nep_page:row.nep.pdf_page,house_page:row.third.pdf_page});
 }
 const fundingPrograms=Object.entries(headlines.sources.nep.programs).map(([label,nep])=>({id:label,label,nep_php:nep.amount_php,
  second_php:headlines.sources.second.programs[label]?.amount_php??0,third_php:headlines.sources.third.programs[label]?.amount_php??0,
  delta_php:(headlines.sources.third.programs[label]?.amount_php??0)-nep.amount_php}));
 const floodFap=['nep','third'].map(side=>sourceAllocations(candidates,side).filter(r=>r.zone==='fap'&&r.program==='Flood Management Program').reduce((sum,r)=>sum+r.amount_php,0));
 const houseAnchors=new Map();
 for(const row of candidates)for(const member of row.second?.records??(row.second?[row.second]:[]))houseAnchors.set(member.source_record_id,row.id);
 const groups=(roadGroups?.groups??[]).map((g,i)=>({...g,id:`group-${i}`,members:g.members.map(member=>({...member,comparison_id:houseAnchors.get(member.id)??null}))}));
 const nonFap=candidates.filter(row=>is(row,s=>s.zone!=='fap'));
 const regions=allocationBreakdown(candidates,'region',{nonFap:true});
 const regionalPaps=Object.fromEntries(regions.map(region=>{
  const ownRows=candidates.map(row=>({...row,...Object.fromEntries(['nep','third'].map(side=>[side,row[side]?.region===region.label?row[side]:null]))}));
  return [region.label,allocationBreakdown(ownRows,'pap',{nonFap:true})];
 }));
 const officeKinds=Object.entries(headlines.sources.nep.offices).map(([label,nep])=>({id:label,label,nep_php:nep.amount_php,nep_records:nep.records,
  third_php:headlines.sources.third.offices[label].amount_php,third_records:headlines.sources.third.offices[label].records,
  delta_php:headlines.sources.third.offices[label].amount_php-nep.amount_php}));
 const totals={nep_php:stages.summary.stages.official_nep.new_appropriations_php,second_php:readings.summary.second.new_appropriations,third_php:readings.summary.third.new_appropriations};
 const operation={nep_php:headlines.sources.nep.amount_php,second_php:headlines.sources.second.amount_php,third_php:headlines.sources.third.amount_php};
 const controlRows=[{id:'agency',label:'Full agency new appropriations',...totals},{id:'operations',label:'Operations including local/FAP',...operation},
  {id:'support',label:'Administration + support',...Object.fromEntries(['nep','second','third'].map(side=>[`${side}_php`,totals[`${side}_php`]-operation[`${side}_php`]]))}].map(row=>({...row,delta_php:row.third_php-row.nep_php}));
 return {schema_version:1,records,stories:{
  'funding-shift':{controls:controlRows,programs:fundingPrograms,record_ids:refs(fap)},
  'multi-purpose':{regions:allocationBreakdown(buildings,'region'),offices:allocationBreakdown(buildings,'office'),record_ids:refs(buildings)},
  caloocan:{controls:['new_appropriations','s2o_total','operations_including_projects'].map(key=>({id:key,label:({new_appropriations:'Full agency new appropriations',s2o_total:'Support to Operations',operations_including_projects:'Operations including local/FAP'})[key],
   second_php:readings.summary.second[key],third_php:readings.summary.third[key],delta_php:readings.summary.third[key]-readings.summary.second[key]})),
   paps:paps.filter(p=>p.reading_delta_php).map(p=>({...p,delta_php:p.reading_delta_php})),record_ids:refs(added)},
  'flood-priorities':{paps:[...paps.filter(p=>p.program==='Flood Management Program'&&p.label!=='Foreign-assisted projects (FAP)'),
   {id:'flood-fap',label:'Foreign-assisted flood projects',nep_php:floodFap[0],third_php:floodFap[1]}].map(p=>({...p,delta_php:p.third_php-p.nep_php})),
   regions:allocationBreakdown(floods,'region'),record_ids:refs(floods)},
  'house-only':{programs:allocationBreakdown(inserted,'program'),regions:allocationBreakdown(inserted,'region'),offices:allocationBreakdown(inserted,'office'),record_ids:refs(inserted)},
  groupings:{groups},
  'regional-gains':{regions,regional_paps:regionalPaps,record_ids:refs(nonFap)},
  'office-capacity':{kinds:officeKinds,offices:allocationBreakdown(candidates,'office',{deoOnly:true})},
  'shorter-works':{rows:shorter},
 }};
}
